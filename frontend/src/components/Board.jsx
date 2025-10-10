import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import List from './List';

const Board = ({ lists, cardsByList, onAddCard, onDeleteCard, onCardClick, onAddList, onDeleteList, onUpdateListColor, onMoveCard }) => {
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  
  const handleAddList = () => {
    if (newListTitle.trim()) {
      onAddList(newListTitle.trim());
      setNewListTitle('');
      setIsAddingList(false);
    }
  };
  
  return (
    <div className="p-4 overflow-x-auto h-[calc(100vh-64px)]">
      <div className="flex gap-3 pb-4 h-full">
        {/* Lists */}
        {lists.map(list => (
          <List
            key={list.id}
            list={list}
            cards={cardsByList[list.id] || []}
            onAddCard={onAddCard}
            onDeleteCard={onDeleteCard}
            onCardClick={onCardClick}
            onDeleteList={onDeleteList}
            onUpdateListColor={onUpdateListColor}
            onMoveCard={onMoveCard}
          />
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
};

export default Board;