import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import trashService from '../services/trashService';
import { toast } from 'react-toastify';

const useTrashStore = create(devtools((set, get) => ({
  itemsByProject: {}, // projectId -> items[]
  loadingByProject: {},
  paginationByProject: {},
  selected: [],
  filtersByProject: {},
  operationInProgress: {}, // Track operations per attachment id

  setFilters: (projectId, filters) => set(s => ({
    filtersByProject: { ...s.filtersByProject, [projectId]: { ...(s.filtersByProject[projectId] || {}), ...filters } }
  })),

  fetchTrash: async (projectId, params = {}) => {
    set(s => ({ loadingByProject: { ...s.loadingByProject, [projectId]: true } }));
    try {
      const result = await trashService.list(projectId, params);
      set(s => ({
        itemsByProject: { ...s.itemsByProject, [projectId]: result.data || [] },
        paginationByProject: { ...s.paginationByProject, [projectId]: result.pagination || {} },
        loadingByProject: { ...s.loadingByProject, [projectId]: false }
      }));
      return true;
    } catch (e) {
      set(s => ({ loadingByProject: { ...s.loadingByProject, [projectId]: false } }));
      console.error('Fetch trash error:', e);
      toast.error(e.message || 'Failed to load trash');
      return false;
    }
  },

  restoreOne: async (projectId, item) => {
    // Mark as in-progress
    set(s => ({ operationInProgress: { ...s.operationInProgress, [item._id]: 'restoring' } }));
    
    try {
      const result = await trashService.restore(item._id);
      
      // Only remove from trash on success
      set(s => ({
        itemsByProject: { ...s.itemsByProject, [projectId]: (s.itemsByProject[projectId] || []).filter(i => i._id !== item._id) },
        operationInProgress: { ...s.operationInProgress, [item._id]: undefined }
      }));
      
      toast.success(`Attachment restored${item.card ? ' to Card' : ''}`);
      return true;
    } catch (e) {
      // Keep item in trash on error
      set(s => ({ operationInProgress: { ...s.operationInProgress, [item._id]: undefined } }));
      console.error('Restore error:', e);
      toast.error(e.message || 'Restore failed');
      return false;
    }
  },

  deletePermanentOne: async (projectId, item) => {
    // Mark as in-progress
    set(s => ({ operationInProgress: { ...s.operationInProgress, [item._id]: 'deleting' } }));
    
    try {
      const result = await trashService.permanentDelete(item._id);
      
      // Only remove from trash on success
      set(s => ({
        itemsByProject: { ...s.itemsByProject, [projectId]: (s.itemsByProject[projectId] || []).filter(i => i._id !== item._id) },
        operationInProgress: { ...s.operationInProgress, [item._id]: undefined }
      }));
      
      toast.success('Attachment permanently deleted');
      return true;
    } catch (e) {
      // Keep item in trash on error
      set(s => ({ operationInProgress: { ...s.operationInProgress, [item._id]: undefined } }));
      console.error('Permanent delete error:', e);
      toast.error(e.message || 'Permanent delete failed');
      return false;
    }
  },

  toggleSelect: (id) => set(s => ({ selected: s.selected.includes(id) ? s.selected.filter(x => x !== id) : [...s.selected, id] })),
  clearSelection: () => set({ selected: [] }),
  selectAll: (projectId) => set(s => ({ selected: (s.itemsByProject[projectId] || []).map(i => i._id) })),

  bulkRestore: async (projectId) => {
    const ids = get().selected;
    if (!ids.length) return false;
    
    // Mark all as in-progress
    set(s => {
      const newOps = { ...s.operationInProgress };
      ids.forEach(id => { newOps[id] = 'restoring'; });
      return { operationInProgress: newOps };
    });
    
    try {
      const result = await trashService.bulkRestore(ids);
      
      // Only remove from trash on success
      set(s => {
        const newOps = { ...s.operationInProgress };
        ids.forEach(id => { newOps[id] = undefined; });
        return {
          itemsByProject: { ...s.itemsByProject, [projectId]: (s.itemsByProject[projectId] || []).filter(i => !ids.includes(i._id)) },
          selected: [],
          operationInProgress: newOps
        };
      });
      
      toast.success(`Restored ${ids.length} item(s)`);
      return true;
    } catch (e) {
      // Keep items in trash on error
      set(s => {
        const newOps = { ...s.operationInProgress };
        ids.forEach(id => { newOps[id] = undefined; });
        return { operationInProgress: newOps };
      });
      console.error('Bulk restore error:', e);
      toast.error(e.message || 'Bulk restore failed');
      return false;
    }
  },

  bulkPermanentDelete: async (projectId) => {
    const ids = get().selected;
    if (!ids.length) return false;
    
    // Mark all as in-progress
    set(s => {
      const newOps = { ...s.operationInProgress };
      ids.forEach(id => { newOps[id] = 'deleting'; });
      return { operationInProgress: newOps };
    });
    
    try {
      const result = await trashService.bulkPermanentDelete(ids);
      
      // Only remove from trash on success
      set(s => {
        const newOps = { ...s.operationInProgress };
        ids.forEach(id => { newOps[id] = undefined; });
        return {
          itemsByProject: { ...s.itemsByProject, [projectId]: (s.itemsByProject[projectId] || []).filter(i => !ids.includes(i._id)) },
          selected: [],
          operationInProgress: newOps
        };
      });
      
      toast.success(`Permanently deleted ${ids.length} item(s)`);
      return true;
    } catch (e) {
      // Keep items in trash on error
      set(s => {
        const newOps = { ...s.operationInProgress };
        ids.forEach(id => { newOps[id] = undefined; });
        return { operationInProgress: newOps };
      });
      console.error('Bulk permanent delete error:', e);
      toast.error(e.message || 'Bulk permanent delete failed');
      return false;
    }
  }
})))

export default useTrashStore;
