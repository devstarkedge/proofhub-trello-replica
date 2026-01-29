import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import AuthContext from '../context/AuthContext';
import socketService from '../services/socket';
import useSalesStore from '../store/salesStore';
import { getUserPermissions } from '../services/salesApi';
import SalesTable from '../components/Sales/SalesTable';
import SalesToolbar from '../components/Sales/SalesToolbar';
import SalesFilters from '../components/Sales/SalesFilters';
import AddSalesRowModal from '../components/Sales/AddSalesRowModal';
import ImportDataModal from '../components/Sales/ImportDataModal';
import ActivityLogModal from '../components/Sales/ActivityLogModal';
import DropdownManagerModal from '../components/Sales/DropdownManagerModal';
import CustomColumnModal from '../components/Sales/CustomColumnModal';
import BulkActionsToolbar from '../components/Sales/BulkActionsToolbar';

const SalesPage = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showDropdownManager, setShowDropdownManager] = useState(false);
  const [showCustomColumn, setShowCustomColumn] = useState(false);
  const [selectedRowForActivity, setSelectedRowForActivity] = useState(null);
  const [editingRow, setEditingRow] = useState(null);

  const {
    permissions,
    fetchPermissions,
    fetchRows,
    fetchCustomColumns,
    fetchDropdownOptions,
    selectedRows,
    handleRowCreated,
    handleRowUpdated,
    handleRowDeleted,
    handleBulkUpdate,
    handleBulkDelete,
    handleDropdownUpdated,
    handleColumnCreated,
    handleRowLocked,
    handleRowUnlocked,
    syncDrafts
  } = useSalesStore();

  useEffect(() => {
    // Wait for auth restore to finish before initializing page
    if (authLoading) return;

    initializePage();

    return () => {
      // Remove any sales socket listeners and leave sales room on unmount
      window.removeEventListener('socket-sales-row-created', onSocketRowCreated);
      window.removeEventListener('socket-sales-row-updated', onSocketRowUpdated);
      window.removeEventListener('socket-sales-row-deleted', onSocketRowDeleted);
      window.removeEventListener('socket-sales-rows-bulk-updated', onSocketRowsBulkUpdated);
      window.removeEventListener('socket-sales-rows-bulk-deleted', onSocketRowsBulkDeleted);
      window.removeEventListener('socket-sales-dropdown-updated', onSocketDropdownUpdated);
      window.removeEventListener('socket-sales-column-created', onSocketColumnCreated);
      window.removeEventListener('socket-sales-rows-imported', onSocketRowsImported);
      window.removeEventListener('socket-sales-row-locked', onSocketRowLocked);
      window.removeEventListener('socket-sales-row-unlocked', onSocketRowUnlocked);

      socketService.leaveSales();
    };
    // Re-run when auth loading changes (i.e. after restoreSession completes)
  }, [authLoading]);

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

  // Listen for permission updates (dynamic changes by Admin)
  useEffect(() => {
    const onPermsUpdate = async (e) => {
      try {
        const detail = e.detail || {};
        const { userId, permissions } = detail;

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

    window.addEventListener('sales-permissions-updated', onPermsUpdate);
    window.addEventListener('socket-sales-permissions-updated', onPermsUpdate);
    return () => {
      window.removeEventListener('sales-permissions-updated', onPermsUpdate);
      window.removeEventListener('socket-sales-permissions-updated', onPermsUpdate);
    };
  }, [user, fetchPermissions, fetchRows, fetchCustomColumns, navigate]);

  const initializePage = async () => {
    try {
      setLoading(true);

      // Check if user is authenticated
      if (!user || !user._id) {
        console.log('No authenticated user found');
        navigate('/login');
        return;
      }

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
      window.addEventListener('socket-sales-rows-imported', onSocketRowsImported);
      window.addEventListener('socket-sales-row-locked', onSocketRowLocked);
      window.addEventListener('socket-sales-row-unlocked', onSocketRowUnlocked);

      // Fetch initial data
      await Promise.all([
        fetchRows(),
        fetchCustomColumns(),
        fetchDropdownOptions('platform'),
        fetchDropdownOptions('technology'),
        fetchDropdownOptions('status'),
        fetchDropdownOptions('clientLocation'),
        fetchDropdownOptions('clientBudget'),
        fetchDropdownOptions('replyFromClient'),
        fetchDropdownOptions('followUps')
      ]);

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
    toast.info('New sales row added');
  };

  const onSocketRowUpdated = (e) => {
    handleRowUpdated(e.detail.row);
  };

  const onSocketRowDeleted = (e) => {
    handleRowDeleted(e.detail.rowId);
    toast.info('Sales row deleted');
  };

  const onSocketRowsBulkUpdated = () => {
    handleBulkUpdate();
    toast.info('Bulk update completed');
  };

  const onSocketRowsBulkDeleted = () => {
    handleBulkDelete();
    toast.info('Bulk delete completed');
  };

  const onSocketDropdownUpdated = (e) => {
    handleDropdownUpdated(e.detail.columnName);
  };

  const onSocketColumnCreated = () => {
    handleColumnCreated();
    toast.info('New column added');
  };

  const onSocketRowsImported = (e) => {
    fetchRows();
    toast.success(`${e.detail.count} rows imported`);
  };

  const onSocketRowLocked = (e) => {
    handleRowLocked(e.detail);
  };

  const onSocketRowUnlocked = (e) => {
    handleRowUnlocked(e.detail);
  };

  // Register listeners after joining the sales room (inside initializePage)
  // Note: listeners are attached in `initializePage` to ensure permissions and socket join succeeded

  const openActivityLog = (row) => {
    setSelectedRowForActivity(row);
    setShowActivityLog(true);
  };

  const openEditModal = (row) => {
    setEditingRow(row);
    setShowAddModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading Sales Module...</p>
        </div>
      </div>
    );
  }

  if (!permissions || !permissions.moduleVisible) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Toolbar */}
      <SalesToolbar
        onAddRow={() => setShowAddModal(true)}
        onImport={() => setShowImportModal(true)}
        onManageDropdowns={() => setShowDropdownManager(true)}
        onCreateColumn={() => setShowCustomColumn(true)}
        onBack={() => navigate(-1)}
        permissions={permissions}
      />

      {/* Filters Panel (always visible, toggle built-in) */}
      <SalesFilters />

      {/* Bulk Actions Toolbar */}
      {selectedRows.size > 0 && (
        <BulkActionsToolbar permissions={permissions} />
      )}

      {/* Main Table */}
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <SalesTable
          onEditRow={openEditModal}
          onViewActivity={openActivityLog}
          permissions={permissions}
        />
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddSalesRowModal
          isOpen={showAddModal}
          onClose={() => {
            setShowAddModal(false);
            setEditingRow(null);
          }}
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
    </div>
  );
};

export default SalesPage;
