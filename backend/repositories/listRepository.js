/**
 * List Repository
 */

import BaseRepository from './BaseRepository.js';
import List from '../models/List.js';
import Card from '../models/Card.js';
import Board from '../models/Board.js';
import Activity from '../models/Activity.js';

class ListRepository extends BaseRepository {
  constructor() {
    super(List);
  }

  async findListsByBoard(boardId) {
    return List.find({ board: boardId, isArchived: false })
      .sort('position')
      .lean();
  }

  async findBoardById(boardId) {
    return Board.findById(boardId).lean();
  }

  async getListCount(boardId) {
    return List.countDocuments({ board: boardId });
  }

  async updateListPositions(boardId, positionRange, increment) {
    return List.updateMany(
      { board: boardId, position: positionRange },
      { $inc: { position: increment } }
    );
  }

  async deleteCardsInList(listId) {
    return Card.deleteMany({ list: listId });
  }

  async createActivity(data) {
    return Activity.create(data);
  }
}

export default new ListRepository();
