import React, { useState } from 'react';
import { Plus, MoreHorizontal, X, Copy, Move, Eye, Palette, Zap, Archive, Trash2 } from 'lucide-react';
import Card from './Card';
import AddCardForm from './AddCardForm';

const List = ({ list, cards, onAddCard, onDeleteCard, onCardClick, onDeleteList, onUpdateListColor, onMoveCard }) => {
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [draggedCard, setDraggedCard] = useState(null);
  
  const handleAddCard = (listId, title) => {
    onAddCard(listId, title);
    setIsAddingCard(false);
  };
  
  const listColors = {
    '1': 'bg-blue-100',
    '2': 'bg-yellow-100',
    '3': 'bg-green-100',
    '4': 'bg-gray-100',
    'green': 'bg-green-200',
    'yellow': 'bg-yellow-200',
    'orange': 'bg-orange-200',
    'red': 'bg-red-200',
    'purple': 'bg-purple-200',
    'blue': 'bg-blue-200',
    'cyan': 'bg-cyan-200',
    'lime': 'bg-lime-200',
    'pink': 'bg-pink-200',
    'gray': 'bg-gray-200'
  };
  
  const colorOptions = [
    { name: 'green', class: 'bg-green-400' },
    { name: 'yellow', class: 'bg-yellow-400' },
    { name: 'orange', class: 'bg-orange-400' },
    { name: 'red', class: 'bg-red-400' },
    { name: 'purple', class: 'bg-purple-400' },
    { name: 'blue', class: 'bg-blue-400' },
    { name: 'cyan', class: 'bg-cyan-400' },
    { name: 'lime', class: 'bg-lime-400' },
    { name: 'pink', class: 'bg-pink-400' },
    { name: 'gray', class: 'bg-gray-400' }
  ];
  
  // Drag and drop handlers
  const handleDragStart = (e, card) => {
    setDraggedCard(card);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  
  const handleDrop = (e) => {
    e.preventDefault();
    if (draggedCard && draggedCard.listId !== list.id) {
      onMoveCard(draggedCard.id, list.id);
    }
    setDraggedCard(null);
  };
  
  const handleCardDragOver = (e, targetCard) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleChangeColor = (colorName) => {
    onUpdateListColor(list.id, colorName);
    setShowColorPicker(false);
    setShowMenu(false);
  };
  
  return (
    <div 
      className={`${listColors[list.color] || listColors[list.id] || 'bg-gray-100'} rounded-xl p-3 w-72 flex-shrink-0 h-fit max-h-[calc(100vh-120px)] flex flex-col`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* List Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800 text-sm px-2 flex-1">{list.title}</h3>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="text-gray-600 hover:bg-gray-200 p-1 rounded transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
            
            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => {
                    setShowMenu(false);
                    setShowColorPicker(false);
                  }}
                />
                <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-xl py-2 w-64 z-20 max-h-[500px] overflow-y-auto">
                  <div className="px-4 py-2 border-b border-gray-200">
                    <h3 className="font-semibold text-sm text-gray-800">List actions</h3>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowColorPicker(false);
                      }}
                      className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  
                  {/* Menu Options */}
                  <div className="py-2">
                    <button
                      onClick={() => setIsAddingCard(true)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Add card
                    </button>
                    
                    <div className="border-t border-gray-200 my-2"></div>
                    
                    {/* Color Picker */}
                    <div className="px-4 py-2">
                      <button
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="w-full text-left text-sm text-gray-700 hover:bg-gray-100 px-2 py-1 rounded flex items-center justify-between"
                      >
                        <span className="flex items-center gap-2">
                          <Palette size={16} />
                          Change list color
                        </span>
                      </button>
                      
                      {showColorPicker && (
                        <div className="mt-2 grid grid-cols-5 gap-2 p-2">
                          {colorOptions.map((color) => (
                            <button
                              key={color.name}
                              onClick={() => handleChangeColor(color.name)}
                              className={`${color.class} w-10 h-8 rounded hover:opacity-80 transition-opacity ${
                                list.color === color.name ? 'ring-2 ring-gray-800' : ''
                              }`}
                              title={color.name}
                            />
                          ))}
                        </div>
                      )}
                      
                      {list.color && (
                        <button
                          onClick={() => handleChangeColor(null)}
                          className="w-full text-left px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded mt-2 flex items-center justify-center gap-2"
                        >
                          <X size={14} />
                          Remove color
                        </button>
                      )}
                    </div>
                    
                    <div className="border-t border-gray-200 my-2"></div>
                    
                    {/* Automation Section */}
                    {/* <div className="px-4 py-2">
                      <button className="w-full text-left text-sm font-semibold text-gray-700 px-2 py-1 flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Zap size={16} />
                          Automation
                        </span>
                      </button>
                      <div className="mt-2 space-y-1">
                        <button className="w-full text-left px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">
                          When a card is added to the list...
                        </button>
                        <button className="w-full text-left px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">
                          Every day, sort list by...
                        </button>
                        <button className="w-full text-left px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">
                          Every Monday, sort list by...
                        </button>
                        <button className="w-full text-left px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded font-medium">
                          Create a rule
                        </button>
                      </div>
                    </div>
                    
                    <div className="border-t border-gray-200 my-2"></div>
                    
                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                      <Archive size={16} />
                      Archive this list
                    </button>
                    
                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2">
                      <Archive size={16} />
                      Archive all cards in this list
                    </button> */}
                    
                    <button
                      onClick={() => {
                        onDeleteList(list.id);
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      Delete this list
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Cards Container */}
      <div className="space-y-2 mb-2 overflow-y-auto flex-1">
        {cards.map(card => (
          <div
            key={card.id}
            draggable
            onDragStart={(e) => handleDragStart(e, card)}
            onDragOver={(e) => handleCardDragOver(e, card)}
          >
            <Card
              card={card}
              onClick={() => onCardClick(card)}
              onDelete={onDeleteCard}
            />
          </div>
        ))}
      </div>
      
      {/* Add Card Section */}
      {isAddingCard ? (
        <AddCardForm
          listId={list.id}
          onAdd={handleAddCard}
          onCancel={() => setIsAddingCard(false)}
        />
      ) : (
        <button
          onClick={() => setIsAddingCard(true)}
          className="flex items-center gap-2 text-gray-700 hover:text-black text-sm w-full p-2 rounded-lg hover:bg-orange-400 hover:bg-opacity-10 transition-colors"
        >
          <Plus size={16} />
          Add a card
        </button>
      )}
    </div>
  );
};

export default List;