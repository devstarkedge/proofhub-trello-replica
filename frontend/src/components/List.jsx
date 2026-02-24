import React, { useState, memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { Plus, MoreHorizontal, X, Palette, Trash2, Edit3, Sparkles, Type } from 'lucide-react';
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

const KanbanList = memo(({ list, cards, onAddCard, onDeleteCard, onCardClick, onDeleteList, onUpdateListColor, onUpdateListTitle, onRestoreCard, dragHandleProps, isDragging, isArchivedView = false }) => {
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isRenameFocused, setIsRenameFocused] = useState(false);
  const renameInputRef = useRef(null);

  // Focus input when rename modal opens
  useEffect(() => {
    if (showRenameModal && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [showRenameModal]);

  const handleRename = useCallback(() => {
    if (renameValue.trim() && renameValue.trim() !== list.title) {
      onUpdateListTitle(list._id, renameValue.trim());
    }
    setShowRenameModal(false);
    setRenameValue('');
  }, [renameValue, list._id, list.title, onUpdateListTitle]);
  
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
                <div 
                  className="absolute right-0 mt-2 w-72 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 100%)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)',
                    borderRadius: '16px',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  {/* Gradient accent line */}
                  <div 
                    className="absolute top-0 left-4 right-4 h-0.5 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #8B5CF6 0%, #EC4899 50%, #F59E0B 100%)',
                    }}
                  />
                  
                  {/* Header */}
                  <div className="px-4 py-3.5 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-6 h-6 rounded-lg flex items-center justify-center"
                        style={{
                          background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                          boxShadow: '0 2px 6px rgba(139, 92, 246, 0.3)',
                        }}
                      >
                        <MoreHorizontal size={12} className="text-white" strokeWidth={2.5} />
                      </div>
                      <h3 className="font-bold text-sm text-gray-800">List Actions</h3>
                    </div>
                    <button 
                      onClick={() => setShowMenu(false)} 
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200"
                    >
                      <X size={14} strokeWidth={2.5}/>
                    </button>
                  </div>
                  
                  <div className="px-2 pb-2">
                    {/* Add Card Button */}
                    <button
                      onClick={() => {
                        setIsAddingCard(true);
                        setShowMenu(false);
                      }}
                      className="group w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:text-gray-900 rounded-xl flex items-center gap-3 transition-all duration-200"
                      style={{
                        background: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(236, 72, 153, 0.05) 100%)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-50 group-hover:bg-purple-100 transition-colors duration-200">
                        <Plus size={16} className="text-purple-600" strokeWidth={2} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">Add Card</span>
                        <span className="text-[10px] text-gray-400">Create a new task</span>
                      </div>
                    </button>

                    {/* Rename Button */}
                    <button
                      onClick={() => {
                        setRenameValue(list.title);
                        setShowRenameModal(true);
                        setShowMenu(false);
                      }}
                      className="group w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:text-gray-900 rounded-xl flex items-center gap-3 transition-all duration-200"
                      style={{
                        background: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(99, 102, 241, 0.05) 100%)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 group-hover:bg-blue-100 transition-colors duration-200">
                        <Edit3 size={16} className="text-blue-600" strokeWidth={2} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">Rename</span>
                        <span className="text-[10px] text-gray-400">Change list name</span>
                      </div>
                    </button>

                    {/* Color Section */}
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <button
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="group w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:text-gray-900 rounded-xl flex items-center justify-between transition-all duration-200"
                        style={{
                          background: showColorPicker ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(251, 191, 36, 0.05) 100%)' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!showColorPicker) e.currentTarget.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(251, 191, 36, 0.05) 100%)';
                        }}
                        onMouseLeave={(e) => {
                          if (!showColorPicker) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 group-hover:bg-amber-100 transition-colors duration-200">
                            <Palette size={16} className="text-amber-600" strokeWidth={2} />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">Color</span>
                            <span className="text-[10px] text-gray-400">Customize appearance</span>
                          </div>
                        </div>
                        <div 
                          className={`w-5 h-5 rounded-full border-2 border-white shadow-sm transition-transform duration-200 ${showColorPicker ? 'scale-110' : ''}`}
                          style={{
                            background: list.color 
                              ? colorOptions.find(c => c.name === list.color)?.class.replace('bg-', '').includes('-') 
                                ? `var(--${list.color}-400, #9CA3AF)` 
                                : '#9CA3AF'
                              : 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)',
                            backgroundColor: list.color ? undefined : '#E5E7EB',
                          }}
                        />
                      </button>
                      
                      {showColorPicker && (
                        <div className="px-3 pb-2 mt-2">
                          <div 
                            className="grid grid-cols-5 gap-2 p-3 rounded-xl"
                            style={{
                              background: 'linear-gradient(135deg, rgba(249, 250, 251, 0.8) 0%, rgba(243, 244, 246, 0.6) 100%)',
                              border: '1px solid rgba(229, 231, 235, 0.5)',
                            }}
                          >
                            {colorOptions.map((color) => (
                              <button
                                key={color.name}
                                onClick={() => handleChangeColor(color.name)}
                                className={`${color.class} w-full aspect-square rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-lg ${
                                  list.color === color.name 
                                    ? 'ring-2 ring-offset-2 ring-purple-500 scale-110 shadow-lg' 
                                    : 'hover:ring-2 hover:ring-offset-1 hover:ring-gray-300'
                                }`}
                                style={{
                                  boxShadow: list.color === color.name ? '0 4px 12px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.05)',
                                }}
                                title={color.name.charAt(0).toUpperCase() + color.name.slice(1)}
                              />
                            ))}
                            <button
                              onClick={() => handleChangeColor(null)}
                              className={`w-full aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center transition-all duration-200 hover:scale-110 hover:border-gray-400 hover:bg-gray-50 ${
                                !list.color ? 'ring-2 ring-offset-2 ring-purple-500 bg-gray-50' : ''
                              }`}
                              title="No Color"
                            >
                              <X size={14} className="text-gray-400" strokeWidth={2}/>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Delete Section */}
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <button
                        onClick={() => {
                          setShowDeletePopup(true);
                          setShowMenu(false);
                        }}
                        className="group w-full text-left px-3 py-2.5 text-sm rounded-xl flex items-center gap-3 transition-all duration-200"
                        style={{
                          background: 'transparent',
                          color: '#DC2626',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(220, 38, 38, 0.05) 100%)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50 group-hover:bg-red-100 transition-colors duration-200">
                          <Trash2 size={16} className="text-red-500" strokeWidth={2} />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">Delete List</span>
                          <span className="text-[10px] text-red-400">Remove permanently</span>
                        </div>
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
          >
            <div className="flex flex-col gap-2 pb-2">
              {cards.filter(c => {
                // Only render cards that match the archive view state
                if (c && c._id) {
                  // In archived view, show only archived cards
                  if (isArchivedView) {
                    return c.isArchived === true;
                  }
                  // In active view, show only non-archived cards
                  return c.isArchived !== true;
                }
                return false;
              }).map((card, index) => (
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
                        onRestore={onRestoreCard}
                        isDragging={snapshot.isDragging}
                        isArchivedView={isArchivedView}
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

      {/* Rename Modal */}
      {showRenameModal && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => {
              setShowRenameModal(false);
              setRenameValue('');
            }}
          />
          
          {/* Modal */}
          <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className="w-full max-w-md animate-in zoom-in-95 fade-in duration-300"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 100%)',
                boxShadow: '0 25px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)',
                borderRadius: '20px',
                backdropFilter: 'blur(24px)',
              }}
            >
              {/* Gradient accent line */}
              <div 
                className="absolute top-0 left-6 right-6 h-1 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 50%, #EC4899 100%)',
                }}
              />
              
              {/* Header */}
              <div className="p-5 pb-0">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                      boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)',
                    }}
                  >
                    <Type size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Rename List</h2>
                    <p className="text-xs text-gray-500">Enter a new name for this list</p>
                  </div>
                </div>
              </div>
              
              {/* Content */}
              <div className="p-5">
                {/* Input container */}
                <div className="relative">
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onFocus={() => setIsRenameFocused(true)}
                    onBlur={() => setIsRenameFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && renameValue.trim()) {
                        handleRename();
                      } else if (e.key === 'Escape') {
                        setShowRenameModal(false);
                        setRenameValue('');
                      }
                    }}
                    placeholder="Enter list name..."
                    className="w-full px-4 py-3.5 text-sm rounded-xl outline-none transition-all duration-200 text-gray-800 placeholder-gray-400 font-medium"
                    style={{
                      background: 'linear-gradient(135deg, rgba(249, 250, 251, 0.9) 0%, rgba(243, 244, 246, 0.7) 100%)',
                      border: isRenameFocused 
                        ? '2px solid rgba(59, 130, 246, 0.5)' 
                        : '2px solid rgba(229, 231, 235, 0.8)',
                      boxShadow: isRenameFocused 
                        ? '0 0 0 4px rgba(59, 130, 246, 0.1), inset 0 2px 4px rgba(59, 130, 246, 0.05)' 
                        : 'inset 0 2px 4px rgba(0,0,0,0.03)',
                    }}
                    maxLength={50}
                  />
                  
                  {/* Character counter */}
                  <div 
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-all duration-200"
                    style={{
                      background: renameValue.length > 40 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(156, 163, 175, 0.1)',
                      color: renameValue.length > 40 ? '#EF4444' : '#9CA3AF',
                    }}
                  >
                    {renameValue.length}/50
                  </div>
                </div>
                
                {/* Hint */}
                <p className="mt-2 text-[11px] text-gray-400 flex items-center gap-1">
                  <span className="opacity-60">💡</span>
                  Press Enter to save, Escape to cancel
                </p>
              </div>
              
              {/* Actions */}
              <div 
                className="px-5 py-4 flex items-center justify-end gap-3"
                style={{
                  borderTop: '1px solid rgba(229, 231, 235, 0.5)',
                  background: 'rgba(249, 250, 251, 0.5)',
                  borderRadius: '0 0 20px 20px',
                }}
              >
                <button
                  onClick={() => {
                    setShowRenameModal(false);
                    setRenameValue('');
                  }}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 rounded-xl transition-all duration-200 hover:bg-gray-100 hover:text-gray-800"
                >
                  Cancel
                </button>
                
                <button
                  onClick={handleRename}
                  disabled={!renameValue.trim() || renameValue.trim() === list.title}
                  className="group relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 overflow-hidden"
                  style={{
                    background: renameValue.trim() && renameValue.trim() !== list.title
                      ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)'
                      : 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)',
                    color: renameValue.trim() && renameValue.trim() !== list.title ? 'white' : '#9CA3AF',
                    boxShadow: renameValue.trim() && renameValue.trim() !== list.title
                      ? '0 4px 14px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                      : 'none',
                    cursor: renameValue.trim() && renameValue.trim() !== list.title ? 'pointer' : 'not-allowed',
                  }}
                >
                  {/* Hover overlay */}
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{
                      background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                    }}
                  />
                  
                  <Edit3 size={14} className="relative z-10" strokeWidth={2.5} />
                  <span className="relative z-10">Save Changes</span>
                  
                  {renameValue.trim() && renameValue.trim() !== list.title && (
                    <Sparkles 
                      size={12} 
                      className="relative z-10 opacity-0 group-hover:opacity-100 transition-all duration-300" 
                    />
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// Add display name for debugging
KanbanList.displayName = 'KanbanList';

export default KanbanList;
