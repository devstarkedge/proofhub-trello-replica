import AttendanceSession from '../attendance/attendanceSession.model.js';
import {WorkSession} from './tracking.models.js';
import {contextFor} from './tracking.service.js';
import {can} from './tracking.authorization.js';
import notificationService from '../../utils/notificationService.js';

export async function sendTrackingReminders(workspaceId,policy){
  if(!policy.enabled||!policy.remindersEnabled)return;
  const now=new Date(),grace=new Date(+now-policy.reminderDelayMinutes*60000),cooldown=new Date(+now-policy.reminderCooldownMinutes*60000);
  for await(const attendance of AttendanceSession.find({workspaceId,status:'ACTIVE',checkInAt:{$lte:grace},$or:[{trackingReminderAt:null},{trackingReminderAt:{$lte:cooldown}}]}).lean().cursor()){
    const session=await WorkSession.findOne({workspaceId,attendanceSession:attendance._id}).lean();
    if(session?.status==='RUNNING'||session?.pauses?.some(p=>!p.endedAt)||attendance.missedCheckoutCutoffAt&&+attendance.missedCheckoutCutoffAt<=+now)continue;
    let ctx;try{ctx=await contextFor(workspaceId,attendance.user);}catch{continue;}
    if(!can(ctx,'tracking.log',{workspaceId,user:attendance.user}))continue;
    // Claim atomically across maintenance processes without changing attendance evidence.
    const claimed=await AttendanceSession.updateOne({_id:attendance._id,status:'ACTIVE',trackingReminderAt:attendance.trackingReminderAt||null},{$set:{trackingReminderAt:now}});
    if(!claimed.modifiedCount)continue;
    await notificationService.createNotification({workspaceId,user:attendance.user,type:'reminder_sent',title:'Choose your work',message:'You are checked in. Select an assigned task or an individual agenda when you are ready to track work.',entityType:'User',entityId:attendance.user,action:'tracking_start',metadata:{url:'/time-tracking?start=1',attendanceSession:String(attendance._id)}},{email:false});
  }
}
