import mongoose from 'mongoose';
import { run } from '../workspaces/workspaceContext.js';
import { DateTime } from 'luxon';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import AttendanceDay from './attendanceDay.model.js';
import AttendanceSession from './attendanceSession.model.js';
import AttendanceEvent from './attendanceEvent.model.js';
import { WorkSession } from '../tracking/tracking.models.js';
import { resolveAttendanceObserverUserIds } from './attendanceAuthorization.service.js';
import * as hooks from './attendanceHooks.js';
import { emitToUser, emitToUsers } from '../../realtime/emitters.js';

export async function enqueueAttendanceEvent(event,dbSession) {
  return AttendanceEvent.findOneAndUpdate({key:event.key},{$setOnInsert:event},{upsert:true,new:true,runValidators:true,session:dbSession});
}
// Share a workday write with checkout to serialize Leave decisions against it.
export async function enqueueLeaveAttendanceChanges(request,dbSession) {
  const workspace=await Workspace.findById(request.workspaceId).select('timezone').session(dbSession).lean();
  const zone=workspace?.timezone||'UTC';
  const start=DateTime.fromJSDate(new Date(request.startDate)).setZone(zone).toISODate(),end=DateTime.fromJSDate(new Date(request.endDate)).setZone(zone).toISODate();
  const days=await AttendanceDay.find({workspaceId:request.workspaceId,user:request.requester,workDateKey:{$gte:start,$lte:end}}).select('_id workDateKey').session(dbSession).lean();
  for(const day of days){
    await AttendanceDay.updateOne({_id:day._id},{$inc:{evaluationRevision:1}},{session:dbSession});
    await enqueueAttendanceEvent({workspaceId:request.workspaceId,user:request.requester,key:`leave-${request._id}-${request.status}-${day.workDateKey}`,kind:'RECALCULATE',workDateKey:day.workDateKey},dbSession);
  }
}

export async function processAttendanceEvents(workspaceId,{limit=20}={}) {
  for(let i=0;i<limit;i++){
    const now=new Date();
    const event=await AttendanceEvent.findOneAndUpdate({workspaceId,processedAt:null,availableAt:{$lte:now},claimedUntil:{$lte:now}},{$set:{claimedUntil:new Date(+now+60000)},$inc:{attempts:1}},{new:true,sort:{availableAt:1}}).lean();
    if(!event)break;
    try {
      const membership=await WorkspaceMembership.findOne({workspace:workspaceId,user:event.user}).lean();
      const activeMembership=membership?.status==='active';
      const workspace=await Workspace.findById(workspaceId).lean();
      if(!workspace)throw new Error('Attendance workspace no longer exists');
      if(event.kind==='RECALCULATE'){
        if(!membership)throw new Error('Attendance member context is unavailable for recomputation');
        const {recomputeAttendanceDayForDate}=await import('./attendance.service.js');
        const transaction=await mongoose.startSession();
        try{await transaction.withTransaction(async()=>{
          await AttendanceDay.updateOne({workspaceId,user:event.user,workDateKey:event.workDateKey},{$inc:{evaluationRevision:1}},{session:transaction});
          await recomputeAttendanceDayForDate({workspaceId,userId:event.user,membership,workspace,workDateKey:event.workDateKey,dbSession:transaction});
        });}finally{await transaction.endSession();}
      } else {
        const attendance=await AttendanceSession.findOne({_id:event.attendanceSession,workspaceId,user:event.user}).lean();
        if(!attendance||attendance.status==='ACTIVE')throw new Error('Checkout event has no completed attendance');
        const {finalizeAttendanceWork,emitChanged}=await import('../tracking/tracking.service.js');
        await finalizeAttendanceWork(attendance);
        const day=await AttendanceDay.findOne({workspaceId,user:event.user,workDateKey:event.workDateKey}).lean();
        const observers=activeMembership?await resolveAttendanceObserverUserIds({workspaceId,subjectUserId:event.user,subjectDepartmentIds:membership.department}):[];
        if(activeMembership)hooks.onCheckedOut(event.user,attendance,day,observers);
        for(const work of await WorkSession.find({workspaceId,attendanceSession:attendance._id}).lean())await emitChanged(work);
      }
      if(event.kind==='RECALCULATE'&&activeMembership){
        const observers=await resolveAttendanceObserverUserIds({workspaceId,subjectUserId:event.user,subjectDepartmentIds:membership.department});
        const payload={workspaceId,userId:event.user,workDateKey:event.workDateKey,eventId:String(event._id)};
        emitToUser(event.user,'attendance:updated',payload,workspaceId);
        if(observers.length)emitToUsers(observers,'attendance:updated',payload,workspaceId);
      }
      await AttendanceEvent.updateOne({_id:event._id,attempts:event.attempts},{$set:{processedAt:new Date(),lastError:'',claimedUntil:new Date(0)}});
    } catch(error) {
      await AttendanceEvent.updateOne({_id:event._id,attempts:event.attempts},{$set:{lastError:'Attendance update delivery will retry',claimedUntil:new Date(0),availableAt:new Date(Date.now()+Math.min(60000,1000*2**Math.min(event.attempts,6)))}});
      console.error('[Attendance] durable event retry:',event.kind,error.message);
    }
  }
}

export async function processAllAttendanceEvents(){
  for await(const workspace of Workspace.find({}).select('_id').cursor())await run({workspaceId:workspace._id},()=>processAttendanceEvents(workspace._id));
}
