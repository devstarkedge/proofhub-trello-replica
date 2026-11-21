import { createHash, randomUUID } from 'node:crypto';
import { Worker as ParseWorker } from 'node:worker_threads';
import mongoose from 'mongoose';
import TaskImport from '../models/TaskImport.js';
import List from '../models/List.js';
import Card from '../models/Card.js';
import User from '../models/User.js';
import { authorizeTaskImport } from './taskImportAccess.js';
import { requireProjectPermission } from './projectAuthorization.js';
import { createProjectTask } from './taskCreation.js';
import { validateImportRow } from './taskImportWorkbook.js';
import { run } from '../modules/workspaces/workspaceContext.js';
import { emitToUser } from '../realtime/index.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

export const importResultProjection = { 'rows.values': 0, 'rows.description': 0, 'rows.startDate': 0, 'rows.dueDate': 0, 'rows.statusName': 0 };
export const importSummary = job => ({
  id: String(job._id), board: String(job.board), workspaceId: String(job.workspaceId),
  fileName: job.fileName, status: job.status, total: job.total,
  processed: job.processed, successful: job.successful, failed: job.failed,
  pending: job.total - job.processed, updatedAt: job.updatedAt,
  warnings: job.rows?.filter(row => row.warning).map(row => ({ rowNumber: row.rowNumber, warning: row.warning })) || [],
  invalid: job.rows?.filter(row => row.error && row.status === 'PENDING').length || 0,
  errors: job.rows?.filter(row => row.error).map(row => ({ rowNumber: row.rowNumber, title: row.title, field: row.field, error: row.error })) || [],
});
const readyConnections = new WeakSet();
export async function requireImportIndexes() {
  const db = mongoose.connection.db;
  if (db && readyConnections.has(db)) return;
  await Promise.all([TaskImport.init(), Card.init()]);
  try {
    const [jobs, cards] = await Promise.all([TaskImport.collection.indexes(), Card.collection.indexes()]);
    const has = (indexes, key) => indexes.some(index => index.unique && JSON.stringify(index.key) === JSON.stringify(key));
    if (!has(jobs, { workspaceId: 1, user: 1, board: 1, digest: 1 }) || !has(jobs, { workspaceId: 1, board: 1, active: 1 }) || !has(cards, { workspaceId: 1, createdBy: 1, trackingCreationId: 1 })) throw new Error('missing indexes');
    if (db) readyConnections.add(db);
  } catch {
    throw new ErrorResponse('Task import is awaiting its database migration. Ask your administrator to run the pending migrations.', 503);
  }
}
let parsing = 0;
export async function parseWorkbook(buffer, statuses) {
  if (parsing >= 2) throw new ErrorResponse('Workbook validation is busy. Please retry shortly.', 429);
  parsing++;
  try {
    return await new Promise((resolve, reject) => {
      const worker = new ParseWorker(new URL('../workers/taskImportWorkbook.worker.js', import.meta.url), { workerData: { buffer, statuses }, resourceLimits: { maxOldGenerationSizeMb: 128 }, execArgv: [] });
      const timer = setTimeout(() => { void worker.terminate(); reject(new ErrorResponse('Workbook validation timed out', 400)); }, 15000);
      worker.once('message', result => { clearTimeout(timer); void worker.terminate(); result.error ? reject(new ErrorResponse(result.error, 400)) : resolve(result.rows); });
      worker.once('error', () => { clearTimeout(timer); reject(new ErrorResponse('Unable to read this workbook', 400)); });
      worker.once('exit', code => { clearTimeout(timer); if (code) reject(new ErrorResponse('Unable to read this workbook', 400)); });
    });
  } finally { parsing--; }
}
export async function validateWorkbook(req, file) {
  await requireImportIndexes();
  if (!file || !/\.xlsx$/i.test(file.originalname)) throw new ErrorResponse('Select an .xlsx file', 400);
  if (await TaskImport.countDocuments({ user: req.user.id, board: req.params.projectId, status: 'READY' }) >= 10) throw new ErrorResponse('There are too many unsubmitted imports. Reuse a recent workbook or try again later.', 429);
  const lists = await List.find({ board: req.params.projectId, isArchived: false }).select('title').lean();
  const rows = await parseWorkbook(file.buffer, lists.map(list => list.title));
  // Excel rewrites ZIP metadata when a file is saved. Use task values, including
  // physical row numbers, so duplicate submission protection survives that save.
  const digest = createHash('sha256').update(JSON.stringify(rows.map(row => [row.rowNumber, row.values]))).digest('hex');
  const filter = { workspaceId: req.workspaceId, user: req.user.id, board: req.params.projectId, digest };
  const existing = await TaskImport.findOne(filter).select(importResultProjection).lean();
  if (existing) return existing;
  try {
    return await TaskImport.create({ ...filter, department: req.params.departmentId, fileName: file.originalname.slice(0, 200), total: rows.length, rows, expiresAt: new Date(Date.now() + 30 * 86400000) });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return TaskImport.findOne(filter).lean();
  }
}
export async function ownedImport(req, jobId, { includeValues = false } = {}) {
  if (!mongoose.isValidObjectId(jobId)) throw new ErrorResponse('Import not found', 404);
  const query = TaskImport.findOne({ _id: jobId, user: req.user.id, board: req.params.projectId, department: req.params.departmentId });
  const job = await (includeValues ? query : query.select(importResultProjection)).lean();
  if (!job) throw new ErrorResponse('Import not found', 404);
  return job;
}

