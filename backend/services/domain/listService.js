/**
 * List Service — orchestrates list operations
 * Pure business logic (no req/res). Controllers handle HTTP.
 */

import listRepo from '../../repositories/listRepository.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

class ListService {
  async getListsByBoard(boardId) {
    return listRepo.findListsByBoard(boardId);
  }

  async createList({ title, boardId, position, color, userId }) {
    const board = await listRepo.findBoardById(boardId);
    if (!board) throw new ErrorResponse('Board not found', 404);

    const listPosition =
      position != null ? position : await listRepo.getListCount(boardId);

    const list = await listRepo.create({
      title,
      board: boardId,
      position: listPosition,
      color,
    });

    // fire-and-forget activity
    listRepo
      .createActivity({
        type: 'list_created',
        description: `Created list "${title}"`,
        user: userId,
        board: boardId,
        list: list._id,
      })
      .catch(() => {});

    return list;
  }

  async updateList(listId, updates, userId) {
    const list = await listRepo.updateById(listId, updates);
    if (!list) throw new ErrorResponse('List not found', 404);

    listRepo
      .createActivity({
        type: 'list_updated',
        description: `Updated list "${list.title}"`,
        user: userId,
        board: list.board,
        list: list._id,
      })
      .catch(() => {});

    return list;
  }

  async updateListPosition(listId, newPosition) {
    const list = await listRepo.findById(listId);
    if (!list) throw new ErrorResponse('List not found', 404);

    const oldPosition = list.position;
    if (newPosition === oldPosition) return list;

    if (newPosition > oldPosition) {
      await listRepo.updateListPositions(
        list.board,
        { $gt: oldPosition, $lte: newPosition },
        -1
      );
    } else {
      await listRepo.updateListPositions(
        list.board,
        { $gte: newPosition, $lt: oldPosition },
        1
      );
    }

    return listRepo.updateById(listId, { position: newPosition });
  }

  async deleteList(listId) {
    const list = await listRepo.findById(listId);
    if (!list) throw new ErrorResponse('List not found', 404);

    await listRepo.deleteCardsInList(list._id);
    await listRepo.deleteById(listId);

    return { success: true };
  }
}

export default new ListService();
