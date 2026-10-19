import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import config from '../../config/index.js';
import AttendanceSession from './attendanceSession.model.js';
import AttendancePolicyVersion from './attendancePolicyVersion.model.js';
import AttendanceShift from './attendanceShift.model.js';
import AttendanceRegularization from './attendanceRegularization.model.js';
import { WorkSession, TrackingScreenshot } from '../tracking/tracking.models.js';
import { trackingContext, can } from '../tracking/tracking.authorization.js';
import { resolveAttendanceEligibility } from './attendanceEligibility.service.js';
import { resolveEffectiveOfficeHours } from './attendanceOfficeHoursOverride.service.js';
import { resolveAuthorizedWorkMode } from './attendanceWorkMode.service.js';
import { resolveWorkspaceDay } from '../workCalendar/workCalendarFacade.js';
import { dateOnlyToInstant, getWorkspaceTimezone } from '../leave/leaveTimezone.util.js';
import { resolveLeaveContextForDate } from './attendanceLeaveReconciliation.service.js';
import { resolveAttendanceStatus } from './attendanceStatusResolver.service.js';
import { applyRegularizationOverlay } from './attendanceRegularizationOverlay.js';
import { attendanceIntervals, intervalMinutes, unionIntervals, scheduleForDay, resolveLeaveCoverage } from './attendanceIntervals.js';
import { codedError } from './attendanceErrors.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const signature = value => createHmac('sha256',config.jwt.secret).update(`attendance-checkout-v1:${value}`).digest();
function tokenFor(preview, userId, workspaceId) {
  const body=Buffer.from(JSON.stringify({purpose:'checkout',userId:String(userId),workspaceId:String(workspaceId),sessionId:String(preview.attendanceSessionId),fingerprint:preview.fingerprint,expiresAt:Date.now()+120000})).toString('base64url');
  return `${body}.${signature(body).toString('base64url')}`;
}
function readToken(token) {
  try {
    if(typeof token!=='string'||token.length>4096) return null;
    const [body,signed,...rest]=token.split('.');if(rest.length||!signed)return null;
    const supplied=Buffer.from(signed,'base64url'),expected=signature(body);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return null;
    return JSON.parse(Buffer.from(body,'base64url').toString());
  } catch { return null; }
}
export function checkoutPreview(evaluation, userId, workspaceId) {
  const {context:_,fingerprint,...publicData}=evaluation;
  const previewToken=tokenFor(evaluation,userId,workspaceId);
  return {...publicData,previewToken,expiresAt:new Date(Date.now()+120000)};
}
export function assertCheckoutConfirmation(token,evaluation,userId,workspaceId) {
  if(!token)return; // Older clients retain the existing authoritative API.
  const proof=readToken(token);
  if(!proof||proof.purpose!=='checkout'||proof.userId!==String(userId)||proof.workspaceId!==String(workspaceId)||proof.sessionId!==String(evaluation.attendanceSessionId))throw codedError('This checkout confirmation is invalid. Review a fresh preview.',400,'CHECKOUT_PREVIEW_INVALID');
  if(proof.expiresAt<Date.now()||proof.fingerprint!==evaluation.fingerprint){
    const error=codedError('Your attendance or approved leave outcome changed. Review it before confirming again.',409,'CHECKOUT_RECONFIRM_REQUIRED');
    error.checkoutPreview=checkoutPreview(evaluation,userId,workspaceId);throw error;
  }
}

