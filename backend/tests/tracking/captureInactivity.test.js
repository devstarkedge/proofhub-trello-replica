import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { summarizeEvidence } from '../../modules/tracking/tracking.evidence.js';
import { evidenceByUser } from '../../modules/tracking/tracking.evidenceRead.js';
import { recordInterval, prepareScreenshot } from '../../modules/tracking/tracking.device.js';
import { TrackingDevice, TrackingPolicy, WorkSession, ActivityInterval, TrackingScreenshot } from '../../modules/tracking/tracking.models.js';
import { MONITORING_NOTICE_VERSION } from '../../modules/tracking/tracking.monitoring.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Role from '../../models/Role.js';
import { TEMPLATES } from '../../authz/templates.js';
import { startTestDatabase, stopTestDatabase, clearTestDatabase, withWorkspace, createWorkspace, createUser, createMembership } from '../leave/testUtils.js';

beforeAll(async () => { process.env.AUTHZ_V2='enforce'; await startTestDatabase(); },120000);
beforeEach(clearTestDatabase);
afterAll(stopTestDatabase,60000);

async function fixture(minutesAgo=40){
  const user=await createUser(),workspace=await createWorkspace(),foreign=await createWorkspace();
  const role=await withWorkspace(workspace._id,()=>Role.create({...TEMPLATES.employee,workspaceId:workspace._id}));
  const member=await createMembership({workspace:workspace._id,user:user._id});
  await WorkspaceMembership.updateOne({_id:member._id},{$set:{roleId:role._id}});
  const start=new Date(Date.now()-minutesAgo*60000),sessionId=new mongoose.Types.ObjectId();
  return withWorkspace(workspace._id,async()=>{
    const policy=await TrackingPolicy.create({workspaceId:workspace._id,enabled:true,monitoringEnabled:true,configuredAt:new Date(),revision:1});
    await WorkSession.collection.insertOne({_id:sessionId,workspaceId:workspace._id,user:user._id,status:'RUNNING',startedAt:start,endedAt:null,segments:[{kind:'INDIVIDUAL',startedAt:start}],pauses:[],audit:[]});
    const device=await TrackingDevice.create({workspaceId:workspace._id,user:user._id,installationId:randomUUID(),activeSession:sessionId,consentAt:new Date(),noticeVersion:MONITORING_NOTICE_VERSION,
      leaseStartedAt:start,leaseUntil:new Date(Date.now()+300000),anchor:{id:randomUUID(),serverAt:start,expiresAt:new Date(Date.now()+86400000),departments:[],policyRevision:1,capturePolicy:{enabled:true,monitoringEnabled:true,retentionDays:365,revision:1}}});
    return {user,workspace,foreign,policy,sessionId,start,device};
  });
}
function payload(f,coverage,start=0,end=300000){return {operationId:randomUUID(),sessionId:String(f.sessionId),anchorId:f.device.anchor.id,startOffsetMs:start,endOffsetMs:end,mouseCount:2,keyboardCount:3,activeSeconds:(end-start)/1000,idleSeconds:0,coverage,inputAvailable:true,screenshotAvailable:coverage==='captured',inputActiveSeconds:2,inputEligibleSeconds:(end-start)/1000,activityBasis:'distinct-input-seconds-v1'};}
const save=(f,value)=>withWorkspace(f.workspace._id,()=>recordInterval({workspaceId:f.workspace._id,userId:f.user._id,deviceId:f.device._id,payload:value}));

it.each(['inactive','activity-only'])('stores %s counters without mutating the running work timeline, and replays once',async coverage=>{
  const f=await fixture(),value=payload(f,coverage),saved=await save(f,value),replay=await save(f,value);
  expect(String(replay._id)).toBe(String(saved._id));expect(saved.coverage).toBe(coverage);expect(saved.screenshotAvailable).toBe(false);expect(saved.keyboardCount).toBe(3);expect(saved.inputEligibleSeconds).toBe(300);
  await withWorkspace(f.workspace._id,async()=>{expect(await ActivityInterval.countDocuments()).toBe(1);const work=await WorkSession.findById(f.sessionId).lean();expect(work.status).toBe('RUNNING');expect(work.endedAt).toBeNull();expect(work.segments).toEqual([{kind:'INDIVIDUAL',startedAt:f.start}]);expect(work.pauses).toEqual([]);});
},30000);

