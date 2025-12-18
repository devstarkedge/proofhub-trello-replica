import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import Database from '../services/database';

/**
 * Normalized Nano-Subtask (Neno) Store
 * 
 * Structure:
 * - nanosById: Map of nano ID -> nano data (single source of truth)
 * - nanoIdsBySubtask: Map of subtask ID -> array of nano IDs (for list rendering)
 * - loading: Map of subtask ID -> boolean (loading state per subtask)
 * - error: Map of subtask ID -> string (error state per subtask)
 */

const useNanoSubtaskStore = create(
  devtools(
    (set, get) => ({
      // Normalized state
      nanosById: {},
      nanoIdsBySubtask: {},
      loading: {},
      error: {},

      // ============ SELECTORS ============
      
      // Get a single nano by ID
      getNano: (nanoId) => get().nanosById[nanoId] || null,

      // Get all nanos for a subtask (returns array of nano objects)
      getNanosBySubtask: (subtaskId) => {
        const state = get();
        const ids = state.nanoIdsBySubtask[subtaskId] || [];
        return ids.map(id => state.nanosById[id]).filter(Boolean);
      },

      // Check if loading for a specific subtask
      isLoading: (subtaskId) => get().loading[subtaskId] || false,

      // Get error for a specific subtask
      getError: (subtaskId) => get().error[subtaskId] || null,

      // ============ ACTIONS ============

      // Fetch nanos for a subtask
      fetchNanos: async (subtaskId, options = {}) => {
        const { forceRefresh = false } = options;
        const state = get();

        // Return cached data if available and not forcing refresh
        if (!forceRefresh && state.nanoIdsBySubtask[subtaskId]?.length > 0) {
          return state.getNanosBySubtask(subtaskId);
        }

        // Set loading state
        set(s => ({
          loading: { ...s.loading, [subtaskId]: true },
          error: { ...s.error, [subtaskId]: null }
        }));

        try {
          const response = await Database.getNanoSubtasks(subtaskId);
          const nanos = response.data || response || [];

          // Normalize into state
          const nanosById = { ...get().nanosById };
          const nanoIds = [];

          nanos.forEach(nano => {
            nanosById[nano._id] = nano;
            nanoIds.push(nano._id);
          });

          set(s => ({
            nanosById,
            nanoIdsBySubtask: { ...s.nanoIdsBySubtask, [subtaskId]: nanoIds },
            loading: { ...s.loading, [subtaskId]: false }
          }));

          return nanos;
        } catch (error) {
          console.error('Error fetching nanos:', error);
          set(s => ({
            loading: { ...s.loading, [subtaskId]: false },
            error: { ...s.error, [subtaskId]: error.message }
          }));
          return [];
        }
      },

      // Create nano with optimistic update
      createNano: async (subtaskId, payload) => {
        const tempId = `temp-nano-${Date.now()}`;
        const tempNano = {
          _id: tempId,
          title: payload.title || 'New Nano-Subtask',
          parentSubtask: subtaskId,
          status: 'todo',
          completed: false,
          isOptimistic: true,
          createdAt: new Date().toISOString(),
          ...payload
        };

        // Optimistic update
        set(s => ({
          nanosById: { ...s.nanosById, [tempId]: tempNano },
          nanoIdsBySubtask: {
            ...s.nanoIdsBySubtask,
            [subtaskId]: [...(s.nanoIdsBySubtask[subtaskId] || []), tempId]
          }
        }));

        try {
          const response = await Database.createNanoSubtask(subtaskId, payload);
          const realNano = response.data || response;

          // Replace temp with real
          set(s => {
            const newById = { ...s.nanosById };
            delete newById[tempId];
            newById[realNano._id] = realNano;

            const newIdsBySubtask = { ...s.nanoIdsBySubtask };
            newIdsBySubtask[subtaskId] = (newIdsBySubtask[subtaskId] || []).map(id =>
              id === tempId ? realNano._id : id
            );

            return { nanosById: newById, nanoIdsBySubtask: newIdsBySubtask };
          });

          return realNano;
        } catch (error) {
          console.error('Error creating nano:', error);
          // Rollback
          set(s => {
            const newById = { ...s.nanosById };
            delete newById[tempId];

            const newIdsBySubtask = { ...s.nanoIdsBySubtask };
            newIdsBySubtask[subtaskId] = (newIdsBySubtask[subtaskId] || []).filter(id => id !== tempId);

            return { nanosById: newById, nanoIdsBySubtask: newIdsBySubtask };
          });
          throw error;
        }
      },

      // Update nano with optimistic update
      updateNano: async (nanoId, updates) => {
        const state = get();
        const originalNano = state.nanosById[nanoId];

        if (!originalNano) {
          console.warn('Nano not found in store:', nanoId);
          return null;
        }

        // Optimistic update
        set(s => ({
          nanosById: {
            ...s.nanosById,
            [nanoId]: { ...originalNano, ...updates, updatedAt: new Date().toISOString() }
          }
        }));

        try {
          const response = await Database.updateNanoSubtask(nanoId, updates);
          const updatedNano = response.data || response;

          // Update with server response
          set(s => ({
            nanosById: {
              ...s.nanosById,
              [nanoId]: updatedNano
            }
          }));

          return updatedNano;
        } catch (error) {
          console.error('Error updating nano:', error);
          // Rollback
          set(s => ({
            nanosById: {
              ...s.nanosById,
              [nanoId]: originalNano
            }
          }));
          throw error;
        }
      },

      // Update nano locally only (no API call) - for external sync
      updateNanoLocal: (nanoId, updates) => {
        set(s => {
          const existing = s.nanosById[nanoId];
          if (!existing) return {};
          return {
            nanosById: {
              ...s.nanosById,
              [nanoId]: { ...existing, ...updates }
            }
          };
        });
      },

      // Delete nano with optimistic update
      deleteNano: async (nanoId) => {
        const state = get();
        const nano = state.nanosById[nanoId];

        if (!nano) return;

        const subtaskId = nano.parentSubtask;

        // Optimistic delete
        set(s => {
          const newById = { ...s.nanosById };
          delete newById[nanoId];

          const newIdsBySubtask = { ...s.nanoIdsBySubtask };
          if (subtaskId && newIdsBySubtask[subtaskId]) {
            newIdsBySubtask[subtaskId] = newIdsBySubtask[subtaskId].filter(id => id !== nanoId);
          }

          return { nanosById: newById, nanoIdsBySubtask: newIdsBySubtask };
        });

        try {
          await Database.deleteNanoSubtask(nanoId);
          return true;
        } catch (error) {
          console.error('Error deleting nano:', error);
          // Rollback
          set(s => ({
            nanosById: { ...s.nanosById, [nanoId]: nano },
            nanoIdsBySubtask: {
              ...s.nanoIdsBySubtask,
              [subtaskId]: [...(s.nanoIdsBySubtask[subtaskId] || []), nanoId]
            }
          }));
          throw error;
        }
      },

      // Toggle nano completion
      toggleNanoComplete: async (nanoId) => {
        const nano = get().nanosById[nanoId];
        if (!nano) return null;

        const newCompleted = !nano.completed;
        const newStatus = newCompleted ? 'done' : 'todo';

        return get().updateNano(nanoId, {
          completed: newCompleted,
          status: newStatus
        });
      },

      // Batch set nanos for a subtask
      setNanosForSubtask: (subtaskId, nanos) => {
        const nanosById = { ...get().nanosById };
        const nanoIds = [];

        nanos.forEach(nano => {
          nanosById[nano._id] = nano;
          nanoIds.push(nano._id);
        });

        set(s => ({
          nanosById,
          nanoIdsBySubtask: { ...s.nanoIdsBySubtask, [subtaskId]: nanoIds }
        }));
      },

      // Clear nanos for a subtask (on modal close or cleanup)
      clearSubtaskNanos: (subtaskId) => {
        set(s => {
          const idsToRemove = s.nanoIdsBySubtask[subtaskId] || [];
          const newById = { ...s.nanosById };
          idsToRemove.forEach(id => delete newById[id]);

          const newIdsBySubtask = { ...s.nanoIdsBySubtask };
          delete newIdsBySubtask[subtaskId];

          return {
            nanosById: newById,
            nanoIdsBySubtask: newIdsBySubtask,
            loading: { ...s.loading, [subtaskId]: undefined },
            error: { ...s.error, [subtaskId]: undefined }
          };
        });
      },

      // Handle real-time events
      handleNanoCreated: (subtaskId, nano) => {
        set(s => ({
          nanosById: { ...s.nanosById, [nano._id]: nano },
          nanoIdsBySubtask: {
            ...s.nanoIdsBySubtask,
            [subtaskId]: [...(s.nanoIdsBySubtask[subtaskId] || []), nano._id]
          }
        }));
      },

      handleNanoUpdated: (nanoId, updates) => {
        set(s => {
          const existing = s.nanosById[nanoId];
          if (!existing) return {};
          return {
            nanosById: {
              ...s.nanosById,
              [nanoId]: { ...existing, ...updates }
            }
          };
        });
      },

      handleNanoDeleted: (nanoId) => {
        set(s => {
          const nano = s.nanosById[nanoId];
          if (!nano) return {};

          const subtaskId = nano.parentSubtask;
          const newById = { ...s.nanosById };
          delete newById[nanoId];

          const newIdsBySubtask = { ...s.nanoIdsBySubtask };
          if (subtaskId && newIdsBySubtask[subtaskId]) {
            newIdsBySubtask[subtaskId] = newIdsBySubtask[subtaskId].filter(id => id !== nanoId);
          }

          return { nanosById: newById, nanoIdsBySubtask: newIdsBySubtask };
        });
      }
    }),
    { name: 'nano-subtask-store' }
  )
);

