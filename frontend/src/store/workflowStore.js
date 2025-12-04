import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import Database from '../services/database';

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

      // Actions
      setBoard: (board) => set({ board }),
      setLists: (lists) => set({ lists }),
      setCardsByList: (cardsByList) => set({ cardsByList }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setLastUpdated: (timestamp) => set({ lastUpdated: timestamp }),

      // OPTIMIZED: Initialize workflow data with single API call
      initializeWorkflow: async (projectId) => {
        try {
          set({ loading: true, error: null, lists: [], cardsByList: {} });

          // Use the new optimized endpoint that returns everything in one call
          const response = await Database.getWorkflowComplete(projectId);
          
          if (!response.success) {
            throw new Error(response.message || 'Failed to load project');
          }

          const { board, lists, cardsByList } = response.data;
          
          // Set all data at once
          set({ 
            board, 
            lists: lists || [], 
            cardsByList: cardsByList || {}, 
            lastUpdated: Date.now() 
          });
        } catch (error) {
          console.error('Error initializing workflow:', error);
          set({ error: error.message || 'Failed to load workflow' });
          
          // Fallback to legacy loading if new endpoint fails
          try {
            await get().initializeWorkflowLegacy(projectId);
          } catch (legacyError) {
            console.error('Legacy loading also failed:', legacyError);
          }
        } finally {
          set({ loading: false });
        }
      },

      // Legacy method for backward compatibility
      initializeWorkflowLegacy: async (projectId) => {
        // Fetch board data
        const response = await Database.getProject(projectId);
        if (!response.success) {
          throw new Error(response.message || 'Failed to load project');
        }

        const projectBoard = response.data;
        set({ board: projectBoard });

        // Fetch lists first
        const listsResponse = await Database.getLists(projectBoard._id);
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
          const cardIndex = newCardsByList[listId].findIndex(card => card._id === cardId);
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

        // If assignees are being updated, populate them with user data
        let processedUpdates = { ...updates };
        if (updates.assignees && Array.isArray(updates.assignees)) {
          try {
            // Fetch team members to populate assignee data
            const usersResponse = await Database.getUsers();
            const teamMembers = usersResponse.data || [];

            processedUpdates.assignees = updates.assignees.map(assigneeId => {
              const user = teamMembers.find(u => u._id === assigneeId);
              return user ? { _id: user._id, name: user.name, email: user.email } : { _id: assigneeId, name: 'Unknown', email: '' };
            });
          } catch (error) {
            console.error('Error fetching team members for assignee population:', error);
            // Fallback: keep assignees as IDs if population fails
            processedUpdates.assignees = updates.assignees;
          }
        };

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
          await Database.updateCard(cardId, updates);
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

      // Move card with optimistic update
      moveCard: async (cardId, newListId, newPosition, newStatus) => {
        const state = get();
        let movedCard = null;
        let sourceListId = null;

        // Find and remove card from source list
        const newCardsByList = { ...state.cardsByList };
        Object.keys(newCardsByList).forEach(listId => {
          const cardIndex = newCardsByList[listId].findIndex(card => card._id === cardId);
          if (cardIndex !== -1) {
            movedCard = { ...newCardsByList[listId][cardIndex], list: newListId, status: newStatus };
            sourceListId = listId;
            newCardsByList[listId] = newCardsByList[listId].filter(card => card._id !== cardId);
          }
        });

        if (!movedCard) return;

        // Add to destination list at correct position
        if (!newCardsByList[newListId]) {
          newCardsByList[newListId] = [];
        }
        newCardsByList[newListId].splice(newPosition, 0, movedCard);

        // Update positions in destination list
        newCardsByList[newListId] = newCardsByList[newListId].map((card, index) => ({
          ...card,
          position: index
        }));

        // Optimistic update
        set({ cardsByList: newCardsByList, lastUpdated: Date.now() });

        try {
          await Database.moveCard(cardId, newListId, newPosition, newStatus);
        } catch (error) {
          console.error('Error moving card:', error);
          // Rollback - this is complex, so we'll reinitialize
          await get().initializeWorkflow(state.board._id);
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
        const originalLists = [...state.lists];
        const listIndex = state.lists.findIndex(list => list._id === listId);

        if (listIndex === -1) return;

        // Optimistic update
        const newLists = [...state.lists];
        const [movedList] = newLists.splice(listIndex, 1);
        movedList.position = newPosition;
        newLists.splice(newPosition, 0, movedList);

        // Update positions
        newLists.forEach((list, index) => {
          list.position = index;
        });

        set({ lists: newLists, lastUpdated: Date.now() });

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
        loading: false,
        error: null,
        lastUpdated: null
      })
    }),
    {
      name: 'workflow-store'
    }
  )
);

export default useWorkflowStore;
