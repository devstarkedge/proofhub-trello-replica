import Workspace from '../models/Workspace.js';
import {run} from '../modules/workspaces/workspaceContext.js';
import {TrackingPolicy,TrackingAgenda,WorkSession,TrackingCaptureLease,TrackingCaptureAnchor} from '../modules/tracking/tracking.models.js';
import {finishDisable} from '../modules/tracking/tracking.settings.js';
export async function runTrackingConfigurationMigration(){
  await TrackingAgenda.createIndexes();await WorkSession.createIndexes();await TrackingCaptureLease.createIndexes();await TrackingCaptureAnchor.createIndexes();let workspaces=0;
  for await(const workspace of Workspace.find({}).select('_id').cursor())await run({workspaceId:workspace._id},async()=>{
    const existing=await TrackingPolicy.findOne({configuredAt:null}).lean();
    const policy=existing?await TrackingPolicy.findOneAndUpdate({_id:existing._id,configuredAt:null,revision:existing.revision},{$set:{enabled:false,disabledAt:existing.disabledAt||new Date(),disableRecoveryPending:true}},{new:true}).lean():null;
    if(policy)await finishDisable(workspace._id,policy);
    await TrackingAgenda.findOneAndUpdate({normalizedTitle:'learning'},{$setOnInsert:{workspaceId:workspace._id,title:'Learning',normalizedTitle:'learning'}},{upsert:true});workspaces++;
  });
  return {workspaces,approvedConfigurationsPreserved:true,historicalExpiryPreserved:true};
}
