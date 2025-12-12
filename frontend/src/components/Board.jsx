import React, { useState, useCallback, useMemo, memo } from 'react';
import { Plus, X } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { toast } from 'react-toastify';
import KanbanList from './List';

const Board = memo(({ lists, cardsByList, onAddCard, onDeleteCard, onCardClick, onAddList, onDeleteList, onUpdateListColor, onUpdateListTitle, onMoveCard, onMoveList }) => {
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  
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
            className="p-4 h-[calc(100vh-64px)] overflow-x-auto overflow-y-hidden"
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            <div className="flex gap-4 h-full items-start">
              {/* Lists */}
              {lists.map((list, index) => (
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
                          dragHandleProps={provided.dragHandleProps}
                          isDragging={snapshot.isDragging}
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
                  <div className="bg-white/30 backdrop-blur-md rounded-xl p-3 border border-white/20 shadow-lg">
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
                      className="w-full p-2.5 text-sm rounded-lg mb-3 outline-none bg-white text-gray-800 placeholder-gray-400 shadow-inner"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleAddList}
                        className="bg-purple-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow-md"
                      >
                        Add List
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingList(false);
                          setNewListTitle('');
                        }}
                        className="text-white hover:bg-white/20 p-1.5 rounded-lg transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsAddingList(true)}
                    className="flex items-center gap-2 text-white/90 bg-white/10 hover:bg-white/20 w-full p-4 rounded-xl transition-all font-semibold border border-dashed border-white/30 hover:border-white/50 backdrop-blur-sm"
                  >
                    <Plus size={20} />
                    Add another list
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