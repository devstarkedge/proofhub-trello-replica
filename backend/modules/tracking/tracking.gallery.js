import {WorkSession,ActivityInterval,TrackingScreenshot} from './tracking.models.js';
import {contextFor,authorizeRecord,objectId,fail} from './tracking.service.js';
import {historicalDepartmentScope} from './tracking.visibility.js';
import {segmentFilter,matchesSegment} from './tracking.dashboard.js';
import {readPrivateScreenshot,createPrivateThumbnail,thumbnailRecord} from './tracking.storage.js';
import {readLegacyScreenshot} from './tracking.legacyStorage.js';
const id=v=>String(v?._id||v||'');
const alive=()=>({$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]});
export const contextTitle=s=>s.attributedTaskTitle?`${s.attributedProjectName} / ${s.attributedTaskTitle}`:s.agenda?`${s.agendaTitle} — ${s.description}`:`${s.projectName||'Project'} / ${s.taskTitle||'Individual'}`;
function contexts(session,interval){return session.segments.filter(s=>+s.startedAt<+interval.endedAt&&(!s.endedAt||+s.endedAt>+interval.startedAt)).map(s=>({segmentId:s._id,title:contextTitle(s),startedAt:s.startedAt,endedAt:s.endedAt,kind:s.kind,project:s.attributedProject||s.project,task:s.attributedTask||s.task,agenda:s.agenda,origin:s.agenda?`${s.agendaTitle} — ${s.description}`:null,attributionIncluded:s.attributionIncluded===true,attributedAt:s.attributedAt,assignedAt:s.assignedAt}));}
function compact(s,interval,session){
  const eligible=interval&&!['excluded','locked','sleep'].includes(interval.coverage)&&interval.activityBasis==='distinct-input-seconds-v1'&&interval.inputEligibleSeconds>0&&Number.isFinite(interval.inputActiveSeconds);
  return {_id:s._id,session:s.session,user:s.user,interval:s.interval,capturedAt:s.capturedAt,displayId:s.displayId,status:s.status,uploadStatus:s.uploadStatus,blurred:s.blurred,
    width:s.width,height:s.height,bytes:s.bytes,thumbnailReady:s.thumbnail?.status==='READY',compressionException:s.compressionException,
    coverage:interval?.coverage||'unavailable',activityPercent:eligible?Math.min(100,Math.max(0,interval.inputActiveSeconds/interval.inputEligibleSeconds*100)):null,
    contexts:interval?contexts(session,interval):[]};
}
export async function gallery(workspaceId,userId,query){
  const ctx=await contextFor(workspaceId,userId),session=await WorkSession.findOne({_id:objectId(query.sessionId),workspaceId}).select('-operations -audit').lean();
  // Capture history can be visible after a department transfer even when the
  // session started elsewhere. Each image still requires its historical scope.
  const scope=await historicalDepartmentScope(workspaceId,userId,session?.user);
  await authorizeRecord(ctx,session?{...session,departmentIdsAtStart:scope??session.departmentIdsAtStart}:null,'tracking.view_screenshots');
  segmentFilter(query);const segments=session.segments.filter(s=>matchesSegment(s,query));
  const intervalFilter=segments.length?{$or:segments.map(s=>({startedAt:{$lt:s.endedAt||new Date()},endedAt:{$gt:s.startedAt}}))}:{_id:{$in:[]}};
  const history=scope===null?{}:{departmentIdsAtCapture:{$in:scope}};
  // Only query matching interval IDs when work-context filters are active.
  const filtered=Object.keys(segmentFilter(query)).length>0;
  const ids=filtered?await ActivityInterval.find({workspaceId,session:session._id,...history,$and:[intervalFilter,alive()]}).distinct('_id'):null;
  const filter={workspaceId,session:session._id,...history,...alive(),status:{$ne:'DELETED'},...(ids?{interval:{$in:ids}}:{})};
  if(query.cursor){let value;try{value=JSON.parse(Buffer.from(String(query.cursor),'base64url').toString());}catch{fail('Invalid screenshot cursor');}
    if(!value||!Number.isFinite(+new Date(value.at)))fail('Invalid screenshot cursor');objectId(value.id);
    filter.$and=[{$or:[{capturedAt:{$lt:new Date(value.at)}},{capturedAt:new Date(value.at),_id:{$lt:objectId(value.id)}}]}];
  }
  const records=await TrackingScreenshot.find(filter).sort({capturedAt:-1,_id:-1}).limit(21).select('_id session user interval capturedAt displayId status uploadStatus blurred width height bytes thumbnail.status compressionException').lean();
  const page=records.slice(0,20),intervals=await ActivityInterval.find({workspaceId,_id:{$in:page.map(s=>s.interval)},...history,...alive()}).select('-digest -capturePolicy').lean();
  const byId=new Map(intervals.map(i=>[id(i),i])),last=page.at(-1);
  return {workspaceId,sessionId:session._id,screenshots:page.filter(s=>byId.has(id(s.interval))).map(s=>compact(s,byId.get(id(s.interval)),session)),nextCursor:records.length>20?Buffer.from(JSON.stringify({at:last.capturedAt,id:last._id})).toString('base64url'):null};
}
export async function authorizedScreenshot(workspaceId,userId,screenshotId,{ready=false}={}){
  const ctx=await contextFor(workspaceId,userId),s=await TrackingScreenshot.findOne({workspaceId,_id:objectId(screenshotId),status:ready?'READY':{$ne:'DELETED'},...alive()}).lean();
  if(!s)fail('Screenshot not found',404);
  const session=await WorkSession.findOne({workspaceId,_id:s.session}).select('-operations -audit').lean();
  await authorizeRecord(ctx,session?{...session,departmentIdsAtStart:s.departmentIdsAtCapture}:null,'tracking.view_screenshots');
  return {s,session};
}
export async function screenshotDetails(workspaceId,userId,screenshotId){
  const {s,session}=await authorizedScreenshot(workspaceId,userId,screenshotId),interval=await ActivityInterval.findOne({workspaceId,_id:s.interval,...alive()}).select('-digest -capturePolicy').lean();
  return {...compact(s,interval,session),originalWidth:s.originalWidth||s.width,originalHeight:s.originalHeight||s.height,quality:s.quality,format:s.format,compressionStrategy:s.compressionStrategy,policyRevision:s.policyRevision,uploadedAt:s.uploadedAt,expiresAt:s.expiresAt,
    thumbnail:s.thumbnail?{width:s.thumbnail.width,height:s.thumbnail.height,bytes:s.thumbnail.bytes,quality:s.thumbnail.quality,status:s.thumbnail.status}:null,
    activity:interval?{startedAt:interval.startedAt,endedAt:interval.endedAt,mouseCount:interval.mouseCount,keyboardCount:interval.keyboardCount,activeSeconds:interval.activeSeconds,idleSeconds:interval.idleSeconds,inputActiveSeconds:interval.inputActiveSeconds,inputEligibleSeconds:interval.inputEligibleSeconds,activityBasis:interval.activityBasis,timeBasis:interval.timeBasis}:null,
    minuteActivityAvailable:false};
}
const derivatives=new Map();
async function thumbnail(s){
  if(s.thumbnail?.status==='READY')return readPrivateScreenshot(thumbnailRecord(s));
  if(derivatives.has(id(s)))return derivatives.get(id(s));
  const promise=(async()=>{const source=s.storageProvider==='cloudflare-r2'?await readPrivateScreenshot(s):await readLegacyScreenshot(s);
    const result=await createPrivateThumbnail(s,source);
    await TrackingScreenshot.updateOne({_id:s._id,status:'READY',...alive()},{$set:{thumbnail:result.thumbnail}});return result.data;
  })();derivatives.set(id(s),promise);try{return await promise;}finally{derivatives.delete(id(s));}
}
export async function screenshotContent(workspaceId,userId,screenshotId,small=false){
  const {s}=await authorizedScreenshot(workspaceId,userId,screenshotId,{ready:true});
  const bytes=small?await thumbnail(s):s.storageProvider==='cloudflare-r2'?await readPrivateScreenshot(s):await readLegacyScreenshot(s);
  // Membership, role, historical departments and expiration are checked again
  // after storage IO. No signed GET URL outlives this authorization decision.
  await authorizedScreenshot(workspaceId,userId,screenshotId,{ready:true});
  return {bytes,mimeType:small?'image/webp':s.mimeType||`image/${s.format||'jpeg'}`};
}
