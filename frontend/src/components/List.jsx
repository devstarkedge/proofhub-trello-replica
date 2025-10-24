import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MoreHorizontal, X, Palette, Trash2 } from 'lucide-react';
import Card from './Card';
import AddCardForm from './AddCardForm';

const List = ({ list, cards, onAddCard, onDeleteCard, onCardClick, onDeleteList, onUpdateListColor, onMoveCard, onDragStart, onDragOver, onDrop }) => {
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [draggedCard, setDraggedCard] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [isListDragging, setIsListDragging] = useState(false);
  
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
  
  // ============ CARD DRAG AND DROP HANDLERS ============
  const handleCardDragStart = (e, card) => {
    setDraggedCard(card);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'card',
      cardId: card._id,
      sourceListId: list._id
    }));
    
    // Add visual feedback
    e.currentTarget.style.opacity = '0.5';
  };

  const handleCardDragOver = (e, targetCard, index) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedCard && draggedCard._id !== targetCard._id) {
      setDropTarget(targetCard._id);
      
      // Calculate if we're dragging above or below the target card
      const rect = e.currentTarget.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const isDraggingBelow = e.clientY > midpoint;
      
      setDragOverIndex(isDraggingBelow ? index + 1 : index);
    }
  };

  const handleCardDragLeave = (e) => {
    // Only clear if we're actually leaving the card area
    const rect = e.currentTarget.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      setDropTarget(null);
    }
  };

  const handleCardDrop = (e, targetCard) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dragData = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    
    if (dragData.type === 'card' && draggedCard && draggedCard._id !== targetCard._id) {
      const targetIndex = cards.findIndex(card => card._id === targetCard._id);
      const draggedIndex = cards.findIndex(card => card._id === draggedCard._id);

      let newPosition;
      
      // If within same list
      if (dragData.sourceListId === list._id) {
        if (dragOverIndex !== null) {
          newPosition = dragOverIndex > draggedIndex ? dragOverIndex - 1 : dragOverIndex;
        } else {
          newPosition = targetIndex;
        }
      } else {
        // Moving from another list
        newPosition = dragOverIndex !== null ? dragOverIndex : targetIndex;
      }

      // Call the move function with calculated position
      onMoveCard(draggedCard._id, list._id, newPosition);
    }
    
    handleDragEnd();
  };

  const handleListAreaDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dragData = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    
    if (dragData.type === 'card' && draggedCard) {
      e.dataTransfer.dropEffect = 'move';
      
      // If dragging over empty space in list, show drop at end
      if (cards.length === 0) {
        setDragOverIndex(0);
      } else if (!dropTarget) {
        setDragOverIndex(cards.length);
      }
    }
  };

  const handleListDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dragData = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    
    if (dragData.type === 'card' && draggedCard) {
      if (dragData.sourceListId !== list._id) {
        // Dropping card from another list at the end
        const newPosition = dragOverIndex !== null ? dragOverIndex : cards.length;
        onMoveCard(draggedCard._id, list._id, newPosition);
      }
    } else if (dragData.type === 'list') {
      // Handle list drop
      onDrop(e, list);
      setIsListDragging(false);
    }
    
    handleDragEnd();
  };
  
  const handleDragEnd = (e) => {
    setIsDragging(false);
    setDraggedCard(null);
    setDropTarget(null);
    setDragOverIndex(null);
    
    // Reset opacity
    if (e && e.currentTarget) {
      e.currentTarget.style.opacity = '1';
    }
  };
  
  // ============ LIST DRAG HANDLERS ============
  const handleListDragStart = (e) => {
    setIsListDragging(true);
    onDragStart(e, list);
    e.currentTarget.style.opacity = '0.6';
  };
  
  const handleListDragEnd = (e) => {
    setIsListDragging(false);
    e.currentTarget.style.opacity = '1';
  };
  
  const handleChangeColor = (colorName) => {
    onUpdateListColor(list._id, colorName);
    setShowColorPicker(false);
    setShowMenu(false);
  };
  
  // ============ STYLING FUNCTIONS ============
  const getCardWrapperClass = (card, index) => {
    const isBeingDragged = isDragging && draggedCard?._id === card._id;
    const isDropTarget = dropTarget === card._id;
    
    return `
      relative
      transition-all duration-300 ease-out
      ${isBeingDragged ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
      ${isDropTarget ? 'transform translate-y-1' : ''}
    `;
  };
  
  const getDropIndicatorClass = (index) => {
    if (dragOverIndex !== index || !isDragging) return 'hidden';
    
    return `
      h-2 
      bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400
      rounded-full 
      shadow-lg 
      shadow-blue-500/50
      mb-2 
      transition-all 
      duration-200
      animate-pulse
    `;
  };
  
  const listClass = `
    ${listColors[list.color] || 'bg-gray-100'} 
    rounded-xl 
    p-3 
    w-72 
    flex-shrink-0 
    h-fit 
    max-h-[calc(100vh-120px)] 
    flex 
    flex-col 
    transition-all 
    duration-300
    ${isListDragging ? 'opacity-60 scale-95 shadow-2xl ring-4 ring-blue-400 ring-opacity-50' : 'opacity-100 scale-100'}
    ${isDragging && !isListDragging ? 'ring-2 ring-blue-300 ring-opacity-30 bg-opacity-90' : ''}
    hover:shadow-lg
  `;
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={listClass}
      draggable
      onDragStart={handleListDragStart}
      onDragOver={onDragOver}
      onDrop={handleListDrop}
      onDragEnd={handleListDragEnd}
      style={{ cursor: 'grab' }}
    >
      {/* List Header */}
      <div className="flex items-center justify-between mb-3 cursor-move" style={{ cursor: 'grab' }}>
        <h3 className="font-semibold text-gray-800 text-sm px-2 flex-1">{list.title}</h3>
        <span className="text-xs text-gray-600 bg-white/50 px-2 py-1 rounded-full mr-2">
          {cards.length}
        </span>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAddingCard(true);
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <Plus size={16} />
                      Add card
                    </button>
                    
                    <div className="border-t border-gray-200 my-2"></div>
                    
                    {/* Color Picker */}
                    <div className="px-4 py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowColorPicker(!showColorPicker);
                        }}
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
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteList(list._id);
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
      <div 
        className="space-y-2 mb-2 overflow-y-auto flex-1 px-1"
        onDragOver={handleListAreaDragOver}
        onDrop={handleListDrop}
        onDragLeave={() => {
          if (!dropTarget) setDragOverIndex(null);
        }}
      >
        <AnimatePresence mode="popLayout">
          {/* Drop indicator at start */}
          {dragOverIndex === 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 8, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={getDropIndicatorClass(0)}
            />
          )}
          
          {cards.map((card, index) => (
            <div key={card._id}>
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className={getCardWrapperClass(card, index)}
                draggable
                onDragStart={(e) => handleCardDragStart(e, card)}
                onDragOver={(e) => handleCardDragOver(e, card, index)}
                onDragLeave={handleCardDragLeave}
                onDrop={(e) => handleCardDrop(e, card)}
                onDragEnd={handleDragEnd}
              >
                {/* Dragging Shadow Effect */}
                {isDragging && draggedCard?._id === card._id && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    className="absolute inset-0 bg-blue-200 rounded-lg blur-sm -z-10"
                  />
                )}
                
                <Card
                  card={card}
                  onClick={() => onCardClick(card)}
                  onDelete={onDeleteCard}
                  isDragging={isDragging && draggedCard?._id === card._id}
                />
              </motion.div>
              
              {/* Drop indicator after each card */}
              {dragOverIndex === index + 1 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 8, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className={getDropIndicatorClass(index + 1)}
                />
              )}
            </div>
          ))}
        </AnimatePresence>
        
        {/* Empty state drop zone */}
        {cards.length === 0 && isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-20 border-2 border-dashed border-blue-400 rounded-lg flex items-center justify-center text-blue-500 text-sm font-medium bg-blue-50"
          >
            Drop card here
          </motion.div>
        )}
      </div>
      
      {/* Add Card Section */}
      <div className="mt-auto">
        {isAddingCard ? (
          <AddCardForm
            listId={list._id}
            onAdd={handleAddCard}
            onCancel={() => setIsAddingCard(false)}
          />
        ) : (
          <button
            onClick={() => setIsAddingCard(true)}
            className="flex items-center gap-2 text-gray-700 hover:text-black text-sm w-full p-2 rounded-lg hover:bg-white hover:bg-opacity-30 transition-colors"
          >
            <Plus size={16} />
            Add a card
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default List;