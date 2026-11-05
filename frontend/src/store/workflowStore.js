import { responseStatus, retryDelay, temporaryReadFailure } from '../../../shared/readFailure.mjs';
import movementPersistence from '../services/movementPersistence';
import { placeWorkflowCard, referenceId } from '../../../shared/workflowMoves.mjs';
import { rememberWorkflow } from '../../../shared/projectOrder.mjs';
import { captureRequestScope, requestScopeKey } from '../../../shared/requestScope.mjs';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import Database from '../services/database';
import { registerResettable } from './resetRegistry';
import logger from '../utils/logger';

// Helper to build cardsById from cardsByList
const buildCardsById = (cardsByList) => {
  const cardsById = {};
  Object.values(cardsByList || {}).forEach(cards => {
    if (Array.isArray(cards)) {
      cards.forEach(card => {
        if (card && card._id) {
          cardsById[card._id] = card;
        }
      });
    }
  });
  return cardsById;
};

// Track the current request to prevent race conditions
let currentRequestId = 0;
let cacheGeneration = 0;
let mutationVersion = 0;
const moveQueues = new Map();
const workflowReads = new Map();
const readRetries = new Map();
function retryWorkflow(projectId, scope, generation, delay) {
  const key = `${generation}:${scope}:${projectId}`;
  clearTimeout(readRetries.get(key));
  const timer = setTimeout(() => {
    readRetries.delete(key);
    if (generation !== cacheGeneration || scope !== cacheScope() || useWorkflowStore.getState().currentProjectId !== projectId) return;
    void useWorkflowStore.getState().initializeWorkflow(projectId);
  }, delay + 25);
  timer?.unref?.(); readRetries.set(key, timer);
}

const moveKey = (scope, projectId) => `${cacheGeneration}:${scope}:${projectId}`;
const cacheScope = () => requestScopeKey(captureRequestScope(localStorage));

