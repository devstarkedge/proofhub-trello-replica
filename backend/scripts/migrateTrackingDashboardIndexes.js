import {WorkSession,ActivityInterval} from '../modules/tracking/tracking.models.js';
import AttendanceSession from '../modules/attendance/attendanceSession.model.js';
import mongoose from 'mongoose';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
export async function runTrackingDashboardIndexMigration(){
  // Additive only: no collection scans in application reads, index drops,
  // session reconciliation, or historical attendance changes.
  await WorkSession.collection.createIndex({workspaceId:1,user:1,endedAt:1,startedAt:-1});
  await ActivityInterval.collection.createIndex({workspaceId:1,session:1,departmentIdsAtCapture:1});
  await AttendanceSession.collection.createIndex({workspaceId:1,user:1,workDateKey:1});
  return {indexesCreated:true,historicalRowsChanged:0};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  await import('dotenv/config');
  try{await mongoose.connect(process.env.MONGO_URI,{autoIndex:false,serverSelectionTimeoutMS:15000});console.log(JSON.stringify(await runTrackingDashboardIndexMigration()));}
  finally{await mongoose.disconnect();}
}
