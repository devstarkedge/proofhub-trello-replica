import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import CardMovement from '../models/CardMovement.js';
import Card from '../models/Card.js';
import List from '../models/List.js';
import Board from '../models/Board.js';
import User from '../models/User.js';
import Activity from '../models/Activity.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import { authorizeProjectResource } from './projectAuthorization.js';
import { moveTaskHierarchy } from './taskMovement.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { run } from '../modules/workspaces/workspaceContext.js';
import { emitToBoard } from '../realtime/index.js';
import notificationService from '../utils/notificationService.js';
import { cancelDueDateJobs } from '../schedulers/cardDueDateScheduler.js';
const id = value => String(value?._id || value || '');
const terminalExpiry = () => new Date(Date.now() + 7 * 86400000);
const publicReceipt = row => ({ operationId: row.operationId, status: row.status, data: row.result, error: row.error, errorStatus: row.errorStatus });
const temporary = error => error.name !== 'ValidationError' && error.name !== 'CastError' && ( !error.statusCode || error.statusCode >= 500 || [408, 429].includes(error.statusCode) || [112, 91, 6, 7].includes(error.code));
let running = false;

export async function enqueueCardMovements(req, operations) {
  if (!Array.isArray(operations) || !operations.length || operations.length > 20 || operations.some(input=>!input || typeof input!=='object' || Array.isArray(input))) throw new ErrorResponse('Submit 1–20 movements', 400);
  if (await CardMovement.countDocuments({status:{$in:['QUEUED','PROCESSING']}}).limit(5000) >= 5000) throw new ErrorResponse('Movement sync is busy; your device will retry shortly',429);
  const results = [];
  for (const input of operations) {
    try {
    if (!/^[\w-]{16,100}$/.test(input.operationId || '') || !mongoose.isValidObjectId(input.cardId) || !mongoose.isValidObjectId(input.destinationListId) || !Number.isSafeInteger(input.position) || input.position < 0 || !Number.isSafeInteger(input.expectedMovementRevision) || input.expectedMovementRevision < 0) throw new ErrorResponse('Invalid movement', 400);
    const payload = { cardId: input.cardId, destinationListId: input.destinationListId, position: input.position, expectedMovementRevision: input.expectedMovementRevision };
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    let row = await CardMovement.findOne({ user: req.user.id, operationId: input.operationId }).lean();
    if (row) { if (row.digest !== digest) throw new ErrorResponse('Movement ID was reused with different data', 409); results.push(publicReceipt(row)); continue; }
    const resource = await authorizeProjectResource(req, 'task', input.cardId, 'task.move');
    const destination = await List.findOne({ _id: input.destinationListId, board: resource.board, isArchived: false }).lean();
    if (!destination) throw new ErrorResponse('Destination list not found in this project', 400);
    try { row = await CardMovement.create({ workspaceId: req.workspaceId, user: req.user.id, operationId: input.operationId, digest,
      card: input.cardId, board: resource.board, destinationListId: destination._id, position: input.position, expectedMovementRevision: input.expectedMovementRevision }); }
    catch (error) { if (error.code !== 11000) throw error; row = await CardMovement.findOne({ user: req.user.id, operationId: input.operationId }).lean(); if (row.digest !== digest) throw new ErrorResponse('Movement ID was reused', 409); }
    results.push(publicReceipt(row));
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500) throw error;
      results.push({ operationId: input.operationId, status: 'FAILED', error: error.message, errorStatus: error.statusCode });
    }
  }
  void processCardMovementQueue().catch(() => {});
  return results;
}
export async function movementReceipts(req, operationIds) {
  if (!Array.isArray(operationIds) || operationIds.length > 50 || operationIds.some(value => !/^[\w-]{16,100}$/.test(value))) throw new ErrorResponse('Invalid movement IDs', 400);
  return (await CardMovement.find({ user: req.user.id, operationId: { $in: operationIds } }).lean()).map(publicReceipt);
}
async function publish(row) {
  const effect = row.effect;
  if (!effect) return;
  const card = { ...effect.card, _id: row.card, board: row.board, list: row.result.list, status: row.result.status };
  const current = await Card.findById(row.card).select('movementRevision').lean();
  if (!current || (current.movementRevision || 0) > row.result.movementRevision) { await CardMovement.updateOne({_id:row._id},{$set:{published:true}}); return; }
  const actor = effect.actor;
  const board = await Board.findById(row.board).select('name department').lean();
  if (!board) { await CardMovement.updateOne({_id:row._id},{$set:{published:true}}); return; }
  const { dispatchTaskStatusChange } = await import('../controllers/cardController.js');
  const statusChange = await dispatchTaskStatusChange({ card, oldStatus: effect.oldStatus, newStatus: card.status, actor, board });
  if (statusChange?.special === 'done') await cancelDueDateJobs(card._id).catch(() => {});
  await Activity.create({ type: 'card_moved', description: `Moved card "${card.title}"`, user: actor.id, board: row.board, card: row.card, list: card.list, contextType: 'task', metadata: { fromList: effect.fromList, toList: effect.toList, newPosition: row.result.position, operationId: row.operationId } });
  await emitToBoard(id(row.board), 'card-moved', { cardId: row.card, sourceListId: effect.sourceListId, destinationListId: card.list, newPosition: row.result.position, status: card.status, revision: row.result.__v, operationId: row.operationId, movedBy: actor });
  await emitToBoard(id(row.board), 'card-updated', { cardId: row.card, updates: row.result, operationId: row.operationId, updatedBy: actor });
  if (id(effect.sourceListId) !== id(card.list)) await notificationService.notifyTaskUpdated(card, actor.id, { moved: true, fromList: effect.fromList, toList: effect.toList, ...(statusChange ? { status: card.status, special: statusChange.special, message: statusChange.message } : {}) });
  await CardMovement.updateOne({ _id: row._id, status: 'APPLIED' }, { $set: { published: true } });
}
export async function processCardMovementQueue({ limit = 20 } = {}) {
  if (running || mongoose.connection.readyState !== 1) return;
  running = true;
  try {
    for (let i = 0; i < limit; i++) {
      const now = new Date(), owner = randomUUID();
      const claimed = await CardMovement.collection.findOneAndUpdate({ $or: [{ status: 'QUEUED', retryAt: { $lte: now } }, { status: 'PROCESSING', leaseUntil: { $lte: now } }] }, { $set: { status: 'PROCESSING', leaseOwner: owner, leaseUntil: new Date(Date.now() + 45000) }, $inc: { attempts: 1 } }, { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after' });
      const row = claimed?.value;
      if (!row) break;
      await run({ workspaceId: row.workspaceId }, async () => {
        try {
          const [member, user] = await Promise.all([WorkspaceMembership.findOne({ workspace: row.workspaceId, user: row.user, status: 'active' }).lean(), User.findOne({ _id: row.user, isActive: true }).select('name').lean()]);
          if (!member || !user) throw new ErrorResponse('Workspace access changed', 403);
          const req = { workspaceId: row.workspaceId, workspaceMembership: member, user: { ...user, id: id(row.user), _id: row.user, role: member.role } };
          await authorizeProjectResource(req, 'task', row.card, 'task.move');
          const list = await List.findOne({ _id: row.destinationListId, board: row.board, isArchived: false }).lean();
          if (!list) throw new ErrorResponse('Destination list is no longer available', 404);
          await moveTaskHierarchy(row.card, { boardId: row.board, expectedBoardId: row.board, listId: list._id, position: row.position,
            expectedMovementRevision: row.expectedMovementRevision, status: list.title.toLowerCase().replace(/\s+/g, '-'), movement: { ...row, actor: { id: id(row.user), name: user.name }, toList: list.title } });
        } catch (error) {
          const retry = temporary(error) && Date.now() - +row.createdAt < 7 * 86400000;
          await CardMovement.updateOne({ _id: row._id, leaseOwner: owner, status: 'PROCESSING' }, { $set: retry
            ? { status: 'QUEUED', retryAt: new Date(Date.now() + Math.min(30000, 500 * 2 ** Math.min(row.attempts, 6))), error: 'Movement will retry automatically' }
            : { status: 'FAILED', error: error.statusCode ? error.message : 'Movement could not be saved. Refresh the board and retry.', errorStatus: error.statusCode || 503, completedAt: new Date(), expiresAt: terminalExpiry() } });
        }
      });
    }
    // The movement is already committed. Delivery is recoverable independently.
    for (let index=0;index<limit;index++) {
      const publicationOwner=randomUUID();
      const delivery=await CardMovement.collection.findOneAndUpdate({status:'APPLIED',published:false,
        $and:[{$or:[{retryAt:{$lte:new Date()}},{retryAt:{$exists:false}}]},{$or:[{publicationLease:{$lte:new Date()}},{publicationLease:{$exists:false}}]}]},
        {$set:{publicationOwner,publicationLease:new Date(Date.now()+60000)}},{sort:{completedAt:1,_id:1},returnDocument:'after'});
      const row=delivery?.value;if(!row)break;
      await run({workspaceId:row.workspaceId},async()=>{
        try { await publish(row); }
        catch { await CardMovement.updateOne({_id:row._id,publicationOwner},{$set:{retryAt:new Date(Date.now()+30000)},$unset:{publicationLease:1}}); }
      });
    }
  } finally { running = false; }
}
