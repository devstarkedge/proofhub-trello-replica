import mongoose from 'mongoose';
import { randomUUID, createHash } from 'node:crypto';
import Board from '../../models/Board.js';
import Card from '../../models/Card.js';
import List from '../../models/List.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import AttendanceSession from '../attendance/attendanceSession.model.js';
import { id } from '../../authz/engine.js';
import { can, projectVisibilityFilter, trackingContext } from './tracking.authorization.js';
import { getActiveWorkspaceId, run } from '../workspaces/workspaceContext.js';
import { emitToUser } from '../../realtime/emitters.js';
import { TrackingPolicy, WorkSession, TrackingDevice, TaskAssignmentEvent, ActivityInterval,TrackingAgenda } from './tracking.models.js';
import { assertTimeline, closeTimeline, linkAssignment, endAssignment, summarize } from './tracking.timeline.js';
import { trackingVisibility, departmentsOf, historicalDepartmentScope,trackingRole } from './tracking.visibility.js';

export function fail(message, statusCode = 400, code = 'TRACKING_INVALID') {
  const error = new Error(message); Object.assign(error, { statusCode, code }); throw error;
}
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const objectId = value => {
  if (!mongoose.isValidObjectId(value)) fail('Invalid record identifier');
  return value;
};
export async function contextFor(workspaceId, userId) {
  const ctx = await trackingContext(workspaceId, userId);
  if (ctx.status !== 'active' || ctx.kind === 'guest') fail('Active workspace membership required', 403);
  return ctx;
}
export async function policyFor(workspaceId, dbSession = null) {
  const defaults={workspaceId,monitoringEnabled:true,intervalSeconds:600,idleThresholdSeconds:60,retentionDays:365,includePreAssignment:false,revision:1,monitors:'primary',blur:false,personalPauseEnabled:true,remindersEnabled:false,reminderDelayMinutes:15,reminderCooldownMinutes:60};
  const stored=await TrackingPolicy.findOne({workspaceId}).session(dbSession).lean();
  const policy={...defaults,...stored};
  if(!policy.configuredAt){policy.intervalSeconds=600;policy.retentionDays=365;}
  policy.enabled=Boolean(policy.enabled&&policy.configuredAt);
  policy.activationState=policy.enabled?'ENABLED':policy.configuredAt?'CONFIGURED_DISABLED':'NOT_CONFIGURED';
  return policy;
}
export async function workOptions(workspaceId, userId, projectId = null) {
  const ctx = await contextFor(workspaceId, userId);
  const own = { workspaceId, user: userId };
  const member=await WorkspaceMembership.findOne({workspace:workspaceId,user:userId,status:'active'}).lean(),role=await trackingRole(member,workspaceId);
  if (!can(ctx, 'tracking.log', own)) return { projects: [], tasks: [], lists: [], canTrack: false };
  const projects = (await Board.find(projectVisibilityFilter(ctx)).sort({ name: 1 }).lean()).filter(p => can(ctx, 'project.view', p));
  const assigned = await Card.distinct('board', { workspaceId, assignees: userId, isArchived: { $ne: true }, board: { $in: projects.map(p => p._id) } });
  const result = { canTrack: true, projects: projects.map(p => ({ _id: p._id, name: p.name,
    hasAssignedTasks: assigned.some(b => id(b) === id(p._id)),
    canCreate: ['admin','manager'].includes(role)&&can(ctx, 'task.create', { workspaceId, project: p, board: p._id, createdBy: userId }) && can(ctx, 'task.assign', { workspaceId, project: p, board: p._id, createdBy: userId }) })), tasks: [], lists: [],canCreateTasks:['admin','manager'].includes(role) };
  if (!projectId) return result;
  objectId(projectId);
  const project = projects.find(p => id(p._id) === id(projectId));
  if (!project) fail('Project not found', 404);
  const tasks = await Card.find({ workspaceId, board: projectId, isArchived: { $ne: true } }).sort({ title: 1 }).lean();
  result.tasks = tasks.filter(t => can(ctx, 'task.view', { ...t, project, taskResource: t })).map(t => ({
    _id: t._id, title: t.title, assigned: t.assignees.some(u => id(u) === id(userId)), unassigned: !t.assignees.length
  }));
  result.lists = await List.find({ workspaceId, board: projectId }).select('_id title').sort({ position: 1 }).lean();
  return result;
}
export async function validateSelection({ workspaceId, userId, selection, dbSession = null }) {
  if (!selection || selection.mode === 'ATTENDANCE_ONLY') return null;
  if (!['ASSIGNED', 'INDIVIDUAL'].includes(selection.mode)) fail('Select assigned task, individual work, or attendance only');
  const ctx = await contextFor(workspaceId, userId), policy = await policyFor(workspaceId, dbSession);
  if (!policy.enabled || !can(ctx, 'tracking.log', { workspaceId, user: userId })) fail('Work tracking is not permitted', 403);
  if(selection.mode==='INDIVIDUAL'&&selection.agendaId){
    const agenda=await TrackingAgenda.findOne({_id:objectId(selection.agendaId),workspaceId,archivedAt:null}).session(dbSession).lean();
    if(!agenda)fail('Agenda not found',404);
    if(typeof selection.description!=='string'||!selection.description.trim()||selection.description.trim().length>1000)fail('Describe what you are working on (1–1000 characters)');
    return {kind:'INDIVIDUAL',agenda:agenda._id,agendaTitle:agenda.title,description:selection.description.trim(),project:null,task:null};
  }
  if(selection.mode==='INDIVIDUAL'&&!selection.candidateTaskId)fail('Choose an agenda and describe what you are working on');
  const project = await Board.findOne({ _id: objectId(selection.projectId), workspaceId }).session(dbSession).lean();
  if (!project || !can(ctx, 'project.view', project)) fail('Project not found', 404);
  let task = null;
  const taskId = selection.mode === 'ASSIGNED' ? selection.taskId : selection.candidateTaskId;
  if (taskId) {
    task = await Card.findOne({ _id: objectId(taskId), workspaceId, board: project._id, isArchived: { $ne: true } }).select('+assignmentEvents').session(dbSession).lean();
    if (!task || !can(ctx, 'task.view', { ...task, project, taskResource: task })) fail('Task not found', 404);
  }
  if (selection.mode === 'ASSIGNED' && (!task || !task.assignees.some(u => id(u) === id(userId)) || !can(ctx, 'time.log', { ...task, project, taskResource: task }))) fail('Choose a task currently assigned to you', 403);
  if (selection.mode === 'INDIVIDUAL' && task?.assignees?.length) fail('Candidate task must be unassigned; select Assigned task to work on an assigned task');
  const assignment=selection.mode==='ASSIGNED'?[...(task.assignmentEvents||[])].reverse().find(e=>e.type==='ASSIGNED'&&id(e.user)===id(userId)&&id(e.project)===id(project._id)):null;
  return { kind: selection.mode === 'ASSIGNED' ? 'TASK' : 'INDIVIDUAL', project: project._id, projectName: project.name,
    task: selection.mode === 'ASSIGNED' ? task._id : null, taskTitle: selection.mode === 'ASSIGNED' ? task.title : null,
    candidateTask: selection.mode === 'INDIVIDUAL' ? task?._id || null : null,
    assignedAt:assignment?.at || null, assignmentEventId:assignment?.id || null };
}
function pushAudit(session, type, at, actor, detail = '') {
  session.audit.push({ id: randomUUID(), type, at, actor, detail });
}
export async function emitChanged(session) {
  if (!session) return;
  try { emitToUser(session.user, 'tracking:changed', { workspaceId: session.workspaceId, sessionId: session._id, revision: session.revision }, session.workspaceId); } catch { /* persisted state is recovered on read */ }
  // Reuse personal workspace rooms; report updates never broadcast private
  // task/session identifiers to unrelated employees or custom roles.
  try{
    for await(const member of WorkspaceMembership.find({workspace:session.workspaceId,status:'active',user:{$ne:session.user}}).select('user').cursor()){
      try{
        if(!await trackingVisibility(session.workspaceId,member.user,session.user,session.departmentIdsAtStart))continue;
        await authorizeRecord(await contextFor(session.workspaceId,member.user),session);
        emitToUser(member.user,'tracking:changed',{workspaceId:session.workspaceId,sessionId:session._id,revision:session.revision},session.workspaceId);
      }catch{/* recipient access changed or transport unavailable */}
    }
  }catch{/* polling recovers from temporary database/transport failures */}
}
// Called inside the ORIGINAL attendance transaction, never instead of checkIn.
export async function startWithAttendance({ attendance, selection, dbSession }) {
  if (!selection) return null;
  const existing = await WorkSession.findOne({ workspaceId: attendance.workspaceId, attendanceSession: attendance._id }).session(dbSession);
  if (existing) return existing;
  const policy = await policyFor(attendance.workspaceId, dbSession);
  const member=await WorkspaceMembership.findOne({workspace:attendance.workspaceId,user:attendance.user}).session(dbSession).lean();
  const [created] = await WorkSession.create([{
    workspaceId: attendance.workspaceId, user: attendance.user, attendanceSession: attendance._id,
    departmentIdsAtStart:departmentsOf(member),
    workDateKey: attendance.workDateKey, startedAt: attendance.checkInAt, status: 'RUNNING',policyRevision:policy.revision,
    segments: [{ ...selection, startedAt: attendance.checkInAt }], includePreAssignment: policy.includePreAssignment,
    audit: [{ id: randomUUID(), type: 'STARTED', at: attendance.checkInAt, actor: attendance.user }]
  }], { session: dbSession });
  return created;
}
export async function finalizeAttendanceWork(attendance, dbSession = null) {
  const session = await WorkSession.findOne({ workspaceId: attendance.workspaceId, attendanceSession: attendance._id, endedAt: null }).session(dbSession).lean();
  if (!session) return null;
  const at = attendance.checkOutAt || attendance.missedCheckoutCutoffAt || attendance.reconciledAt;
  if (!at) fail('Attendance closure requires an authoritative cutoff', 500);
  closeTimeline(session, at);
  pushAudit(session, 'ATTENDANCE_CLOSED', session.endedAt, session.user, attendance.closureReason || attendance.status);
  const saved = await WorkSession.findOneAndUpdate({ _id: session._id, workspaceId: session.workspaceId, revision: session.revision },
    { $set: { segments: session.segments, pauses: session.pauses || [], status: session.status, endedAt: session.endedAt, audit: session.audit }, $inc: { revision: 1 } }, { new: true, session: dbSession });
  if (!saved) fail('Work session changed concurrently; retry checkout', 409);
  if (!dbSession) emitChanged(saved);
  return saved;
}
export async function reconcileSession(sessionId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const session = await WorkSession.findById(sessionId).lean();
    if (!session) return null;
    const taskIds = [...new Set(session.segments.flatMap(s => [s.candidateTask, s.task]).filter(Boolean).map(id))];
    const tasks = await Card.find({ _id: { $in: taskIds } }).select('+assignmentEvents').lean();
    const missing=taskIds.filter(taskId=>!tasks.some(t=>id(t._id)===taskId));
    if(missing.length){
      const archived=await TaskAssignmentEvent.find({task:{$in:missing}}).sort({at:1,sequence:1}).lean();
      for(const taskId of missing){const events=archived.filter(e=>id(e.task)===taskId);if(events.length)tasks.push({_id:taskId,
        title:events.at(-1).taskTitle,board:events[0].project,isArchived:true,assignees:[],assignmentEvents:events.map(e=>({...e,id:e.eventId}))});}
    }
    let changed = false;
    for (const task of tasks) for (const event of [...(task.assignmentEvents || [])].sort((a,b) => +new Date(a.at) - +new Date(b.at) || (a.sequence || 0)-(b.sequence || 0) || a.id.localeCompare(b.id))) {
      if (id(event.user) !== id(session.user)) continue;
      if (session.audit.some(a => a.id === event.id)) continue;
      const before = JSON.stringify(session.segments);
      const linked = event.type === 'ASSIGNED' ? linkAssignment(session.segments, event, task) : endAssignment(session.segments, event, task);
      if (JSON.stringify(linked) === before) continue;
      // Permission is resolved fresh, never inferred from the outbox alone.
      if (event.type === 'ASSIGNED') {
        const ctx = await contextFor(session.workspaceId, session.user);
        const project = await Board.findById(event.project).lean();
        if (!project || !can(ctx, 'task.view', { ...task, project, taskResource: task }) || !can(ctx, 'time.log', { ...task, project, taskResource: task })) continue;
      }
      session.segments = linked;
      if (session.status === 'RUNNING' && !session.segments.some(s => !s.endedAt)) session.status = 'PAUSED';
      session.audit.push({ id: event.id, type: event.type === 'ASSIGNED' ? 'CANDIDATE_ASSIGNED' : 'TASK_UNASSIGNED', at: event.at, actor: session.user, detail: id(task._id) });
      changed = true;
    }
    const attendance = await AttendanceSession.findById(session.attendanceSession).lean();
    if (session.status !== 'CLOSED' && attendance && (attendance.status !== 'ACTIVE' || attendance.missedCheckoutCutoffAt && +new Date(attendance.missedCheckoutCutoffAt) <= Date.now())) {
      closeTimeline(session, attendance.checkOutAt || attendance.missedCheckoutCutoffAt || attendance.reconciledAt);
      pushAudit(session, 'ATTENDANCE_CLOSED', session.endedAt, session.user); changed = true;
    }
    if (session.status === 'RUNNING') {
      const open = session.segments.find(s => !s.endedAt), policy = await policyFor(session.workspaceId);
      let permitted = false;
      try {
        const ctx = await contextFor(session.workspaceId, session.user), project = open ? await Board.findById(open.project).lean() : null;
        const task = open?.kind === 'TASK' ? tasks.find(t => id(t._id) === id(open.task)) : null;
        permitted = policy.enabled && can(ctx, 'tracking.log', { workspaceId: session.workspaceId, user: session.user }) && (open?.agenda || project && can(ctx, 'project.view', project))
          && (open.kind !== 'TASK' || task && !task.isArchived && id(task.board) === id(open.project) && task.assignees.some(u => id(u) === id(session.user)) && can(ctx, 'time.log', { ...task, project, taskResource: task }));
      } catch (e) { if (e.statusCode !== 403) throw e; }
      if (!permitted && open) {
        open.endedAt = new Date(Math.max(!policy.enabled&&policy.disabledAt?+new Date(policy.disabledAt):Date.now(), +new Date(open.startedAt))); session.status = 'PAUSED';
        pushAudit(session, 'AUTHORIZATION_OR_POLICY_PAUSE', open.endedAt, session.user); changed = true;
      }
    }
    if (!changed) return session;
    const saved = await WorkSession.findOneAndUpdate({ _id: session._id, revision: session.revision },
      { $set: { segments: session.segments, pauses: session.pauses || [], audit: session.audit, status: session.status, endedAt: session.endedAt }, $inc: { revision: 1 } }, { new: true }).lean();
    if (saved) { emitChanged(saved); return saved; }
  }
  fail('Work session is busy; retry', 409);
}
export async function reconcileWorkspaceSessions(workspaceId = getActiveWorkspaceId()) {
  if (!workspaceId || mongoose.connection.readyState !== 1) return;
  return run({ workspaceId }, async () => {
    // Closed sessions are also reconciled for late assignment outbox delivery.
    const recent = await WorkSession.find({ workspaceId, $or: [{ endedAt: null }, { updatedAt: { $gte: new Date(Date.now() - 86400000) } }] }).select('_id').limit(200).lean();
    for (const s of recent) { try { await reconcileSession(s._id); } catch (e) { console.error('[Tracking] reconciliation:', e.message); } }
  });
}
export async function currentState(workspaceId, userId) {
  const ctx = await contextFor(workspaceId, userId);
  const policy = await policyFor(workspaceId);
  const attendance = await AttendanceSession.findOne({ workspaceId, user: userId, status: 'ACTIVE' }).lean();
  let session = await WorkSession.findOne({ workspaceId, user: userId, ...(attendance ? { attendanceSession: attendance._id } : {}) }).sort({ startedAt: -1 }).lean();
  if (session) session = await reconcileSession(session._id);
  const devices = await TrackingDevice.find({ workspaceId, user: userId, revokedAt: null }).select('-anchor -anchors').lean();
  return { workspaceId, serverNow: new Date(), policy, canTrack: policy.enabled && can(ctx, 'tracking.log', { workspaceId, user: userId }),
    canManagePolicy: await trackingRole(await WorkspaceMembership.findOne({workspace:workspaceId,user:userId,status:'active'}).lean(),workspaceId)==='admin'&&can(ctx,'tracking.manage_policy',{workspaceId}), canViewReports: can(ctx, 'tracking.view_reports'),
    attendance: attendance ? { _id: attendance._id, checkInAt: attendance.checkInAt, cutoffAt: attendance.missedCheckoutCutoffAt } : null,
    session: session ? { ...session, totals: summarize(session) } : null,
    devices: devices.map(d => ({ ...d, connected: Date.now() - +new Date(d.lastSeenAt || 0) < 45000 })) };
}
export async function changeWork({ workspaceId, userId, action, selection, operationId, expectedRevision }) {
  if (typeof operationId !== 'string' || !/^[\w-]{8,128}$/.test(operationId)) fail('An operation ID is required');
  if (!['start', 'switch', 'pause', 'resume', 'link'].includes(action)) fail('Unknown work action');
  const operationDigest = digest({ action, selection: selection || null });
  const dbSession = await mongoose.startSession(); let result;
  try { await dbSession.withTransaction(async () => {
    const attendance = await AttendanceSession.findOne({ workspaceId, user: userId, status: 'ACTIVE' }).session(dbSession).lean();
    if (!attendance || attendance.missedCheckoutCutoffAt && +new Date(attendance.missedCheckoutCutoffAt) <= Date.now()) fail('Check in before starting or changing work', 409);
    let session = await WorkSession.findOne({ workspaceId, attendanceSession: attendance._id }).session(dbSession).lean();
    const replay = session?.operations.find(op => op.id === operationId);
    if (replay) { if (replay.digest !== operationDigest) fail('Operation ID was already used for different work', 409); result = session; return; }
    if (session && session.status === 'CLOSED') fail('Work session has ended', 409);
    const policy=await policyFor(workspaceId,dbSession);
    if(!policy.enabled)fail('Time Tracking is disabled',403);
    await TrackingPolicy.updateOne({_id:policy._id,revision:policy.revision,enabled:true},{$inc:{__v:1}},{session:dbSession});
    if(action==='pause'&&policy.personalPauseEnabled===false)fail('Personal Pause is disabled by workspace policy',403);
    if (session && expectedRevision !== session.revision) fail('Work changed on another device; refresh and retry', 409, 'TRACKING_CONFLICT');
    const at = new Date(Math.max(Date.now(), session ? +new Date(session.segments.at(-1)?.startedAt || session.startedAt) : +new Date(attendance.checkInAt)));
    if (action === 'pause') {
      if (!session) fail('No work session to pause', 409);
      const open = session.segments.find(s => !s.endedAt); if (open) open.endedAt = at;
      if (session.status === 'RUNNING') { session.pauses ||= []; session.pauses.push({startedAt:at,endedAt:null,reason:'PERSONAL_PAUSE'}); }
      session.status = 'PAUSED';
    } else {
      let chosen = selection;
      if (action === 'resume') {
        if (!session || session.status !== 'PAUSED') fail('Work is not paused', 409);
        const last = session.segments.at(-1);
        chosen = { mode: last.kind === 'TASK' || last.linkedTask ? 'ASSIGNED' : 'INDIVIDUAL', projectId: last.project, taskId: last.task || last.linkedTask, candidateTaskId: last.candidateTask,agendaId:last.agenda,description:last.description };
      }
      const valid = await validateSelection({ workspaceId, userId, selection: chosen, dbSession });
      if (!valid) fail('Select work before starting a timer');
      if (!session) {
        const policy = await policyFor(workspaceId, dbSession);
        const member=await WorkspaceMembership.findOne({workspace:workspaceId,user:userId}).session(dbSession).lean();
        session = { _id: new mongoose.Types.ObjectId(), workspaceId, user: userId, attendanceSession: attendance._id,
          workDateKey: attendance.workDateKey, startedAt: at, status: 'RUNNING', endedAt: null, segments: [],
          includePreAssignment: policy.includePreAssignment, policyRevision:policy.revision, departmentIdsAtStart:departmentsOf(member),revision: 0, operations: [], audit: [] };
      } else if (action === 'start') fail('Work already exists; use switch or resume', 409);
      if (action === 'link'||session.segments.at(-1)?.agenda&&valid.kind==='TASK') {
        const last = session.segments.at(-1);
        if(last?.agenda){
          if(valid.kind!=='TASK'||typeof selection?.includePrevious!=='boolean')fail('Choose Yes or No for previous agenda work before linking');
          last.endedAt||=at;
          if(selection.includePrevious){let boundary=+new Date(last.endedAt);for(let i=session.segments.length-1;i>=0;i--){const s=session.segments[i];if(s.kind!=='INDIVIDUAL'||id(s.agenda)!==id(last.agenda)||s.description!==last.description||+new Date(s.endedAt)!==boundary)break;
            s.attributionIncluded=true;s.attributedTask=valid.task;s.attributedProject=valid.project;s.attributedProjectName=valid.projectName;s.attributedTaskTitle=valid.taskTitle;s.attributedAt=at;boundary=+new Date(s.startedAt);}}
          session.audit.push({id:operationId,type:selection.includePrevious?'AGENDA_LINK_INCLUDE':'AGENDA_LINK_SEPARATE',at,actor:userId,detail:JSON.stringify({agenda:last.agenda,title:last.agendaTitle,description:last.description,task:valid.task,previousEnd:at})});
          session.segments.push({...valid,startedAt:at,endedAt:null,reason:'AGENDA_LINK'});
          const pause=session.pauses?.find(p=>!p.endedAt);if(pause)pause.endedAt=at;session.status='RUNNING';
        }else{
        if (valid.kind !== 'TASK' || last?.kind !== 'INDIVIDUAL' || id(last.project) !== id(valid.project)) fail('Explicit linking requires individual work and an assigned task in the same project',409);
        const task = await Card.findById(valid.task).select('+assignmentEvents').session(dbSession).lean();
        const event = [...(task.assignmentEvents || [])].reverse().find(e=>id(e.user)===id(userId)&&e.type==='ASSIGNED'&&id(e.project)===id(valid.project));
        const assignmentAt = event?.at || null;
        const boundary = new Date(Math.max(+new Date(last.startedAt), Math.min(assignmentAt ? +new Date(assignmentAt) : +at, last.endedAt ? +new Date(last.endedAt) : +at)));
        const originalEnd = last.endedAt;
        const index = session.segments.length-1;
        last.linkedTask = valid.task; last.assignedAt = assignmentAt; last.linkDecisionAt = at; last.reason = 'EXPLICIT_LINK';
        if (+boundary === +new Date(last.startedAt)) {
          session.segments[index] = { ...last, ...valid, kind:'TASK', linkedTask:null,candidateTask:null,assignedAt:assignmentAt,linkDecisionAt:at };
        } else {
          last.endedAt = boundary;
          if (!originalEnd || +boundary < +new Date(originalEnd)) session.segments.push({ ...valid,startedAt:boundary,endedAt:originalEnd,assignedAt:assignmentAt,linkDecisionAt:at,reason:'EXPLICIT_LINK' });
        }
        // Paused work stays paused; an explicit historical link adds no time.
        }
      } else {
        const pause = session.pauses?.find(p=>!p.endedAt); if (pause) pause.endedAt = at;
        const open = session.segments.find(s => !s.endedAt);
        if (open) open.endedAt = at;
        session.segments.push({ ...valid, startedAt: at, endedAt: null, reason: action });
        session.status = 'RUNNING';
      }
    }
    // Also write-lock attendance. Checkout and a work change cannot commit
    // against different snapshots of whether this person is still checked in.
    await AttendanceSession.updateOne({ _id: attendance._id, status: 'ACTIVE' }, { $set: { updatedAt: new Date() } }, { session: dbSession });
    session.operations.push({ id: operationId, digest: operationDigest, at });
    pushAudit(session, action.toUpperCase(), at, userId);
    assertTimeline(session.segments);
    if (session.operations.length > 5000 || session.segments.length > 5000) fail('Daily work change limit reached', 429);
    result = await WorkSession.findOneAndUpdate({ _id: session._id, revision: session.revision }, {
      $set: { segments: session.segments, pauses: session.pauses || [], status: session.status, operations: session.operations, audit: session.audit },
      $setOnInsert: { workspaceId, user: userId, attendanceSession: attendance._id, workDateKey: attendance.workDateKey,
        startedAt: session.startedAt, endedAt: null, policyRevision:session.policyRevision, includePreAssignment: session.includePreAssignment,departmentIdsAtStart:session.departmentIdsAtStart },
      $inc: { revision: 1 }
    }, { new: true, upsert: session.revision === 0, runValidators: true, session: dbSession }).lean();
    if (!result) fail('Work changed concurrently', 409);
  }); } finally { await dbSession.endSession(); }
  emitChanged(result); return result;
}

