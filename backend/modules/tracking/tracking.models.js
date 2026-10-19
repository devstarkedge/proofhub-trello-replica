import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

const oid = (ref, required = false) => ({ type: mongoose.Schema.Types.ObjectId, ref, required });
const tenant = { workspaceId: oid('Workspace', true) };
function model(name, fields, indexes = [], options = {}) {
  const schema = new mongoose.Schema({ ...tenant, ...fields }, { timestamps: true, ...options });
  schema.plugin(workspaceScopePlugin);
  if (options.immutableAudit) {
    schema.pre('save',function(){if(!this.isNew)throw new Error('Assignment audit is immutable');});
    schema.pre(['findOneAndUpdate','updateOne','updateMany','replaceOne','findOneAndReplace','deleteOne','deleteMany','findOneAndDelete'],function(){throw new Error('Assignment audit is immutable');});
  }
  for (const [keys, opts] of indexes) schema.index(keys, opts);
  return mongoose.model(name, schema);
}
export const TrackingPolicy = model('TrackingPolicy', {
  enabled: { type: Boolean, default: false }, monitoringEnabled: { type: Boolean, default: true },
  configuredAt: Date, effectiveAt: Date, disabledAt: Date, disableRecoveryPending:Boolean,
  versions:[{_id:false,revision:Number,effectiveAt:Date,configuration:mongoose.Schema.Types.Mixed}],
  intervalSeconds: { type: Number, default: 600, min: 60, max: 3600 },
  idleThresholdSeconds: { type: Number, default: 60, min: 15, max: 900 },
  retentionDays: { type: Number, default: 365, min: 7, max: 365 },
  monitors:{type:String,enum:['primary','all'],default:'primary'},blur:{type:Boolean,default:false},personalPauseEnabled:{type:Boolean,default:true},
  excludedDisplayIds: {type:[String],default:[]}, excludeWindowTitles: {type:[String],default:[]},
  remindersEnabled:{type:Boolean,default:false},reminderDelayMinutes:{type:Number,default:15},reminderCooldownMinutes:{type:Number,default:60},
  includePreAssignment: { type: Boolean, default: false },
  revision: { type: Number, default: 1 }, updatedBy: oid('User')
}, [[{ workspaceId: 1 }, { unique: true }]]);

const segment = new mongoose.Schema({
  startedAt: { type: Date, required: true }, endedAt: { type: Date, default: null },
  kind: { type: String, enum: ['INDIVIDUAL', 'TASK'], required: true },
  project: oid('Board'), projectName: String, task: oid('Card'), taskTitle: String,
  agenda:oid('TrackingAgenda'),agendaTitle:String,description:String,
  attributionIncluded:Boolean,attributedProject:oid('Board'),attributedTask:oid('Card'),attributedProjectName:String,attributedTaskTitle:String,attributedAt:Date,
  candidateTask: oid('Card'), linkedTask: oid('Card'), assignedAt: Date,
  assignmentEventId: String, linkDecisionAt: Date, reason: String
}, { _id: true });
export const WorkSession = model('WorkSession', {
  departmentIdsAtStart: {type:[mongoose.Schema.Types.ObjectId],default:undefined},
  user: oid('User', true), attendanceSession: oid('AttendanceSession', true), workDateKey: String,
  startedAt: { type: Date, required: true, immutable: true }, endedAt: { type: Date, default: null },
  status: { type: String, enum: ['RUNNING', 'PAUSED', 'CLOSED'], required: true },
  segments: [segment], revision: { type: Number, default: 0 }, evidenceRevision: { type: Number, default: 0 },
  pauses: [{ startedAt: {type:Date,required:true}, endedAt: {type:Date,default:null}, reason: {type:String,default:'PERSONAL_PAUSE'} }],
  includePreAssignment: { type: Boolean, default: false },
  policyRevision:Number, reminderAt:Date,
  operations: [{ _id: false, id: String, digest: String, at: Date }],
  audit: [new mongoose.Schema({ id: String, type: String, at: Date, actor: oid('User'), detail: String }, { _id: false })]
}, [
  [{ workspaceId: 1, attendanceSession: 1 }, { unique: true }],
  [{ workspaceId: 1, user: 1 }, { unique: true, partialFilterExpression: { endedAt: null } }],
  [{ workspaceId: 1, user: 1, startedAt: -1 }, {}]
  ,[{ workspaceId: 1, 'segments.task': 1 }, {}]
  ,[{ workspaceId: 1, 'segments.linkedTask': 1 }, {}]
  ,[{ workspaceId: 1, 'segments.attributedTask': 1 }, {}]
  ,[{ workspaceId: 1, 'segments.agenda': 1 }, {}]
  ,[{ workspaceId: 1, user:1, workDateKey:1 }, {}]
]);

