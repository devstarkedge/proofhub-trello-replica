// Explicit, read-only connected profiling. Never fetches image bytes or calls
// HTTP audit/mutation handlers. Optional baseline is the preserved Git index.
import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DateTime} from 'luxon';
import User from '../models/User.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import {WorkSession,TrackingScreenshot} from '../modules/tracking/tracking.models.js';
import {readTrackingReports} from '../modules/tracking/tracking.reportRead.js';
import {screenshotDetails} from '../modules/tracking/tracking.gallery.js';
import {run} from '../modules/workspaces/workspaceContext.js';
import {closeSharedConnection} from '../queues/connection.js';
const report={readOnly:true,measurements:[]},temporary=[];
let writes=0,reads=0;
async function measure(mode,fn){const start=performance.now(),before=reads,result=await fn();report.measurements.push({mode,elapsedMs:Math.round(performance.now()-start),queries:reads-before,bytes:Buffer.byteLength(JSON.stringify(result)),sessions:result.sessions?.length});}
try{
  await mongoose.connect(process.env.MONGO_URI,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:15000});
  const workspaceId=process.env.FLOWTASK_DIAGNOSTIC_WORKSPACE;if(!mongoose.isValidObjectId(workspaceId))throw new Error('Explicit workspace required');
  const adminUsers=await User.find({name:process.env.FLOWTASK_DIAGNOSTIC_ADMIN_NAME||'Alpha'}).select('_id').lean();
  const admin=await WorkspaceMembership.findOne({workspace:workspaceId,status:'active',role:'admin',user:{$in:adminUsers.map(user=>user._id)}}).lean();if(!admin)throw new Error('Active workspace admin not found');
  await run({workspaceId},async()=>{
    const users=await User.find({name:process.env.FLOWTASK_DIAGNOSTIC_USER_NAME||'Sonu Gupta'}).select('_id').lean();
    const member=await WorkspaceMembership.findOne({workspace:workspaceId,status:'active',user:{$in:users.map(user=>user._id)}}).lean();if(!member)throw new Error('Requested workspace member not found');
    const work=await WorkSession.findOne({workspaceId,user:member.user}).sort({startedAt:-1}).select('_id workDateKey').lean();if(!work)throw new Error('No work session for requested member');
    const capture=await TrackingScreenshot.findOne({workspaceId,session:work._id,status:'READY',$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]}).sort({capturedAt:-1}).select('_id').lean();
    const params={userId:String(member.user),fromDate:DateTime.fromISO(work.workDateKey).minus({days:6}).toISODate(),toDate:work.workDateKey};
    let beforeReports,beforeDetails;
    if(process.env.FLOWTASK_COMPARE_INDEX==='true')for(const [filename,exportName]of [['tracking.reportRead.js','readTrackingReports'],['tracking.gallery.js','screenshotDetails']]){
      const target=new URL(`../modules/tracking/.detail-baseline-${randomUUID()}.js`,import.meta.url);temporary.push(target);
      await fs.writeFile(target,execFileSync('git',['show',`:backend/modules/tracking/${filename}`],{encoding:'utf8'}));
      const module=await import(target.href);if(exportName==='readTrackingReports')beforeReports=module[exportName];else beforeDetails=module[exportName];
    }
    mongoose.set('debug',(_collection,method)=>{/update|insert|delete|findOneAnd/.test(method)?writes++:reads++;});
    if(beforeReports)await measure('before-daily-sessions',()=>beforeReports(workspaceId,admin.user,params));
    await measure('after-daily-sessions',()=>readTrackingReports(workspaceId,admin.user,{...params,summaryOnly:'true'}));
    if(capture){if(beforeDetails)await measure('before-screenshot-metadata',()=>beforeDetails(workspaceId,admin.user,capture._id));await measure('after-screenshot-metadata',()=>screenshotDetails(workspaceId,admin.user,capture._id));}
  });
  report.writes=writes;if(writes)throw new Error('Unexpected mutation during read-only profiling');
}catch(error){report.error=error.message;process.exitCode=1;}
finally{mongoose.set('debug',false);await mongoose.disconnect();await closeSharedConnection();for(const target of temporary)await fs.rm(target,{force:true});}
if(process.env.FLOWTASK_DASHBOARD_EVIDENCE){await fs.mkdir(process.env.FLOWTASK_DASHBOARD_EVIDENCE,{recursive:true});await fs.writeFile(`${process.env.FLOWTASK_DASHBOARD_EVIDENCE}/connected-detail-performance.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