export async function retryFailedImport(req, jobId) {
  await requireImportIndexes();
  const source = await ownedImport(req, jobId, { includeValues: true });
  if (!['PARTIAL', 'FAILED'].includes(source.status) || !source.failed) throw new ErrorResponse('There are no completed failed rows to retry', 400);
  // One child per explicit retry intent; repeating the same request recovers
  // that child and can never resubmit the successful rows from its parent.
  const filter = { user: req.user.id, board: source.board, digest: `retry:${source._id}` };
  const existing = await TaskImport.findOne(filter).select(importResultProjection).lean();
  if (existing) return existing;
  const lists = await List.find({ board: source.board, isArchived: false }).select('title').lean();
  const rows = source.rows.filter(row => row.status === 'FAILED').map(row => ({
    ...validateImportRow(row.values, lists.map(list => list.title), row.rowNumber),
    ...(row.error?.includes('formulas and embedded') ? { error: row.error, field: row.field } : {}),
  }));
  try {
    return await TaskImport.create({ ...filter, workspaceId: req.workspaceId, department: source.department, retryOf: source._id, fileName: `Retry: ${source.fileName}`.slice(0, 200), rows, total: rows.length, expiresAt: new Date(Date.now() + 30 * 86400000) });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return TaskImport.findOne(filter).select(importResultProjection).lean();
  }
}

