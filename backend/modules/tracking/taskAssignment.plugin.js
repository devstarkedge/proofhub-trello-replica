import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Board from '../../models/Board.js';
import { getActiveContext } from '../workspaces/workspaceContext.js';
import { TaskAssignmentEvent } from './tracking.models.js';
const id = value => String(value?._id || value);
function events(before, after, project, at, sequence) {
  const old = new Set((before || []).map(id)), next = new Set((after || []).map(id));
  return [ ...[...next].filter(u => !old.has(u)).map(user => ({ id: randomUUID(), user, project, at, sequence, type: 'ASSIGNED' })),
    ...[...old].filter(u => !next.has(u)).map(user => ({ id: randomUUID(), user, project, at, sequence, type: 'UNASSIGNED' })) ];
}
async function authorizeChanges(changes, task, dbSession) {
  const context = getActiveContext();
  const added = changes.filter(e => e.type === 'ASSIGNED').map(e => e.user);
  if (added.length) {
    const active = await WorkspaceMembership.countDocuments({workspace:task.workspaceId,user:{$in:added},status:'active'}).session(dbSession || null);
    if (active !== new Set(added).size) { const error=new Error('Task assignees must be active members of this workspace');error.statusCode=403;throw error; }
  }
  if (!context?.actorId || !changes.length) return; // trusted background/system writer
  const { trackingContext, can } = await import('./tracking.authorization.js');
  const ctx = await trackingContext(task.workspaceId,context.actorId), project = await Board.findById(task.board).session(dbSession || null).lean();
  if (!project || !can(ctx,'task.assign',{...task,project,taskResource:task})) { const error=new Error('Task assignment permission required');error.statusCode=403;throw error; }
  for(const event of changes)event.actor=context.actorId;
}
// A durable outbox embedded in Card: the assignment and its authoritative
// timestamp commit in ONE atomic MongoDB write, including legacy writers.
export default function taskAssignmentPlugin(schema) {
  schema.add({ assignmentRevision: { type: Number, default: 0 }, assignmentEvents: { type: [new mongoose.Schema({
    id: String, sequence: Number, actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Board' }, at: Date,
    type: { type: String, enum: ['ASSIGNED', 'UNASSIGNED'] }
  }, { _id: false })], select: false, default: [] } });
  schema.post('init', doc => { doc.$locals.originalAssignees = (doc.assignees || []).map(id); });
  schema.pre('save', async function () {
    if (!this.isNew && this.isModified('assignmentEvents')) throw new Error('Assignment history is immutable');
    if (!this.isNew && !this.isModified('assignees')) return;
    const changes = events(this.isNew ? [] : this.$locals.originalAssignees, this.assignees, this.board, new Date(), (this.assignmentRevision || 0)+1);
    await authorizeChanges(changes,this.toObject(),this.$session());
    if (changes.length) {
      if (!this.assignmentEvents) {
        const old = await this.constructor.findById(this._id).select('+assignmentEvents').session(this.$session()).lean();
        this.assignmentEvents = old?.assignmentEvents || [];
      }
      this.assignmentEvents.push(...changes); this.assignmentRevision += 1; this.$locals.trackingAssignmentChanged = true;
    }
  });
  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], async function () {
    const update = this.getUpdate();
    if (!update || Array.isArray(update)) return;
    for (const [key, value] of Object.entries(update)) {
      if (/^assignment(Events|Revision)/.test(key) || key.startsWith('$') && value && Object.keys(value).some(k => /^assignment(Events|Revision)/.test(k))) throw new Error('Assignment history is immutable');
    }
    const values = update.assignees ?? update.$set?.assignees;
    if (values === undefined) {
      if (['$push', '$pull', '$addToSet', '$unset', '$pop'].some(op => update[op]?.assignees !== undefined)) throw new Error('Assign tasks using an explicit assignees array');
      return;
    }
    if (this.op === 'updateMany') throw new Error('Bulk assignments require individual atomic task updates');
    const previous = await this.model.findOne(this.getFilter()).select('workspaceId assignees board createdBy assignmentRevision').session(this.getOptions().session || null).lean();
    if (!previous) return;
    const changes = events(previous.assignees, values, previous.board, new Date(), (previous.assignmentRevision || 0)+1);
    if (!changes.length) return;
    await authorizeChanges(changes,previous,this.getOptions().session);
    this.and([{ assignees: previous.assignees }, previous.assignmentRevision ? { assignmentRevision: previous.assignmentRevision } : { $or: [{ assignmentRevision: 0 }, { assignmentRevision: { $exists: false } }] }]);
    this._trackingAssignment = true;
    // Normalize plain updates before adding operators, without changing values.
    const direct = Object.fromEntries(Object.entries(update).filter(([k]) => !k.startsWith('$')));
    const operators = Object.fromEntries(Object.entries(update).filter(([k]) => k.startsWith('$')));
    operators.$set = { ...direct, ...operators.$set };
    operators.$push = { ...operators.$push, assignmentEvents: { $each: changes } };
    operators.$inc = { ...operators.$inc, assignmentRevision: 1 };
    this.setUpdate(operators);
  });
  schema.post(['findOneAndUpdate', 'updateOne'], function (result) {
    if (this._trackingAssignment && (!result || result.matchedCount === 0)) {
      const error = new Error('Task assignment changed concurrently. Refresh and retry.'); error.statusCode = 409; throw error;
    }
  });
  const reconcile = function () {
    // The outbox is authoritative. A crash or failed emit is repaired by the
    // tracking maintenance sweep and every session read, never lost here.
    if (this.getOptions?.().session || this.$session?.() || !this._trackingAssignment && !this.$locals?.trackingAssignmentChanged) return;
    import('./tracking.service.js').then(m => m.reconcileWorkspaceSessions()).catch(() => {});
  };
  schema.post('save', reconcile);
  schema.post('findOneAndUpdate', reconcile);
  const archive = async (task,session) => {
    for(const event of task.assignmentEvents || []){
      const exists=await TaskAssignmentEvent.exists({workspaceId:task.workspaceId,eventId:event.id}).session(session || null);
      if(exists)continue;
      try { await TaskAssignmentEvent.create([{workspaceId:task.workspaceId,eventId:event.id,task:task._id,
        user:event.user,project:event.project,actor:event.actor,at:event.at,type:event.type,sequence:event.sequence,taskTitle:task.title}],{session});
      } catch(error){if(error.code!==11000)throw error;}
    }
  };
  schema.pre(['deleteOne','deleteMany','findOneAndDelete'],{query:true,document:false},async function(){
    const tasks=await this.model.find(this.getFilter()).select('+assignmentEvents').session(this.getOptions().session || null).lean();
    for(const task of tasks)await archive(task,this.getOptions().session);
  });
  schema.pre('deleteOne',{document:true,query:false},async function(){
    const task=await this.constructor.findById(this._id).select('+assignmentEvents').session(this.$session()).lean();
    if(task)await archive(task,this.$session());
  });
}
