import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import List from './List';

const Board = ({ lists, cardsByList, onAddCard, onDeleteCard, onCardClick, onAddList, onDeleteList, onUpdateListColor, onMoveCard, onMoveList }) => {
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [draggedList, setDraggedList] = useState(null);
  const [dragOverListId, setDragOverListId] = useState(null);
  const [isDraggingList, setIsDraggingList] = useState(false);
  
  const handleAddList = () => {
    if (newListTitle.trim()) {
      onAddList(newListTitle.trim());
      setNewListTitle('');
      setIsAddingList(false);
    }
  };

  const handleListDragStart = (e, list) => {
    setDraggedList(list);
    setIsDraggingList(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'list',
      listId: list._id
    }));
  };

  const handleListDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleListDragEnter = (e, targetList) => {
    e.preventDefault();
    if (draggedList && draggedList._id !== targetList._id) {
      setDragOverListId(targetList._id);
    }
  };

  const handleListDragLeave = (e, targetList) => {
    if (dragOverListId === targetList._id) {
      // Check if we're actually leaving the list element
      const rect = e.currentTarget.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        setDragOverListId(null);
      }
    }
  };

  const handleListDrop = (e, targetList) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dragData = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    
    if (dragData.type === 'list' && draggedList && draggedList._id !== targetList._id) {
      const draggedIndex = lists.findIndex(l => l._id === draggedList._id);
      const targetIndex = lists.findIndex(l => l._id === targetList._id);
      
      // Calculate drop position based on mouse position
      const rect = e.currentTarget.getBoundingClientRect();
      const midPoint = rect.left + rect.width / 2;
      const dropBefore = e.clientX < midPoint;
      
      let newPosition;
      if (dropBefore) {
        newPosition = targetIndex < draggedIndex ? targetIndex : targetIndex;
      } else {
        newPosition = targetIndex > draggedIndex ? targetIndex : targetIndex + 1;
      }
      
      onMoveList(draggedList._id, newPosition);
    }
    
    handleListDragEnd();
  };

  const handleListDragEnd = () => {
    setDraggedList(null);
    setDragOverListId(null);
    setIsDraggingList(false);
  };

  const getListWrapperClass = (list) => {
    const isBeingDragged = draggedList?._id === list._id;
    const isDropTarget = dragOverListId === list._id;
    
    return `
      relative
      transition-all 
      duration-300 
      ease-out
      ${isBeingDragged ? 'opacity-30 scale-95 z-50' : 'opacity-100 scale-100'}
      ${isDropTarget ? 'ml-4' : 'ml-0'}
    `;
  };
  
  return (
    <div className="p-4 overflow-x-auto h-[calc(100vh-64px)]">
      <div className="flex gap-3 pb-4 h-full">
        <AnimatePresence mode="popLayout">
          {/* Lists */}
          {lists.map((list, index) => (
            <motion.div
              key={list._id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={getListWrapperClass(list)}
              onDragEnter={(e) => handleListDragEnter(e, list)}
              onDragLeave={(e) => handleListDragLeave(e, list)}
              onDrop={(e) => handleListDrop(e, list)}
            >
              {/* Drop indicator - shown when hovering */}
              {dragOverListId === list._id && (
                <motion.div
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  exit={{ opacity: 0, scaleX: 0 }}
                  className="absolute -left-2 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 via-blue-500 to-blue-400 rounded-full shadow-lg shadow-blue-500/50"
                />
              )}
              
              {/* Glow effect when dragging over */}
              {dragOverListId === list._id && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.3 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-blue-400 rounded-xl blur-xl -z-10"
                />
              )}
              
              {/* Ghost preview when dragging */}
              {draggedList?._id === list._id && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.2 }}
                  className="absolute inset-0 bg-gray-800 rounded-xl shadow-2xl"
                />
              )}
              
              <List
                list={list}
                cards={cardsByList[list._id] || []}
                onAddCard={onAddCard}
                onDeleteCard={onDeleteCard}
                onCardClick={onCardClick}
                onDeleteList={onDeleteList}
                onUpdateListColor={onUpdateListColor}
                onMoveCard={onMoveCard}
                onDragStart={handleListDragStart}
                onDragOver={handleListDragOver}
                onDrop={(e) => handleListDrop(e, list)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        
        {/* Add List */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-72 flex-shrink-0"
        >
          {isAddingList ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white bg-opacity-20 backdrop-blur-sm rounded-xl p-3"
            >
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
                className="w-full p-2 text-sm rounded mb-2 outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAddList}
                  className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
                >
                  Add list
                </button>
                <button
                  onClick={() => {
                    setIsAddingList(false);
                    setNewListTitle('');
                  }}
                  className="text-gray-600 hover:text-gray-800 transition-colors p-1 hover:bg-gray-200 rounded"
                >
                  <X size={20} />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsAddingList(true)}
              className="flex items-center gap-2 text-white bg-gray-400 bg-opacity-20 hover:bg-opacity-30 w-full p-3 rounded-xl transition-all font-medium shadow-sm"
            >
              <Plus size={20} />
              Add another list
            </motion.button>
          )}
        </motion.div>
      </div>
      
      {/* Global drag overlay indicator */}
      {isDraggingList && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-white/90 backdrop-blur-lg px-6 py-3 rounded-full shadow-2xl border border-gray-200 z-50"
        >
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
            Dragging list...
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default Board;