const useWorkflowStore = create(
  devtools(
    (set, get) => ({
      // State
      board: null,
      lists: [],
      cardsByList: {},
      cardsById: {},  // Normalized card lookup for O(1) access
      loading: true,
      error: null, errorStatus: null, refreshError: null, workflowRetryAt: 0,
      lastUpdated: null,
      currentProjectId: null, // Track which project data belongs to

      // Actions
      setBoard: (board) => set({ board }),
      setLists: (lists) => set({ lists }),
      setCardsByList: (cardsByList) => set({ cardsByList }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setLastUpdated: (timestamp) => set({ lastUpdated: timestamp }),
      
      // Cache for prefetched data
      prefetchedData: {},
      
      invalidateProjectCache: (projectId) => set(state => ({
        prefetchedData: projectId ? Object.fromEntries(Object.entries(state.prefetchedData).filter(([id]) => id !== String(projectId))) : {}
      })),

      // Prefetch workflow data in background
      prefetchWorkflow: async (projectId) => {
        const generation = cacheGeneration;
        const scope = cacheScope();
        const version = mutationVersion;
        if (moveQueues.get(moveKey(scope, projectId))?.pending) return;
        const state = get();
        // Don't prefetch if we already have fresh data
        if (state.prefetchedData[projectId]?.scope === scope && state.prefetchedData[projectId]?.generation === generation && (Date.now() - state.prefetchedData[projectId].timestamp < 30000)) {
           return;
        }

        try {
          const response = await Database.getWorkflowComplete(projectId, { readVersion: `${generation}:${version}` });
          if (response.success && response.data && cacheGeneration === generation && cacheScope() === scope && mutationVersion === version) {
             set(state => ({
               prefetchedData: rememberWorkflow(state.prefetchedData, projectId, {
                 data: response.data, scope, generation, timestamp: Date.now()
               })
             }));
          }
        } catch (err) {
          // Silent fail for prefetch
          console.error('Prefetch failed', err);
        }
      },
      initializeWorkflow: (projectId) => {
        const key = moveKey(cacheScope(), projectId), state = get();
        if (state.currentProjectId === projectId && state.currentScope === cacheScope() && state.workflowRetryAt > Date.now()) {
          retryWorkflow(projectId, cacheScope(), cacheGeneration, state.workflowRetryAt - Date.now());
          return Promise.resolve();
        }
        const existing = workflowReads.get(key);
        if (existing?.version === mutationVersion) return existing.promise;
        const entry = { version: mutationVersion };
        entry.promise = get().loadWorkflow(projectId).finally(() => { if (workflowReads.get(key) === entry) workflowReads.delete(key); });
        workflowReads.set(key, entry);
        return entry.promise;
      },
      loadWorkflow: async (projectId) => {
        const outgoing = get();
        const activeMoves = moveQueues.get(moveKey(cacheScope(), outgoing.currentProjectId));
        if (activeMoves?.pending && outgoing.board) activeMoves.snapshot = {
          board: outgoing.board, lists: outgoing.lists, cardsByList: outgoing.cardsByList, cardsById: outgoing.cardsById
        };
        const moves = moveQueues.get(moveKey(cacheScope(), projectId));
        if (moves?.pending) {
          // Coalesce realtime refreshes until the last queued write commits.
          moves.refresh = true;
          if (get().currentProjectId !== projectId || get().currentScope !== cacheScope()) {
            currentRequestId += 1;
            set({ ...(moves.snapshot || { board: null, lists: [], cardsByList: {}, cardsById: {} }), loading: !moves.snapshot,
              error: null, currentProjectId: projectId, currentScope: cacheScope() });
          }
          return moves.tail;
        }
        const requestId = ++currentRequestId;
        const scope = cacheScope();
        const generation = cacheGeneration;
        const version = mutationVersion;
        logger.debug('PROJECT_RESOLUTION_START', { projectId, requestId });
        const state = get();
        
        // Check if we already have data for this project
        const isSameProject = state.currentProjectId === projectId && state.currentScope === scope;
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
          if (prefetched?.scope === cacheScope() && prefetched?.generation === cacheGeneration && (Date.now() - prefetched.timestamp < 30000)) { // Brief display cache; always refresh below.
             console.log('Using prefetched data for', projectId);
             const { board, lists, cardsByList } = prefetched.data;
             const cardsById = buildCardsById(cardsByList);
             set({
                board,
                lists: lists || [],
                cardsByList: cardsByList || {},
                cardsById,
                loading: false,
                lastUpdated: Date.now(),
                error: null,
                currentScope: scope, currentProjectId: projectId
             });
             logger.debug('PROJECT_RESOLUTION_COMPLETE', { projectId, boardId: board?._id, source: 'prefetch' });
          } else {

          // New project or no data - show loader and clear old data
          set({ 
            loading: true,
            error: null, errorStatus: null, refreshError: null, workflowRetryAt: 0,
            board: null,
            lists: [], 
            cardsByList: {},
            cardsById: {},
            currentScope: scope, currentProjectId: projectId
          });
          }
        }

        try {
          // Use the new optimized endpoint that returns everything in one call
          const response = await Database.getWorkflowComplete(projectId, { readVersion: `${generation}:${version}` });
          const pendingMoves = await movementPersistence.pending(projectId);
          if (response.data?.cardsByList) for (const intent of pendingMoves) {
            const target = response.data.lists.find(list => String(list._id) === intent.destinationListId);
            if (target) response.data.cardsByList = placeWorkflowCard(response.data.cardsByList, intent.cardId, intent.destinationListId, intent.position,
              { status: target.title.toLowerCase().replace(/\s+/g, '-') });
          }
          // Check if this request is still the current one
          if (requestId !== currentRequestId || generation !== cacheGeneration || scope !== cacheScope()) {
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
          
          set(state => ({ prefetchedData: rememberWorkflow(state.prefetchedData, projectId, {
            data: response.data, scope, generation, timestamp: Date.now()
          }) }));
          // Set all data at once with normalized cardsById
          const cardsById = buildCardsById(cardsByList);
          set({
            board,
            lists: lists || [],
            cardsByList: cardsByList || {},
            cardsById,
            lastUpdated: Date.now(),
            loading: false, error: null, errorStatus: null, refreshError: null, workflowRetryAt: 0
          });
          logger.debug('PROJECT_RESOLUTION_COMPLETE', { projectId, boardId: board?._id, source: 'network' });
        } catch (error) {
          if (requestId !== currentRequestId || generation !== cacheGeneration || scope !== cacheScope()) return;

          if (temporaryReadFailure(error)) {
            const delay = retryDelay(error), current = get();
            const keep = current.board && current.currentProjectId === projectId && current.currentScope === scope;
            set({ loading: false, error: keep ? null : error.message, errorStatus: keep ? null : responseStatus(error),
              refreshError: keep ? error.message : null, workflowRetryAt: Date.now() + delay });
            if (globalThis.navigator?.onLine !== false) retryWorkflow(projectId, scope, generation, delay);
            return;
          }
          get().invalidateProjectCache(projectId);
          console.error('Error initializing workflow:' , error);
          logger.debug('PROJECT_CONTEXT_INVALID', { projectId, requestId, message: error.message });
          set({
            error: error.message || 'Failed to load workflow', errorStatus: responseStatus(error), refreshError: null, workflowRetryAt: 0,
            board: null, lists: [], cardsByList: {}, cardsById: {},
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
          set({ lists: [], cardsByList: {}, cardsById: {}, lastUpdated: Date.now() });
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

        const cardsById = buildCardsById(cardsMap);
        set({ lists: boardLists, cardsByList: cardsMap, cardsById, lastUpdated: Date.now() });
      },

      // Update board (project) details
      updateBoard: (updates) => set((state) => ({
        board: { ...state.board, ...updates },
        lastUpdated: Date.now()
      })),

      // Add card with optimistic update
      addCard: async (listId, title, boardId) => {
        const scope = cacheScope(), generation = cacheGeneration;
        const projectId = get().currentProjectId;
        const current = () => scope === cacheScope() && generation === cacheGeneration && projectId === get().currentProjectId;
        const tempId = `temp-${crypto.randomUUID()}`;
        mutationVersion++; currentRequestId++; get().invalidateProjectCache(boardId);
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
          cardsById: { ...state.cardsById, [tempId]: tempCard },
          lastUpdated: Date.now()
        }));

        try {
          const newCard = await Database.createCard(listId, title, boardId);
          const realCard = newCard.data || newCard;
          if (!realCard?._id || newCard.success === false) throw new Error(newCard.message || 'Invalid card response');
          if (!current()) return realCard;

          // Replace temp card with real card
          set((state) => {
            const newCardsById = { ...state.cardsById };
            delete newCardsById[tempId];
            // A realtime create/update can arrive before the HTTP reply.
            // Preserve its newer placement and edits; remove only our placeholder.
            const existing = state.cardsById[realCard._id];
            const confirmed = existing ? { ...realCard, ...existing } : realCard;
            newCardsById[realCard._id] = confirmed;
            const list = state.cardsByList[listId] || [];
            const hasTemp = list.some(card => card._id === tempId);
            const next = existing ? list.filter(card => card._id !== tempId)
              : hasTemp ? list.map(card => card._id === tempId ? confirmed : card) : [...list, confirmed];
            return {
              cardsByList: { ...state.cardsByList, [listId]: next },
              cardsById: newCardsById
            };
          });

          return realCard;
        } catch (error) {
          if (!current()) throw error;
          console.error('Error adding card:', error);
          // Rollback optimistic update
          set((state) => {
            const newCardsById = { ...state.cardsById };
            delete newCardsById[tempId];
            return {
              cardsByList: {
                ...state.cardsByList,
                [listId]: (state.cardsByList[listId] || []).filter(card => card._id !== tempId)
              },
              cardsById: newCardsById
            };
          });
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
        const newCardsById = { ...state.cardsById };
        delete newCardsById[cardId];
        set({ cardsByList: newCardsByList, cardsById: newCardsById, lastUpdated: Date.now() });

        try {
          await Database.deleteCard(cardId);
        } catch (error) {
          console.error('Error deleting card:', error);
          // Rollback optimistic update
          set((state) => ({
            cardsByList: {
              ...state.cardsByList,
              [sourceListId]: [...(state.cardsByList[sourceListId] || []), deletedCard]
            },
            cardsById: { ...state.cardsById, [cardId]: deletedCard }
          }));
          throw error;
        }
      },

      // Update card with optimistic update
      updateCard: async (cardId, updates) => {
        const state = get();
        let originalCard = null;

        // Find original card
        Object.keys(state.cardsByList).forEach(listId => {
          const card = state.cardsByList[listId].find(c => c._id === cardId);
          if (card) {
            originalCard = card;
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

        // Optimistic update - both cardsByList and cardsById
        const updatedCard = { ...originalCard, ...processedUpdates };
        set((state) => {
          const newCardsByList = { ...state.cardsByList };
          Object.keys(newCardsByList).forEach(listId => {
            newCardsByList[listId] = newCardsByList[listId].map(card =>
              card._id === cardId ? updatedCard : card
            );
          });
          return { 
            cardsByList: newCardsByList, 
            cardsById: { ...state.cardsById, [cardId]: updatedCard },
            lastUpdated: Date.now() 
          };
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
            return { 
              cardsByList: newCardsByList,
              cardsById: { ...state.cardsById, [cardId]: originalCard }
            };
          });
          throw error;
        }
      },

      // Update card locally ONLY (no API call)
      // Useful for syncing state when another store (like attachmentStore) handles the API call
      updateCardLocal: (cardId, updates) => {
        set((state) => {
          const existingCard = state.cardsById[cardId];
          if (!existingCard) return {};
          if (Number.isInteger(updates.__v) && Number.isInteger(existingCard.__v) && updates.__v < existingCard.__v) return {};
          const patch = { ...updates };
          const moves = moveQueues.get(moveKey(cacheScope(), state.currentProjectId));
          if (moves?.pending) {
            // An earlier move's echo can also shift other pending cards.
            // Defer board placement to the coalesced refresh after all saves.
            delete patch.list; delete patch.position;
            if (moves.cards.has(cardId)) delete patch.status;
          }
          const updatedCard = { ...existingCard, ...patch };
          const relocating = patch.list !== undefined || patch.position !== undefined;
          const cardsByList = relocating
            ? placeWorkflowCard(state.cardsByList, cardId, updatedCard.list, updatedCard.position, patch)
            : Object.fromEntries(Object.entries(state.cardsByList).map(([listId, cards]) => [listId,
              cards.map(card => card._id === cardId ? updatedCard : card)]));
          return { cardsByList, cardsById: buildCardsById(cardsByList), lastUpdated: Date.now() };
        });
      },

      // Add card from socket event (e.g. another user copied/moved a card to this board)
      addCardFromSocket: (card, listId) => {
        set((state) => {
          const targetListId = listId || card.list?._id || card.list;
          if (!targetListId) return {};
          // Don't add duplicates
          if (state.cardsById[card._id]) return {};

          const newCardsByList = { ...state.cardsByList };
          const listCards = [...(newCardsByList[targetListId] || [])];
          listCards.push(card);
          // Re-sort by position
          listCards.sort((a, b) => (a.position || 0) - (b.position || 0));
          newCardsByList[targetListId] = listCards;

          return {
            cardsByList: newCardsByList,
            cardsById: { ...state.cardsById, [card._id]: card },
            lastUpdated: Date.now()
          };
        });
      },

      // Remove card from socket event (e.g. another user moved a card away from this board)
      removeCardFromSocket: (cardId) => {
        set((state) => {
          if (!state.cardsById[cardId]) return {};
          const newCardsByList = { ...state.cardsByList };
          Object.keys(newCardsByList).forEach(listId => {
            const idx = newCardsByList[listId].findIndex(c => c._id === cardId);
            if (idx !== -1) {
              newCardsByList[listId] = newCardsByList[listId].filter(c => c._id !== cardId);
            }
          });
          const newCardsById = { ...state.cardsById };
          delete newCardsById[cardId];
          return {
            cardsByList: newCardsByList,
            cardsById: newCardsById,
            lastUpdated: Date.now()
          };
        });
      },

      // Render drops immediately; persist them in board order in the background.
      moveCard: (cardId, newListId, newPosition, newStatus) => {
        const state = get();
        const original = state.cardsById[cardId];
        if (!original) return Promise.resolve();
        const projectId = state.currentProjectId;
        const scope = cacheScope(), generation = cacheGeneration;
        const key = moveKey(scope, projectId);
        let queue = moveQueues.get(key);
        if (!queue) {
          queue = { tail: Promise.resolve(), pending: 0, cards: new Map(), refresh: false };
          moveQueues.set(key, queue);
        }
        let entry = queue.cards.get(cardId);
        if (!entry) {
          const source = Object.keys(state.cardsByList).find(id => state.cardsByList[id].some(card => card._id === cardId));
          entry = { pending: 0, confirmed: { list: source, position: original.position, status: original.status, __v: original.__v, movementRevision: original.movementRevision || 0 } };
          queue.cards.set(cardId, entry);
        }
        const operationId = ++mutationVersion;
        entry.latest = operationId; entry.pending += 1; queue.pending += 1;
        currentRequestId += 1; // Discard any read started before this drop.
        get().invalidateProjectCache(projectId);
        const cardsByList = placeWorkflowCard(state.cardsByList, cardId, newListId, newPosition, { status: newStatus ?? original.status });
        set({ cardsByList, cardsById: buildCardsById(cardsByList), lastUpdated: Date.now() });
        const sameSession = () => generation === cacheGeneration && scope === cacheScope();
        const sameView = () => sameSession() && get().currentProjectId === projectId;
        const place = placement => {
          if (!sameView() || !get().cardsById[cardId]) return;
          const next = placeWorkflowCard(get().cardsByList, cardId, placement.list, placement.position, placement);
          set({ cardsByList: next, cardsById: buildCardsById(next), lastUpdated: Date.now() });
        };
        queue.snapshot = { board: state.board, lists: state.lists, cardsByList, cardsById: buildCardsById(cardsByList) };
        const persisted = movementPersistence.enqueue({ boardId: projectId, cardId, destinationListId: newListId,
          position: newPosition, expectedMovementRevision: entry.confirmed.movementRevision });
        const operation = queue.tail.then(async () => {
          try {
            // Queued writes must never inherit another account/workspace.
            if (!sameSession()) throw new DOMException('Session changed; reopen this project before retrying', 'AbortError');
            const response = await persisted;
            if (response.superseded) return response;
            if (response?.success === false) throw new Error(response.message || 'Failed to move card');
            const saved = response?.data || {};
            entry.confirmed = {
              list: referenceId(saved.list || newListId),
              position: saved.position ?? newPosition,
              status: saved.status ?? newStatus ?? original.status,
              __v: saved.__v ?? entry.confirmed.__v,
              movementRevision: saved.movementRevision ?? entry.confirmed.movementRevision,
            };
            if (entry.latest === operationId) {
              // Later drops of other cards may have shifted this card's index.
              // Keep that visible order until those queued writes settle too.
              const visible = get().cardsById[cardId];
              place(queue.pending > 1 && visible
                ? { ...entry.confirmed, position: visible.position }
                : entry.confirmed);
            }
            return response;
          } catch (error) {
            if ([404,409].includes(error.status || error.response?.status)) queue.refresh = true;
            // Undo only this card's placement, preserving other cards and edits.
            // A later queued drop owns the UI and will reconcile its own result.
            if (entry.latest === operationId) place(entry.confirmed);
            throw error;
          } finally {
            entry.pending -= 1; queue.pending -= 1;
            if (!entry.pending) queue.cards.delete(cardId);
            mutationVersion += 1;
            if (sameSession()) get().invalidateProjectCache(projectId);
            if (!queue.pending) {
              if (moveQueues.get(key) === queue) moveQueues.delete(key);
              if (sameView() && queue.refresh) void get().initializeWorkflow(projectId);
            }
          }
        });
        // A failed operation must not cancel subsequent drops.
        queue.tail = operation.catch(() => {});
        return operation;
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
          const existingCard = state.cardsById[cardId];
          if (!existingCard) return state;
          
          const updatedCard = { ...existingCard, hasRecurrence };
          const newCardsByList = { ...state.cardsByList };
          
          Object.keys(newCardsByList).forEach(listId => {
            newCardsByList[listId] = newCardsByList[listId].map(card =>
              card._id === cardId ? updatedCard : card
            );
          });
          
          return { 
            cardsByList: newCardsByList, 
            cardsById: { ...state.cardsById, [cardId]: updatedCard },
            lastUpdated: Date.now() 
          };
        });
      },

      // Optimistically restore a card
      restoreCardOptimistic: (card) => {
        set((state) => {
          if (!card || !card.list) return state;

          const listId = typeof card.list === 'object' ? card.list._id : card.list;
          
          // Check if already in list
          const currentList = state.cardsByList[listId] || [];
          if (currentList.some(c => c._id === card._id)) return state;

          // Prepare restored card
          const restoredCard = {
             ...card,
             isArchived: false,
             archivedAt: null,
             autoDeleteAt: null
          };

          const newCardsByList = {
            ...state.cardsByList,
            [listId]: [...currentList, restoredCard]
          };

          return {
            cardsByList: newCardsByList,
            cardsById: { ...state.cardsById, [card._id]: restoredCard },
            lastUpdated: Date.now()
          };
        });
      },

      // Rollback restore
      restoreCardRollback: (cardId, originalListId) => {
        set((state) => {
           const newCardsByList = { ...state.cardsByList };
           // Remove from list
           if (newCardsByList[originalListId]) {
             newCardsByList[originalListId] = newCardsByList[originalListId].filter(c => c._id !== cardId);
           }
           
           const newCardsById = { ...state.cardsById };
           delete newCardsById[cardId];
           
           return {
             cardsByList: newCardsByList,
             cardsById: newCardsById,
             lastUpdated: Date.now()
           };
        });
      },

      // Clear workflow data
      clearWorkflow: () => set({
        board: null,
        lists: [],
        cardsByList: {},
        cardsById: {},
        loading: true,
        error: null, errorStatus: null, refreshError: null, workflowRetryAt: 0,
        lastUpdated: null,
        currentProjectId: null
      }),

      // Workspace-scoped — cleared on workspace switch/logout, see
      // resetRegistry.js. Reuses clearWorkflow's reset plus the prefetch
      // cache, which clearWorkflow itself deliberately leaves alone
      // (prefetching another project shouldn't wipe the currently-viewed
      // one's cache) but does need to go on an actual workspace switch.
      reset: () => {
        currentRequestId += 1;
        cacheGeneration += 1;
        mutationVersion += 1;
        moveQueues.clear(); workflowReads.clear();
        for (const timer of readRetries.values()) clearTimeout(timer); readRetries.clear();
        set({
        board: null,
        lists: [],
        cardsByList: {},
        cardsById: {},
        loading: true,
        error: null, errorStatus: null, refreshError: null, workflowRetryAt: 0,
        lastUpdated: null,
        currentProjectId: null,
        prefetchedData: {}
      });
      }
    }),
    {
      name: 'workflow-store'
    }
  )
);

registerResettable(() => useWorkflowStore.getState().reset());

// ============ SELECTOR HOOKS (with shallow comparison) ============

/**
 * Hook to get a single card by ID
 * Uses shallow comparison to prevent unnecessary re-renders
 */
export const useCard = (cardId) => {
  return useWorkflowStore(
    state => state.cardsById[cardId],
    shallow
  );
};

/**
 * Hook to get cards for a specific list
 * Returns memoized array of card objects
 */
export const useCardsByList = (listId) => {
  return useWorkflowStore(
    state => state.cardsByList[listId] || [],
    shallow
  );
};

/**
 * Hook to get all lists
 */
export const useLists = () => {
  return useWorkflowStore(
    state => state.lists,
    shallow
  );
};

/**
 * Hook to get board data
 */
export const useBoard = () => {
  return useWorkflowStore(
    state => state.board,
    shallow
  );
};

/**
 * Hook to get loading state
 */
export const useWorkflowLoading = () => {
  return useWorkflowStore(state => state.loading);
};

/**
 * Hook to get error state
 */
export const useWorkflowError = () => {
  return useWorkflowStore(state => state.error);
};

export default useWorkflowStore;

globalThis.window?.addEventListener('flowtask:movement-status', event => {
  const detail = event.detail;
  if (detail?.type !== 'reconciled') return;
  const state = useWorkflowStore.getState();
  if (String(state.currentProjectId) !== String(detail.boardId)) return;
  const queue = moveQueues.get(moveKey(cacheScope(), state.currentProjectId));
  if (queue?.pending) { queue.refresh = true; return; }
  void state.initializeWorkflow(state.currentProjectId);
});
