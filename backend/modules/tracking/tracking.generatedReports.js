import { randomUUID, createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import mongoose from 'mongoose';
import Report from './tracking.generatedReport.model.js';
import { WorkSession } from './tracking.models.js';
import Board from '../../models/Board.js';
import Card from '../../models/Card.js';
import { policyFor } from './tracking.service.js';
import { readRecentWorkBreakWindows } from '../attendance/attendanceWorkBreak.js';
import { trackingSessionCutoffStages, dashboardSegmentExpression, projectedTrackingStatus } from './tracking.dashboardRead.js';
import { generatedReportAccess, validateGeneratedReportFilters, assertGeneratedReportScope, generatedReportRecipients, reportId as id, reportError as fail } from './tracking.generatedReport.access.js';
import { buildTrackingWorkbook } from './tracking.generatedReport.build.js';
import { aggregateTrackingRows } from './tracking.generatedReport.workbook.js';
import { run } from '../workspaces/workspaceContext.js';
import { sendEmail } from '../../utils/email.js';
const bytes=value=>Buffer.isBuffer(value)?value:Buffer.from(value.value(true));
const publicReport = row => {
  const {workbook,rows,leaseOwner,leaseUntil,digest,...metadata}=row.toObject ? row.toObject() : row;
  return metadata;
};
let processing=false;

export async function generatedReportOptions(workspaceId,userId,query={}) {
  const access=await generatedReportAccess(workspaceId,userId);
  const departmentId=query.departmentId || '', projectId=query.projectId || '';
  const search = {};
  for (const field of ['userSearch','projectSearch','taskSearch']) { if (query[field] && (typeof query[field]!=='string' || query[field].length>80)) fail('Search is too long'); search[field]=String(query[field]||'').trim(); }
  const nameFilter = text => text ? { $regex: text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), $options:'i' } : null;
  if (departmentId && !access.allowedDepartments.has(departmentId)) fail('Department is outside your report scope',403);
  if (projectId && !mongoose.isValidObjectId(projectId)) fail('Invalid project');
    const projectFilter={isDeleted:{$ne:true},...(access.visibleProjectIds?{_id:{$in:[...access.visibleProjectIds]}}:{}),...(departmentId?{department:departmentId}:access.role==='manager'?{department:{$in:[...access.allowedDepartments]}}:{})};
    const projects=await Board.find({...projectFilter,...(search.projectSearch?{name:nameFilter(search.projectSearch)}:{})}).select('name department').sort({name:1}).limit(501).lean();
    let tasks=[];
    if (projectId) {
      if(!await Board.exists({$and:[projectFilter,{_id:projectId}]})) fail('Project is outside your report scope',403);
      tasks=await Card.find({board:projectId,...(search.taskSearch?{title:nameFilter(search.taskSearch)}:{})}).select('title isArchived').sort({title:1}).limit(501).lean();
    }
    const users=access.subjects.filter(person=>(!departmentId||person.departmentIds.includes(departmentId))&&(!search.userSearch||`${person.name} ${person.email}`.toLowerCase().includes(search.userSearch.toLowerCase())));
    return {departments:access.departments.map(d=>({_id:d._id,name:d.name})),users:users.slice(0,500).map(s=>({_id:s._id,name:s.name,email:s.email})),projects:projects.slice(0,500),tasks:tasks.slice(0,500),optionsLimited:users.length>500||projects.length>500||tasks.length>500,timezone:access.timezone,retentionDays:14,maxReports:10};
}
export async function createGeneratedReport(workspaceId,userId,input) {
  const access=await generatedReportAccess(workspaceId,userId);
  if (!/^[\w-]{16,100}$/.test(input.operationId||'')) fail('A report operation ID is required');
  if (!['download','email'].includes(input.method)) fail('Choose download or email delivery');
  const selection=await validateGeneratedReportFilters(access,input);
  const recipients=input.method==='email'?await generatedReportRecipients(access,input.recipients):[];
  const digest=createHash('sha256').update(JSON.stringify({filters:selection.filters,method:input.method,recipients})).digest('hex');
  const previous=await Report.findOne({createdBy:userId,operationId:input.operationId}).lean();
  if(previous){if(previous.digest!==digest)fail('Report operation ID was reused with different filters',409);assertGeneratedReportScope(access,previous);return publicReport(previous);}
  if(await Report.countDocuments({expiresAt:{$gt:new Date()}})>=10)fail('This workspace has 10 saved reports. Delete an older report or wait for its 14-day retention period.',409);
  let report;
  try { report=await Report.create({workspaceId,createdBy:userId,generatedBy:access.user.name,operationId:input.operationId,digest,...selection,name:`${selection.filters.period==='weekly'?'Weekly':'Monthly'} time tracking · ${selection.filters.startDate}`,recipients,emailStatus:recipients.length?'PENDING':'NONE',expiresAt:new Date(Date.now()+14*86400000)}); }
  catch(error){if(error.code===11000){const replay=await Report.findOne({createdBy:userId,operationId:input.operationId}).lean();if(replay && replay.digest===digest)return publicReport(replay);fail('A report is already being generated in this workspace. Retry when it finishes.',409);}throw error;}
  void processGeneratedReports().catch(()=>{});
  return publicReport(report);
}
export async function listGeneratedReports(workspaceId,userId) {
  const access=await generatedReportAccess(workspaceId,userId);
  const rows=await Report.find({expiresAt:{$gt:new Date()},...(access.role==='manager'?{createdBy:userId}:{})}).sort({createdAt:-1}).limit(10).lean();
  return rows.filter(row=>{try{assertGeneratedReportScope(access,row);return true;}catch{return false;}}).map(publicReport);
}
async function loadReport(workspaceId,userId,reportId,bytes='') {
  if(!mongoose.isValidObjectId(reportId))fail('Report not found',404);
  const access=await generatedReportAccess(workspaceId,userId);
  const report=await Report.findOne({_id:reportId,expiresAt:{$gt:new Date()}}).select(bytes).lean();
  if(!report)fail('Report not found',404);assertGeneratedReportScope(access,report);
  return {access,report};
}
export async function viewGeneratedReport(workspaceId,userId,reportId,pageInput=1) {
  const page=Number(pageInput);if(!Number.isInteger(page)||page<1||page>200)fail('Invalid report page');
  const {report}=await loadReport(workspaceId,userId,reportId,'+rows');
  const rows=report.rows?JSON.parse(gunzipSync(bytes(report.rows),{maxOutputLength:16*1024*1024}).toString('utf8')):[];
  return {...publicReport(report),details:rows.slice((page-1)*100,page*100).map(({sessionIds,...row})=>row),page,pages:Math.max(1,Math.ceil(rows.length/100))};
}
export async function downloadGeneratedReport(workspaceId,userId,reportId) {
  const {report}=await loadReport(workspaceId,userId,reportId,'+workbook');
  if(!['READY','EMPTY'].includes(report.status)||!report.workbook)fail('Report is not ready to download',409);
  return {filename:`flowtask-${report.filters.period}-${report.filters.startDate}.xlsx`,content:bytes(report.workbook)};
}
export async function deleteGeneratedReport(workspaceId,userId,reportId) {
  const {access,report}=await loadReport(workspaceId,userId,reportId);
  if(id(report.createdBy)!==id(userId) && access.role!=='admin')fail('Only the report creator or a workspace Admin may delete this report',403);
  if(report.active || report.emailStatus==='SENDING')fail('Wait for report processing to finish',409);
  await Report.deleteOne({_id:report._id,active:false,emailStatus:{$ne:'SENDING'}});
}
export async function retryGeneratedReportEmail(workspaceId,userId,reportId,input) {
  const {access,report}=await loadReport(workspaceId,userId,reportId);
  if(!['READY','EMPTY'].includes(report.status))fail('Generate the report before emailing it',409);
  const recipients=await generatedReportRecipients(access,input.recipients);
  if(input.confirmUnknown!==true && report.emailStatus==='UNKNOWN')fail('Delivery is uncertain. Confirm that you want to send another copy.',409);
  const updated=await Report.findOneAndUpdate({_id:report._id,emailStatus:{$nin:['SENDING','PENDING']}},{$set:{recipients,emailStatus:'PENDING',emailError:null}},{new:true}).lean();
  if(!updated)fail('Email delivery is already in progress',409);
  void processGeneratedReports().catch(()=>{});return publicReport(updated);
}
async function generate(report,access) {
  assertGeneratedReportScope(access,report);
  const now=new Date(report.createdAt),filters=report.filters;
  const [policy,workBreakWindows]=await Promise.all([policyFor(report.workspaceId),readRecentWorkBreakWindows(report.workspaceId,now)]);
  const projects=await Board.find(access.visibleProjectIds?{_id:{$in:[...access.visibleProjectIds]}}:{}).select('name department').lean();
  const collector=aggregateTrackingRows(null,access,report,new Map(projects.map(project=>[id(project._id),project])));
  const pipeline=[{$match:{user:{$in:report.subjectIds},startedAt:{$lt:new Date(filters.endAt)},$or:[{endedAt:null},{endedAt:{$gt:new Date(filters.startAt)}}]}},
    ...trackingSessionCutoffStages({workspaceId:report.workspaceId,now,policy,workBreakWindows}),
    {$set:{_viewStatus:{$cond:[{$and:[{$eq:[{$ifNull:['$endedAt',null]},null]},{$eq:['$_attendance.status','ACTIVE']},{$gte:['$_cutoff',now]}]},workBreakWindows.length?projectedTrackingStatus:'$status','CLOSED']}}},
    ...(filters.status?[{$match:{_viewStatus:filters.status}}]:[]),
    {$set:{segments:{$filter:{input:'$segments',as:'s',cond:dashboardSegmentExpression(filters)}}}},
    {$unwind:'$segments'},
    {$match:{'segments.startedAt':{$lt:new Date(filters.endAt)}}},
    {$project:{sessionId:'$_id',user:1,departmentIdsAtStart:1,cutoff:'$_cutoff',segment:'$segments'}}];
  const cursor=WorkSession.aggregate(pipeline).option({maxTimeMS:20000}).cursor({batchSize:100});let scanned=0;
  try {for await(const row of cursor){if(++scanned>50000)fail('Report exceeds 50,000 tracking segments. Select an employee or project.',413);collector.add(row);}}
  finally {await cursor.close();}
  const data=collector.finish();
  const serialized=JSON.stringify(data.rows);
  if(Buffer.byteLength(serialized)>16*1024*1024)fail('Report details are too large. Select an employee or project.',413);
  const rows=gzipSync(serialized),workbook=await buildTrackingWorkbook(report,data);
  if(rows.length+workbook.length>3*1024*1024)fail('Report exceeds the 3 MB storage limit. Select an employee or project.',413);
  return {rows,workbook,projectIds:[...new Set(data.rows.map(row=>row.projectId).filter(Boolean))],rowsCount:data.rows.length,sessionCount:data.sessionCount,totalSeconds:data.rows.reduce((sum,row)=>sum+row.seconds,0),status:data.rows.length?'READY':'EMPTY'};
}
async function deliver(report) {
  const access=await generatedReportAccess(report.workspaceId,report.createdBy);assertGeneratedReportScope(access,report);
  await generatedReportRecipients(access,report.recipients);
  await sendEmail({to:report.recipients.join(','),subject:`FlowTask ${report.filters.period} time tracking report`,html:`<p>Your FlowTask time tracking report for ${report.filters.startDate} to ${report.filters.endDate} is attached.</p><p>Times use ${report.filters.timezone}. Generated from authorized workspace records.</p>`,attachments:[{filename:`flowtask-${report.filters.period}-${report.filters.startDate}.xlsx`,content:bytes(report.workbook),contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}]});
}
export async function processGeneratedReports() {
  if(processing||mongoose.connection.readyState!==1)return;processing=true;
  try {
    const now=new Date(),owner=randomUUID();
    const claim=await Report.collection.findOneAndUpdate({expiresAt:{$gt:now},$or:[{status:'QUEUED'},{status:'PROCESSING',leaseUntil:{$lte:now}}]},{$set:{status:'PROCESSING',leaseOwner:owner,leaseUntil:new Date(Date.now()+120000)}},{sort:{createdAt:1},returnDocument:'after'});
    const report=claim?.value;
    if(report)await run({workspaceId:report.workspaceId},async()=>{
      try {
        const access=await generatedReportAccess(report.workspaceId,report.createdBy),result=await generate(report,access);
        // Roles/department assignments may change during a long export.
        assertGeneratedReportScope(await generatedReportAccess(report.workspaceId,report.createdBy),{...report,projectIds:result.projectIds});
        await Report.updateOne({_id:report._id,leaseOwner:owner,status:'PROCESSING'},{$set:{...result,active:false,completedAt:new Date()}});
      }catch(error){await Report.updateOne({_id:report._id,leaseOwner:owner,status:'PROCESSING'},{$set:{status:'FAILED',active:false,error:error.statusCode?error.message:'Report generation failed. Try a smaller selection.',emailStatus:'NONE',completedAt:new Date()}});}
    });
    // SMTP cannot be exactly-once. Recover an expired delivery as uncertain;
    // never automatically send a second copy after an ambiguous acknowledgement.
    await Report.collection.updateMany({emailStatus:'SENDING',leaseUntil:{$lte:new Date()}},{$set:{emailStatus:'UNKNOWN',emailError:'Delivery confirmation was interrupted. Check the recipient inbox before sending again.'}});
    const email=await Report.collection.findOneAndUpdate({status:{$in:['READY','EMPTY']},emailStatus:'PENDING',expiresAt:{$gt:new Date()}},{$set:{emailStatus:'SENDING',leaseOwner:owner,leaseUntil:new Date(Date.now()+120000)}},{sort:{createdAt:1},returnDocument:'after'});
    if(email?.value)await run({workspaceId:email.value.workspaceId},async()=>{
      try{await deliver(email.value);await Report.updateOne({_id:email.value._id,leaseOwner:owner,emailStatus:'SENDING'},{$set:{emailStatus:'SENT',emailError:null,emailSentAt:new Date()}});}
      catch(error){await Report.updateOne({_id:email.value._id,leaseOwner:owner,emailStatus:'SENDING'},{$set:{emailStatus:'FAILED',emailError:error.statusCode?error.message:'Email could not be confirmed. Check the recipient inbox before retrying.'}});}
    });
  }finally{processing=false;}
}
