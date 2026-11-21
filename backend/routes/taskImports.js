import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/authMiddleware.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { authorizeTaskImport } from '../services/taskImportAccess.js';
import { importSummary, importResultProjection, validateWorkbook, ownedImport, requireImportIndexes, retryFailedImport } from '../services/taskImport.js';
import { templateWorkbook, IMPORT_HEADERS, MAX_IMPORT_BYTES } from '../services/taskImportWorkbook.js';
import { taskImportOptions } from '../services/taskImportOptions.js';
import { run } from '../modules/workspaces/workspaceContext.js';
import { enqueueImport } from '../workers/taskImportWorker.js';
import TaskImport from '../models/TaskImport.js';

const router = express.Router({ mergeParams: true });
router.use(protect, asyncHandler(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  req.taskImportProject = await authorizeTaskImport(req, req.params.projectId, req.params.departmentId);
  next();
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 0 } }).single('file');
const sendWorkbook = async (res, book, name) => {
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.attachment(name);
  res.send(Buffer.from(await book.xlsx.writeBuffer()));
};
router.get('/template', asyncHandler(async (req, res) => {
  const options = await taskImportOptions(req.taskImportProject, req.workspaceId);
  if (!options.statuses.length || new Set(options.statuses).size !== options.statuses.length) throw new ErrorResponse('This project needs distinct active status names before importing', 400);
  await sendWorkbook(res, await templateWorkbook(options.statuses, options), 'flowtask-task-template.xlsx');
}));
router.post('/validate', (req, res, next) => upload(req, res, error => {
  // Multipart stream callbacks may run outside protect's AsyncLocalStorage
  // scope. Restore only the workspace already authenticated on this request.
  run({ workspaceId: req.workspaceId }, () => error ? next(new ErrorResponse(error.code === 'LIMIT_FILE_SIZE' ? 'Maximum file size is 2 MB' : 'Upload one .xlsx file', 400)) : next());
}), asyncHandler(async (req, res) => {
  const job = await validateWorkbook(req, req.file);
  res.status(200).json({ success: true, data: importSummary(job) });
}));
router.get('/latest', asyncHandler(async (req, res) => {
  const job = await TaskImport.findOne({ user: req.user.id, board: req.params.projectId, department: req.params.departmentId }).select(importResultProjection).sort({ active: -1, createdAt: -1 }).lean();
  res.json({ success: true, data: job ? importSummary(job) : null });
}));
router.get('/:jobId', asyncHandler(async (req, res) => res.json({ success: true, data: importSummary(await ownedImport(req, req.params.jobId)) })));
router.post('/:jobId/retry-failed', asyncHandler(async (req, res) => {
  res.json({ success: true, data: importSummary(await retryFailedImport(req, req.params.jobId)) });
}));
router.post('/:jobId/start', asyncHandler(async (req, res) => {
  await requireImportIndexes();
  const job = await ownedImport(req, req.params.jobId);
  if (job.status === 'READY') {
    if (await TaskImport.exists({ board: req.params.projectId, active: true })) throw new ErrorResponse('An import is already running for this project', 409);
    try {
      await TaskImport.updateOne({ _id: job._id, status: 'READY' }, { $set: { status: 'QUEUED', active: true }, $unset: { expiresAt: 1 } });
    } catch (error) {
      if (error.code === 11000) throw new ErrorResponse('An import is already running for this project', 409);
      throw error;
    }
  }
  if (['READY', 'QUEUED', 'PROCESSING'].includes(job.status)) {
    // The accepted job remains in MongoDB if Redis is down; recovery schedules
    // it after service restoration rather than reporting a false completion.
    await enqueueImport(job._id, req.workspaceId).catch(() => {});
  }
  res.status(202).json({ success: true, data: importSummary(await ownedImport(req, job._id)) });
}));
router.get('/:jobId/failed-rows', asyncHandler(async (req, res) => {
  const job = await ownedImport(req, req.params.jobId, { includeValues: true });
  const options = await taskImportOptions(req.taskImportProject, req.workspaceId);
  const book = await templateWorkbook(options.statuses, options);
  const sheet = book.getWorksheet('Tasks');
  sheet.getRow(1).values = [...IMPORT_HEADERS, 'Excel Row', 'Failed Field', 'Error'];
  for (const row of job.rows.filter(row => row.error)) sheet.addRow([...IMPORT_HEADERS.map((_, index) => row.values[index] || ''), row.rowNumber, row.field || 'Task', row.error]);
  sheet.getColumn(10).width = 70;
  await sendWorkbook(res, book, 'flowtask-failed-tasks.xlsx');
}));
export default router;
