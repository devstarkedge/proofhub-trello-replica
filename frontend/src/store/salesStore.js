import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as salesApi from '../services/salesApi';
import * as salesTabApi from '../services/salesTabApi';

const DEFAULT_FILTERS = {
  search: '',
  name: '',
  platform: '',
  technology: '',
  status: '',
  location: '',
  minRating: null,
  minHireRate: null,
  budget: '',
  profile: '',
  dateFrom: null,
  dateTo: null,
  bidType: '',
  bidDomain: '',
};

const useSalesStore = create(
  persist(
    (set, get) => ({
      // State
      rows: [],
      selectedRows: new Set(),
      filters: {
        search: '',
        name: '',
        platform: '',
        technology: '',
        status: '',
        location: '',
        minRating: null,
        minHireRate: null,
        budget: '',
        profile: '',
        dateFrom: null,
        dateTo: null,
        bidType: '',
        bidDomain: '',
      },
      sortBy: 'date',
      sortOrder: 'desc',
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        pages: 0
      },
      loading: false,
      error: null,
      
      // Dropdown options cache
      dropdownOptions: {},
      
      // Custom columns
      customColumns: [],
      
      // User permissions
      permissions: null,
      
      // Locked rows (for inline editing)
      lockedRows: {},
      
      // Pending drafts (offline edits)
      pendingDrafts: [],

      // Name tabs
      nameTab: 'All',
      uniqueNames: [],

      // Per-column filters (key: column key, value: filter value or object)
      columnFilters: {},

      // User-customized column widths (key: column key, value: width in px)
      columnWidths: {},

      // Custom saved tabs
      savedTabs: [],
      activeTabId: null,
      tabsLoading: false,

      // ============================================
      // ACTIONS
      // ============================================

      /**
       * Fetch sales rows with current filters
       */
      fetchRows: async (page = null) => {
        set({ loading: true, error: null });
        try {
          const currentPage = page || get().pagination.page;
          const columnFilters = get().columnFilters || {};
          const hasColumnFilters = Object.keys(columnFilters).some(k => {
            const v = columnFilters[k];
            if (v === '' || v === null || v === undefined) return false;
            if (typeof v === 'object' && v !== null) {
              return Object.values(v).some(sv => sv !== '' && sv !== null && sv !== undefined);
            }
            return true;
          });

          const params = {
            page: currentPage,
            limit: get().pagination.limit,
            ...get().filters,
            sortBy: get().sortBy,
            sortOrder: get().sortOrder
          };

          // Only send columnFilters if there are active ones
          if (hasColumnFilters) {
            params.columnFilters = JSON.stringify(columnFilters);
          }

          const response = await salesApi.getSalesRows(params);
          // Deduplicate rows by _id
          const uniqueRows = [];
          const seen = new Set();
          for (const row of response.data) {
            if (!seen.has(row._id)) {
              uniqueRows.push(row);
              seen.add(row._id);
            }
          }
          set({
            rows: uniqueRows,
            pagination: response.pagination,
            loading: false
          });
        } catch (error) {
          set({ error: error.message, loading: false });
        }
      },

      /**
       * Create new sales row (with optimistic update)
       */
      createRow: async (rowData) => {
        try {
          const response = await salesApi.createSalesRow(rowData);
          set(state => {
            // Insert new row in correct date-sorted position
            const newRow = response.data;
            const allRows = [...state.rows];
            const seen = new Set(allRows.map(r => r._id));
            if (seen.has(newRow._id)) {
              return { rows: allRows.map(r => r._id === newRow._id ? newRow : r) };
            }
            // Find insertion index based on date sort
            const sortOrder = state.sortOrder;
            const newDate = new Date(newRow.date || 0).getTime();
            let insertIdx = allRows.length;
            for (let i = 0; i < allRows.length; i++) {
              const rowDate = new Date(allRows[i].date || 0).getTime();
              if (sortOrder === 'desc' ? newDate >= rowDate : newDate <= rowDate) {
                insertIdx = i;
                break;
              }
            }
            allRows.splice(insertIdx, 0, newRow);
            return { rows: allRows };
          });
          return response.data;
        } catch (error) {
          throw error;
        }
      },

      /**
       * Update sales row (with optimistic update and offline draft)
       */
      updateRow: async (id, updates) => {
        // Optimistic update
        const previousRows = get().rows;
        set(state => ({
          rows: state.rows.map(row =>
            row._id === id ? { ...row, ...updates } : row
          )
        }));

        try {
          const response = await salesApi.updateSalesRow(id, updates);
          
          // Confirm with server data
          set(state => ({
            rows: state.rows.map(row =>
              row._id === id ? response.data : row
            )
          }));
          
          return response.data;
        } catch (error) {
          console.error('Update failed:', error);
          // Check if it's likely a network error or explicitly offline
          if (!window.navigator.onLine || error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
             // Save to drafts
             get().saveDraft(id, updates);
             // Keep the optimistic update? Or maybe mark it as pending?
             // For now, we keep it but it might be lost if we refresh.
             // Ideally we should mark it visually.
             // But at least we save it.
          } else {
             // Rollback on non-network error
             set({ rows: previousRows });
             throw error;
          }
        }
      },

      /**
       * Delete sales row (with optimistic update)
       */
      deleteRow: async (id) => {
        // Optimistic delete
        const previousRows = get().rows;
        set(state => ({
          rows: state.rows.filter(row => row._id !== id)
        }));

        try {
          await salesApi.deleteSalesRow(id);
        } catch (error) {
           // Rollback on error
           set({ rows: previousRows });
           throw error;
        }
      },

      /**
       * Bulk update rows
       */
      bulkUpdate: async (rowIds, updates) => {
        try {
          await salesApi.bulkUpdateRows(rowIds, updates);
          await get().fetchRows();
          get().clearSelection();
        } catch (error) {
          throw error;
        }
      },

      /**
       * Bulk delete rows
       */
      bulkDelete: async (rowIds) => {
        try {
          await salesApi.bulkDeleteRows(rowIds);
          await get().fetchRows();
          get().clearSelection();
        } catch (error) {
          throw error;
        }
      },

      /**
       * Import rows from data
       */
      importRows: async (data) => {
        try {
          const response = await salesApi.importRows(data);
          await get().fetchRows();
          return response;
        } catch (error) {
          throw error;
        }
      },

      /**
       * Export rows
       */
      exportRows: async (format = 'csv') => {
        try {
          const selectedRowIds = Array.from(get().selectedRows);
          const filters = get().filters;
          const columnFilters = get().columnFilters || {};
          const sortBy = get().sortBy;
          const sortOrder = get().sortOrder;
          await salesApi.exportRows(format, selectedRowIds.length > 0 ? selectedRowIds : null, {
            ...filters,
            columnFilters: Object.keys(columnFilters).length > 0 ? JSON.stringify(columnFilters) : undefined,
            sortBy,
            sortOrder
          });
        } catch (error) {
          throw error;
        }
      },

      /**
       * Set filters
       */
      setFilters: (filters) => {
        set(state => ({
          filters: { ...state.filters, ...filters },
          pagination: { ...state.pagination, page: 1 } // Reset to page 1
        }));
        get().fetchRows(1);
      },

      /**
       * Clear all filters
       */
      clearFilters: () => {
        set({
          filters: {
            search: '',
            name: '',
            platform: '',
            technology: '',
            status: '',
            location: '',
            minRating: null,
            minHireRate: null,
            budget: '',
            profile: '',
            dateFrom: null,
            dateTo: null,
            bidType: '',
            bidDomain: '',
          },
          columnFilters: {},
          nameTab: 'All'
        });
        get().fetchRows(1);
      },

      /**
       * Set a per-column filter value
       */
      setColumnFilter: (columnKey, value) => {
        set(state => {
          const newFilters = { ...state.columnFilters };
          if (value === '' || value === null || value === undefined) {
            delete newFilters[columnKey];
          } else {
            newFilters[columnKey] = value;
          }
          return {
            columnFilters: newFilters,
            pagination: { ...state.pagination, page: 1 }
          };
        });
        get().fetchRows(1);
      },

      /**
       * Clear all column filters
       */
      clearColumnFilters: () => {
        set({ columnFilters: {} });
        get().fetchRows(1);
      },

      /**
       * Set a single column width (user resize)
       */
      setColumnWidth: (columnKey, width) => {
        set(state => ({
          columnWidths: { ...state.columnWidths, [columnKey]: width }
        }));
      },

      /**
       * Reset all column widths to defaults
       */
      resetColumnWidths: () => {
        set({ columnWidths: {} });
      },

      /**
       * Set sorting
       */
      setSorting: (sortBy, sortOrder) => {
        set({ sortBy, sortOrder });
        get().fetchRows();
      },

      /**
       * Go to page
       */
      goToPage: (page) => {
        get().fetchRows(page);
      },

      /**
       * Toggle row selection
       */
      toggleRowSelection: (rowId) => {
        set(state => {
          const newSelection = new Set(state.selectedRows);
          if (newSelection.has(rowId)) {
            newSelection.delete(rowId);
          } else {
            newSelection.add(rowId);
          }
          return { selectedRows: newSelection };
        });
      },

      /**
       * Select all rows
       */
      selectAllRows: () => {
        set(state => ({
          selectedRows: new Set(state.rows.map(row => row._id))
        }));
      },

      /**
       * Clear selection
       */
      clearSelection: () => {
        set({ selectedRows: new Set() });
      },

      /**
       * Fetch dropdown options for a column
       */
      fetchDropdownOptions: async (columnName) => {
        try {
          const response = await salesApi.getDropdownOptions(columnName);
          set(state => ({
            dropdownOptions: {
              ...state.dropdownOptions,
              [columnName]: response.data
            }
          }));
          return response.data;
        } catch (error) {
          throw error;
        }
      },

      /**
       * Add dropdown option
       */
      addDropdownOption: async (columnName, optionData) => {
        try {
          await salesApi.addDropdownOption(columnName, optionData);
          await get().fetchDropdownOptions(columnName);
        } catch (error) {
          throw error;
        }
      },

      /**
       * Update dropdown option
       */
      updateDropdownOption: async (columnName, optionId, updates) => {
        try {
          await salesApi.updateDropdownOption(columnName, optionId, updates);
          await get().fetchDropdownOptions(columnName);
        } catch (error) {
          throw error;
        }
      },

      /**
       * Delete dropdown option
       */
      deleteDropdownOption: async (columnName, optionId) => {
        const previousOptions = get().dropdownOptions[columnName] || [];
        set(state => ({
          dropdownOptions: {
            ...state.dropdownOptions,
            [columnName]: previousOptions.filter(opt => opt._id !== optionId)
          }
        }));

        try {
          await salesApi.deleteDropdownOption(columnName, optionId);
        } catch (error) {
          // Rollback on error
          set(state => ({
            dropdownOptions: {
              ...state.dropdownOptions,
              [columnName]: previousOptions
            }
          }));
          throw error;
        }
      },

      /**
       * Fetch custom columns
       */
      fetchCustomColumns: async () => {
        try {
          const response = await salesApi.getCustomColumns();
          set({ customColumns: response.data });
        } catch (error) {
          throw error;
        }
      },

      /**
       * Create custom column
       */
      createCustomColumn: async (columnData) => {
        try {
          await salesApi.createCustomColumn(columnData);
          await get().fetchCustomColumns();
        } catch (error) {
          throw error;
        }
      },

      /**
       * Update custom column
       */
      updateCustomColumn: async (columnId, columnData) => {
        try {
          await salesApi.updateCustomColumn(columnId, columnData);
          await get().fetchCustomColumns();
        } catch (error) {
          throw error;
        }
      },

      /**
       * Delete custom column
       */
      deleteCustomColumn: async (columnId) => {
        try {
          await salesApi.deleteCustomColumn(columnId);
          await get().fetchCustomColumns();
        } catch (error) {
          throw error;
        }
      },

      /**
       * Fetch user permissions
       */
      fetchPermissions: async (userId) => {
        try {
          const response = await salesApi.getUserPermissions(userId);
          set({ permissions: response.data });
          return response.data;
        } catch (error) {
          throw error;
        }
      },

      /**
       * Handle real-time row created event
       */
      handleRowCreated: (row) => {
        set(state => {
          // If row already exists, replace it
          const exists = state.rows.some(r => r._id === row._id);
          if (exists) {
            return { rows: state.rows.map(r => (r._id === row._id ? row : r)) };
          }
          // Insert in correct date-sorted position
          const allRows = [...state.rows];
          const sortOrder = state.sortOrder;
          const newDate = new Date(row.date || 0).getTime();
          let insertIdx = allRows.length;
          for (let i = 0; i < allRows.length; i++) {
            const rowDate = new Date(allRows[i].date || 0).getTime();
            if (sortOrder === 'desc' ? newDate >= rowDate : newDate <= rowDate) {
              insertIdx = i;
              break;
            }
          }
          allRows.splice(insertIdx, 0, row);
          return { rows: allRows };
        });
      },

      /**
       * Handle real-time row updated event
       */
      handleRowUpdated: (updatedRow) => {
        set(state => {
          const nextRows = state.rows.map(row =>
            row._id === updatedRow._id ? updatedRow : row
          );

          if (!updatedRow.lockedBy) {
            const { [updatedRow._id]: removed, ...rest } = state.lockedRows;
            return { rows: nextRows, lockedRows: rest };
          }

          return { rows: nextRows };
        });
      },

      /**
       * Handle real-time row deleted event
       */
      handleRowDeleted: (rowId) => {
        set(state => ({
          rows: state.rows.filter(row => row._id !== rowId)
        }));
      },

      /**
       * Handle real-time bulk update
       */
      handleBulkUpdate: () => {
        get().fetchRows();
      },

      /**
       * Handle real-time bulk delete
       */
      handleBulkDelete: () => {
        get().fetchRows();
      },

      /**
       * Handle dropdown updated event
       */
      handleDropdownUpdated: (columnName) => {
        get().fetchDropdownOptions(columnName);
      },

      /**
       * Lock a row for editing
       */
      lockRow: async (rowId) => {
        try {
          const response = await salesApi.lockRow(rowId);
          set(state => ({
            lockedRows: {
              ...state.lockedRows,
              [rowId]: response.data.lockedBy
            }
          }));
          return response.data;
        } catch (error) {
          throw error;
        }
      },

      /**
       * Unlock a row after editing
       */
      unlockRow: async (rowId) => {
        try {
          await salesApi.unlockRow(rowId);
          set(state => {
            const { [rowId]: removed, ...rest } = state.lockedRows;
            return { lockedRows: rest };
          });
        } catch (error) {
          throw error;
        }
      },

      /**
       * Handle real-time row locked event
       */
      handleRowLocked: (data) => {
        set(state => ({
          lockedRows: {
            ...state.lockedRows,
            [data.rowId]: data.lockedBy
          }
        }));
      },

      /**
       * Handle real-time row unlocked event
       */
      handleRowUnlocked: (data) => {
        set(state => {
          const { [data.rowId]: removed, ...rest } = state.lockedRows;
          return { lockedRows: rest };
        });
      },

      /**
       * Handle column created event
       */
      handleColumnCreated: () => {
        get().fetchCustomColumns();
      },

      /**
       * Handle column deleted event
       */
      handleColumnDeleted: () => {
        get().fetchCustomColumns();
      },

      /**
       * Fetch unique names for tabs
       */
      fetchUniqueNames: async () => {
        try {
          const response = await salesApi.getUniqueNames();
          set({ uniqueNames: response.data });
          return response.data;
        } catch (error) {
          console.error('Failed to fetch unique names:', error);
        }
      },

      /**
       * Set active name tab and filter — also clears any active custom tab
       */
      setNameTab: (name) => {
        const filterName = name === 'All' ? '' : name;
        set(state => ({
          nameTab: name,
          activeTabId: null,
          filters: { ...DEFAULT_FILTERS, name: filterName },
          columnFilters: {},
          selectedRows: new Set(),
          sortBy: 'date',
          sortOrder: 'desc',
          pagination: { ...state.pagination, page: 1 },
        }));
        get().fetchRows(1);
      },

      /**
       * Save draft (offline support)
       */
      saveDraft: (rowId, updates) => {
        set(state => ({
          pendingDrafts: [
            ...state.pendingDrafts.filter(d => d.rowId !== rowId),
            { rowId, updates, timestamp: Date.now() }
          ]
        }));
      },

      /**
       * Sync pending drafts
       */
      syncDrafts: async () => {
        const drafts = get().pendingDrafts;
        if (drafts.length === 0) return;

        for (const draft of drafts) {
          try {
            await salesApi.updateSalesRow(draft.rowId, draft.updates);
          } catch (error) {
            console.error('Failed to sync draft:', error);
          }
        }

        set({ pendingDrafts: [] });
        await get().fetchRows();
      },

      // ============================================
      // SAVED TABS ACTIONS
      // ============================================

      fetchSavedTabs: async () => {
        set({ tabsLoading: true });
        try {
          const response = await salesTabApi.getSalesTabs();
          set({ savedTabs: response.data, tabsLoading: false });
        } catch (error) {
          set({ tabsLoading: false });
          console.error('Failed to fetch saved tabs:', error);
        }
      },

      createSavedTab: async (tabData) => {
        try {
          const response = await salesTabApi.createSalesTab(tabData);
          set((state) => ({
            savedTabs: [...state.savedTabs, response.data],
          }));
          return response.data;
        } catch (error) {
          throw error;
        }
      },

      updateSavedTab: async (tabId, updates) => {
        const previousTabs = get().savedTabs;
        // Optimistic update
        set((state) => ({
          savedTabs: state.savedTabs.map((t) =>
            t._id === tabId ? { ...t, ...updates } : t
          ),
        }));
        try {
          const response = await salesTabApi.updateSalesTab(tabId, updates);
          set((state) => ({
            savedTabs: state.savedTabs.map((t) =>
              t._id === tabId ? response.data : t
            ),
          }));
          return response.data;
        } catch (error) {
          set({ savedTabs: previousTabs });
          throw error;
        }
      },

      deleteSavedTab: async (tabId) => {
        const previousTabs = get().savedTabs;
        set((state) => ({
          savedTabs: state.savedTabs.filter((t) => t._id !== tabId),
          activeTabId: state.activeTabId === tabId ? null : state.activeTabId,
        }));
        try {
          await salesTabApi.deleteSalesTab(tabId);
        } catch (error) {
          set({ savedTabs: previousTabs });
          throw error;
        }
      },

      approveSavedTab: async (tabId) => {
        try {
          const response = await salesTabApi.approveSalesTab(tabId);
          set((state) => ({
            savedTabs: state.savedTabs.map((t) =>
              t._id === tabId ? response.data : t
            ),
          }));
        } catch (error) {
          throw error;
        }
      },

      ignoreSavedTab: async (tabId) => {
        try {
          const response = await salesTabApi.ignoreSalesTab(tabId);
          set((state) => ({
            savedTabs: state.savedTabs.map((t) =>
              t._id === tabId ? response.data : t
            ),
          }));
        } catch (error) {
          throw error;
        }
      },

      markTabRead: async (tabId) => {
        // Optimistic
        set((state) => ({
          savedTabs: state.savedTabs.map((t) =>
            t._id === tabId ? { ...t, unreadMatches: 0 } : t
          ),
        }));
        try {
          await salesTabApi.markSalesTabRead(tabId);
        } catch (error) {
          console.error('Failed to mark tab read:', error);
        }
      },

      /**
       * Activate a saved tab — restore its full workspace state
       */
      activateTab: (tabOrId) => {
        const id = typeof tabOrId === 'string' ? tabOrId : tabOrId?._id;
        const tab = get().savedTabs.find((t) => t._id === id);
        if (!tab) return;

        const updates = {
          activeTabId: id,
          nameTab: 'All', // Reset name tab when using saved tab
        };

        // Restore filters
        if (tab.filters) {
          updates.filters = {
            search: tab.filters.search || tab.search || '',
            name: tab.filters.name || '',
            platform: tab.filters.platform || '',
            technology: tab.filters.technology || '',
            status: tab.filters.status || '',
            location: tab.filters.location || '',
            minRating: tab.filters.minRating ?? null,
            minHireRate: tab.filters.minHireRate ?? null,
            budget: tab.filters.budget || '',
            profile: tab.filters.profile || '',
            dateFrom: tab.filters.dateFrom || null,
            dateTo: tab.filters.dateTo || null,
          };
        }

        // Restore sorting
        if (tab.sorting) {
          updates.sortBy = tab.sorting.sortBy || 'date';
          updates.sortOrder = tab.sorting.sortOrder || 'desc';
        }

        // Restore column filters
        if (tab.filters?.columnFilters) {
          updates.columnFilters = tab.filters.columnFilters;
        }

        // Reset pagination
        updates.pagination = { ...get().pagination, page: 1 };

        set(updates);
        get().fetchRows(1);

        // Mark as read if it's a watch tab with unread
        if (tab.isWatchTab && tab.unreadMatches > 0) {
          get().markTabRead(id);
        }
      },

      /**
       * Deactivate saved tab — return to default view and reset all filters
       */
      deactivateTab: () => {
        set(state => ({
          activeTabId: null,
          filters: { ...DEFAULT_FILTERS },
          columnFilters: {},
          selectedRows: new Set(),
          sortBy: 'date',
          sortOrder: 'desc',
          pagination: { ...state.pagination, page: 1 },
        }));
        get().fetchRows(1);
      },

      // ============================================
      // SAVED TAB SOCKET HANDLERS
      // ============================================

      handleTabCreated: (tab) => {
        set((state) => {
          const exists = state.savedTabs.some((t) => t._id === tab._id);
          if (exists) return { savedTabs: state.savedTabs.map((t) => (t._id === tab._id ? tab : t)) };
          return { savedTabs: [...state.savedTabs, tab] };
        });
      },

      handleTabUpdated: (tab) => {
        set((state) => ({
          savedTabs: state.savedTabs.map((t) => (t._id === tab._id ? tab : t)),
        }));
      },

      handleTabDeleted: (tabId) => {
        set((state) => ({
          savedTabs: state.savedTabs.filter((t) => t._id !== tabId),
          activeTabId: state.activeTabId === tabId ? null : state.activeTabId,
        }));
      },

      handleTabApproved: (tab) => {
        set((state) => ({
          savedTabs: state.savedTabs.map((t) => (t._id === tab._id ? tab : t)),
        }));
      },

      handleTabIgnored: (tab) => {
        set((state) => ({
          savedTabs: state.savedTabs.map((t) => (t._id === tab._id ? tab : t)),
        }));
      },

      handleTabAlert: (alertData) => {
        // Update unread count in matching tab
        set((state) => ({
          savedTabs: state.savedTabs.map((t) =>
            t._id === alertData.tabId
              ? { ...t, unreadMatches: (t.unreadMatches || 0) + 1 }
              : t
          ),
        }));
      },

      handleTabUnreadUpdate: (tabId, unreadMatches) => {
        set((state) => ({
          savedTabs: state.savedTabs.map((t) =>
            t._id === tabId ? { ...t, unreadMatches } : t
          ),
        }));
      },
    }),
    {
      name: 'sales-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        filters: state.filters,
        nameTab: state.nameTab,
        columnFilters: state.columnFilters,
        columnWidths: state.columnWidths,
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        dropdownOptions: state.dropdownOptions,
        pendingDrafts: state.pendingDrafts,
        activeTabId: state.activeTabId
      })
    }
  )
);

export default useSalesStore;