// This is composition of the existing policy evaluator, never a second engine.
// No currentState/getTodayStatus/reconciliation/creation calls belong here.
export async function evaluateCheckout({workspaceId,userId,membership,workspace,attendance,at=new Date(),dbSession=null}) {
  const timezone=getWorkspaceTimezone(workspace),workDateKey=attendance.workDateKey;
  const dayInstant=dateOnlyToInstant(workDateKey,timezone);
  const policyVersion=await AttendancePolicyVersion.findOne({_id:attendance.policyVersion,workspaceId}).session(dbSession).lean();
  if(!policyVersion)throw codedError('The attendance session policy is unavailable. Contact your workspace administrator.',409,'POLICY_NOT_CONFIGURED');
  const shift=attendance.shift?await AttendanceShift.findOne({_id:attendance.shift,workspaceId}).session(dbSession).lean():null;
  const eligibility=await resolveAttendanceEligibility({workspaceId,userId,membership,workspace,attendancePolicy:policyVersion});
  // An already-started attendance cycle can still be closed after eligibility changes.
  const context={workspaceId,userId,workDateKey,timezone,dayInstant,policyVersion,shift,eligibility:{...eligibility,attendanceRequired:true},serverNow:at};
  context.officeHours=await resolveEffectiveOfficeHours({workspaceId,userId,membership,date:dayInstant,policyVersion,shift,dbSession});
  context.calendar=await resolveWorkspaceDay({workspaceId,date:dayInstant,departmentId:membership.department?.[0],timezone,dbSession});
  context.leave=await resolveLeaveContextForDate({workspaceId,userId,dayInstant,dbSession});
  // The mode actually authorized at check-in remains authoritative for this cycle.
  const storedMode=attendance.checkIn?.workMode;
  context.workModeResolution=storedMode&&storedMode!=='HYBRID'?{workMode:storedMode,effectiveMode:storedMode}:await resolveAuthorizedWorkMode({workspaceId,userId,membership,dayInstant,timezone,policyVersion,requestedWorkMode:storedMode});
  const raw=await AttendanceSession.find({workspaceId,user:userId,workDateKey}).select('status checkInAt checkOutAt missedCheckoutCutoffAt systemGeneratedCheckout regularizationResolution').session(dbSession).lean();
  const proposed=raw.map(s=>String(s._id)===String(attendance._id)?{...s,status:'COMPLETED',checkOutAt:at}:s);
  const regularizations=await AttendanceRegularization.find({workspaceId,requester:userId,workDateKey,status:'APPROVED'}).sort({decidedAt:1,createdAt:1,_id:1}).select('attendanceSession finalCorrection').session(dbSession).lean();
  context.sessions=applyRegularizationOverlay({sessions:proposed,approvedRegularizations:regularizations});
  const outcome=resolveAttendanceStatus(context);
  const schedule=scheduleForDay(context),coverage=resolveLeaveCoverage(context.leave,schedule);
  const permissions=await trackingContext(workspaceId,userId,{includeProjects:false});
  const workVisible=can(permissions,'tracking.log',{workspaceId,user:userId})||can(permissions,'tracking.view_reports',{workspaceId,user:userId});
  let trackedWorkSeconds=null,workSessionIds=[],pendingUploads=0;
  if(workVisible){
    const work=await WorkSession.find({workspaceId,user:userId,workDateKey}).select('attendanceSession startedAt endedAt segments.startedAt segments.endedAt').session(dbSession).lean();
    workSessionIds=work.map(s=>s._id);
    const intervals=work.flatMap(s=>{const source=raw.find(a=>String(a._id)===String(s.attendanceSession));if(!source)return [];const cutoff=source.checkOutAt||source.missedCheckoutCutoffAt;return s.segments.map(segment=>[Math.max(+new Date(segment.startedAt),+new Date(source.checkInAt)),Math.min(+at,cutoff?+new Date(cutoff):Infinity,s.endedAt?+new Date(s.endedAt):Infinity,segment.endedAt?+new Date(segment.endedAt):Infinity)]);});
    trackedWorkSeconds=intervalMinutes(unionIntervals(intervals))*60;
    pendingUploads=await TrackingScreenshot.countDocuments({workspaceId,user:userId,session:{$in:workSessionIds},status:'PENDING'}).session(dbSession);
  }
  const warnings=[];
  if(!coverage.unresolved && context.leave.leaveState!=='FULL_LEAVE'){
    if(outcome.earlyExitMinutes>0)warnings.push({code:'EARLY_EXIT',minutes:outcome.earlyExitMinutes,message:`${outcome.earlyExitMinutes} minutes of early departure are not covered by approved leave.`});
    if(outcome.presenceState==='ABSENT')warnings.push({code:'INSUFFICIENT_DURATION',message:'Recorded attendance is below the required minimum after approved leave adjustments.'});
    else if(outcome.presenceState==='HALF_PRESENT'&&context.leave.leaveFraction===0)warnings.push({code:'HALF_PRESENT',message:'Your effective attendance policy currently evaluates this workday as half present.'});
  }
  const label=coverage.unresolved?'Provisional — attendance review needed':context.leave.leaveState==='FULL_LEAVE'?'On approved leave':context.leave.leaveFraction===0.5&&outcome.presenceState==='HALF_PRESENT'?'Half present · half approved leave':({PRESENT:'Present',HALF_PRESENT:'Half present',ABSENT:'Absent',MISSING_CHECKOUT:'Missing checkout'})[outcome.presenceState]||'Provisional';
  const explanation=coverage.unresolved?'An approved leave time window could not be resolved safely. Your attendance will retain a review flag.':context.leave.leaveState==='FULL_LEAVE'?'Approved full-day leave is preserved. Recorded attendance remains available for authorized review.':coverage.summaries.some(s=>s.coverageResolved)&&!outcome.earlyExitMinutes?'Approved leave has been included in the attendance evaluation.':'Calculated using your effective attendance policy and recorded attendance.';
  const canConfirm=!attendance.missedCheckoutCutoffAt||+at<+new Date(attendance.missedCheckoutCutoffAt);
  const data={attendanceSessionId:attendance._id,workSessionIds,workDateKey,timezone,serverNow:at,proposedCheckOutAt:at,checkInAt:attendance.checkInAt,
    attendanceSeconds:intervalMinutes(attendanceIntervals(context.sessions,at))*60,trackedWorkSeconds,workVisible,
    policyVersionId:policyVersion._id,schedule:schedule?{startedAt:schedule.startedAt,endedAt:schedule.endedAt,midpointAt:schedule.midpointAt}:null,
    outcome:{presenceState:outcome.presenceState,punctualityState:outcome.punctualityState,leaveState:outcome.leaveState,presenceFraction:outcome.presenceFraction,leaveFraction:outcome.leaveFraction,label,provisional:coverage.unresolved,explanation},
    approvedLeaves:coverage.summaries,uncoveredEarlyMinutes:outcome.earlyExitMinutes,warnings,pendingUploads,canConfirm};
  // Exact clocks/elapsed seconds are deliberately excluded from the proof:
  // only a changed outcome, schedule or approved coverage needs reconfirmation.
  const fingerprint=digest({session:String(attendance._id),workDateKey,policy:String(policyVersion._id),schedule:data.schedule,mode:context.workModeResolution.effectiveMode,
    officeHours:context.officeHours,outcome:data.outcome,leaves:data.approvedLeaves.map(({status:_,...covered})=>covered),warnings:warnings.map(w=>w.code),canConfirm});
  return {...data,fingerprint,context:{...context,outcome}};
}
export async function getCheckoutPreview(args) {
  const attendance=await AttendanceSession.findOne({workspaceId:args.workspaceId,user:args.userId,status:'ACTIVE'}).lean();
  if(!attendance)throw codedError('No active attendance session. Refresh your attendance status.',409,'NO_ACTIVE_SESSION');
  return checkoutPreview(await evaluateCheckout({...args,attendance}),args.userId,args.workspaceId);
}
