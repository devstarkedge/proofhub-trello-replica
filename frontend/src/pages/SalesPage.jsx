import React, { useEffect, useState, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import AuthContext from '../context/AuthContext';
import NotificationContext from '../context/NotificationContext';
import socketService from '../services/socket';
import useSalesStore from '../store/salesStore';
import { getUserPermissions } from '../services/salesApi';
import SalesTable from '../components/Sales/SalesTable';
import SalesToolbar from '../components/Sales/SalesToolbar';
import SalesFilters from '../components/Sales/SalesFilters';
import SalesNameTabs from '../components/Sales/SalesNameTabs';
import AddSalesRowModal from '../components/Sales/AddSalesRowModal';
import ImportDataModal from '../components/Sales/ImportDataModal';
import ActivityLogModal from '../components/Sales/ActivityLogModal';
import DropdownManagerModal from '../components/Sales/DropdownManagerModal';
import CustomColumnModal from '../components/Sales/CustomColumnModal';
import BulkActionsToolbar from '../components/Sales/BulkActionsToolbar';
import CustomTabBar from '../components/Sales/CustomTabBar';
import AddTabButton from '../components/Sales/AddTabButton';
import SaveTabModal from '../components/Sales/SaveTabModal';
import TabApprovalToast from '../components/Sales/TabApprovalToast';
import WatchAlertToast from '../components/Sales/WatchAlertToast';


const SalesPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useContext(AuthContext);
  const { openTabApprovalModal } = useContext(NotificationContext);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showDropdownManager, setShowDropdownManager] = useState(false);
  const [showCustomColumn, setShowCustomColumn] = useState(false);
  const [selectedRowForActivity, setSelectedRowForActivity] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [showSaveTabModal, setShowSaveTabModal] = useState(false);
  const [editingTab, setEditingTab] = useState(null);

  const {
    permissions,
    fetchPermissions,
    fetchRows,
    fetchCustomColumns,
    fetchDropdownOptions,
    fetchUniqueNames,
    setNameTab,
    nameTab,
    selectedRows,
    lockedRows,
    lockRow,
    unlockRow,
    handleRowCreated,
    handleRowUpdated,
    handleRowDeleted,
    handleBulkUpdate,
    handleBulkDelete,
    handleDropdownUpdated,
    handleColumnCreated,
    handleColumnDeleted,
    handleRowLocked,
    handleRowUnlocked,
    syncDrafts,
    fetchSavedTabs,
    savedTabs,
    activeTabId,
    activateTab,
    deactivateTab,
    deleteSavedTab,
    handleTabCreated,
    handleTabUpdated,
    handleTabDeleted,
    handleTabApproved,
    handleTabIgnored,
    handleTabAlert,
    handleTabUnreadUpdate,
  } = useSalesStore();

  useEffect(() => {
    // Wait for auth restore to finish before initializing page
    if (authLoading) return;

    if (user && (user._id || user.id)) {
      initializePage();
    }

    return () => {
      // Remove any sales socket listeners and leave sales room on unmount
      window.removeEventListener('socket-sales-row-created', onSocketRowCreated);
      window.removeEventListener('socket-sales-row-updated', onSocketRowUpdated);
      window.removeEventListener('socket-sales-row-deleted', onSocketRowDeleted);
      window.removeEventListener('socket-sales-rows-bulk-updated', onSocketRowsBulkUpdated);
      window.removeEventListener('socket-sales-rows-bulk-deleted', onSocketRowsBulkDeleted);
      window.removeEventListener('socket-sales-dropdown-updated', onSocketDropdownUpdated);
      window.removeEventListener('socket-sales-column-created', onSocketColumnCreated);
      window.removeEventListener('socket-sales-column-updated', onSocketColumnUpdated);
      window.removeEventListener('socket-sales-column-deleted', onSocketColumnDeleted);
      window.removeEventListener('socket-sales-rows-imported', onSocketRowsImported);
      window.removeEventListener('socket-sales-row-locked', onSocketRowLocked);
      window.removeEventListener('socket-sales-row-unlocked', onSocketRowUnlocked);
      window.removeEventListener('sales-permissions-updated', onPermsUpdate);
      window.removeEventListener('socket-sales-permissions-updated', onPermsUpdate);
      window.removeEventListener('socket-connected', onSocketConnected);
      window.removeEventListener('socket-sales-tab-created', onSocketTabCreated);
      window.removeEventListener('socket-sales-tab-updated', onSocketTabUpdated);
      window.removeEventListener('socket-sales-tab-deleted', onSocketTabDeleted);
      window.removeEventListener('socket-sales-tab-approved', onSocketTabApproved);
      window.removeEventListener('socket-sales-tab-ignored', onSocketTabIgnored);
      window.removeEventListener('socket-sales-tab-alert', onSocketTabAlert);
      window.removeEventListener('socket-sales-tab-unread-update', onSocketTabUnreadUpdate);

      socketService.leaveSales();
    };
    // Re-run when auth loading changes (i.e. after restoreSession completes)
  }, [authLoading, user]);

  // Listen for online status to sync drafts
  useEffect(() => {
    const handleOnline = () => {
      console.log('Back online, syncing drafts...');
      toast.info('Back online! Syncing drafts...');
      syncDrafts();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncDrafts]);

  // Sync URL query params with nameTab
  useEffect(() => {
    const currentUrl = searchParams.get('name') || '';
    const expected = nameTab === 'All' ? '' : nameTab;
    if (currentUrl !== expected) {
      if (expected) {
        setSearchParams({ name: expected }, { replace: true });
      } else {
        searchParams.delete('name');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [nameTab]);

  // Deep link: open tab approval modal from push notification URL
  useEffect(() => {
    const approvalTabId = searchParams.get('openApproval');
    if (approvalTabId && user?.role === 'admin' && !loading) {
      openTabApprovalModal({
        metadata: { tabId: approvalTabId },
        entityId: approvalTabId,
        type: 'sales_tab_approval',
      });
      // Clean up URL param
      searchParams.delete('openApproval');
      setSearchParams(searchParams, { replace: true });
    }
  }, [loading, searchParams, user]);

  const onPermsUpdate = async (e) => {
    try {
      const detail = e.detail || {};
      const { userId } = detail;

      // If the socket emitted without userId, it's already targeted to this client
      if (userId && user && user._id !== userId) return;

      // Re-fetch permissions and update store
      const perms = await fetchPermissions(user._id);
      if (!perms || !perms.moduleVisible) {
        toast.error('Your access to the Sales module was revoked');
        navigate('/');
        return;
      }

      // If permissions changed, refresh rows to reflect allowed actions
      await Promise.all([fetchRows(), fetchCustomColumns()]);
    } catch (err) {
      // ignore
    }
  };

  const initializePage = async () => {
    try {
      setLoading(true);

      console.log('Checking permissions for user:', user._id);

      // Check permissions
      let perms;
      try {
        perms = await fetchPermissions(user._id);
      } catch (permError) {
        console.error('Permission check failed:', permError);
        // If permission check fails (404, 403, etc.), assume no access
        toast.error('You do not have access to the Sales module');
        navigate('/');
        return;
      }

      console.log('Permissions received:', perms);
      
      if (!perms || !perms.moduleVisible) {
        toast.error('You do not have access to the Sales module');
        navigate('/');
        return;
      }

      // Join sales Socket.IO room
      socketService.joinSales();

      // Setup real-time event listeners (attach named handlers so they can be removed)
      window.addEventListener('socket-sales-row-created', onSocketRowCreated);
      window.addEventListener('socket-sales-row-updated', onSocketRowUpdated);
      window.addEventListener('socket-sales-row-deleted', onSocketRowDeleted);
      window.addEventListener('socket-sales-rows-bulk-updated', onSocketRowsBulkUpdated);
      window.addEventListener('socket-sales-rows-bulk-deleted', onSocketRowsBulkDeleted);
      window.addEventListener('socket-sales-dropdown-updated', onSocketDropdownUpdated);
      window.addEventListener('socket-sales-column-created', onSocketColumnCreated);
      window.addEventListener('socket-sales-column-updated', onSocketColumnUpdated);
      window.addEventListener('socket-sales-column-deleted', onSocketColumnDeleted);
      window.addEventListener('socket-sales-rows-imported', onSocketRowsImported);
      window.addEventListener('socket-sales-row-locked', onSocketRowLocked);
      window.addEventListener('socket-sales-row-unlocked', onSocketRowUnlocked);
      
      // Permissions listeners
      window.addEventListener('sales-permissions-updated', onPermsUpdate);
      window.addEventListener('socket-sales-permissions-updated', onPermsUpdate);

      // Socket connection listener (handles reconnects and delayed connections)
      window.addEventListener('socket-connected', onSocketConnected);

      // Tab event listeners
      window.addEventListener('socket-sales-tab-created', onSocketTabCreated);
      window.addEventListener('socket-sales-tab-updated', onSocketTabUpdated);
      window.addEventListener('socket-sales-tab-deleted', onSocketTabDeleted);
      window.addEventListener('socket-sales-tab-approved', onSocketTabApproved);
      window.addEventListener('socket-sales-tab-ignored', onSocketTabIgnored);
      window.addEventListener('socket-sales-tab-alert', onSocketTabAlert);
      window.addEventListener('socket-sales-tab-unread-update', onSocketTabUnreadUpdate);

      // Fetch initial data
      // Initialize name tab from URL query param if present
      const urlName = searchParams.get('name');
      if (urlName) {
        setNameTab(urlName);
      }

      await Promise.all([
        fetchRows(),
        fetchCustomColumns(),
        fetchUniqueNames(),
        fetchDropdownOptions('platform'),
        fetchDropdownOptions('technology'),
        fetchDropdownOptions('status'),
        fetchDropdownOptions('clientLocation'),
        fetchDropdownOptions('clientBudget'),
        fetchDropdownOptions('replyFromClient'),
        fetchDropdownOptions('followUps')
      ]);

      // Fetch saved tabs
      fetchSavedTabs().catch(() => {});

      // Sync any pending offline drafts
      await syncDrafts();

      setLoading(false);
    } catch (error) {
      console.error('Failed to initialize sales page:', error);
      setLoading(false);
      toast.error('Failed to load sales module');
      // Don't redirect on general errors, just show error state
    }
  };

  // Named handlers so they can be removed on unmount
  const onSocketRowCreated = (e) => {
    handleRowCreated(e.detail.row);
    fetchUniqueNames();
    toast.info('New sales row added');
  };

  const onSocketRowUpdated = (e) => {
    handleRowUpdated(e.detail.row);
  };

  const onSocketRowDeleted = (e) => {
    handleRowDeleted(e.detail.rowId);
    fetchUniqueNames();
    toast.info('Sales row deleted');
  };

  const onSocketRowsBulkUpdated = () => {
    handleBulkUpdate();
    toast.info('Bulk update completed');
  };

  const onSocketRowsBulkDeleted = () => {
    handleBulkDelete();
    fetchUniqueNames();
    toast.info('Bulk delete completed');
  };

  const onSocketDropdownUpdated = (e) => {
    handleDropdownUpdated(e.detail.columnName);
  };

  const onSocketColumnCreated = () => {
    handleColumnCreated();
    toast.info('New column added');
  };

  const onSocketColumnUpdated = () => {
    handleColumnCreated(); // Reuse the same handler to refresh columns
    toast.info('Column updated');
  };

  const onSocketColumnDeleted = () => {
    handleColumnDeleted();
    toast.info('Column deleted');
  };

  const onSocketRowsImported = (e) => {
    const detail = e.detail || {};
    const newColCount = Array.isArray(detail.newColumnsCreated) ? detail.newColumnsCreated.length : (detail.newColumnsCreated || 0);
    const newOptCount = Array.isArray(detail.newDropdownOptionsCreated) ? detail.newDropdownOptionsCreated.length : (detail.newDropdownOptionsCreated || 0);
    fetchRows();
    fetchUniqueNames();
    if (newColCount > 0) {
      fetchCustomColumns();
    }
    if (newOptCount > 0 || newColCount > 0) {
      fetchDropdownOptions();
    }
    toast.success(`${detail.count || 0} rows imported${newColCount ? `, ${newColCount} new columns` : ''}${newOptCount ? `, ${newOptCount} new options` : ''}`);
  };

  const onSocketRowLocked = (e) => {
    handleRowLocked(e.detail);
  };

  const onSocketRowUnlocked = (e) => {
    handleRowUnlocked(e.detail);
  };

  const onSocketConnected = () => {
    console.log('Socket re-connected, joining sales room...');
    socketService.joinSales();
  };

  // Tab socket handlers
  const onSocketTabCreated = (e) => handleTabCreated(e.detail);
  const onSocketTabUpdated = (e) => handleTabUpdated(e.detail);
  const onSocketTabDeleted = (e) => handleTabDeleted(e.detail);
  const onSocketTabApproved = (e) => handleTabApproved(e.detail);
  const onSocketTabIgnored = (e) => handleTabIgnored(e.detail);
  const onSocketTabAlert = (e) => handleTabAlert(e.detail);
  const onSocketTabUnreadUpdate = (e) => handleTabUnreadUpdate(e.detail);

  // Register listeners after joining the sales room (inside initializePage)
  // Note: listeners are attached in `initializePage` to ensure permissions and socket join succeeded

  // Tab management handlers
  const handleEditTab = (tab) => {
    setEditingTab(tab);
    setShowSaveTabModal(true);
  };

  const handleDeleteTab = async (tabId) => {
    if (window.confirm('Delete this saved tab?')) {
      await deleteSavedTab(tabId);
    }
  };

  const openActivityLog = (row) => {
    setSelectedRowForActivity(row);
    setShowActivityLog(true);
  };

  const openEditModal = async (row) => {
    const existingLock = lockedRows?.[row._id];
    const existingLockName = existingLock?.name || existingLock?.userName;
    if (existingLock && existingLock._id && existingLock._id !== user?._id) {
      toast.error(existingLockName
        ? `This row is being edited by ${existingLockName}`
        : 'This row is being edited by another user'
      );
      return;
    }

    try {
      await lockRow(row._id);
      setEditingRow(row);
      setShowAddModal(true);
    } catch (error) {
      const lockedByName = error?.response?.data?.lockedBy?.name
        || error?.response?.data?.lockedBy?.userName;
      const message = lockedByName
        ? `This row is being edited by ${lockedByName}`
        : (error?.response?.data?.message || 'This row is being edited by another user');
      toast.error(message);
    }
  };

  const closeEditModal = async () => {
    setShowAddModal(false);
    if (editingRow?._id) {
      await unlockRow(editingRow._id).catch(() => {});
    }
    setEditingRow(null);
  };

  // Render permissions check loader only if permissions are completely missing
  // But we want to show the shell ASAP, so we might skip this if we want instant shell.
  // However, we need permissions to render the toolbar properly.
  // For now, we'll keep the specialized loader only for authentication/initial permission check.
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Authenticating...</p>
        </div>
      </div>
    );
  }

  // If permissions are loaded and denied, show denial message (handled by redirect usually, but safe fallback)
  if (!loading && permissions && !permissions.moduleVisible) {
    return null; // Will have redirected
  }

  return (
    <div className="h-full bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-50 dark:from-gray-900 dark:via-blue-900/10 dark:to-gray-900">
      
      {/* Main Content Area - Fixed height to allow inner scroll */}
      <div className="h-full flex flex-col overflow-hidden">
          {/* Scrollable Content Container (Toolbar + Table) */}
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            
            {/* Toolbar */}
            <div className="flex-shrink-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm">
              <div className="flex items-center">
                <div className="flex-1">
                  <SalesToolbar
                    onAddRow={() => setShowAddModal(true)}
                    onImport={() => setShowImportModal(true)}
                    onManageDropdowns={() => setShowDropdownManager(true)}
                    onCreateColumn={() => setShowCustomColumn(true)}
                    permissions={permissions}
                  />
                </div>
                <div className="pr-4">
                  <AddTabButton onClick={() => { setEditingTab(null); setShowSaveTabModal(true); }} />
                </div>
              </div>

              {/* Filters Panel (always visible, toggle built-in) */}
              <SalesFilters />

              {/* Name Tabs */}
              <SalesNameTabs />

              {/* Custom Saved Tabs */}
              <CustomTabBar onEditTab={handleEditTab} onDeleteTab={handleDeleteTab} />

              {/* Bulk Actions Toolbar */}
              {selectedRows.size > 0 && (
                <BulkActionsToolbar permissions={permissions} />
              )}
            </div>

            {/* Main Table - takes remaining height with premium spacing */}
            <div className="flex-1 overflow-hidden px-4 sm:px-6 lg:px-8 py-6">
              <SalesTable
                onEditRow={openEditModal}
                onViewActivity={openActivityLog}
                permissions={permissions}
                loading={loading} // Pass loading state to table
              />
            </div>
          </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddSalesRowModal
          isOpen={showAddModal}
          onClose={closeEditModal}
          editingRow={editingRow}
        />
      )}

      {showImportModal && (
        <ImportDataModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {showActivityLog && selectedRowForActivity && (
        <ActivityLogModal
          isOpen={showActivityLog}
          onClose={() => {
            setShowActivityLog(false);
            setSelectedRowForActivity(null);
          }}
          rowId={selectedRowForActivity._id}
        />
      )}

      {showCustomColumn && (
        <CustomColumnModal
          isOpen={showCustomColumn}
          onClose={() => setShowCustomColumn(false)}
        />
      )}

      {/* Save Tab Modal */}
      <SaveTabModal
        isOpen={showSaveTabModal}
        onClose={() => { setShowSaveTabModal(false); setEditingTab(null); }}
        editingTab={editingTab}
      />

      {/* Real-time toast overlays */}
      <TabApprovalToast />
      <WatchAlertToast />
    </div>
  );
};

export default SalesPage;
