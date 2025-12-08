import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import Database from '../services/database';

const useLabelStore = create(
  devtools(
    (set, get) => ({
      // State
      loading: false,
      error: null,

      // Fetch labels for a board (always fresh)
      fetchLabels: async (boardId) => {
        set({ loading: true, error: null });
        
        try {
          const response = await Database.getLabelsByBoard(boardId);
          const labels = response.data || [];
          set({ loading: false });
          return labels;
        } catch (error) {
          console.error('Error fetching labels:', error);
          set({ error: error.message, loading: false });
          return [];
        }
      },

      // Create a new label
      createLabel: async (name, color, boardId) => {
        set({ loading: true });
        
        try {
          const response = await Database.createLabel(name, color, boardId);
          set({ loading: false });
          return response.data;
        } catch (error) {
          console.error('Error creating label:', error);
          set({ loading: false });
          throw error;
        }
      },

      // Update a label
      updateLabel: async (labelId, updates) => {
        set({ loading: true });
        
        try {
          const response = await Database.updateLabel(labelId, updates);
          set({ loading: false });
          return response.data;
        } catch (error) {
          console.error('Error updating label:', error);
          set({ loading: false });
          throw error;
        }
      },

      // Delete a label
      deleteLabel: async (labelId) => {
        set({ loading: true });
        
        try {
          await Database.deleteLabel(labelId);
          set({ loading: false });
          return true;
        } catch (error) {
          console.error('Error deleting label:', error);
          set({ loading: false });
          throw error;
        }
      },

      // Sync labels for an entity (card, subtask, nano)
      syncLabels: async (entityType, entityId, labelIds) => {
        try {
          const response = await Database.syncLabels(entityType, entityId, labelIds);
          return response.data;
        } catch (error) {
          console.error('Error syncing labels:', error);
          throw error;
        }
      }
    }),
    { name: 'LabelStore' }
  )
);

export default useLabelStore;