// ============ HOOK SELECTORS (with shallow comparison) ============

/**
 * Hook to get a single nano by ID
 * Uses shallow comparison to prevent unnecessary re-renders
 */
export const useNano = (nanoId) => {
  return useNanoSubtaskStore(
    state => state.nanosById[nanoId],
    shallow
  );
};

/**
 * Hook to get nano IDs for a subtask (stable array reference)
 * Use this for list rendering - the array reference is stable
 */
export const useNanoIds = (subtaskId) => {
  return useNanoSubtaskStore(
    state => state.nanoIdsBySubtask[subtaskId] || [],
    shallow
  );
};

/**
 * Hook to get all nanos for a subtask
 * Uses separate selector calls to prevent creating new arrays in selector
 * This prevents creating new arrays on each render
 */
export const useNanosBySubtask = (subtaskId) => {
  const ids = useNanoSubtaskStore(state => state.nanoIdsBySubtask[subtaskId], shallow);
  const nanosById = useNanoSubtaskStore(state => state.nanosById, shallow);
  
  // Return empty array if no IDs - this is stable
  if (!ids || ids.length === 0) return [];
  
  // Derive nanos - components should memoize if needed
  return ids.map(id => nanosById[id]).filter(Boolean);
};

/**
 * Hook to get loading state for a subtask's nanos
 */
export const useNanoLoading = (subtaskId) => {
  return useNanoSubtaskStore(state => state.loading[subtaskId] || false);
};

/**
 * Hook to get error state for a subtask's nanos
 */
export const useNanoError = (subtaskId) => {
  return useNanoSubtaskStore(state => state.error[subtaskId] || null);
};

export default useNanoSubtaskStore;