// One atomic Mongo lease owns a bounded batch. Each row is durable before its
// progress event. Task creation has its own unique key to survive a crash between
// the card write and the progress write, or an overlapping stale worker.
export async function processImportBatch(jobId, workspaceId) {
  await requireImportIndexes();
  return run({ workspaceId }, async () => {
    const owner = randomUUID(), now = new Date();
    const job = await TaskImport.findOneAndUpdate({ _id: jobId, workspaceId, status: { $in: ['QUEUED', 'PROCESSING'] }, leaseUntil: { $lte: now } }, {
      $set: { status: 'PROCESSING', leaseOwner: owner, leaseUntil: new Date(Date.now() + 120000) },
    }, { new: true, projection: { rows: 0 } }).lean();
    if (!job) return false;
    const batch = await TaskImport.findOne({ _id: job._id, leaseOwner: owner }).select({ rows: { $slice: [job.processed, 10] } }).lean();
    if (!batch) return false;
    for (let count = 0; count < 10 && job.processed < job.total; count++) {
      const index = job.processed, stored = batch.rows[count];
      let row = { ...stored };
      try {
        const user = await User.findOne({ _id: job.user, isActive: true }).select('name').lean();
        if (!user) throw new ErrorResponse('User access is no longer active', 403);
        // Fresh membership, role grants, project and list checks on every row.
        const req = { workspaceId, user: { ...user, id: String(user._id) }, body: {} };
        const project = await authorizeTaskImport(req, job.board, job.department);
        const lists = await List.find({ board: job.board, workspaceId, isArchived: false }).select('title board').lean();
        row = { ...validateImportRow(stored.values, lists.map(list => list.title), stored.rowNumber), attempts: stored.attempts || 0 };
        // Structural/formula errors detected by the workbook reader are retained.
        if (stored.error && stored.error.includes('formulas and embedded')) row = { ...row, field: stored.field, error: stored.error };
        if (row.error) throw new ErrorResponse(row.error, 400);
        if (row.startDate || row.dueDate) await requireProjectPermission(req, 'task.edit_dates', project);
        const list = lists.find(list => list.title === row.statusName);
        req.body = { title: row.title, description: row.description, board: job.board, list: list._id, startDate: row.startDate, dueDate: row.dueDate };
        const card = await createProjectTask(req, { creationId: `import:${job._id}:${index}`, authorizedProject: project, validatedList: list });
        row = { ...row, status: 'SUCCESS', card: card._id, error: undefined, field: undefined };
      } catch (error) {
        // A transient storage/side-effect failure retries this same creation key.
        // Validation/authorization failures belong only to this row.
        const transient = !error.statusCode || error.statusCode >= 500;
        if (transient && error.name !== 'ValidationError' && error.name !== 'CastError') {
          const attempts = (stored.attempts || 0) + 1;
          if (attempts < 3) {
            await TaskImport.updateOne({ _id: job._id, leaseOwner: owner, processed: index }, { $set: { [`rows.${index}.attempts`]: attempts, status: 'QUEUED', leaseUntil: new Date(0) } });
            throw error; // Queue backoff; the durable row key makes retries safe.
          }
          const saved = await Card.findOne({ workspaceId, board: job.board, createdBy: job.user, trackingCreationId: `import:${job._id}:${index}` }).select('_id').lean();
          row = saved
            ? { ...row, attempts, status: 'SUCCESS', card: saved._id, error: undefined, field: undefined, warning: 'Task was saved, but a creation side effect could not be confirmed. Refresh the project.' }
            : { ...row, attempts, status: 'FAILED', field: 'Task', error: 'Database processing failed after three attempts. Correct or retry this row.' };
        } else {
          const validation = Object.values(error.errors || {})[0];
          const saved = await Card.findOne({ workspaceId, board: job.board, createdBy: job.user, trackingCreationId: `import:${job._id}:${index}` }).select('_id').lean();
          row = saved
            ? { ...row, status: 'SUCCESS', card: saved._id, error: undefined, field: undefined, warning: 'Task was already saved before access or project configuration changed.' }
            : { ...row, status: 'FAILED', field: row.field || ({ title: 'Task Name', description: 'Task Description', startDate: 'Start Date', dueDate: 'End Date' }[validation?.path]) || 'Task', error: error.statusCode ? error.message : validation?.message || 'Task failed existing task validation' };
        }
      }
      const success = row.status === 'SUCCESS';
      const changed = await TaskImport.updateOne({ _id: job._id, leaseOwner: owner, processed: index }, {
        $set: { [`rows.${index}`]: row, leaseUntil: new Date(Date.now() + 120000) },
        $inc: { processed: 1, successful: success ? 1 : 0, failed: success ? 0 : 1 },
      });
      if (!changed.modifiedCount) return false;
      job.processed++; job.successful += success ? 1 : 0; job.failed += success ? 0 : 1;
      // Private, tenant-scoped counts only. Error details require a fresh API check.
      try { emitToUser(String(job.user), 'task-import-progress', { ...importSummary({ ...job, rows: [] }), updatedAt: new Date().toISOString() }, workspaceId); } catch { /* API reconciliation recovers missed delivery */ }
    }
    const finished = job.processed === job.total;
    const status = finished ? job.failed === 0 ? 'COMPLETED' : job.successful ? 'PARTIAL' : 'FAILED' : 'QUEUED';
    await TaskImport.updateOne({ _id: job._id, leaseOwner: owner }, { $set: {
      status, active: !finished, leaseUntil: new Date(0), ...(finished ? { completedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86400000) } : {}),
    } });
    try { emitToUser(String(job.user), 'task-import-progress', { ...importSummary({ ...job, rows: [], status }), updatedAt: new Date().toISOString() }, workspaceId); } catch { /* recover on reconnect */ }
    return !finished;
  });
}
