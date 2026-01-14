import React, { useState, useCallback, useMemo, memo, useRef } from 'react';
import { Plus, X, Sparkles, LayoutList } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { toast } from 'react-toastify';
import KanbanList from './List';

const Board = memo(({ lists, cardsByList, onAddCard, onDeleteCard, onCardClick, onAddList, onDeleteList, onUpdateListColor, onUpdateListTitle, onMoveCard, onMoveList, onRestoreCard, isArchivedView = false }) => {
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [isListInputFocused, setIsListInputFocused] = useState(false);
  const listInputRef = useRef(null);
  
  // Handle drag end for both lists and cards
  const onDragEnd = useCallback(async (result) => {
    const { destination, source, type, draggableId } = result;

    // Dropped outside the list
    if (!destination) {
      return;
    }

    // Dropped in the same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // LIST REORDERING
    if (type === 'list') {
      // Optimistic update happens immediately in the store
      const movePromise = onMoveList(draggableId, destination.index);

      // Handle side effects (toast/error) asynchronously
      movePromise.then(() => {
        const movedList = lists.find(l => l._id === draggableId);
        if (movedList) {
          toast.success(`List "${movedList.title}" moved`, {
             position: "bottom-right",
             autoClose: 2000,
             hideProgressBar: true,
             closeOnClick: true,
             pauseOnHover: false,
             draggable: false,
             progress: undefined,
             theme: "light",
          });
        }
      }).catch((error) => {
        console.error("Failed to move list:", error);
        toast.error("Failed to move list");
      });
      
      return;
    }

    // CARD MOVEMENT
    if (type === 'card') {
      const startListId = source.droppableId;
      const finishListId = destination.droppableId;

      // Find status from destination list
      const targetList = lists.find(l => l._id === finishListId);
      const newStatus = targetList ? targetList.title.toLowerCase().replace(/\s+/g, '-') : 'to-do';

      // Optimistic update happens immediately in the store
      const movePromise = onMoveCard(
        draggableId,
        finishListId,
        destination.index,
        newStatus
      );

      // Handle side effects (toast/error) asynchronously
      movePromise.then(() => {
        // Show toast
        const sourceListCards = cardsByList[startListId] || [];
        const movedCard = sourceListCards.find(c => c._id === draggableId);
        const cardTitle = movedCard ? movedCard.title : 'Card';
        const listTitle = targetList ? targetList.title : 'List';

        toast.success(
          <div className="flex flex-col gap-1">
            <span className="font-medium text-sm">Moved "{cardTitle}"</span>
            <span className="text-xs text-gray-500">to {listTitle}</span>
          </div>,
          {
             position: "bottom-right",
             autoClose: 2000,
             hideProgressBar: true,
             closeOnClick: true,
             pauseOnHover: false,
             draggable: false,
             progress: undefined,
             theme: "light",
          }
        );
      }).catch((error) => {
        console.error("Failed to move card:", error);
        toast.error("Failed to move card");
      });
    }
  }, [lists, cardsByList, onMoveList, onMoveCard]);

  const handleAddList = useCallback(() => {
    if (newListTitle.trim()) {
      onAddList(newListTitle.trim());
      setNewListTitle('');
      setIsAddingList(false);
    }
  }, [newListTitle, onAddList]);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="all-lists" direction="horizontal" type="list">
        {(provided) => (
          <div 
            className="p-4 h-full overflow-x-auto"
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{ scrollbarWidth: 'thin' }}
          >
            <div className="flex gap-4 h-full items-start">
              {/* Lists */}
              {lists.filter(l => l && l._id).map((list, index) => (
                <Draggable key={list._id} draggableId={list._id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className="max-h-full"
                    >
                      <div
                        className={`max-h-full rounded-xl transition-transform ${snapshot.isDragging ? 'rotate-2 scale-105' : ''}`}
                      >
                         {/* We pass dragHandleProps to the List component so only header is draggable */}
                        <KanbanList
                          list={list}
                          cards={cardsByList[list._id] || []}
                          onAddCard={onAddCard}
                          onDeleteCard={onDeleteCard}
                          onCardClick={onCardClick}
                          onDeleteList={onDeleteList}
                          onUpdateListColor={onUpdateListColor}
                          onUpdateListTitle={onUpdateListTitle}
                          onRestoreCard={onRestoreCard}
                          dragHandleProps={provided.dragHandleProps}
                          isDragging={snapshot.isDragging}
                          isArchivedView={isArchivedView}
                        />
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              
              {/* Add List */}
              <div className="w-72 flex-shrink-0">
                {isAddingList ? (
                  <div 
                    className="relative overflow-hidden rounded-xl transition-all duration-300 ease-out"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.9) 100%)',
                      boxShadow: isListInputFocused 
                        ? '0 12px 40px rgba(139, 92, 246, 0.25), 0 0 0 2px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.9)'
                        : '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.2), inset 0 1px 0 rgba(255,255,255,0.9)',
                      backdropFilter: 'blur(16px)',
                    }}
                  >
                    {/* Gradient accent line at top */}
                    <div 
                      className="absolute top-0 left-0 right-0 h-1 transition-opacity duration-300"
                      style={{
                        background: 'linear-gradient(90deg, #8B5CF6 0%, #EC4899 50%, #F59E0B 100%)',
                        opacity: isListInputFocused ? 1 : 0.6,
                      }}
                    />
                    
                    <div className="p-4 pt-5">
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-3">
                        <div 
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200"
                          style={{
                            background: isListInputFocused 
                              ? 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)'
                              : 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)',
                          }}
                        >
                          <LayoutList 
                            size={14} 
                            className={`transition-colors duration-200 ${isListInputFocused ? 'text-white' : 'text-gray-500'}`}
                            strokeWidth={2.5}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">New List</span>
                      </div>
                      
                      {/* Input */}
                      <input
                        ref={listInputRef}
                        autoFocus
                        type="text"
                        value={newListTitle}
                        onChange={(e) => setNewListTitle(e.target.value)}
                        onFocus={() => setIsListInputFocused(true)}
                        onBlur={() => setIsListInputFocused(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newListTitle.trim()) handleAddList();
                          if (e.key === 'Escape') {
                            setIsAddingList(false);
                            setNewListTitle('');
                          }
                        }}
                        placeholder="What's this list for?"
                        className="w-full px-3 py-2.5 text-sm rounded-lg outline-none transition-all duration-200 text-gray-800 placeholder-gray-400 font-medium"
                        style={{
                          background: 'rgba(249, 250, 251, 0.8)',
                          border: isListInputFocused 
                            ? '2px solid rgba(139, 92, 246, 0.3)' 
                            : '2px solid rgba(229, 231, 235, 0.8)',
                          boxShadow: isListInputFocused 
                            ? 'inset 0 2px 4px rgba(139, 92, 246, 0.05)' 
                            : 'inset 0 2px 4px rgba(0,0,0,0.03)',
                        }}
                      />
                      
                      {/* Actions bar */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100/80">
                        <div className="flex items-center gap-2">
                          {/* Add List button */}
                          <button
                            onClick={handleAddList}
                            disabled={!newListTitle.trim()}
                            className="group relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 overflow-hidden"
                            style={{
                              background: newListTitle.trim() 
                                ? 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)'
                                : 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)',
                              color: newListTitle.trim() ? 'white' : '#9CA3AF',
                              boxShadow: newListTitle.trim() 
                                ? '0 4px 12px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                                : 'none',
                              cursor: newListTitle.trim() ? 'pointer' : 'not-allowed',
                            }}
                          >
                            {/* Hover gradient overlay */}
                            <div 
                              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                              style={{
                                background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                              }}
                            />
                            
                            <Plus size={14} className="relative z-10" strokeWidth={2.5} />
                            <span className="relative z-10">Add List</span>
                            
                            {/* Sparkle effect when valid */}
                            {newListTitle.trim() && (
                              <Sparkles 
                                size={12} 
                                className="relative z-10 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:rotate-12" 
                              />
                            )}
                          </button>
                          
                          {/* Quick tip */}
                          <span className="text-[10px] text-gray-400 font-medium hidden sm:inline">
                            Enter ↵
                          </span>
                        </div>
                        
                        {/* Cancel button */}
                        <button
                          onClick={() => {
                            setIsAddingList(false);
                            setNewListTitle('');
                          }}
                          className="group flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 hover:bg-gray-100"
                          title="Cancel (Esc)"
                        >
                          <X 
                            size={16} 
                            className="text-gray-400 group-hover:text-gray-600 transition-colors duration-200" 
                            strokeWidth={2}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsAddingList(true)}
                    className="group relative flex items-center gap-3 w-full p-4 rounded-xl transition-all duration-300 font-semibold overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)',
                      border: '2px dashed rgba(255,255,255,0.3)',
                      backdropFilter: 'blur(8px)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 100%)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 100%)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                      style={{
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(236, 72, 153, 0.3) 100%)',
                        boxShadow: '0 2px 8px rgba(139, 92, 246, 0.2)',
                      }}
                    >
                      <Plus size={18} className="text-white" strokeWidth={2.5} />
                    </div>
                    <span className="text-white/90 group-hover:text-white transition-colors duration-200">Add another list</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
});

Board.displayName = 'Board';

export default Board;