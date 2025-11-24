import { invalidateCache } from '../middleware/cache.js';

const ensureString = (id) => {
  if (!id) return null;
  return typeof id === 'string' ? id : id.toString();
};

export const invalidateHierarchyCache = ({
  boardId,
  listId,
  cardId,
  subtaskId,
  subtaskNanoId
}) => {
  const board = ensureString(boardId);
  const list = ensureString(listId);
  const card = ensureString(cardId);
  const subtask = ensureString(subtaskId);
  const nano = ensureString(subtaskNanoId);

  if (board) {
    invalidateCache(`/api/boards/${board}`);
    invalidateCache(`/api/lists/board/${board}`);
    invalidateCache(`/api/cards/board/${board}`);
  }

  if (list) {
    invalidateCache(`/api/lists/${list}`);
    invalidateCache(`/api/cards/list/${list}`);
  }

  if (card) {
    invalidateCache(`/api/cards/${card}`);
    invalidateCache(`/api/cards/${card}/activity`);
    invalidateCache(`/api/subtasks/task/${card}`);
  }

  if (subtask) {
    invalidateCache(`/api/subtasks/${subtask}`);
    invalidateCache(`/api/subtask-nanos/subtask/${subtask}`);
  }

  if (nano) {
    invalidateCache(`/api/subtask-nanos/${nano}`);
  }
};

