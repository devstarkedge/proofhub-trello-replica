import React, { useState, memo, useCallback, useMemo } from 'react';
import { Plus, MoreHorizontal, X, Palette, Trash2, Edit3 } from 'lucide-react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import Card from './Card';
import AddCardForm from './AddCardForm';
import DeletePopup from './ui/DeletePopup';

// Memoized color options
const listColors = {
  '1': 'bg-blue-100/50 border-blue-200',
  '2': 'bg-yellow-100/50 border-yellow-200',
  '3': 'bg-green-100/50 border-green-200',
  '4': 'bg-gray-100/50 border-gray-200',
  'green': 'bg-green-200/50 border-green-300',
  'yellow': 'bg-yellow-200/50 border-yellow-300',
  'orange': 'bg-orange-200/50 border-orange-300',
  'red': 'bg-red-200/50 border-red-300',
  'purple': 'bg-purple-200/50 border-purple-300',
  'blue': 'bg-blue-200/50 border-blue-300',
  'cyan': 'bg-cyan-200/50 border-cyan-300',
  'lime': 'bg-lime-200/50 border-lime-300',
  'pink': 'bg-pink-200/50 border-pink-300',
  'gray': 'bg-gray-200/50 border-gray-300'
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

const KanbanList = memo(({ list, cards, onAddCard, onDeleteCard, onCardClick, onDeleteList, onUpdateListColor, onUpdateListTitle, dragHandleProps, isDragging }) => {
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  
  const handleAddCard = useCallback((listId, title) => {
    onAddCard(listId, title);
    setIsAddingCard(false);
  }, [onAddCard]);
  
  // Dynamic list class
  const listClass = useMemo(() => 
    `${listColors[list.color] || 'bg-gray-100/50 border-gray-200'} border rounded-xl p-3 w-72 flex-shrink-0 flex flex-col transition-shadow relative group/list ${isDragging ? 'shadow-2xl ring-2 ring-purple-500/50' : 'shadow-sm'}`,
    [list.color, isDragging]
  );

  const handleChangeColor = useCallback((colorName) => {
    onUpdateListColor(list._id, colorName);
    setShowColorPicker(false);
    setShowMenu(false);
  }, [list._id, onUpdateListColor]);
  
  return (
    <div className={listClass}>
      {/* Background Blur Layer - Separate to avoid trapping fixed dragged items */}
      <div className="absolute inset-0 backdrop-blur-sm -z-10 rounded-xl" />
      
      {/* List Header */}
      <div 
        className="flex items-center justify-between mb-3 relative z-20"
        {...dragHandleProps}
        style={{ cursor: 'grab' }}
      >
        <h3 className="font-bold text-gray-900 text-[15px] px-2 flex-1 truncate uppercase tracking-tight">{list.title}</h3>
        <div className="flex items-center gap-1 opacity-0 group-hover/list:opacity-100 transition-opacity duration-200">
          <span className="text-xs font-bold text-gray-600 bg-white/60 px-2 py-0.5 rounded-full shadow-sm border border-black/5">{cards.length}</span>
          <div className="relative z-10">
            <button 
              onClick={(e) => {
                e.preventDefault(); // Prevent drag start
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="text-gray-600 hover:text-black hover:bg-black/10 p-1.5 rounded-lg transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
            
            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-20" 
                  onClick={() => {
                    setShowMenu(false);
                    setShowColorPicker(false);
                  }}
                />
                <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-xl py-2 w-64 z-50 border border-gray-100 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                  <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-semibold text-sm text-gray-800">List Actions</h3>
                    <button onClick={() => setShowMenu(false)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
                  </div>
                  
                  <div className="p-2 space-y-1">
                    <button
                      onClick={() => {
                        setIsAddingCard(true);
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2.5 transition-colors"
                    >
                      <Plus size={16} />
                      Add Card
                    </button>

                    <button
                      onClick={() => {
                        const newTitle = prompt('Enter new list name:', list.title);
                        if (newTitle && newTitle.trim()) onUpdateListTitle(list._id, newTitle.trim());
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2.5 transition-colors"
                    >
                      <Edit3 size={16} />
                      Rename
                    </button>

                    {/* Color Picker */}
                    <div className="pt-2 mt-2 border-t border-gray-100">
                      <button
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg flex items-center justify-between transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          <Palette size={16} />
                          Color
                        </span>
                      </button>
                      
                      {showColorPicker && (
                        <div className="px-3 pb-2 grid grid-cols-5 gap-1.5 mt-1">
                          {colorOptions.map((color) => (
                            <button
                              key={color.name}
                              onClick={() => handleChangeColor(color.name)}
                              className={`${color.class} w-full aspect-square rounded-md hover:scale-110 transition-transform ${
                                list.color === color.name ? 'ring-2 ring-offset-1 ring-gray-400' : ''
                              }`}
                            />
                          ))}
                          <button
                           onClick={() => handleChangeColor(null)}
                           className="w-full aspect-square rounded-md border border-gray-300 flex items-center justify-center hover:bg-gray-50"
                           title="No Color"
                          >
                            <X size={12} className="text-gray-400"/>
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div className="pt-2 mt-2 border-t border-gray-100">
                      <button
                        onClick={() => {
                          setShowDeletePopup(true);
                          setShowMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2.5 transition-colors"
                      >
                        <Trash2 size={16} />
                        Delete List
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Cards Container */}
      <Droppable droppableId={list._id} type="card">
        {(provided, snapshot) => (
           <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 px-1 -mx-1 min-h-[50px] transition-colors rounded-lg z-0 ${snapshot.isDraggingOver ? 'bg-black/5' : ''}`}
            style={{ 
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(0,0,0,0.1) transparent'
            }}
          >
            <div className="flex flex-col gap-2 pb-2">
              {cards.filter(c => c && c._id).map((card, index) => (
                <Draggable key={card._id} draggableId={card._id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      style={{ 
                        ...provided.draggableProps.style,
                        transform: snapshot.isDragging ? provided.draggableProps.style?.transform + ' rotate(2deg)' : provided.draggableProps.style?.transform,
                        zIndex: snapshot.isDragging ? 9999 : 'auto',
                      }}
                      className={`group ${snapshot.isDragging ? 'relative' : ''}`}
                    >
                      <Card
                        card={card}
                        onClick={() => onCardClick(card)}
                        onDelete={onDeleteCard}
                        isDragging={snapshot.isDragging}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          </div>
        )}
      </Droppable>
      
      {/* Add Card Section */}
      {isAddingCard ? (
        <div className="mt-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <AddCardForm
            listId={list._id}
            onAdd={handleAddCard}
            onCancel={() => setIsAddingCard(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => setIsAddingCard(true)}
          className="mt-2 flex items-center gap-2 text-gray-600 hover:text-gray-800 text-[14px] font-medium w-full p-2.5 rounded-lg hover:bg-white/60  transition-all border border-transparent hover:border-black/5 hover:shadow-sm group"
        >
          <div className="w-6 h-6 rounded bg-black/5 group-hover:bg-purple-100 flex items-center justify-center transition-colors">
             <Plus size={16} className="group-hover:text-purple-600"/>
          </div>
          Add Card
        </button>
      )}

      <DeletePopup
        isOpen={showDeletePopup}
        onCancel={() => setShowDeletePopup(false)}
        onConfirm={() => {
          onDeleteList(list._id, { skipConfirm: true });
          setShowDeletePopup(false);
        }}
        itemType="list"
      />
    </div>
  );
});

// Add display name for debugging
KanbanList.displayName = 'KanbanList';

export default KanbanList;
