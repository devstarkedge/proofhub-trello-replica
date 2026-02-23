/**
 * Label Service — orchestrates label CRUD + entity label management
 * Pure business logic (no req/res). Controllers handle HTTP.
 */

import labelRepo from '../../repositories/labelRepository.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

class LabelService {
  /* ── Board label CRUD ─────────────────────────── */

  async getLabelsByBoard(boardId) {
    return labelRepo.findByBoard(boardId);
  }

  async createLabel({ name, color, boardId, userId }) {
    if (!name || !boardId) {
      throw new ErrorResponse('Label name and board ID are required', 400);
    }

    const dup = await labelRepo.findDuplicate(boardId, name);
    if (dup) {
      throw new ErrorResponse(
        'A label with this name already exists in this project',
        400
      );
    }

    return labelRepo.create({
      name: name.trim(),
      color: color || '#3B82F6',
      board: boardId,
      createdBy: userId,
    });
  }

  async updateLabel(labelId, { name, color }) {
    const label = await labelRepo.findById(labelId);
    if (!label) throw new ErrorResponse('Label not found', 404);

    if (name && name.trim().toLowerCase() !== label.name.toLowerCase()) {
      const dup = await labelRepo.findDuplicate(label.board, name, labelId);
      if (dup) {
        throw new ErrorResponse(
          'A label with this name already exists in this project',
          400
        );
      }
    }

    const updates = {};
    if (name) updates.name = name.trim();
    if (color) updates.color = color;

    return labelRepo.updateById(labelId, updates);
  }

  async deleteLabel(labelId) {
    const label = await labelRepo.findById(labelId);
    if (!label) throw new ErrorResponse('Label not found', 404);

    await labelRepo.removeFromAllEntities(labelId);
    await labelRepo.deleteById(labelId);

    return { success: true };
  }

  /* ── Entity label management ──────────────────── */

  async addLabelsToCard(cardId, labelIds) {
    this._validateIds(labelIds);
    const card = await labelRepo.addLabelsToCard(cardId, labelIds);
    if (!card) throw new ErrorResponse('Card not found', 404);
    return card.labels;
  }

  async removeLabelsFromCard(cardId, labelIds) {
    this._validateIds(labelIds);
    const card = await labelRepo.removeLabelsFromCard(cardId, labelIds);
    if (!card) throw new ErrorResponse('Card not found', 404);
    return card.labels;
  }

  async addLabelsToSubtask(subtaskId, labelIds) {
    this._validateIds(labelIds);
    const subtask = await labelRepo.addLabelsToSubtask(subtaskId, labelIds);
    if (!subtask) throw new ErrorResponse('Subtask not found', 404);
    return subtask.tags;
  }

  async removeLabelsFromSubtask(subtaskId, labelIds) {
    this._validateIds(labelIds);
    const subtask = await labelRepo.removeLabelsFromSubtask(subtaskId, labelIds);
    if (!subtask) throw new ErrorResponse('Subtask not found', 404);
    return subtask.tags;
  }

  async addLabelsToNano(nanoId, labelIds) {
    this._validateIds(labelIds);
    const nano = await labelRepo.addLabelsToNano(nanoId, labelIds);
    if (!nano) throw new ErrorResponse('Nano-subtask not found', 404);
    return nano.tags;
  }

  async removeLabelsFromNano(nanoId, labelIds) {
    this._validateIds(labelIds);
    const nano = await labelRepo.removeLabelsFromNano(nanoId, labelIds);
    if (!nano) throw new ErrorResponse('Nano-subtask not found', 404);
    return nano.tags;
  }

  async syncLabels({ entityType, entityId, labelIds }) {
    if (!entityType || !entityId || !Array.isArray(labelIds)) {
      throw new ErrorResponse(
        'Entity type, entity ID, and label IDs are required',
        400
      );
    }

    let entity;
    let field;

    switch (entityType) {
      case 'card':
        entity = await labelRepo.setCardLabels(entityId, labelIds);
        field = 'labels';
        break;
      case 'subtask':
        entity = await labelRepo.setSubtaskLabels(entityId, labelIds);
        field = 'tags';
        break;
      case 'nano':
        entity = await labelRepo.setNanoLabels(entityId, labelIds);
        field = 'tags';
        break;
      default:
        throw new ErrorResponse('Invalid entity type', 400);
    }

    if (!entity) throw new ErrorResponse('Entity not found', 404);
    return entity[field];
  }

  /* ── Helpers ──────────────────────────────────── */

  _validateIds(ids) {
    if (!Array.isArray(ids)) {
      throw new ErrorResponse('Label IDs must be an array', 400);
    }
  }
}

export default new LabelService();
