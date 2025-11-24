import mongoose from 'mongoose';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';

const toObjectId = (id) => {
  if (!id) return null;
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id);
};

export const refreshCardHierarchyStats = async (cardId) => {
  if (!cardId) return;
  const cardObjectId = toObjectId(cardId);

  const subtaskAgg = await Subtask.aggregate([
    { $match: { task: cardObjectId } },
    {
      $group: {
        _id: '$task',
        total: { $sum: 1 },
        completed: {
          $sum: {
            $cond: [{ $eq: ['$status', 'done'] }, 1, 0]
          }
        }
      }
    }
  ]);

  const nanoAgg = await SubtaskNano.aggregate([
    { $match: { task: cardObjectId } },
    {
      $group: {
        _id: '$task',
        total: { $sum: 1 },
        completed: {
          $sum: {
            $cond: [{ $eq: ['$status', 'done'] }, 1, 0]
          }
        }
      }
    }
  ]);

  const subtaskStats = subtaskAgg[0] || { total: 0, completed: 0 };
  const nanoStats = nanoAgg[0] || { total: 0, completed: 0 };

  await Card.findByIdAndUpdate(cardObjectId, {
    subtaskStats: {
      total: subtaskStats.total || 0,
      completed: subtaskStats.completed || 0,
      nanoTotal: nanoStats.total || 0,
      nanoCompleted: nanoStats.completed || 0
    }
  });
};

export const refreshSubtaskNanoStats = async (subtaskId) => {
  if (!subtaskId) return;
  const subtaskObjectId = toObjectId(subtaskId);

  const nanoAgg = await SubtaskNano.aggregate([
    { $match: { subtask: subtaskObjectId } },
    {
      $group: {
        _id: '$subtask',
        total: { $sum: 1 },
        completed: {
          $sum: {
            $cond: [{ $eq: ['$status', 'done'] }, 1, 0]
          }
        }
      }
    }
  ]);

  const nanoStats = nanoAgg[0] || { total: 0, completed: 0 };

  await Subtask.findByIdAndUpdate(subtaskObjectId, {
    nanoCount: nanoStats.total || 0
  });
};

