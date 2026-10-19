import mongoose from 'mongoose';
import AttendanceRegularization from './attendanceRegularization.model.js';
import AttendanceSession from './attendanceSession.model.js';
import AttendanceDay from './attendanceDay.model.js';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import {applyRegularizationOverlay} from './attendanceRegularizationOverlay.js';
import {enqueueAttendanceEvent,processAttendanceEvents} from './attendanceEvents.service.js';
import {finalizeAttendanceWork} from '../tracking/tracking.service.js';
import {codedError} from './attendanceErrors.js';

export const regularizationEventKey=id=>`regularization-applied-${id}`;

// Shared by manager approval, policy auto-approval, manual correction and
// targeted recovery of already-approved legacy requests. All writes commit
// with the decision; a failed recomputation cannot resolve the warning.
export async function applyApprovedRegularization(entity,dbSession){
  if(entity.status!=='APPROVED'||entity.appliedAt)return;
  if(!dbSession)throw new Error('Regularization application requires a transaction');
  const {workspaceId,requester:userId,workDateKey}=entity;
  const raw=await AttendanceSession.find({workspaceId,user:userId,workDateKey}).session(dbSession).lean();
  const target=entity.attendanceSession?raw.find(s=>String(s._id)===String(entity.attendanceSession)):null;
  if(entity.attendanceSession&&!target)throw codedError('The attendance session does not belong to this employee and workday.',409,'REGULARIZATION_SESSION_MISMATCH');
  const approved=await AttendanceRegularization.find({workspaceId,requester:userId,workDateKey,status:'APPROVED'}).sort({decidedAt:1,createdAt:1,_id:1}).session(dbSession).lean();
  const effective=applyRegularizationOverlay({sessions:raw,approvedRegularizations:approved});
  const corrected=target?effective.find(s=>String(s._id)===String(target._id)):null;
  const at=new Date();
  if(corrected?.checkOutAt&&+new Date(corrected.checkOutAt)>+at)throw codedError('A corrected check-out cannot be in the future.',400,'REGULARIZATION_INVALID_INTERVAL');
  const workspace=await Workspace.findById(workspaceId).select('attendanceModuleEnabled timezone').session(dbSession).lean();
  const membership=await WorkspaceMembership.findOne({workspace:workspaceId,user:userId}).session(dbSession).lean();
  if(!workspace||!membership)throw codedError('Attendance workspace membership is unavailable.',409,'REGULARIZATION_CONTEXT_UNAVAILABLE');
  // This workday revision is also written by checkout and Leave decisions.
  // Concurrent transactions therefore retry against the same approved context.
  await AttendanceDay.updateOne({workspaceId,user:userId,workDateKey},{$inc:{evaluationRevision:1}},{session:dbSession});
  if(target&&corrected?.checkOutAt){
    const latest=approved.filter(r=>String(r.attendanceSession)===String(target._id)).at(-1);
    const resolution={request:latest?._id||entity._id,checkInAt:corrected.checkInAt,checkOutAt:corrected.checkOutAt,appliedAt:at,originalStatus:target.regularizationResolution?.originalStatus||target.status};
    await AttendanceSession.updateOne({_id:target._id,workspaceId,user:userId,workDateKey},{$set:{regularizationStatus:'APPROVED',regularizationResolution:resolution,
      // A correction of a still-open cycle also relinquishes its active slot.
      // Missed-checkout evidence remains MISSED_CHECKOUT with a resolved interval.
      ...(target.status==='ACTIVE'?{status:'CLOSED',checkOutAt:corrected.checkOutAt}: {})}},{session:dbSession,runValidators:true});
    // Never extend recorded task/capture time to an approved attendance time.
    // An already expired cycle keeps its original authoritative closure.
    await finalizeAttendanceWork({...target,checkOutAt:target.status==='MISSED_CHECKOUT'?(target.checkOutAt||target.missedCheckoutCutoffAt||target.reconciledAt||corrected.checkOutAt):corrected.checkOutAt},dbSession);
  }
  const {recomputeAttendanceDayForDate}=await import('./attendance.service.js');
  await recomputeAttendanceDayForDate({workspaceId,userId,membership,workspace,workDateKey,dbSession});
  if(target&&!corrected?.checkOutAt)await AttendanceSession.updateOne({_id:target._id,workspaceId,user:userId},{$set:{regularizationStatus:'APPROVED'}},{session:dbSession});
  entity.appliedAt=at;await entity.save({session:dbSession});
  await enqueueAttendanceEvent({workspaceId,user:userId,workDateKey,attendanceSession:target?._id,key:regularizationEventKey(entity._id),kind:'REGULARIZED'},dbSession);
}

export async function deliverRegularizationUpdate(entity){
  await processAttendanceEvents(entity.workspaceId,{key:regularizationEventKey(entity._id)});
}

// No blanket historical recalculation: repair only this caller's unresolved
// missed cycles with a real, already-approved, unapplied linked correction.
export async function repairApprovedMissedCheckoutsForUser({workspaceId,userId}){
  const missed=await AttendanceSession.find({workspaceId,user:userId,status:'MISSED_CHECKOUT','regularizationResolution.appliedAt':null}).sort({checkInAt:-1}).select('_id').limit(20).lean();
  if(!missed.length)return;
  const requests=await AttendanceRegularization.find({workspaceId,requester:userId,status:'APPROVED',appliedAt:null,attendanceSession:{$in:missed.map(s=>s._id)}}).sort({decidedAt:1,createdAt:1,_id:1}).limit(50).select('_id').lean();
  for(const request of requests){
    const transaction=await mongoose.startSession();let entity;
    try{
      await transaction.withTransaction(async()=>{
        entity=await AttendanceRegularization.findOne({_id:request._id,workspaceId,requester:userId,status:'APPROVED',appliedAt:null}).session(transaction);
        if(entity)await applyApprovedRegularization(entity,transaction);
      });
      if(entity)await deliverRegularizationUpdate(entity);
    }catch(error){
      // Invalid legacy corrections stay unresolved; approval alone is not proof
      // of successful application. Infrastructure failures must remain visible.
      if(!['REGULARIZATION_INVALID_INTERVAL','REGULARIZATION_SESSION_MISMATCH'].includes(error.code))throw error;
    }finally{await transaction.endSession();}
  }
}
