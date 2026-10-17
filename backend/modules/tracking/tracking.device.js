import mongoose from 'mongoose';
import { randomUUID,createHash,timingSafeEqual } from 'node:crypto';
import { TrackingDevice, WorkSession, ActivityInterval, TrackingScreenshot,TrackingCaptureLease,TrackingCaptureAnchor,TrackingPolicy } from './tracking.models.js';
import { contextFor, policyFor, fail, digest, objectId, reconcileSession, authorizeRecord } from './tracking.service.js';
import { can } from './tracking.authorization.js';
import { overlapSeconds } from './tracking.timeline.js';
import { signedUpload, verifyPrivateUpload, screenshotKey, privateStorage, storageLabels,SCREENSHOT_MAX_BYTES,privateScreenshotExists,missingStorageObject } from './tracking.storage.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { departmentsOf } from './tracking.visibility.js';
import { emitToUser } from '../../realtime/emitters.js';
import {migrateLegacyScreenshot} from './tracking.legacyStorage.js';
import {MONITORING_NOTICE_VERSION,hasMonitoringNotice,workspaceCapturePreferences} from './tracking.monitoring.js';
const captureSnapshot=p=>({enabled:p.enabled,monitoringEnabled:p.monitoringEnabled,revision:p.revision,retentionDays:p.retentionDays,blur:p.blur,intervalSeconds:p.intervalSeconds,monitors:p.monitors,excludedDisplayIds:p.excludedDisplayIds||[],excludeWindowTitles:p.excludeWindowTitles||[]});
async function persistAnchor(device,anchor,dbSession=null){
  await TrackingCaptureAnchor.findOneAndUpdate({device:device._id,id:anchor.id},{$setOnInsert:{...anchor,workspaceId:device.workspaceId,user:device.user,device:device._id,purgeAt:anchor.capturePolicy.retentionDays===null?null:new Date(+new Date(anchor.expiresAt)+anchor.capturePolicy.retentionDays*86400000)}},{upsert:true,runValidators:true,session:dbSession});
}