it.each(['inactive','activity-only'])('rejects screenshots falsely declared on a %s interval',async coverage=>{
  const f=await fixture();await expect(save(f,{...payload(f,coverage),screenshotAvailable:true})).rejects.toMatchObject({statusCode:400});
  await withWorkspace(f.workspace._id,async()=>expect(await ActivityInterval.countDocuments()).toBe(0));
},30000);

it.each(['inactive','activity-only'])('cannot bypass a %s image prohibition by claiming legacy screenshot recovery',async coverage=>{
  const f=await fixture(),saved=await save(f,payload(f,coverage));
  await expect(withWorkspace(f.workspace._id,()=>prepareScreenshot({workspaceId:f.workspace._id,userId:f.user._id,deviceId:f.device._id,intervalId:saved._id,image:{width:10,height:10,displayId:'1',recoveredFrom:'SIZE_QUALITY_CONFLICT'}}))).rejects.toMatchObject({statusCode:403});
  await withWorkspace(f.workspace._id,async()=>expect(await TrackingScreenshot.countDocuments()).toBe(0));
},30000);

it('keeps activity counters but excludes intentional no-image windows from both capture-success summaries',async()=>{
  const f=await fixture(),intervals=[];
  for(const [index,coverage]of ['inactive','activity-only','captured'].entries())intervals.push(await save(f,payload(f,coverage,index*300000,(index+1)*300000)));
  await withWorkspace(f.workspace._id,async()=>{
    const image=await TrackingScreenshot.create({workspaceId:f.workspace._id,user:f.user._id,session:f.sessionId,device:f.device._id,interval:intervals[2]._id,status:'READY',capturedAt:intervals[2].endedAt});
    const direct=summarizeEvidence(intervals,[image]);
    const grouped=(await evidenceByUser(f.workspace._id,[{_id:f.sessionId}],[{session:f.sessionId,startedAt:f.start,endedAt:new Date(+f.start+900000)}],f.start,new Date(+f.start+900000))).get(String(f.user._id));
    for(const evidence of [direct,grouped])expect(evidence).toMatchObject({mouseCount:6,keyboardCount:9,knownSeconds:900,eligibleInputSeconds:900,eligibleWindows:1,capturedWindows:1,captureSuccessPercent:100,pendingScreenshots:0});
  });
},30000);

it('does not accept another workspace/device identity, and still rejects post-checkout data',async()=>{
  const f=await fixture();
  await expect(withWorkspace(f.foreign._id,()=>recordInterval({workspaceId:f.foreign._id,userId:f.user._id,deviceId:f.device._id,payload:payload(f,'inactive')}))).rejects.toMatchObject({statusCode:404});
  await withWorkspace(f.workspace._id,()=>WorkSession.updateOne({_id:f.sessionId},{$set:{status:'CLOSED',endedAt:new Date(+f.start+100000)}}));
  await expect(save(f,payload(f,'inactive'))).rejects.toMatchObject({code:'CAPTURE_AFTER_CHECKOUT'});
},30000);

it('accepts a full 63 minute randomized period split into bounded metadata windows and a final capture',async()=>{
  const f=await fixture(80),parts=[];
  await withWorkspace(f.workspace._id,()=>TrackingPolicy.updateOne({_id:f.policy._id},{$set:{intervalSeconds:3600}}));
  for(const [start,end,coverage]of [[0,1800000,'activity-only'],[1800000,3600000,'activity-only'],[3600000,3780000,'captured']])parts.push(await save(f,payload(f,coverage,start,end)));
  expect(parts.map(part=>part.coverage)).toEqual(['activity-only','activity-only','captured']);
  expect(parts.reduce((sum,part)=>sum+part.inputEligibleSeconds,0)).toBe(3780);
  expect(parts[2].screenshotAvailable).toBe(true);
},30000);