export async function createWorkTask({ workspaceId, userId, user, projectId, listId, title, description = '', operationId }) {
  const ctx = await contextFor(workspaceId, userId);
  const member=await WorkspaceMembership.findOne({workspace:workspaceId,user:userId,status:'active'}).lean();
  if(!['admin','manager'].includes(await trackingRole(member,workspaceId)))fail('Only Admin and Manager can create tasks through work selection',403);
  const project = await Board.findById(objectId(projectId)).lean();
  const resource = { workspaceId, project, board: project?._id, createdBy: userId };
  if (!project || !can(ctx, 'task.create', resource) || !can(ctx, 'task.assign', resource)) fail('Task creation and self-assignment permission required', 403);
  const list = await List.findOne({ _id: objectId(listId), board: project._id, workspaceId }).lean();
  if (!list) fail('Project list not found', 404);
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200 || typeof description !== 'string' || description.length > 5000) fail('Enter a task title (1–200 characters) and a description up to 5000 characters');
  if (typeof operationId !== 'string' || !/^[\w-]{8,128}$/.test(operationId)) fail('Task creation requires an operation ID');
  const replay = await Card.findOne({ workspaceId, createdBy: userId, trackingCreationId: operationId }).lean();
  if (replay) {
    if (id(replay.board) !== id(projectId) || id(replay.list) !== id(listId) || replay.title !== title.trim() || (replay.description || '') !== description) fail('Task creation ID was reused',409);
    return replay;
  }
  // Reuse the established creation orchestration, activity and notifications.
  const { default: cardService } = await import('../../services/domain/cardService.js');
  try { return await cardService.createCard({ board: project._id, list: list._id, title: title.trim(), description, assignees: [userId], trackingCreationId: operationId }, user); }
  catch (error) {
    const persisted = await Card.findOne({ workspaceId, createdBy: userId, trackingCreationId: operationId }).lean();
    if (persisted) return persisted;
    throw error;
  }
}

