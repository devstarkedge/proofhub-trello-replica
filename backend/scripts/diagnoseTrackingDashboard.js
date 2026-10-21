// Read-only probe. Never invokes tracking/session reconciliation or storage IO.
import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import User from '../models/User.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import {run} from '../modules/workspaces/workspaceContext.js';
import {dashboard} from '../modules/tracking/tracking.dashboard.js';
import {readTrackingReports,readTrackingTimeline} from '../modules/tracking/tracking.reportRead.js';
import {WorkSession} from '../modules/tracking/tracking.models.js';
import {closeSharedConnection} from '../queues/connection.js';
const report={readOnly:true,requests:[]};
try{
 await mongoose.connect(process.env.MONGO_URI,{autoIndex:false,serverSelectionTimeoutMS:15000});
 const workspaceId=process.env.FLOWTASK_DIAGNOSTIC_WORKSPACE;if(!mongoose.isValidObjectId(workspaceId))throw new Error('Explicit diagnostic workspace required');
 const users=await User.find({name:process.env.FLOWTASK_DIAGNOSTIC_ADMIN_NAME||'Alpha'}).select('_id').lean();
 const admin=await WorkspaceMembership.findOne({workspace:workspaceId,user:{$in:users.map(u=>u._id)},role:'admin',status:'active'}).lean();if(!admin)throw new Error('The requested active workspace admin was not found');
 let writes=0,queries=0;mongoose.set('debug',(_collection,method)=>{/update|insert|delete|findOneAnd/.test(method)?writes++:queries++;});
 await run({workspaceId},async()=>{
  for(const mode of [{summaryOnly:'false',deferTotals:'true'},{totalsOnly:'true'}]){
   const start=performance.now(),before=queries,result=await dashboard(workspaceId,admin.user,mode);
   report.requests.push({mode,elapsedMs:Math.round(performance.now()-start),queries:queries-before,responseBytes:Buffer.byteLength(JSON.stringify(result)),authorizedUsers:result.total,rows:result.users.length,totals:result.totals});
  }
  const session=await WorkSession.findOne({workspaceId}).sort({startedAt:-1}).select('user workDateKey').lean();
  if(session){const start=performance.now(),before=queries,result=await readTrackingReports(workspaceId,admin.user,{userId:String(session.user),fromDate:session.workDateKey,toDate:session.workDateKey});report.requests.push({mode:'employee-day-report',elapsedMs:Math.round(performance.now()-start),queries:queries-before,responseBytes:Buffer.byteLength(JSON.stringify(result)),sessions:result.sessions.length});}
  if(session){const start=performance.now(),before=queries,result=await readTrackingTimeline(workspaceId,admin.user,session._id,{summaryOnly:'false'});report.requests.push({mode:'employee-capture-timeline',elapsedMs:Math.round(performance.now()-start),queries:queries-before,responseBytes:Buffer.byteLength(JSON.stringify(result)),intervals:result.intervals.length});}
 });
 mongoose.set('debug',false);report.writes=writes;if(writes)throw new Error('Unexpected write during read-only verification');
}catch(error){report.error=String(error.message||'Diagnostic failed');process.exitCode=1;}
finally{mongoose.set('debug',false);await mongoose.disconnect();await closeSharedConnection();}
if(process.env.FLOWTASK_DASHBOARD_EVIDENCE){await fs.mkdir(process.env.FLOWTASK_DASHBOARD_EVIDENCE,{recursive:true});await fs.writeFile(`${process.env.FLOWTASK_DASHBOARD_EVIDENCE}/connected-read-verification.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
