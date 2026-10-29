import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

const schema=new mongoose.Schema({
  workspaceId:{type:mongoose.Schema.Types.ObjectId,ref:'Workspace',required:true},
  user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
  key:{type:String,required:true},kind:{type:String,enum:['CHECKED_IN','CHECKED_OUT','RECALCULATE','WORK_CHANGED','REGULARIZED','CHAT_REPORT'],required:true},
  reportPayload:mongoose.Schema.Types.Mixed,reportOrder:Number,
  workSession:{type:mongoose.Schema.Types.ObjectId,ref:'WorkSession'},
  workRevision:Number,
  attendanceSession:{type:mongoose.Schema.Types.ObjectId,ref:'AttendanceSession'},workDateKey:String,
  availableAt:{type:Date,default:Date.now},claimedUntil:{type:Date,default:()=>new Date(0)},attempts:{type:Number,default:0},
  processedAt:{type:Date,default:null},lastError:String
},{timestamps:true});
schema.index({workspaceId:1,key:1},{unique:true});
schema.index({workspaceId:1,processedAt:1,availableAt:1,claimedUntil:1});
schema.index({workspaceId:1,workSession:1,processedAt:1,workRevision:1});
schema.index({workspaceId:1,kind:1,attendanceSession:1,processedAt:1,reportOrder:1});
schema.index({processedAt:1},{expireAfterSeconds:30*86400});
schema.plugin(workspaceScopePlugin);
export default mongoose.model('AttendanceEvent',schema);