export async function authorizeRecord(ctx, session, permission = 'tracking.view_reports') {
  if (!session || id(session.workspaceId) !== id(ctx.workspaceId)) fail('Record not found', 404);
  if(!await trackingVisibility(ctx.workspaceId,ctx.userId,session.user,session.departmentIdsAtStart))fail('Record not found',404);
  if (id(session.user) === id(ctx.userId)) return;
  // A session-wide summary cannot safely reveal portions captured in another
  // historical department. Mixed/legacy evidence is conservative for managers;
  // individual image access is checked against its own capture-time scope.
  if(permission==='tracking.view_reports'){
    const scope=await historicalDepartmentScope(ctx.workspaceId,ctx.userId,session.user);
    if(scope!==null && await ActivityInterval.exists({session:session._id,departmentIdsAtCapture:{$nin:scope}}))fail('Record not found',404);
  }
  const member = await WorkspaceMembership.findOne({ workspace: ctx.workspaceId, user: session.user, status: 'active' }).lean();
  if (!member || !can(ctx, permission, { workspaceId: ctx.workspaceId, user: session.user, departments: member.departments || member.department || [] })) fail('Record not found', 404);
  // Project grants/restrictions are evaluated for every segment; a broad
  // employee report must never reveal a private project through a time entry.
  const projectIds=session.segments.flatMap(s=>[s.project,s.attributedProject]).filter(Boolean);
  const projects = await Board.find({ _id: { $in: projectIds } }).lean();
  if (projects.length !== new Set(projectIds.map(id)).size || projects.some(p => !can(ctx, 'project.view', p))) fail('Record not found', 404);
}
