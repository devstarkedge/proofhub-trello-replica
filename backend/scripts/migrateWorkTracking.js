import Role from '../models/Role.js';
import Card from '../models/Card.js';
import Workspace from '../models/Workspace.js';
import { TEMPLATES } from '../authz/templates.js';
import { runUnscoped, run } from '../modules/workspaces/workspaceContext.js';
import { TrackingPolicy, WorkSession, TrackingDevice, ActivityInterval, TrackingScreenshot, TaskAssignmentEvent } from '../modules/tracking/tracking.models.js';

export async function runWorkTrackingMigration() {
  // Additive indexes only. Never syncIndexes(): that could drop unrelated
  // working indexes from the existing attendance/task application.
  for (const model of [WorkSession,TrackingDevice,ActivityInterval,TrackingScreenshot,TrackingPolicy,TaskAssignmentEvent,Card]) await model.createIndexes();
  let roles=0;
  await runUnscoped(async()=>{
    const existing=await Role.find({isSystem:true,customized:{$ne:true},grants:{$exists:true}}).lean();
    for(const role of existing){
      const additions=(TEMPLATES[role.templateKey||role.slug]?.grants||[]).filter(g=>g.permission.startsWith('tracking.')&&!role.grants.some(old=>old.permission===g.permission));
      if(!additions.length)continue;
      await Role.updateOne({_id:role._id},{$push:{grants:{$each:additions}}});roles++;
    }
  });
  // Legacy roles and memberships retain their existing behavior through the
  // existing permission engine adapter. Custom V2 roles opt in via the catalog.
  for await(const workspace of Workspace.find({}).select('_id').cursor())await run({workspaceId:workspace._id},async()=>{
    await TrackingPolicy.findOneAndUpdate({},{$setOnInsert:{workspaceId:workspace._id}},{upsert:true,runValidators:true});
  });
  return {rolesUpdated:roles,indexesCreated:true,customRolesUnchanged:true};
}
