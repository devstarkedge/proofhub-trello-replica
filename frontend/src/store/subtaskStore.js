import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { shallow } from 'zustand/shallow';
import Database from '../services/database';

/**
 * Normalized Subtask Store
 * 
 * Structure:
 * - subtasksById: Map of subtask ID -> subtask data (single source of truth)
 * - subtaskIdsByTask: Map of task ID -> array of subtask IDs (for list rendering)
 * - loading: Map of task ID -> boolean (loading state per task)
 * - error: Map of task ID -> string (error state per task)
 */

const useSubtaskStore = create(
  devtools(
    (set, get) => ({
      // Normalized state
      subtasksById: {},
      subtaskIdsByTask: {},
      loading: {},
      error: {},

      // ============ SELECTORS ============
      
      // Get a single subtask by ID
      getSubtask: (subtaskId) => get().subtasksById[subtaskId] || null,

      // Get all subtasks for a task (returns array of subtask objects)
      getSubtasksByTask: (taskId) => {
        const state = get();
        const ids = state.subtaskIdsByTask[taskId] || [];
        return ids.map(id => state.subtasksById[id]).filter(Boolean);
      },

      // Check if loading for a specific task
      isLoading: (taskId) => get().loading[taskId] || false,

      // Get error for a specific task
      getError: (taskId) => get().error[taskId] || null,

      // ============ ACTIONS ============

      // Fetch subtasks for a task
      fetchSubtasks: async (taskId, options = {}) => {
        const { forceRefresh = false } = options;
        const state = get();

        // Return cached data if available and not forcing refresh
        if (!forceRefresh && state.subtaskIdsByTask[taskId]?.length > 0) {
          return state.getSubtasksByTask(taskId);
        }

        // Set loading state
        set(s => ({
          loading: { ...s.loading, [taskId]: true },
          error: { ...s.error, [taskId]: null }
        }));

        try {
          const response = await Database.getSubtasks(taskId);
          const subtasks = response.data || response || [];

          // Normalize into state
          const subtasksById = { ...get().subtasksById };
          const subtaskIds = [];

          subtasks.forEach(subtask => {
            subtasksById[subtask._id] = subtask;
            subtaskIds.push(subtask._id);
          });

          set(s => ({
            subtasksById,
            subtaskIdsByTask: { ...s.subtaskIdsByTask, [taskId]: subtaskIds },
            loading: { ...s.loading, [taskId]: false }
          }));

          return subtasks;
        } catch (error) {
          console.error('Error fetching subtasks:', error);
          set(s => ({
            loading: { ...s.loading, [taskId]: false },
            error: { ...s.error, [taskId]: error.message }
          }));
          return [];
        }
      },

      // Create subtask with optimistic update
      createSubtask: async (taskId, payload) => {
        const tempId = `temp-subtask-${Date.now()}`;
        const tempSubtask = {
          _id: tempId,
          title: payload.title || 'New Subtask',
          parentTask: taskId,
          status: 'todo',
          completed: false,
          isOptimistic: true,
          createdAt: new Date().toISOString(),
          ...payload
        };

        // Optimistic update
        set(s => ({
          subtasksById: { ...s.subtasksById, [tempId]: tempSubtask },
          subtaskIdsByTask: {
            ...s.subtaskIdsByTask,
            [taskId]: [...(s.subtaskIdsByTask[taskId] || []), tempId]
          }
        }));

        try {
          const response = await Database.createSubtask(taskId, payload);
          const realSubtask = response.data || response;

          // Replace temp with real
          set(s => {
            const newById = { ...s.subtasksById };
            delete newById[tempId];
            newById[realSubtask._id] = realSubtask;

            const newIdsByTask = { ...s.subtaskIdsByTask };
            newIdsByTask[taskId] = (newIdsByTask[taskId] || []).map(id =>
              id === tempId ? realSubtask._id : id
            );

            return { subtasksById: newById, subtaskIdsByTask: newIdsByTask };
          });

          return realSubtask;
        } catch (error) {
          console.error('Error creating subtask:', error);
          // Rollback
          set(s => {
            const newById = { ...s.subtasksById };
            delete newById[tempId];

            const newIdsByTask = { ...s.subtaskIdsByTask };
            newIdsByTask[taskId] = (newIdsByTask[taskId] || []).filter(id => id !== tempId);

            return { subtasksById: newById, subtaskIdsByTask: newIdsByTask };
          });
          throw error;
        }
      },

      // Update subtask with optimistic update
      updateSubtask: async (subtaskId, updates) => {
        const state = get();
        const originalSubtask = state.subtasksById[subtaskId];

        if (!originalSubtask) {
          console.warn('Subtask not found in store:', subtaskId);
          return null;
        }

        // Optimistic update
        set(s => ({
          subtasksById: {
            ...s.subtasksById,
            [subtaskId]: { ...originalSubtask, ...updates, updatedAt: new Date().toISOString() }
          }
        }));

        try {
          const response = await Database.updateSubtask(subtaskId, updates);
          const updatedSubtask = response.data || response;

          // Update with server response
          set(s => ({
            subtasksById: {
              ...s.subtasksById,
              [subtaskId]: updatedSubtask
            }
          }));

          return updatedSubtask;
        } catch (error) {
          console.error('Error updating subtask:', error);
          // Rollback
          set(s => ({
            subtasksById: {
              ...s.subtasksById,
              [subtaskId]: originalSubtask
            }
          }));
          throw error;
        }
      },

      // Update subtask locally only (no API call) - for external sync
      updateSubtaskLocal: (subtaskId, updates) => {
        set(s => {
          const existing = s.subtasksById[subtaskId];
          if (!existing) return {};
          return {
            subtasksById: {
              ...s.subtasksById,
              [subtaskId]: { ...existing, ...updates }
            }
          };
        });
      },

      // Delete subtask with optimistic update
      deleteSubtask: async (subtaskId) => {
        const state = get();
        const subtask = state.subtasksById[subtaskId];

        if (!subtask) return;

        const taskId = subtask.parentTask;

        // Optimistic delete
        set(s => {
          const newById = { ...s.subtasksById };
          delete newById[subtaskId];

          const newIdsByTask = { ...s.subtaskIdsByTask };
          if (taskId && newIdsByTask[taskId]) {
            newIdsByTask[taskId] = newIdsByTask[taskId].filter(id => id !== subtaskId);
          }

          return { subtasksById: newById, subtaskIdsByTask: newIdsByTask };
        });

        try {
          await Database.deleteSubtask(subtaskId);
          return true;
        } catch (error) {
          console.error('Error deleting subtask:', error);
          // Rollback
          set(s => ({
            subtasksById: { ...s.subtasksById, [subtaskId]: subtask },
            subtaskIdsByTask: {
              ...s.subtaskIdsByTask,
              [taskId]: [...(s.subtaskIdsByTask[taskId] || []), subtaskId]
            }
          }));
          throw error;
        }
      },

      // Toggle subtask completion
      toggleSubtaskComplete: async (subtaskId) => {
        const subtask = get().subtasksById[subtaskId];
        if (!subtask) return null;

        const newCompleted = !subtask.completed;
        const newStatus = newCompleted ? 'done' : 'todo';

        return get().updateSubtask(subtaskId, {
          completed: newCompleted,
          status: newStatus
        });
      },

      // Batch update subtasks for a task (used after reordering)
      setSubtasksForTask: (taskId, subtasks) => {
        const subtasksById = { ...get().subtasksById };
        const subtaskIds = [];

        subtasks.forEach(subtask => {
          subtasksById[subtask._id] = subtask;
          subtaskIds.push(subtask._id);
        });

        set(s => ({
          subtasksById,
          subtaskIdsByTask: { ...s.subtaskIdsByTask, [taskId]: subtaskIds }
        }));
      },

      // Clear subtasks for a task (on modal close or cleanup)
      clearTaskSubtasks: (taskId) => {
        set(s => {
          const idsToRemove = s.subtaskIdsByTask[taskId] || [];
          const newById = { ...s.subtasksById };
          idsToRemove.forEach(id => delete newById[id]);

          const newIdsByTask = { ...s.subtaskIdsByTask };
          delete newIdsByTask[taskId];

          return {
            subtasksById: newById,
            subtaskIdsByTask: newIdsByTask,
            loading: { ...s.loading, [taskId]: undefined },
            error: { ...s.error, [taskId]: undefined }
          };
        });
      },

      // Handle real-time events
      handleSubtaskCreated: (taskId, subtask) => {
        set(s => ({
          subtasksById: { ...s.subtasksById, [subtask._id]: subtask },
          subtaskIdsByTask: {
            ...s.subtaskIdsByTask,
            [taskId]: [...(s.subtaskIdsByTask[taskId] || []), subtask._id]
          }
        }));
      },

      handleSubtaskUpdated: (subtaskId, updates) => {
        set(s => {
          const existing = s.subtasksById[subtaskId];
          if (!existing) return {};
          return {
            subtasksById: {
              ...s.subtasksById,
              [subtaskId]: { ...existing, ...updates }
            }
          };
        });
      },

      handleSubtaskDeleted: (subtaskId) => {
        set(s => {
          const subtask = s.subtasksById[subtaskId];
          if (!subtask) return {};

          const taskId = subtask.parentTask;
          const newById = { ...s.subtasksById };
          delete newById[subtaskId];

          const newIdsByTask = { ...s.subtaskIdsByTask };
          if (taskId && newIdsByTask[taskId]) {
            newIdsByTask[taskId] = newIdsByTask[taskId].filter(id => id !== subtaskId);
          }

          return { subtasksById: newById, subtaskIdsByTask: newIdsByTask };
        });
      }
    }),
    { name: 'subtask-store' }
  )
);

