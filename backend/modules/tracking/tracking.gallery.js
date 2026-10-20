import {WorkSession,ActivityInterval,TrackingScreenshot} from './tracking.models.js';
import {contextFor,authorizeRecord,objectId,fail} from './tracking.service.js';
import {historicalDepartmentScope} from './tracking.visibility.js';
import {segmentFilter,matchesSegment} from './tracking.dashboard.js';
import {readPrivateScreenshot,missingStorageObject} from './tracking.storage.js';
import {readLegacyScreenshot} from './tracking.legacyStorage.js';
import {screenshotContentPolicy} from './tracking.contentPolicy.js';
const id=v=>String(v?._id||v||'');
const alive=()=>({$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]});
export const contextTitle=s=>s.attributedTaskTitle?`${s.attributedProjectName} / ${s.attributedTaskTitle}`:s.agenda?`${s.agendaTitle} — ${s.description}`:`${s.projectName||'Project'} / ${s.taskTitle||'Individual'}`;
function contexts(session,interval){return session.segments.filter(s=>+s.startedAt<+interval.endedAt&&(!s.endedAt||+s.endedAt>+interval.startedAt)).map(s=>({segmentId:s._id,title:contextTitle(s),startedAt:s.startedAt,endedAt:s.endedAt,kind:s.kind,project:s.attributedProject||s.project,task:s.attributedTask||s.task,agenda:s.agenda,origin:s.agenda?`${s.agendaTitle} — ${s.description}`:null,attributionIncluded:s.attributionIncluded===true,attributedAt:s.attributedAt,assignedAt:s.assignedAt}));}
function compact(s,interval,session){
  const eligible=interval&&!['excluded','locked','sleep'].includes(interval.coverage)&&interval.activityBasis==='distinct-input-seconds-v1'&&interval.inputEligibleSeconds>0&&Number.isFinite(interval.inputActiveSeconds);
  return {_id:s._id,session:s.session,user:s.user,interval:s.interval,capturedAt:s.capturedAt,displayId:s.displayId,status:s.status,uploadStatus:s.uploadStatus,blurred:s.blurred,
    width:s.width,height:s.height,bytes:s.bytes,imageVersion:s.checksum,thumbnailVersion:s.checksum,expiresAt:s.expiresAt,sizeExceptionReason:s.sizeExceptionReason,thumbnailReady:s.status==='READY',compressionException:s.compressionException,
    coverage:interval?.coverage||'unavailable',activityPercent:eligible?Math.min(100,Math.max(0,interval.inputActiveSeconds/interval.inputEligibleSeconds*100)):null,
    contexts:interval?contexts(session,interval):[]};
}
export async function gallery(workspaceId,userId,query){
  const session=await WorkSession.findOne({_id:objectId(query.sessionId),workspaceId}).select('-operations -audit').lean();
  const ctx=await contextFor(workspaceId,userId,{includeProjects:id(session?.user)!==id(userId)});
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
  const records=await TrackingScreenshot.find(filter).sort({capturedAt:-1,_id:-1}).limit(21).select('_id session user interval capturedAt displayId status uploadStatus blurred width height bytes sizeExceptionReason compressionException checksum expiresAt').lean();
  const page=records.slice(0,20),intervals=await ActivityInterval.find({workspaceId,_id:{$in:page.map(s=>s.interval)},...history,...alive()}).select('_id startedAt endedAt coverage activityBasis inputEligibleSeconds inputActiveSeconds').lean();
  const byId=new Map(intervals.map(i=>[id(i),i])),last=page.at(-1);
  return {workspaceId,sessionId:session._id,screenshots:page.filter(s=>byId.has(id(s.interval))).map(s=>compact(s,byId.get(id(s.interval)),session)),nextCursor:records.length>20?Buffer.from(JSON.stringify({at:last.capturedAt,id:last._id})).toString('base64url'):null};
}
export async function authorizedScreenshot(workspaceId,userId,screenshotId,{ready=false}={}){
  const s=await TrackingScreenshot.findOne({workspaceId,_id:objectId(screenshotId),status:ready?'READY':{$ne:'DELETED'},...alive()}).lean();
  if(!s)fail('Screenshot not found',404);
  const ctx=await contextFor(workspaceId,userId,{includeProjects:id(s.user)!==id(userId)});
  const session=await WorkSession.findOne({workspaceId,_id:s.session}).select('-operations -audit').lean();
  await authorizeRecord(ctx,session?{...session,departmentIdsAtStart:s.departmentIdsAtCapture}:null,'tracking.view_screenshots');
  return {s,session};
}
export async function screenshotDetails(workspaceId,userId,screenshotId){
  const {s,session}=await authorizedScreenshot(workspaceId,userId,screenshotId),interval=await ActivityInterval.findOne({workspaceId,_id:s.interval,...alive()}).select('-digest -capturePolicy').lean();
  return {...compact(s,interval,session),originalWidth:s.originalWidth||s.width,originalHeight:s.originalHeight||s.height,quality:s.quality,format:s.format,compressionStrategy:s.compressionStrategy,policyRevision:s.policyRevision,uploadedAt:s.uploadedAt,expiresAt:s.expiresAt,
    thumbnail:{source:'canonical',bytes:s.bytes,width:s.width,height:s.height,quality:s.quality,status:s.status},
    activity:interval?{startedAt:interval.startedAt,endedAt:interval.endedAt,mouseCount:interval.mouseCount,keyboardCount:interval.keyboardCount,activeSeconds:interval.activeSeconds,idleSeconds:interval.idleSeconds,inputActiveSeconds:interval.inputActiveSeconds,inputEligibleSeconds:interval.inputEligibleSeconds,activityBasis:interval.activityBasis,timeBasis:interval.timeBasis}:null,
    minuteActivityAvailable:false};
}
export async function screenshotContent(workspaceId,userId,screenshotId,options={}){
  const {s}=await authorizedScreenshot(workspaceId,userId,screenshotId,{ready:true});
  const policy=screenshotContentPolicy(s,options);
  if(policy.authorizedUntil<=Date.now())fail('Screenshot authorization expired',401);
  if(policy.notModified)return policy;
  let bytes;
  try{bytes=s.storageProvider==='cloudflare-r2'?await readPrivateScreenshot(s):await readLegacyScreenshot(s);}
  catch(error){if(s.storageProvider==='cloudflare-r2'&&missingStorageObject(error)){
    await TrackingScreenshot.updateOne({_id:s._id,status:'READY'},{$set:{status:'PENDING',uploadStatus:'RETRY_PENDING',storageMissingAt:new Date(),lastUploadError:'Image was removed from R2. A retained desktop copy is required to recover it.'}});
    fail('This image was deleted from storage. It can be recovered only if the desktop still has a saved copy.',410,'SCREENSHOT_OBJECT_MISSING');
  }throw error;}
  // Membership, role, historical departments and expiration are checked again
  // after storage IO. No signed GET URL outlives this authorization decision.
  const {s:current}=await authorizedScreenshot(workspaceId,userId,screenshotId,{ready:true});
  if(current.checksum!==s.checksum)fail('Screenshot changed during retrieval',409);
  const confirmed=screenshotContentPolicy(current,options);
  if(confirmed.authorizedUntil<=Date.now())fail('Screenshot authorization expired',401);
  return {...confirmed,notModified:false,bytes,mimeType:s.mimeType||`image/${s.format||'jpeg'}`,width:s.width,height:s.height};
}
