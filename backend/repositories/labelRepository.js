/**
 * Label Repository
 */

import BaseRepository from './BaseRepository.js';
import Label from '../models/Label.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';

class LabelRepository extends BaseRepository {
  constructor() {
    super(Label);
  }

  /* ── Board labels ─────────────────────────────── */

  async findByBoard(boardId) {
    return Label.find({ board: boardId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async findDuplicate(boardId, name, excludeId = null) {
    const filter = {
      board: boardId,
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    };
    if (excludeId) filter._id = { $ne: excludeId };
    return Label.findOne(filter).lean();
  }

  /* ── Cascade delete ───────────────────────────── */

  async removeFromAllEntities(labelId) {
    return Promise.all([
      Card.updateMany({ labels: labelId }, { $pull: { labels: labelId } }),
      Subtask.updateMany({ tags: labelId }, { $pull: { tags: labelId } }),
      SubtaskNano.updateMany({ tags: labelId }, { $pull: { tags: labelId } }),
    ]);
  }

  /* ── Card labels ──────────────────────────────── */

  async addLabelsToCard(cardId, labelIds) {
    return Card.findByIdAndUpdate(
      cardId,
      { $addToSet: { labels: { $each: labelIds } } },
      { new: true }
    ).populate('labels');
  }

  async removeLabelsFromCard(cardId, labelIds) {
    return Card.findByIdAndUpdate(
      cardId,
      { $pull: { labels: { $in: labelIds } } },
      { new: true }
    ).populate('labels');
  }

  async setCardLabels(cardId, labelIds) {
    return Card.findByIdAndUpdate(
      cardId,
      { labels: labelIds },
      { new: true }
    ).populate('labels');
  }

  /* ── Subtask labels (tags) ────────────────────── */

  async addLabelsToSubtask(subtaskId, labelIds) {
    return Subtask.findByIdAndUpdate(
      subtaskId,
      { $addToSet: { tags: { $each: labelIds } } },
      { new: true }
    ).populate('tags');
  }

  async removeLabelsFromSubtask(subtaskId, labelIds) {
    return Subtask.findByIdAndUpdate(
      subtaskId,
      { $pull: { tags: { $in: labelIds } } },
      { new: true }
    ).populate('tags');
  }

  async setSubtaskLabels(subtaskId, labelIds) {
    return Subtask.findByIdAndUpdate(
      subtaskId,
      { tags: labelIds },
      { new: true }
    ).populate('tags');
  }

  /* ── Nano-subtask labels (tags) ───────────────── */

  async addLabelsToNano(nanoId, labelIds) {
    return SubtaskNano.findByIdAndUpdate(
      nanoId,
      { $addToSet: { tags: { $each: labelIds } } },
      { new: true }
    ).populate('tags');
  }

  async removeLabelsFromNano(nanoId, labelIds) {
    return SubtaskNano.findByIdAndUpdate(
      nanoId,
      { $pull: { tags: { $in: labelIds } } },
      { new: true }
    ).populate('tags');
  }

  async setNanoLabels(nanoId, labelIds) {
    return SubtaskNano.findByIdAndUpdate(
      nanoId,
      { tags: labelIds },
      { new: true }
    ).populate('tags');
  }
}

export default new LabelRepository();
