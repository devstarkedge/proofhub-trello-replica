import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import Database from '../services/database';

// Track the current request to prevent race conditions
let currentRequestId = 0;

const useWorkflowStore = create(
  devtools(
    (set, get) => ({
      // State
      board: null,
      lists: [],
      cardsByList: {},
      loading: true,
      error: null,
      lastUpdated: null,
      currentProjectId: null, // Track which project data belongs to

      // Actions
      setBoard: (board) => set({ board }),
      setLists: (lists) => set({ lists }),
      setCardsByList: (cardsByList) => set({ cardsByList }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setLastUpdated: (timestamp) => set({ lastUpdated: timestamp }),
      
      // Cache for prefetched data
      prefetchedData: {},
      
      // Prefetch workflow data in background
      prefetchWorkflow: async (projectId) => {
        const state = get();
        // Don't prefetch if we already have fresh data
        if (state.prefetchedData[projectId] && (Date.now() - state.prefetchedData[projectId].timestamp < 60000)) {
           return;
        }

        try {
          const response = await Database.getWorkflowComplete(projectId);
          if (response.success && response.data) {
             set(state => ({
               prefetchedData: {
                 ...state.prefetchedData,
                 [projectId]: {
                   data: response.data,
                   timestamp: Date.now()
                 }
               }
             }));
          }
        } catch (err) {
          // Silent fail for prefetch
          console.error('Prefetch failed', err);
        }
      },
      initializeWorkflow: async (projectId) => {
        const requestId = ++currentRequestId;
        const state = get();
        
        // Check if we already have data for this project
        const isSameProject = state.currentProjectId === projectId;
        const hasData = state.board && state.lists && state.lists.length >= 0; 
        
        if (isSameProject && hasData) {
          // Background refresh - silent update
          // Do NOT set loading to true.
          // We can optionally set a "refreshing" flag if we want a spinner somewhere, 
          // but for "no flicker" we usually just leave it alone.
          // Let's assume we don't want to show any loading state for background refresh 
          // to adhere to "Prevent unnecessary re-renders" and "flickering".
        } else {
          // Check for prefetched data first
          const prefetched = state.prefetchedData[projectId];
          if (prefetched && (Date.now() - prefetched.timestamp < 300000)) { // 5 minutes validity
             console.log('Using prefetched data for', projectId);
             const { board, lists, cardsByList } = prefetched.data;
             set({ 
                board, 
                lists: lists || [], 
                cardsByList: cardsByList || {}, 
                loading: false,
                lastUpdated: Date.now(),
                error: null,
                currentProjectId: projectId
             });
             // Clear used prefetch to free memory? Optional. keeping it for now.
             return;
          }

          // New project or no data - show loader and clear old data
          set({ 
            loading: true, 
            error: null, 
            board: null,
            lists: [], 
            cardsByList: {},
            currentProjectId: projectId 
          });
        }

        try {
          // Use the new optimized endpoint that returns everything in one call
          const response = await Database.getWorkflowComplete(projectId);
          
          // Check if this request is still the current one
          if (requestId !== currentRequestId) {
            console.log('Stale request ignored for project:', projectId);
            return;
          }
          
          if (!response.success) {
            throw new Error(response.message || 'Failed to load project');
          }

          const { board, lists, cardsByList } = response.data;
          
          // Double-check we're still on the same project
          if (get().currentProjectId !== projectId) {
            // This happens if user switched project while loading
            // But strict check: if we started a load for P2, currentProjectId is P2.
            // If user quickly switched P2->P3, currentProjectId is P3. 
            // So this check is correct.
            console.log('Project changed during load, ignoring result');
            return;
          }
          
          // Set all data at once
          set({ 
            board, 
            lists: lists || [], 
            cardsByList: cardsByList || {}, 
            lastUpdated: Date.now(),
            loading: false 
          });
        } catch (error) {
          if (requestId !== currentRequestId) return;
          
          console.error('Error initializing workflow:', error);
          set({ 
            error: error.message || 'Failed to load workflow',
            loading: false 
          });
        }
      },

      // Legacy method for backward compatibility
      initializeWorkflowLegacy: async (projectId, requestId) => {
        // Check if request is still valid
        if (requestId !== undefined && requestId !== currentRequestId) return;
        
        // Fetch board data
        const response = await Database.getProject(projectId);
        if (!response.success) {
          throw new Error(response.message || 'Failed to load project');
        }

        // Check again after async operation
        if (requestId !== undefined && requestId !== currentRequestId) return;

        const projectBoard = response.data;
        set({ board: projectBoard });

        // Fetch lists first
        const listsResponse = await Database.getLists(projectBoard._id);
        
        // Check again after async operation
        if (requestId !== undefined && requestId !== currentRequestId) return;
        
        const boardLists = Array.isArray(listsResponse.data) ? listsResponse.data : 
                          Array.isArray(listsResponse) ? listsResponse : [];

        // If no lists found, set empty state and return early
        if (!boardLists || boardLists.length === 0) {
          set({ lists: [], cardsByList: {}, lastUpdated: Date.now() });
          return;
        }

        // Fetch cards for all lists in parallel
        const cardPromises = boardLists.map(list => Database.getCards(list._id));
        const cardsResponses = await Promise.all(cardPromises);
        
        // Final check before setting state
        if (requestId !== undefined && requestId !== currentRequestId) return;

        // Group cards by listId
        const cardsMap = {};
        boardLists.forEach((list, index) => {
          const cardsData = cardsResponses[index]?.data || cardsResponses[index];
          cardsMap[list._id] = Array.isArray(cardsData) ? cardsData : [];
        });

        set({ lists: boardLists, cardsByList: cardsMap, lastUpdated: Date.now() });
      },

      // Update board (project) details
      updateBoard: (updates) => set((state) => ({
        board: { ...state.board, ...updates },
        lastUpdated: Date.now()
      })),

      // Add card with optimistic update
      addCard: async (listId, title, boardId) => {
        const tempId = `temp-${Date.now()}`;
        const tempCard = {
          _id: tempId,
          title,
          list: listId,
          board: boardId,
          position: get().cardsByList[listId]?.length || 0,
          createdAt: new Date().toISOString(),
          isOptimistic: true
        };

        // Optimistic update
        set((state) => ({
          cardsByList: {
            ...state.cardsByList,
            [listId]: [...(state.cardsByList[listId] || []), tempCard]
          },
          lastUpdated: Date.now()
        }));

        try {
          const newCard = await Database.createCard(listId, title, boardId);
          const realCard = newCard.data || newCard;

          // Replace temp card with real card
          set((state) => ({
            cardsByList: {
              ...state.cardsByList,
              [listId]: state.cardsByList[listId].map(card =>
                card._id === tempId ? realCard : card
              )
            }
          }));

          return realCard;
        } catch (error) {
          console.error('Error adding card:', error);
          // Rollback optimistic update
          set((state) => ({
            cardsByList: {
              ...state.cardsByList,
              [listId]: state.cardsByList[listId].filter(card => card._id !== tempId)
            }
          }));
          throw error;
        }
      },

      // Delete card with optimistic update
      deleteCard: async (cardId) => {
        const state = get();
        let deletedCard = null;
        let sourceListId = null;

        // Find and remove card optimistically
        const newCardsByList = { ...state.cardsByList };
        Object.keys(newCardsByList).forEach(listId => {
          const listCards = newCardsByList[listId];
          // Guard: skip if list is undefined or not an array
          if (!Array.isArray(listCards)) return;
          const cardIndex = listCards.findIndex(card => card._id === cardId);
          if (cardIndex !== -1) {
            deletedCard = newCardsByList[listId][cardIndex];
            sourceListId = listId;
            newCardsByList[listId] = newCardsByList[listId].filter(card => card._id !== cardId);
          }
        });

        if (!deletedCard) return;

        // Optimistic update
        set({ cardsByList: newCardsByList, lastUpdated: Date.now() });

        try {
          await Database.deleteCard(cardId);
        } catch (error) {
          console.error('Error deleting card:', error);
          // Rollback optimistic update
          set((state) => ({
            cardsByList: {
              ...state.cardsByList,
              [sourceListId]: [...(state.cardsByList[sourceListId] || []), deletedCard]
            }
          }));
          throw error;
        }
      },

      // Update card with optimistic update
      updateCard: async (cardId, updates) => {
        const state = get();
        let originalCard = null;
        let sourceListId = null;

        // Find original card
        Object.keys(state.cardsByList).forEach(listId => {
          const card = state.cardsByList[listId].find(c => c._id === cardId);
          if (card) {
            originalCard = card;
            sourceListId = listId;
          }
        });

        if (!originalCard) return;

        // Process updates - avoid fetching users on every update
        // Only populate assignees if they're IDs (strings), otherwise keep them as-is
        let processedUpdates = { ...updates };
        
        // Handle labels - use populated labels if available
        if (updates._labelsPopulated && Array.isArray(updates._labelsPopulated)) {
          processedUpdates.labels = updates._labelsPopulated;
          delete processedUpdates._labelsPopulated;
        }
        
        // Handle assignees - use populated assignees if available
        if (updates._assigneesPopulated && Array.isArray(updates._assigneesPopulated)) {
          processedUpdates.assignees = updates._assigneesPopulated;
          delete processedUpdates._assigneesPopulated;
        } else if (updates.assignees && Array.isArray(updates.assignees)) {
          // Check if assignees are already populated objects
          const needsPopulation = updates.assignees.some(a => typeof a === 'string');
          if (needsPopulation) {
            // Use board members from current state instead of fetching users
            const boardMembers = get().board?.members || [];
            processedUpdates.assignees = updates.assignees.map(assigneeId => {
              if (typeof assigneeId === 'object') return assigneeId;
              const user = boardMembers.find(u => u._id === assigneeId);
              return user ? { _id: user._id, name: user.name, email: user.email } : { _id: assigneeId, name: 'Unknown', email: '' };
            });
          }
        }
        
        // Handle coverImage - use populated coverImage if available
        if (updates._coverImagePopulated && typeof updates._coverImagePopulated === 'object') {
          processedUpdates.coverImage = updates._coverImagePopulated;
          delete processedUpdates._coverImagePopulated;
        } else if (updates.coverImage && typeof updates.coverImage === 'object') {
          // If coverImage is already an object, use it directly
          processedUpdates.coverImage = updates.coverImage;
        }

        // Optimistic update
        set((state) => {
          const newCardsByList = { ...state.cardsByList };
          Object.keys(newCardsByList).forEach(listId => {
            newCardsByList[listId] = newCardsByList[listId].map(card =>
              card._id === cardId ? { ...card, ...processedUpdates } : card
            );
          });
          return { cardsByList: newCardsByList, lastUpdated: Date.now() };
        });

        try {
          // Remove internal fields before sending to backend
          const backendUpdates = { ...updates };
          delete backendUpdates._labelsPopulated;
          delete backendUpdates._assigneesPopulated;
          delete backendUpdates._coverImagePopulated;
          
          await Database.updateCard(cardId, backendUpdates);
        } catch (error) {
          console.error('Error updating card:', error);
          // Rollback optimistic update
          set((state) => {
            const newCardsByList = { ...state.cardsByList };
            Object.keys(newCardsByList).forEach(listId => {
              newCardsByList[listId] = newCardsByList[listId].map(card =>
                card._id === cardId ? originalCard : card
              );
            });
            return { cardsByList: newCardsByList };
          });
          throw error;
        }
      },

      // Update card locally ONLY (no API call)
      // Useful for syncing state when another store (like attachmentStore) handles the API call
      updateCardLocal: (cardId, updates) => {
        set((state) => {
          const newCardsByList = { ...state.cardsByList };
          let found = false;
          
          Object.keys(newCardsByList).forEach(listId => {
            if (found) return;
            
            const cardIndex = newCardsByList[listId].findIndex(c => c._id === cardId);
            if (cardIndex !== -1) {
              found = true;
              newCardsByList[listId] = newCardsByList[listId].map((card, idx) => 
                idx === cardIndex ? { ...card, ...updates } : card
              );
            }
          });
          
          if (!found) return {};
          
          return { cardsByList: newCardsByList, lastUpdated: Date.now() };
        });
      },

      // Move card with optimistic update
      moveCard: async (cardId, newListId, newPosition, newStatus) => {
        const state = get();
        // Capture original state for rollback
        const originalCardsByList = state.cardsByList;
        
        // Deep clone the map structure to avoid mutating original state arrays
        const newCardsByList = { ...state.cardsByList };
        // We also need to clone the arrays we're going to modify (source and dest lists)
        // But since we don't know them easily without searching, let's wait until we find them.

        let movedCard = null;

        // Find and remove card from source list
        Object.keys(newCardsByList).forEach(listId => {
          const listCards = newCardsByList[listId];
          const cardIndex = listCards.findIndex(card => card._id === cardId);
          if (cardIndex !== -1) {
            movedCard = { ...listCards[cardIndex], list: newListId, status: newStatus };
            // Clone the list array before filtering (which creates a new array anyway, so filter is safe)
            newCardsByList[listId] = listCards.filter(card => card._id !== cardId);
          }
        });

        if (!movedCard) return;

        // Add to destination list at correct position
        // CRITICAL: Must clone the destination array before modifying it
        const destList = newCardsByList[newListId] ? [...newCardsByList[newListId]] : [];
        destList.splice(newPosition, 0, movedCard);
        
        // Update positions in destination list
        newCardsByList[newListId] = destList.map((card, index) => ({
          ...card,
          position: index
        }));

        // Optimistic update
        set({ cardsByList: newCardsByList, lastUpdated: Date.now() });

        try {
          await Database.moveCard(cardId, newListId, newPosition, newStatus);
        } catch (error) {
          console.error('Error moving card:', error);
          // Rollback to exact previous state
          set({ cardsByList: originalCardsByList });
          throw error;
        }
      },

      // Add list with optimistic update
      addList: async (boardId, title) => {
        const tempId = `temp-list-${Date.now()}`;
        const tempList = {
          _id: tempId,
          title,
          board: boardId,
          position: get().lists.length,
          color: null,
          isOptimistic: true
        };

        // Optimistic update
        set((state) => ({
          lists: [...state.lists, tempList],
          cardsByList: { ...state.cardsByList, [tempId]: [] },
          lastUpdated: Date.now()
        }));

        try {
          const newList = await Database.createList(boardId, title);
          const realList = newList.data || newList;

          // Replace temp list with real list
          set((state) => ({
            lists: state.lists.map(list =>
              list._id === tempId ? realList : list
            ),
            cardsByList: {
              ...state.cardsByList,
              [realList._id]: state.cardsByList[tempId] || [],
              [tempId]: undefined
            }
          }));

          return realList;
        } catch (error) {
          console.error('Error adding list:', error);
          // Rollback optimistic update
          set((state) => ({
            lists: state.lists.filter(list => list._id !== tempId),
            cardsByList: { ...state.cardsByList, [tempId]: undefined }
          }));
          throw error;
        }
      },

      // Delete list with optimistic update
      deleteList: async (listId) => {
        const state = get();
        const deletedList = state.lists.find(list => list._id === listId);
        const deletedCards = state.cardsByList[listId] || [];

        if (!deletedList) return;

        // Optimistic update
        set((state) => ({
          lists: state.lists.filter(list => list._id !== listId),
          cardsByList: { ...state.cardsByList, [listId]: undefined },
          lastUpdated: Date.now()
        }));

        try {
          await Database.deleteList(listId);
        } catch (error) {
          console.error('Error deleting list:', error);
          // Rollback optimistic update
          set((state) => ({
            lists: [...state.lists, deletedList],
            cardsByList: { ...state.cardsByList, [listId]: deletedCards }
          }));
          throw error;
        }
      },

      // Update list color with optimistic update
      updateListColor: async (listId, color) => {
        const state = get();
        const originalList = state.lists.find(list => list._id === listId);

        if (!originalList) return;

        // Optimistic update
        set((state) => ({
          lists: state.lists.map(list =>
            list._id === listId ? { ...list, color } : list
          ),
          lastUpdated: Date.now()
        }));

        try {
          await Database.updateList(listId, { color });
        } catch (error) {
          console.error('Error updating list color:', error);
          // Rollback optimistic update
          set((state) => ({
            lists: state.lists.map(list =>
              list._id === listId ? originalList : list
            )
          }));
          throw error;
        }
      },

      // Update list title
      updateListTitle: async (listId, title) => {
        const state = get();
        const originalList = state.lists.find(list => list._id === listId);

        if (!originalList) return;

        // Optimistic update
        set((state) => ({
          lists: state.lists.map(list =>
            list._id === listId ? { ...list, title } : list
          ),
          lastUpdated: Date.now()
        }));

        try {
          await Database.updateList(listId, { title });
        } catch (error) {
          console.error('Error updating list title:', error);
          // Rollback optimistic update
          set((state) => ({
            lists: state.lists.map(list =>
              list._id === listId ? originalList : list
            )
          }));
          throw error;
        }
      },

      // Move list with optimistic update
      moveList: async (listId, newPosition) => {
        const state = get();
        const originalLists = state.lists; // Keep reference to original array
        const listIndex = state.lists.findIndex(list => list._id === listId);

        if (listIndex === -1) return;

        // Optimistic update
        const newLists = [...state.lists];
        const [movedListOriginal] = newLists.splice(listIndex, 1);
        
        // Clone the moved list to avoid mutating the object in originalLists
        const movedList = { ...movedListOriginal, position: newPosition };
        
        newLists.splice(newPosition, 0, movedList);

        // Update positions for all lists (cloning them to avoid mutation)
        const updatedLists = newLists.map((list, index) => ({
          ...list,
          position: index
        }));

        set({ lists: updatedLists, lastUpdated: Date.now() });

        try {
          await Database.moveList(listId, newPosition);
        } catch (error) {
          console.error('Error moving list:', error);
          // Rollback optimistic update
          set({ lists: originalLists });
          throw error;
        }
      },

      // Reorder cards within a list
      reorderCardsInList: (listId, startIndex, endIndex) => {
        set((state) => {
          const newCards = [...(state.cardsByList[listId] || [])];
          const [movedCard] = newCards.splice(startIndex, 1);
          newCards.splice(endIndex, 0, movedCard);

          // Update positions
          const updatedCards = newCards.map((card, index) => ({
            ...card,
            position: index
          }));

          return {
            cardsByList: {
              ...state.cardsByList,
              [listId]: updatedCards
            },
            lastUpdated: Date.now()
          };
        });
      },

      // Get card by ID
      getCard: (cardId) => {
        const state = get();
        for (const listId of Object.keys(state.cardsByList)) {
          const card = state.cardsByList[listId].find(c => c._id === cardId);
          if (card) return card;
        }
        return null;
      },

      // Get fresh card data from server
      getFreshCard: async (cardId) => {
        try {
          const response = await Database.getCard(cardId);
          if (response.success) {
            return response.data;
          }
          return null;
        } catch (error) {
          console.error('Error fetching fresh card data:', error);
          return null;
        }
      },

      // Get list by ID
      getList: (listId) => {
        return get().lists.find(list => list._id === listId);
      },

      // Update a card's hasRecurrence property
      updateCardRecurrence: (cardId, hasRecurrence) => {
        set((state) => {
          const newCardsByList = { ...state.cardsByList };
          let cardFound = false;
          Object.keys(newCardsByList).forEach(listId => {
            newCardsByList[listId] = newCardsByList[listId].map(card => {
              if (card._id === cardId) {
                cardFound = true;
                return { ...card, hasRecurrence };
              }
              return card;
            });
          });
          if (!cardFound) return state;
          return { cardsByList: newCardsByList, lastUpdated: Date.now() };
        });
      },

      // Clear workflow data
      clearWorkflow: () => set({
        board: null,
        lists: [],
        cardsByList: {},
        loading: true,
        error: null,
        lastUpdated: null,
        currentProjectId: null
      })
    }),
    {
      name: 'workflow-store'
    }
  )
);

export default useWorkflowStore;