export const TrackingDevice = model('TrackingDevice', {
  user: oid('User', true), installationId: { type: String, required: true }, name: String,
  platform: String, appVersion: String, lastSeenAt: Date, revokedAt: Date,
  releasedAt: Date, monitoringDisplacedAt: Date,
  consentRevision: { type: Number, default: 0 }, consentAt: Date,
  noticeAuthorizationHash: {type:String,select:false},
  noticeVersion: Number,
  noticeHistory: [{ _id:false, version:Number, policyRevision:Number, acceptedAt:Date }],
  // Backward-compatible delivery cache, replaced from workspace policy on
  // every heartbeat. These fields are never employee-controlled authority.
  preferences: {
    enabled: { type: Boolean, default: false }, intervalSeconds: { type: Number, default: 600 },
    monitors: { type: String, enum: ['primary', 'all'], default: 'primary' },
    excludedDisplayIds: [String], excludeWindowTitles: [String], blur: { type: Boolean, default: false }
  },
  activeSession: oid('WorkSession'), leaseUntil: Date, leaseStartedAt: Date, leaseVersion: {type:Number,default:0},
  anchor: { id: String, serverAt: Date, expiresAt: Date, departments:[mongoose.Schema.Types.ObjectId], policyRevision:Number,capturePolicy:mongoose.Schema.Types.Mixed },
  anchors: [{ _id: false, id: String, serverAt: Date, expiresAt: Date, departments:[mongoose.Schema.Types.ObjectId], policyRevision:Number,capturePolicy:mongoose.Schema.Types.Mixed }],
  state: { type: String, default: 'unavailable' },
  lastUploadError: String, lastUploadErrorCode: String, lastUploadErrorAt: Date,
  screenshotIssue: String, screenshotIssueAt: Date
}, [
  [{ workspaceId: 1, user: 1, installationId: 1 }, { unique: true }],
  [{ workspaceId: 1, activeSession: 1 }, { unique: true, partialFilterExpression: { activeSession: { $type: 'objectId' } } }]
]);