export async function registerDevice({ workspaceId, userId, installationId, name, platform, appVersion, noticeAuthorization }) {
  const ctx = await contextFor(workspaceId, userId);
  if (!can(ctx, 'tracking.log', { workspaceId, user: userId })) fail('Tracking permission required', 403);
  if (typeof installationId !== 'string' || !/^[\w-]{8,128}$/.test(installationId) || !['win32', 'darwin', 'linux'].includes(platform)) fail('Invalid desktop identity');
  if(noticeAuthorization!==undefined&&(typeof noticeAuthorization!=='string'||!/^[a-f\d]{64}$/.test(noticeAuthorization)))fail('Invalid desktop authorization');
  const hash=noticeAuthorization?createHash('sha256').update(noticeAuthorization).digest('hex'):null;
  const existing=await TrackingDevice.findOne({workspaceId,user:userId,installationId}).select('+noticeAuthorizationHash').lean();
  if(existing?.noticeAuthorizationHash&&existing.noticeAuthorizationHash!==hash)fail('Register this device from its original desktop app.',403,'DESKTOP_DEVICE_REQUIRED');
  const now = new Date();
  const member=await WorkspaceMembership.findOne({workspace:workspaceId,user:userId,status:'active'}).lean();
  const policy=await policyFor(workspaceId);
  const anchor = { id: randomUUID(), serverAt: now, expiresAt: new Date(+now + 86400000), departments:departmentsOf(member),policyRevision:policy.revision,capturePolicy:captureSnapshot(policy) };
  let device;
  // workspaceScopePlugin adds the tenant predicate. A scalar credential CAS
  // avoids ambiguous equality inference in MongoDB's upsert with nested $or.
  try{device=await TrackingDevice.findOneAndUpdate({user:userId,installationId,noticeAuthorizationHash:existing?.noticeAuthorizationHash||null}, {
    $set: { name: String(name || 'FlowTask Desktop').slice(0,80), platform, appVersion: String(appVersion || '').slice(0,30), lastSeenAt: now, anchor,...(hash?{noticeAuthorizationHash:hash}:{}) },
    $push: { anchors: { $each: [anchor], $slice: -8 } },
    $setOnInsert: { workspaceId, user: userId, installationId }
  }, { upsert: true, new: true, runValidators: true }).lean();}
  catch(error){if(error.code===11000)fail('Device authorization changed; use the original desktop app.',409,'DESKTOP_DEVICE_REQUIRED');throw error;}
  delete device.noticeAuthorizationHash;
  await persistAnchor(device,anchor);return device;
}
export async function ownedDevice(workspaceId, userId, deviceId) {
  const d = await TrackingDevice.findOne({ _id: objectId(deviceId), workspaceId, user: userId, revokedAt: null }).lean();
  if (!d) fail('Desktop device not found', 404);
  return d;
}
export async function acceptMonitoringNotice({ workspaceId, userId, deviceId, noticeVersion, policyRevision, noticeAuthorization }) {
  const d = await TrackingDevice.findOne({_id:objectId(deviceId),workspaceId,user:userId,revokedAt:null}).select('+noticeAuthorizationHash').lean(), policy = await policyFor(workspaceId);
  if(!d)fail('Desktop device not found',404);
  if(!/^[a-f\d]{64}$/.test(noticeAuthorization||'')||!/^[a-f\d]{64}$/.test(d.noticeAuthorizationHash||'')||!timingSafeEqual(Buffer.from(d.noticeAuthorizationHash,'hex'),createHash('sha256').update(noticeAuthorization).digest()))fail('Approve device access in the updated FlowTask desktop app.',403,'DESKTOP_DEVICE_REQUIRED');
  delete d.noticeAuthorizationHash;
  const ctx=await contextFor(workspaceId,userId);
  if(!can(ctx,'tracking.log',{workspaceId,user:userId}))fail('Tracking permission required',403);
  if(!policy.enabled||!policy.monitoringEnabled)fail('Desktop monitoring is disabled by workspace',409);
  if(noticeVersion!==MONITORING_NOTICE_VERSION||policyRevision!==policy.revision)fail('Monitoring notice changed; review the current notice',409,'CONSENT_REQUIRED');
  if(hasMonitoringNotice(d))return d;
  const acceptedAt=new Date();
  const saved=await TrackingDevice.findOneAndUpdate({_id:d._id,revokedAt:null,consentAt:d.consentAt||null},{$set:{consentAt:acceptedAt,consentRevision:policy.revision,noticeVersion,preferences:workspaceCapturePreferences(policy)},$push:{noticeHistory:{version:noticeVersion,policyRevision:policy.revision,acceptedAt}}},{new:true,runValidators:true}).lean();
  if(!saved)fail('Device authorization changed; retry',409);
  return saved;
}
export async function releaseDevice({workspaceId,userId,deviceId,revoke=false}){
  await ownedDevice(workspaceId,userId,deviceId);
  const at=new Date(),dbSession=await mongoose.startSession();
  try{await dbSession.withTransaction(async()=>{
    await TrackingDevice.updateOne({_id:deviceId,workspaceId,user:userId},{$set:{activeSession:null,leaseUntil:at,releasedAt:at,state:revoke?'revoked':'disconnected',...(revoke?{revokedAt:at}: {})}},{session:dbSession});
    await TrackingCaptureLease.updateMany({device:deviceId,endedAt:{$gt:at}},{$set:{endedAt:at}},{session:dbSession});
  });}finally{await dbSession.endSession();}
  try{emitToUser(userId,'tracking:device-updated',{deviceId:String(deviceId),revoked:revoke},workspaceId);}catch{/* polling recovers */}
  return {released:true,revoked:revoke};
}
export async function heartbeat({ workspaceId, userId, deviceId, sessionId, state, takeover=false, noticeAuthorization }) {
  const ctx = await contextFor(workspaceId, userId), device = await ownedDevice(workspaceId, userId, deviceId);
  const policy = await policyFor(workspaceId), now = new Date();
  let session = sessionId ? await WorkSession.findOne({ _id: objectId(sessionId), workspaceId, user: userId }).lean() : null;
  if (session) session = await reconcileSession(session._id);
  const permitted = policy.enabled && policy.monitoringEnabled && hasMonitoringNotice(device) && can(ctx, 'tracking.log', { workspaceId, user: userId });
  const canCapture = Boolean(permitted && session?.status === 'RUNNING');
  if(takeover){
    const secret=await TrackingDevice.findOne({_id:device._id,workspaceId,user:userId,revokedAt:null}).select('+noticeAuthorizationHash').lean();
    if(!/^[a-f\d]{64}$/.test(noticeAuthorization||'')||!/^[a-f\d]{64}$/.test(secret?.noticeAuthorizationHash||'')||!timingSafeEqual(Buffer.from(secret.noticeAuthorizationHash,'hex'),createHash('sha256').update(noticeAuthorization).digest()))fail('Switch monitoring from the authorized FlowTask desktop app.',403,'DESKTOP_DEVICE_REQUIRED');
    if(!canCapture)fail('Start authorized work and review the monitoring notice first.',409,'CONSENT_REQUIRED');
  }
  // A five-minute capture authorization bounds offline collection. Expired
  // ownership can be reclaimed without resetting the employee work session.
  if(canCapture&&device.monitoringDisplacedAt&&!takeover)fail('Monitoring was moved to another desktop. Choose Use this desktop to move it back.',409,'DEVICE_TRANSFERRED');
  const update = { lastSeenAt: now, state: String(state || 'connected').slice(0,40), activeSession: canCapture ? session._id : null };
  update.preferences=workspaceCapturePreferences(policy);
  const startsLease=canCapture&&(String(device.activeSession)!==String(session._id)||!device.leaseUntil||+new Date(device.leaseUntil)<=+now);
  if(canCapture){update.leaseUntil=new Date(+now+300000);if(startsLease){update.leaseStartedAt=now;update.leaseVersion=(device.leaseVersion||0)+1;}}
  // A new capture lease needs a fresh server/monotonic origin. Reusing an
  // overnight origin can put the first window before its lease after clock
  // adjustments. Historical anchors remain durable for completed offline work.
  const member=await WorkspaceMembership.findOne({workspace:workspaceId,user:userId,status:'active'}).lean(),departments=departmentsOf(member);
  if (startsLease || !device.anchor?.id || +new Date(device.anchor.expiresAt) <= +now || device.anchor.policyRevision!==policy.revision || JSON.stringify((device.anchor.departments||[]).map(String).sort())!==JSON.stringify([...departments].sort())) update.anchor = { id: randomUUID(), serverAt: now, expiresAt: new Date(+now + 86400000),departments,policyRevision:policy.revision,capturePolicy:captureSnapshot(policy) };
  let saved,transferredFrom=null;const dbSession=await mongoose.startSession();
  try{await dbSession.withTransaction(async()=>{
    transferredFrom=null;
    if(canCapture){
      const authorized=await TrackingPolicy.updateOne({_id:policy._id,revision:policy.revision,enabled:true},{$inc:{__v:1}},{session:dbSession});
      if(!authorized.matchedCount)fail('Workspace configuration changed',409);
      const running=await WorkSession.updateOne({_id:session._id,status:'RUNNING'},{$inc:{evidenceRevision:1}},{session:dbSession});
      if(!running.matchedCount)fail('Work is no longer running',409);
      // Include old records without a lease deadline so they cannot retain
      // ownership forever. A recent legacy owner keeps the same five-minute grace.
      await TrackingDevice.updateMany({workspaceId,user:userId,activeSession:session._id,$or:[{revokedAt:{$ne:null}},{leaseUntil:{$lte:now}},{leaseUntil:null,lastSeenAt:{$lte:new Date(+now-300000)}},{leaseUntil:null,lastSeenAt:null}]},{$set:{activeSession:null}},{session:dbSession});
      const owner=await TrackingDevice.findOne({workspaceId,user:userId,activeSession:session._id,_id:{$ne:device._id}}).session(dbSession).lean();
      if(owner){
        if(!takeover)fail('Another desktop owns monitoring. Close it and wait up to 5 minutes, or choose Use this desktop.',409,'DEVICE_CONFLICT');
        transferredFrom=String(owner._id);
        await TrackingDevice.updateOne({_id:owner._id},{$set:{activeSession:null,leaseUntil:now,releasedAt:now,monitoringDisplacedAt:now,state:'displaced'}},{session:dbSession});
        await TrackingCaptureLease.updateMany({device:owner._id,session:session._id,endedAt:{$gt:now}},{$set:{endedAt:now}},{session:dbSession});
      }
    }
    saved=await TrackingDevice.findOneAndUpdate({_id:device._id,revokedAt:null,releasedAt:device.releasedAt||null},{$set:update,...(takeover?{$unset:{monitoringDisplacedAt:1}}:{}),...(update.anchor?{$push:{anchors:{$each:[update.anchor],$slice:-8}}}:{})},{new:true,session:dbSession}).lean();
    if(!saved)fail('Desktop device was revoked',403,'DEVICE_REVOKED');
    if(update.anchor)await persistAnchor(saved,update.anchor,dbSession);
    if(canCapture)await TrackingCaptureLease.findOneAndUpdate({device:device._id,version:saved.leaseVersion},{$set:{endedAt:saved.leaseUntil,expiresAt:policy.retentionDays===null?null:new Date(+saved.leaseUntil+policy.retentionDays*86400000)},$setOnInsert:{workspaceId,user:userId,session:session._id,startedAt:saved.leaseStartedAt}},{upsert:true,runValidators:true,session:dbSession});
  });}catch(error){if(error.code===11000)fail('Another desktop owns monitoring. Choose Use this desktop to switch.',409,'DEVICE_CONFLICT');throw error;}finally{await dbSession.endSession();}
  if(transferredFrom)try{emitToUser(userId,'tracking:device-updated',{deviceId:transferredFrom,displaced:true,replacementDeviceId:String(device._id)},workspaceId);}catch{/* polling recovers */}
  return { serverNow: now, device: saved, policy, session, canCapture,transferredFrom,
    noticeVersion:MONITORING_NOTICE_VERSION,needsNotice:policy.enabled&&policy.monitoringEnabled&&!hasMonitoringNotice(device),
    reason: !policy.enabled ? 'Time Tracking disabled by workspace' : !policy.monitoringEnabled ? 'Monitoring disabled by workspace' : !session || session.status !== 'RUNNING' ? 'Work is not running' : !hasMonitoringNotice(device) ? 'Monitoring notice required' : !permitted?'Tracking permission required':null };
}
function numeric(value, max = 1e9) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max; }
export async function recordInterval(args) {
  const {workspaceId,userId,deviceId}=args;
  const filter={_id:deviceId,workspaceId,user:userId};
  try {
    const saved=await saveInterval(args);
    await TrackingDevice.updateOne(filter,{$unset:{lastUploadError:1,lastUploadErrorCode:1,lastUploadErrorAt:1}}).catch(()=>{});
    return saved;
  } catch(error) {
    // Keep the reason visible across heartbeat/status refreshes. Never persist
    // input payloads, image data, tokens or internal error/stack details.
    const message=error.statusCode>=400&&error.statusCode<500?error.message:'Desktop upload unavailable; retry shortly';
    await TrackingDevice.updateOne(filter,{$set:{lastUploadError:String(message).slice(0,300),lastUploadErrorCode:String(error.code||'UPLOAD_UNAVAILABLE').slice(0,80),lastUploadErrorAt:new Date()}}).catch(()=>{});
    throw error;
  }
}
async function saveInterval({ workspaceId, userId, deviceId, payload }) {
  const device = await ownedDevice(workspaceId, userId, deviceId), policy = await policyFor(workspaceId);
  const ctx = await contextFor(workspaceId, userId);
  if (!can(ctx, 'tracking.log', { workspaceId, user: userId })) fail('Tracking permission required', 403);
  if (!payload || typeof payload.operationId !== 'string' || !/^[\w-]{8,128}$/.test(payload.operationId)) fail('Invalid activity operation');
  const allowed = ['operationId','sessionId','anchorId','startOffsetMs','endOffsetMs','mouseCount','keyboardCount','activeSeconds','idleSeconds','coverage','inputAvailable','screenshotAvailable','inputActiveSeconds','inputEligibleSeconds','activityBasis'];
  if (Object.keys(payload).some(k => !allowed.includes(k))) fail('Only privacy-safe interval counters are accepted');
  const hash = digest(payload), replay = await ActivityInterval.findOne({ workspaceId, device: device._id, operationId: payload.operationId }).lean();
  if (replay) { if (replay.digest !== hash) fail('Interval ID was reused with different data', 409); return replay; }
  if (!hasMonitoringNotice(device)) fail('Monitoring consent is no longer effective', 403);
  const session = await WorkSession.findOne({ _id: objectId(payload.sessionId), workspaceId, user: userId }).lean();
  if (!session) fail('Work session not found', 404);
  const conflicting = await TrackingDevice.findOne({ workspaceId, activeSession: session._id, _id: { $ne: device._id } }).lean();
  const anchor = (device.anchors?.length ? device.anchors : [device.anchor]).find(a => a?.id === payload.anchorId)||await TrackingCaptureAnchor.findOne({device:device._id,id:payload.anchorId}).lean();
  if (!anchor || !numeric(payload.startOffsetMs, 86400000) || !numeric(payload.endOffsetMs, 86400000) || payload.endOffsetMs <= payload.startOffsetMs) fail('Invalid monotonic interval anchor');
  const startedAt = new Date(+new Date(anchor.serverAt) + payload.startOffsetMs), endedAt = new Date(+new Date(anchor.serverAt) + payload.endOffsetMs);
  if(session.endedAt && +endedAt>+new Date(session.endedAt))fail('Activity was recorded after attendance checkout',409,'CAPTURE_AFTER_CHECKOUT');
  const nextVersion=(policy.versions||[]).filter(v=>v.revision>anchor.policyRevision).sort((a,b)=>a.revision-b.revision)[0];
  if(nextVersion&&+endedAt>+new Date(nextVersion.effectiveAt))fail('Capture crosses a workspace configuration boundary',403);
  if(anchor.capturePolicy && (!anchor.capturePolicy.enabled||!anchor.capturePolicy.monitoringEnabled)||policy.disabledAt&&+endedAt>+new Date(policy.disabledAt)&&!policy.enabled)fail('Capture was not authorized by the effective workspace policy',403);
  if (conflicting && (!conflicting.leaseStartedAt || +endedAt > +new Date(conflicting.leaseStartedAt))) fail('Another device owns this monitoring session',409,'DEVICE_CONFLICT');
  if(device.noticeVersion===MONITORING_NOTICE_VERSION||payload.activityBasis==='distinct-input-seconds-v1'){
    const historical=await TrackingCaptureLease.exists({device:device._id,session:session._id,startedAt:{$lte:new Date(+startedAt+2000)},endedAt:{$gte:endedAt}});
    const legacy=device.leaseStartedAt&&device.leaseUntil&&+startedAt>=+new Date(device.leaseStartedAt)-2000&&+endedAt<=+new Date(device.leaseUntil);
    if(!historical&&!legacy)fail('Activity falls outside the authorized capture lease',403,'LEASE_EXPIRED');
  }
  const seconds = (+endedAt - +startedAt) / 1000;
  if (seconds > 3605 || +endedAt > Date.now() + 5000 || +endedAt > +new Date(anchor.expiresAt) || +startedAt < +new Date(session.startedAt) - 2000) fail('Invalid activity boundaries');
  // Older agents predate policy snapshots. Preserve their stored retention
  // rather than applying the new configuration defaults to historical uploads.
  const capturePolicy=anchor.capturePolicy||await TrackingPolicy.findOne({workspaceId}).lean()||policy;
  if (capturePolicy.retentionDays!==null && Date.now() - +endedAt > capturePolicy.retentionDays * 86400000) fail('Activity interval is outside retention', 410);
  if (!['captured','excluded','locked','sleep','unavailable','partial'].includes(payload.coverage) || typeof payload.inputAvailable !== 'boolean' || typeof payload.screenshotAvailable !== 'boolean') fail('Invalid coverage');
  const covered = overlapSeconds(startedAt, endedAt, session.segments);
  // A final upload after checkout may straddle the close boundary. Preserve
  // the exact screenshot boundaries, flag partial coverage, and never use
  // this evidence to add work duration or to scale unknown counters.
  if (covered <= 0) fail('Activity is outside working segments', 409);
  const partial = covered + 0.01 < seconds;
  const distinctInput = payload.activityBasis === 'distinct-input-seconds-v1';
  if (payload.activityBasis && !distinctInput) fail('Unsupported activity measurement');
  if (distinctInput && (!numeric(payload.inputActiveSeconds,seconds+0.05) || !numeric(payload.inputEligibleSeconds,seconds+0.05) || payload.inputActiveSeconds>payload.inputEligibleSeconds || Math.abs(payload.inputEligibleSeconds-seconds)>0.05)) fail('Invalid distinct-input-second measurements');
  const inputEligible = distinctInput && !partial && payload.inputAvailable && !['excluded','locked','sleep'].includes(payload.coverage);
  if (payload.inputAvailable && (!Number.isInteger(payload.mouseCount) || !numeric(payload.mouseCount) || !Number.isInteger(payload.keyboardCount) || !numeric(payload.keyboardCount))) fail('Invalid input counts');
  if (!numeric(payload.activeSeconds, seconds + 0.05) || !numeric(payload.idleSeconds, seconds + 0.05) || Math.abs(payload.activeSeconds + payload.idleSeconds - seconds) > 0.1) fail('Active and idle measurements must cover the exact interval');
  const dbSession = await mongoose.startSession(); let saved;
  try { await dbSession.withTransaction(async () => {
    const current=await WorkSession.findOne({_id:session._id,workspaceId,user:userId}).session(dbSession).lean();
    if(!current||current.endedAt&&+endedAt>+new Date(current.endedAt))fail('Activity was recorded after attendance checkout',409,'CAPTURE_AFTER_CHECKOUT');
    // A device row write serializes concurrent interval submissions; the
    // overlap query alone would allow two inserts under snapshot isolation.
    await WorkSession.updateOne({ _id: session._id }, { $inc: { evidenceRevision: 1 } }, { session: dbSession });
    await TrackingDevice.updateOne({ _id: device._id }, { $set: { lastSeenAt: new Date() } }, { session: dbSession });
    const overlap = await ActivityInterval.findOne({ workspaceId, session: session._id, startedAt: { $lt: endedAt }, endedAt: { $gt: startedAt } }).session(dbSession).lean();
    if (overlap) {
      if (overlap.operationId === payload.operationId && overlap.digest === hash) { saved = overlap; return; }
      fail('Activity intervals must not overlap', 409);
    }
    [saved] = await ActivityInterval.create([{
      workspaceId, user: userId, session: session._id, device: device._id, operationId: payload.operationId, digest: hash,
      startedAt, endedAt, mouseCount: payload.inputAvailable ? payload.mouseCount : null,
      keyboardCount: payload.inputAvailable ? payload.keyboardCount : null,
      activeSeconds: partial ? null : payload.activeSeconds, idleSeconds: partial ? null : payload.idleSeconds,
      inputActiveSeconds: inputEligible ? payload.inputActiveSeconds : null,
      inputEligibleSeconds: inputEligible ? payload.inputEligibleSeconds : null, activityBasis: distinctInput ? payload.activityBasis : 'legacy-idle-threshold', policyRevision: anchor.policyRevision || policy.revision,
      departmentIdsAtCapture:anchor.departments,
      capturePolicy:{revision:anchor.policyRevision,retentionDays:capturePolicy.retentionDays,blur:capturePolicy.blur,monitoringEnabled:capturePolicy.monitoringEnabled,excludedDisplayIds:capturePolicy.excludedDisplayIds||[]},
      coverage: partial ? 'partial' : payload.coverage, inputAvailable: payload.inputAvailable,
      screenshotAvailable: payload.screenshotAvailable, expiresAt: capturePolicy.retentionDays===null?null:new Date(+endedAt + capturePolicy.retentionDays * 86400000)
    }], { session: dbSession });
  }); } finally { await dbSession.endSession(); }
  return saved;
}
export async function prepareScreenshot({ workspaceId, userId, deviceId, intervalId, image }) {
  const device = await ownedDevice(workspaceId, userId, deviceId);
  const ctx = await contextFor(workspaceId,userId);
  if (!can(ctx,'tracking.log',{workspaceId,user:userId})) fail('Tracking permission required',403);
  if (!hasMonitoringNotice(device)) fail('Monitoring consent required', 403);
  const interval = await ActivityInterval.findOne({ _id: objectId(intervalId), workspaceId, user: userId, device: device._id }).lean();
  if (!interval || !interval.screenshotAvailable && image?.exceptionCode!=='SIZE_QUALITY_CONFLICT' || interval.expiresAt && interval.expiresAt <= new Date()) fail('Screenshot interval unavailable', 404);
  const work = await WorkSession.findById(interval.session).lean();
  if (!work || work.endedAt && +new Date(interval.endedAt) > +new Date(work.endedAt) || !work.segments.some(s=>+new Date(s.startedAt)<+new Date(interval.endedAt)&&(!s.endedAt||+new Date(s.endedAt)>=+new Date(interval.endedAt)))) fail('Screenshot capture occurred outside working time',409);
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0 || image.width > 16000 || image.height > 16000 || typeof image.displayId !== 'string' || !/^[\w-]{1,80}$/.test(image.displayId)) fail('Invalid screenshot metadata');
  if (interval.capturePolicy?.blur && !image.blurred) fail('Blur was required by capture policy');
  if(interval.capturePolicy?.excludedDisplayIds?.includes(image.displayId))fail('Monitor was excluded by capture policy',403);
  let screenshot = await TrackingScreenshot.findOne({ workspaceId, interval: interval._id, displayId: image.displayId });
  if(image.exceptionCode==='SIZE_QUALITY_CONFLICT'){
    if(['excluded','locked','sleep'].includes(interval.coverage))fail('No screenshot was authorized for this interval',403);
    const measured=image.measurement;
    if(measured&&(!Number.isInteger(measured.bytes)||measured.bytes<=SCREENSHOT_MAX_BYTES||!Number.isInteger(measured.width)||!Number.isInteger(measured.height)||measured.width<1||measured.height<1||measured.width>16000||measured.height>16000))fail('Invalid compression exception metadata');
    if(!screenshot){const metadata={workspaceId,user:userId,session:interval.session,device:device._id,interval:interval._id,displayId:image.displayId,capturedAt:interval.endedAt,
      width:measured?.width||image.width,height:measured?.height||image.height,originalWidth:measured?.originalWidth||image.width,originalHeight:measured?.originalHeight||image.height,bytes:measured?.bytes||0,blurred:Boolean(image.blurred),policyRevision:interval.policyRevision,format:'webp',mimeType:'image/webp',
      compressionException:'SIZE_QUALITY_CONFLICT',compressionStrategy:String(measured?.compressionStrategy||image.compressionStrategy||'quality-floor').slice(0,80),quality:55,pipelineVersion:2,
      status:'FAILED',uploadStatus:'SIZE_QUALITY_CONFLICT',departmentIdsAtCapture:interval.departmentIdsAtCapture,expiresAt:interval.expiresAt};
      try{screenshot=await TrackingScreenshot.create(metadata);}catch(error){if(error.code!==11000)throw error;screenshot=await TrackingScreenshot.findOne({workspaceId,interval:interval._id,displayId:image.displayId});}
    }
    await TrackingDevice.updateOne({_id:device._id},{$set:{screenshotIssue:'SIZE_QUALITY_CONFLICT: A capture could not fit 70 KiB without crossing the readability floor. Activity was retained.',screenshotIssueAt:new Date()}});
    void notifyScreenshot(screenshot);return {screenshotId:screenshot._id,ready:screenshot.status==='READY',exceptionRecorded:true,upload:null};
  }
  if(!/^[a-f\d]{64}$/.test(image.checksum)||!/^[a-f\d]{32}$/.test(image.contentMd5)||!Number.isInteger(image.bytes)||image.bytes<=0||image.bytes>15*1024*1024)fail('Invalid screenshot metadata');
  const grandfathered=screenshot&&screenshot.pipelineVersion!==2&&screenshot.status!=='FAILED';
  if(!grandfathered&&image.bytes>SCREENSHOT_MAX_BYTES)fail('New screenshots must fit 70 KiB. Update the desktop encoder; activity is preserved.',409,'AGENT_UPDATE_REQUIRED');
  if(image.format!=='webp'||image.mimeType!=='image/webp'||!Number.isInteger(image.quality)||image.quality<55||image.quality>85)fail('Desktop screenshots require adaptive WebP quality 55–85. Update the desktop app.',409,'AGENT_UPDATE_REQUIRED');
  if(image.originalWidth&&(!Number.isInteger(image.originalWidth)||image.originalWidth<image.width||image.width/image.originalWidth<0.74)||image.originalHeight&&(!Number.isInteger(image.originalHeight)||image.originalHeight<image.height||image.height/image.originalHeight<0.74))fail('Screenshot dimensions exceed the readability scaling limit');
  if(screenshot && screenshot.storageProvider!=='cloudflare-r2'){
    if(screenshot.status==='READY')return {screenshotId:screenshot._id,ready:true,upload:null};
    if(screenshot.status==='PENDING'){
      const metadata={workspaceId,user:userId,interval:interval._id,displayId:image.displayId,capturedAt:interval.endedAt};
      screenshot=await TrackingScreenshot.findOneAndUpdate({_id:screenshot._id,status:'PENDING',storageProvider:{$ne:'cloudflare-r2'}},{$set:{format:'webp',mimeType:'image/webp',quality:85,storageProvider:'cloudflare-r2',storageBucket:privateStorage().config.bucket,storageKey:screenshotKey(metadata),checksum:image.checksum,contentMd5:image.contentMd5,bytes:image.bytes,width:image.width,height:image.height,blurred:Boolean(image.blurred)}},{new:true})||await TrackingScreenshot.findOne({_id:screenshot._id});
    }
  }
  if (screenshot && (screenshot.checksum !== image.checksum || screenshot.contentMd5 !== image.contentMd5)) fail('Screenshot retry differs from original', 409);
  if (!screenshot) { const metadata={
    workspaceId, user: userId, session: interval.session, device: device._id, interval: interval._id,
    displayId: image.displayId, capturedAt: interval.endedAt, checksum: image.checksum, contentMd5: image.contentMd5,
    bytes: image.bytes, width: image.width, height: image.height, blurred: Boolean(image.blurred),
    format:'webp',mimeType:'image/webp',quality:image.quality,pipelineVersion:2,originalWidth:image.originalWidth||image.width,originalHeight:image.originalHeight||image.height,compressionStrategy:String(image.compressionStrategy||'quality-85').slice(0,80),storageProvider:'cloudflare-r2',storageBucket:privateStorage().config.bucket,
    departmentIdsAtCapture:interval.departmentIdsAtCapture,policyRevision:interval.policyRevision,
    expiresAt: interval.expiresAt
  };Object.assign(metadata,await storageLabels(workspaceId,userId,interval.departmentIdsAtCapture||[],interval.endedAt));metadata.storageKey=screenshotKey(metadata);
    try { screenshot=await TrackingScreenshot.create(metadata); }
    catch(error){if(error.code!==11000)throw error;screenshot=await TrackingScreenshot.findOne({workspaceId,interval:interval._id,displayId:image.displayId});if(!screenshot||screenshot.checksum!==image.checksum)fail('Screenshot retry differs from original',409);}
  }
  if (screenshot.status === 'DELETED') fail('Screenshot was removed', 410);
  if(screenshot.status==='FAILED')fail('Capture exceeded its size/readability limit',409,'SIZE_QUALITY_CONFLICT');
  if(screenshot.status==='READY'&&screenshot.storageProvider==='cloudflare-r2'&&!await privateScreenshotExists(screenshot)){
    // An R2 prefix can be deleted outside FlowTask. If the desktop still has
    // this capture, reissue a conditional PUT at the SAME saved key and ID.
    screenshot=await TrackingScreenshot.findOneAndUpdate({_id:screenshot._id,status:'READY'},{$set:{status:'PENDING',uploadStatus:'RETRY_PENDING',storageMissingAt:new Date(),lastUploadError:'Stored image was removed from R2; waiting for the desktop copy.'}},{new:true})||await TrackingScreenshot.findById(screenshot._id);
  }
  if(screenshot.status==='DELETED'||screenshot.expiresAt&&screenshot.expiresAt<=new Date())fail('Screenshot was removed',410);
  if(screenshot.status!=='READY'){screenshot.uploadStatus='UPLOADING';await screenshot.save();}
  return { screenshotId: screenshot._id, ready: screenshot.status === 'READY', upload: screenshot.status === 'READY' ? null : await signedUpload(screenshot) };
}
export async function completeScreenshot({ workspaceId, userId, deviceId, screenshotId }) {
  const ctx = await contextFor(workspaceId, userId), device = await ownedDevice(workspaceId, userId, deviceId);
  if (!can(ctx,'tracking.log',{workspaceId,user:userId}) || !hasMonitoringNotice(device)) fail('Monitoring consent is no longer effective',403);
  const screenshot = await TrackingScreenshot.findOne({ _id: objectId(screenshotId), workspaceId, user: userId, device: deviceId });
  if (!screenshot || screenshot.status === 'DELETED' || screenshot.expiresAt && screenshot.expiresAt <= new Date()) fail('Screenshot not found', 404);
  if (screenshot.status === 'READY') {
    if(screenshot.storageProvider!=='cloudflare-r2'||await privateScreenshotExists(screenshot))return screenshot;
    await TrackingScreenshot.updateOne({_id:screenshot._id,status:'READY'},{$set:{status:'PENDING',uploadStatus:'RETRY_PENDING',storageMissingAt:new Date()}});
    fail('Stored screenshot is missing; the desktop will upload its saved copy again.',503,'SCREENSHOT_OBJECT_MISSING');
  }
  const interval=await ActivityInterval.findOne({_id:screenshot.interval,workspaceId,user:userId,device:deviceId}).lean();
  const work=await WorkSession.findOne({_id:screenshot.session,workspaceId,user:userId}).lean();
  if(!interval||!work||!interval.screenshotAvailable||+new Date(screenshot.capturedAt)!==+new Date(interval.endedAt)||work.endedAt&&+new Date(screenshot.capturedAt)>+new Date(work.endedAt)||!work.segments.some(s=>+new Date(s.startedAt)<+new Date(screenshot.capturedAt)&&(!s.endedAt||+new Date(s.endedAt)>=+new Date(screenshot.capturedAt))))fail('Capture no longer falls within authorized work time',409);
  try{await verifyPrivateUpload(screenshot);
  }catch(error){screenshot.uploadStatus='RETRY_PENDING';await screenshot.save();void notifyScreenshot(screenshot);if(missingStorageObject(error))fail('Stored screenshot is missing; retry the saved capture.',503,'SCREENSHOT_OBJECT_MISSING');throw error;}
  screenshot.status = 'READY';screenshot.uploadStatus='UPLOADED';screenshot.uploadedAt=new Date();screenshot.storageMissingAt=undefined;screenshot.lastUploadError=undefined;await screenshot.save();
  await TrackingDevice.updateOne({_id:deviceId},{$unset:{screenshotIssue:1,screenshotIssueAt:1}});
  void notifyScreenshot(screenshot);
  return screenshot;
}
export async function retryScreenshot({workspaceId,userId,deviceId,screenshotId}){
  await contextFor(workspaceId,userId);await ownedDevice(workspaceId,userId,deviceId);
  const screenshot=await TrackingScreenshot.findOneAndUpdate({_id:objectId(screenshotId),workspaceId,user:userId,device:deviceId,status:'PENDING'},{$set:{uploadStatus:'RETRY_PENDING',lastUploadError:'Upload unavailable; the desktop will retry this capture'}},{new:true});
  if(screenshot)void notifyScreenshot(screenshot);return {retryPending:Boolean(screenshot)};
}
async function notifyScreenshot(screenshot){
  try{
    const session=await WorkSession.findById(screenshot.session).lean();
    const scoped=session?{...session,departmentIdsAtStart:screenshot.departmentIdsAtCapture}:null;
    for await(const member of WorkspaceMembership.find({workspace:screenshot.workspaceId,status:'active'}).select('user').cursor()){
      try{const ctx=await contextFor(screenshot.workspaceId,member.user);await authorizeRecord(ctx,scoped,'tracking.view_screenshots');emitToUser(member.user,'tracking:screenshot-updated',{sessionId:screenshot.session,screenshotId:screenshot._id,userId:screenshot.user,capturedAt:screenshot.capturedAt,status:screenshot.status},screenshot.workspaceId);}catch{/* forbidden or temporarily disconnected */}
    }
  }catch{/* saved status remains authoritative; polling recovers */}
}