// ============ HOOK SELECTORS (with shallow comparison) ============

/**
 * Hook to get a single subtask by ID
 * Uses shallow comparison to prevent unnecessary re-renders
 */
export const useSubtask = (subtaskId) => {
  return useSubtaskStore(
    state => state.subtasksById[subtaskId],
    shallow
  );
};

/**
 * Hook to get subtask IDs for a task (stable array reference)
 * Use this for list rendering - the array reference is stable
 */
export const useSubtaskIds = (taskId) => {
  return useSubtaskStore(
    state => state.subtaskIdsByTask[taskId] || [],
    shallow
  );
};

/**
 * Hook to get all subtasks for a task
 * Returns the subtasksById map and taskId's IDs - component derives the array
 * This prevents creating new arrays on each render
 */
export const useSubtasksByTask = (taskId) => {
  const ids = useSubtaskStore(state => state.subtaskIdsByTask[taskId], shallow);
  const subtasksById = useSubtaskStore(state => state.subtasksById, shallow);
  
  // Return empty array if no IDs - this is stable
  if (!ids || ids.length === 0) return [];
  
  // Derive subtasks - components should memoize if needed
  return ids.map(id => subtasksById[id]).filter(Boolean);
};

/**
 * Hook to get loading state for a task
 */
export const useSubtaskLoading = (taskId) => {
  return useSubtaskStore(state => state.loading[taskId] || false);
};

/**
 * Hook to get error state for a task
 */
export const useSubtaskError = (taskId) => {
  return useSubtaskStore(state => state.error[taskId] || null);
};

export default useSubtaskStore;