export const ActivityInterval = model('ActivityInterval', {
  user: oid('User', true), session: oid('WorkSession', true), device: oid('TrackingDevice', true),
  operationId: { type: String, required: true }, digest: String,
  startedAt: { type: Date, required: true }, endedAt: { type: Date, required: true },
  mouseCount: { type: Number, default: null }, keyboardCount: { type: Number, default: null },
  activeSeconds: { type: Number, default: null }, idleSeconds: { type: Number, default: null },
  inputActiveSeconds: {type:Number,default:null}, inputEligibleSeconds: {type:Number,default:null}, activityBasis: String,
  policyRevision: Number,
  capturePolicy:mongoose.Schema.Types.Mixed,
  departmentIdsAtCapture: {type:[mongoose.Schema.Types.ObjectId],default:undefined},
  coverage: { type: String, enum: ['captured', 'excluded', 'locked', 'sleep', 'unavailable', 'partial'], required: true },
  inputAvailable: Boolean, screenshotAvailable: Boolean, timeBasis: { type: String, default: 'server-anchor-monotonic' },
  expiresAt: { type: Date, default:null }
}, [
  [{ workspaceId: 1, device: 1, operationId: 1 }, { unique: true }],
  [{ workspaceId: 1, session: 1, startedAt: 1 }, {}],
  [{ workspaceId: 1, session: 1, endedAt: -1, _id: -1 }, {}],
  [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]
]);
// Historical capture authorization survives device restart and lease renewal.
// A pending interval is checked against its original lease, never today's lease.
export const TrackingCaptureLease=model('TrackingCaptureLease',{
  user:oid('User',true),device:oid('TrackingDevice',true),session:oid('WorkSession',true),version:{type:Number,required:true},
  startedAt:{type:Date,required:true},endedAt:{type:Date,required:true},expiresAt:{type:Date,default:null}
},[[{workspaceId:1,device:1,version:1},{unique:true}],[{workspaceId:1,device:1,session:1,startedAt:1},{}],[{expiresAt:1},{expireAfterSeconds:0}]]);
export const TrackingCaptureAnchor=model('TrackingCaptureAnchor',{
  user:oid('User',true),device:oid('TrackingDevice',true),id:{type:String,required:true},serverAt:Date,expiresAt:Date,
  departments:[mongoose.Schema.Types.ObjectId],policyRevision:Number,capturePolicy:mongoose.Schema.Types.Mixed,purgeAt:{type:Date,default:null}
},[[{workspaceId:1,device:1,id:1},{unique:true}],[{purgeAt:1},{expireAfterSeconds:0}]]);
export const TrackingScreenshot = model('TrackingScreenshot', {
  user: oid('User', true), session: oid('WorkSession', true), device: oid('TrackingDevice', true),
  interval: oid('ActivityInterval', true), displayId: String, capturedAt: Date,
  checksum: String, contentMd5: String, bytes: Number, width: Number, height: Number,
  publicId: String, format: { type: String, default: 'webp' }, blurred: Boolean,
  captureId: String, recoveredFrom: String, targetBytes: Number, targetMet: Boolean,
  pipelineVersion: Number, originalWidth: Number, originalHeight: Number, compressionStrategy: String, compressionException: String,
  storageWorkspaceLabel: String, storageDepartmentLabel: String, storageUserLabel: String,
  storageDateKey: String, storageTimezone: String,
  thumbnail: {storageKey:String,bytes:Number,width:Number,height:Number,checksum:String,contentMd5:String,quality:Number,status:String,mimeType:String},
  storageProvider: String, storageKey: String, storageBucket: String, mimeType: String, quality: Number,
  departmentIdsAtCapture: {type:[mongoose.Schema.Types.ObjectId],default:undefined}, policyRevision: Number,
  uploadStatus: {type:String,enum:['PENDING','UPLOADING','UPLOADED','FAILED','RETRY_PENDING','EXPIRED','DELETED','SIZE_QUALITY_CONFLICT'],default:'PENDING'}, uploadedAt: Date,
  lastUploadError: String, storageMissingAt: Date,
  status: { type: String, enum: ['PENDING', 'READY', 'DELETED', 'FAILED'], default: 'PENDING' },
  expiresAt: { type: Date, default:null }, deletedAt: Date
}, [
  [{ workspaceId: 1, interval: 1, displayId: 1 }, { unique: true }],
  [{ workspaceId: 1, session: 1, capturedAt: 1 }, {}],
  [{ workspaceId: 1, user: 1, capturedAt: -1, _id: -1 }, {}],
  [{ workspaceId: 1, session: 1, capturedAt: -1, _id: -1 }, {}],
  [{ expiresAt: 1, status: 1 }, {}]
]);
export const TrackingStorageLabel=model('TrackingStorageLabel',{
  kind:{type:String,enum:['workspace','department','department-group','user'],required:true},ownerId:{type:mongoose.Schema.Types.ObjectId,required:true},label:{type:String,required:true}
},[[{workspaceId:1,kind:1,ownerId:1},{unique:true}],[{workspaceId:1,kind:1,label:1},{unique:true}],[{kind:1,label:1},{unique:true,partialFilterExpression:{kind:'workspace'}}]]);
export const TrackingAgenda=model('TrackingAgenda',{
  title:{type:String,required:true,maxlength:80},normalizedTitle:{type:String,required:true},createdBy:oid('User'),archivedAt:Date
},[[{workspaceId:1,normalizedTitle:1},{unique:true}]]);
// Archived authoritative events survive physical deletion of the source task.
// The Card outbox is the atomic write path; deletion copies it here first.
export const TaskAssignmentEvent = model('TaskAssignmentEvent', {
  eventId: { type:String,required:true,immutable:true }, task: oid('Card',true),
  user: oid('User',true), project: oid('Board',true), actor: oid('User'),
  at: { type:Date,required:true,immutable:true }, type: { type:String,enum:['ASSIGNED','UNASSIGNED'],immutable:true },
  sequence: Number, taskTitle: String
}, [[{workspaceId:1,eventId:1},{unique:true}],[{workspaceId:1,task:1,user:1,at:1},{}]], {immutableAudit:true});
