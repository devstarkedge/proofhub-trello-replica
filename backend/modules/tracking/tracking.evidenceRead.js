import mongoose from 'mongoose';
import {ActivityInterval,TrackingScreenshot,WorkSession} from './tracking.models.js';
import {dashboardSegmentExpression} from './tracking.dashboardRead.js';
// Aggregate at the database instead of transferring a year's capture windows
// and screenshot states to Node for every employee list refresh.
export async function evidenceByUser(workspaceId,sessions,segments,start,end,options={}){
  if(!sessions.length)return new Map();
  const tenant=new mongoose.Types.ObjectId(String(workspaceId)),now=new Date();
  const excluded={$in:['$coverage',['excluded','locked','sleep']]};
  const distinct={$and:[{$eq:['$activityBasis','distinct-input-seconds-v1']},{$isNumber:'$inputActiveSeconds'},{$isNumber:'$inputEligibleSeconds'}]};
  const workLookup=options.fromWorkSessions?[{$lookup:{from:WorkSession.collection.name,let:{session:'$session',owner:'$user'},pipeline:[
    {$match:{workspaceId:tenant,$expr:{$and:[{$eq:['$_id','$$session']},{$eq:['$user','$$owner']}]}}},
    {$project:{segments:{$map:{input:{$filter:{input:{$ifNull:['$segments',[]]},as:'s',cond:dashboardSegmentExpression(options.query||{})}},as:'s',in:{session:'$_id',startedAt:'$$s.startedAt',endedAt:{$ifNull:['$$s.endedAt',{$ifNull:['$endedAt',end]}]}}}}}}
  ],as:'_work'}},{$set:{_eligibleSegments:{$ifNull:[{$first:'$_work.segments'},[]]}}}]:[];
  const rows=await ActivityInterval.aggregate([
    {$match:{workspaceId:tenant,session:{$in:sessions.map(s=>s._id)},startedAt:{$gte:start},endedAt:{$lte:end},$or:[{expiresAt:null},{expiresAt:{$gt:now}}]}},
    ...workLookup,
    {$set:{seconds:{$divide:[{$subtract:['$endedAt','$startedAt']},1000]},overlap:{$sum:{$map:{input:options.fromWorkSessions?'$_eligibleSegments':{$literal:segments},as:'s',in:{$cond:[{$eq:['$$s.session','$session']},{$max:[0,{$divide:[{$subtract:[{$min:['$endedAt','$$s.endedAt']},{$max:['$startedAt','$$s.startedAt']}]},1000]}]},0]}}}}}},
    {$match:{$expr:{$gte:['$overlap',{$subtract:['$seconds',0.001]}]}}},
    {$lookup:{from:TrackingScreenshot.collection.name,localField:'_id',foreignField:'interval',pipeline:[{$match:{workspaceId:tenant,status:{$ne:'DELETED'},$or:[{expiresAt:null},{expiresAt:{$gt:now}}]}},{$group:{_id:null,ready:{$sum:{$cond:[{$eq:['$status','READY']},1,0]}},pending:{$sum:{$cond:[{$eq:['$status','PENDING']},1,0]}}}}],as:'images'}},
    {$group:{_id:{user:'$user',coverage:'$coverage'},windows:{$sum:1},seconds:{$sum:'$seconds'},
      captured:{$sum:{$cond:[{$and:[{$not:[excluded]},{$gt:[{$ifNull:[{$first:'$images.ready'},0]},0]}]},1,0]}},
      pending:{$sum:{$ifNull:[{$first:'$images.pending'},0]}},
      inputActive:{$sum:{$cond:[{$and:[{$not:[excluded]},distinct]},'$inputActiveSeconds',0]}},
      inputEligible:{$sum:{$cond:[{$and:[{$not:[excluded]},distinct]},'$inputEligibleSeconds',0]}},
      mouse:{$sum:{$cond:[{$not:[excluded]},{$ifNull:['$mouseCount',0]},0]}},keyboard:{$sum:{$cond:[{$not:[excluded]},{$ifNull:['$keyboardCount',0]},0]}},
      knownMouse:{$sum:{$cond:[{$and:[{$not:[excluded]},{$isNumber:'$mouseCount'}]},1,0]}},knownKeyboard:{$sum:{$cond:[{$and:[{$not:[excluded]},{$isNumber:'$keyboardCount'}]},1,0]}}
    }}
  ]).option({maxTimeMS:10000,allowDiskUse:true});
  const result=new Map();
  for(const row of rows){const key=String(row._id.user),coverage=row._id.coverage,skip=['excluded','locked','sleep'].includes(coverage);
    const value=result.get(key)||{activeInputSeconds:0,eligibleInputSeconds:0,mouseCount:null,keyboardCount:null,knownSeconds:0,excludedSeconds:0,eligibleWindows:0,capturedWindows:0,pendingScreenshots:0,outcomes:{}};
    const noImage=skip||['inactive','activity-only'].includes(coverage);
    value.activeInputSeconds+=row.inputActive;value.eligibleInputSeconds+=row.inputEligible;value.knownSeconds+=row.seconds;value.excludedSeconds+=skip?row.seconds:0;value.eligibleWindows+=noImage?0:row.windows;value.capturedWindows+=noImage?0:row.captured;value.pendingScreenshots+=row.pending;value.outcomes[coverage]=row.windows;
    if(row.knownMouse)value.mouseCount=(value.mouseCount||0)+row.mouse;if(row.knownKeyboard)value.keyboardCount=(value.keyboardCount||0)+row.keyboard;
    result.set(key,value);
  }
  for(const value of result.values()){value.activityPercent=value.eligibleInputSeconds>0?value.activeInputSeconds/value.eligibleInputSeconds*100:null;value.captureSuccessPercent=value.eligibleWindows>0?value.capturedWindows/value.eligibleWindows*100:null;value.provisional=value.pendingScreenshots>0;}
  return result;
}
