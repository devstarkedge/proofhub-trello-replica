import React, { useState, useCallback, useMemo, memo } from 'react';
import { Plus, X } from 'lucide-react';
import KanbanList from './List';

const Board = memo(({ lists, cardsByList, onAddCard, onDeleteCard, onCardClick, onAddList, onDeleteList, onUpdateListColor, onUpdateListTitle, onMoveCard, onMoveList }) => {
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [draggedList, setDraggedList] = useState(null);
  const [draggedCard, setDraggedCard] = useState(null);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  
  // Memoize list IDs for stable reference
  const listIds = useMemo(() => lists.map(l => l._id), [lists]);

  const handleAddList = useCallback(() => {
    if (newListTitle.trim()) {
      onAddList(newListTitle.trim());
      setNewListTitle('');
      setIsAddingList(false);
    }
  }, [newListTitle, onAddList]);

  const handleListDragStart = useCallback((e, list) => {
    setDraggedList(list);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('dragType', 'list');
    e.dataTransfer.setData('dragId', list._id);
  }, []);

  const handleListDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleListDrop = useCallback((e, targetList) => {
    e.preventDefault();
    const dragType = e.dataTransfer.getData('dragType');
    if (dragType === 'list' && draggedList && draggedList._id !== targetList._id) {
      // Determine if dropping before or after the target list based on mouse position
      const rect = e.currentTarget.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const newPosition = e.clientY < centerY ? targetList.position : targetList.position + 1;
      onMoveList(draggedList._id, newPosition);
    }
    setDraggedList(null);
  }, [draggedList, onMoveList]);

  const handleCardDragStart = useCallback((e, card) => {
    setDraggedCard(card);
    setIsDraggingCard(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card._id);
  }, []);

  const handleCardDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleCardDrop = useCallback((e, targetList) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    if (cardId && draggedCard && draggedCard.list !== targetList._id) {
      const newPosition = cardsByList[targetList._id]?.length || 0;
      // Derive status from target list title for immediate optimistic UI update
      const newStatus = targetList.title.toLowerCase().replace(/\s+/g, '-');
      onMoveCard(draggedCard._id, targetList._id, newPosition, newStatus);
    }
    setDraggedCard(null);
    setIsDraggingCard(false);
  }, [draggedCard, cardsByList, onMoveCard]);

  const handleDragEnd = useCallback(() => {
    setDraggedCard(null);
    setIsDraggingCard(false);
  }, []);
  
  return (
    <div className="p-4 h-[calc(100vh-64px)]">
      <div className="flex gap-3 pb-4 h-full">
        {/* Lists */}
        {lists.map((list, index) => (
          <div
            key={`${list._id}-${index}`}
            onDragOver={handleCardDragOver}
            onDrop={(e) => handleCardDrop(e, list)}
            className={`${isDraggingCard ? 'border-2 border-dashed border-blue-400 rounded-xl' : ''}`}
          >
            <KanbanList
              list={list}
              cards={cardsByList[list._id] || []}
              onAddCard={onAddCard}
              onDeleteCard={onDeleteCard}
              onCardClick={onCardClick}
              onDeleteList={onDeleteList}
              onUpdateListColor={onUpdateListColor}
              onUpdateListTitle={onUpdateListTitle}
              onMoveCard={onMoveCard}
              onDragStart={handleListDragStart}
              onDragOver={handleListDragOver}
              onDrop={handleListDrop}
              onCardDragStart={handleCardDragStart}
              onCardDragEnd={handleDragEnd}
            />
          </div>
        ))}
        
        {/* Add List */}
        <div className="w-72 flex-shrink-0">
          {isAddingList ? (
            <div className="bg-white bg-opacity-20 backdrop-blur-sm rounded-xl p-3">
              <input
                autoFocus
                type="text"
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddList();
                  if (e.key === 'Escape') {
                    setIsAddingList(false);
                    setNewListTitle('');
                  }
                }}
                placeholder="Enter list title..."
                className="w-full p-2 text-sm rounded mb-2 outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddList}
                  className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 transition-colors"
                >
                  Add list
                </button>
                <button
                  onClick={() => {
                    setIsAddingList(false);
                    setNewListTitle('');
                  }}
                  className="text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingList(true)}
              className="flex items-center gap-2 text-white bg-gray-400 bg-opacity-20 hover:bg-opacity-30 w-full p-3 rounded-xl transition-colors font-medium"
            >
              <Plus size={20} />
              Add another list
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

Board.displayName = 'Board';

export default Board;