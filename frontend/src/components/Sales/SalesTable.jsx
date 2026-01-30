import React, { useRef, useState, useCallback, useContext, memo, useEffect } from 'react';
import { formatSalesDate } from '../../utils/dateUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Star, ExternalLink, History, Edit2, Trash2, Lock, Copy, 
  ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import StarRating from '../ui/StarRating';
import { toast } from 'react-toastify';
import useSalesStore from '../../store/salesStore';
import AuthContext from '../../context/AuthContext';
import { useVirtualizer } from '@tanstack/react-virtual';

// Column configuration for the table - NO STICKY COLUMNS
const BASE_COLUMNS = [
  { key: 'checkbox', label: '', width: 50, type: null },
  { key: 'date', label: 'Date', width: 110, type: 'date' },
  { key: 'monthName', label: 'Month', width: 90, type: 'text', readOnly: true },
  { key: 'platform', label: 'Platform', width: 120, type: 'dropdown' },
  { key: 'status', label: 'Status', width: 110, type: 'dropdown' },
  { key: 'bidLink', label: 'Bid Link', width: 100, type: 'link' },
  { key: 'profile', label: 'Profile', width: 120, type: 'dropdown' },
  { key: 'technology', label: 'Technology', width: 130, type: 'dropdown' },
  { key: 'clientRating', label: 'Client Rating', width: 120, type: 'rating' },
  { key: 'clientHireRate', label: '% Hire Rate', width: 100, type: 'percent' },
  { key: 'clientBudget', label: 'Client Budget', width: 120, type: 'dropdown' },
  { key: 'clientSpending', label: 'Client Spending', width: 120, type: 'text' },
  { key: 'clientLocation', label: 'Client Location', width: 140, type: 'dropdown' },
  { key: 'replyFromClient', label: 'Reply From Client', width: 140, type: 'dropdown' },
  { key: 'followUps', label: 'Follow Ups', width: 120, type: 'dropdown' },
  { key: 'followUpDate', label: 'Follow Up Date', width: 130, type: 'date' },
  { key: 'connects', label: 'Connects', width: 90, type: 'number' },
  { key: 'rate', label: 'Rate', width: 90, type: 'currency' },
  { key: 'proposalScreenshot', label: 'Proposal Screenshot', width: 150, type: 'link' },
  { key: 'comments', label: 'Comments', width: 200, type: 'text' },
  { key: 'actions', label: 'Actions', width: 140, type: null }
];

// Helper to map custom columns
const mapCustomColumns = (customColumns) =>
  customColumns.map(col => ({ key: col.key, label: col.name, width: 140, type: col.type || 'text' }));

// Memoized table row component
const TableRow = memo(({ 
  row, 
  columns, 
  isSelected, 
  onToggleSelection,
  onEditRow,
  onViewActivity,
  onDelete,
  permissions,
  lockedRows,
  style
}) => {
  const isLocked = lockedRows[row._id];

  const handleCopyLink = (link) => {
    navigator.clipboard.writeText(link);
    toast.success('Link copied to clipboard!');
  };

  const renderCellContent = (column) => {
    const value = row[column.key];
    const canEdit = permissions?.canUpdate && !column.readOnly && column.type;

    // Special cells
    if (column.key === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelection(row._id)}
          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
        />
      );
    }

    if (column.key === 'actions') {
      return (
        <div className="flex items-center justify-center gap-2">
          {permissions?.canViewActivityLog && (
            <button
              onClick={() => onViewActivity(row)}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
              title="View Activity Log"
            >
              <History className="w-4 h-4" />
            </button>
          )}
          {permissions?.canUpdate && (
            <button
              onClick={() => onEditRow(row)}
              className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-all"
              title="Edit Row"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          {permissions?.canDelete && (
            <button
              onClick={() => onDelete(row._id)}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
              title="Delete Row"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {isLocked && (
            <div className="p-1.5 text-amber-500" title={`Locked by ${isLocked.userName}`}>
              <Lock className="w-4 h-4" />
            </div>
          )}
        </div>
      );
    }

    // Read-only display
    switch (column.type) {
      case 'date':
        return formatSalesDate(value);
      
      case 'link':
        if (!value) return '-';
        return (
          <div className="flex items-center gap-1">
            <a 
              href={value} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-600 hover:text-blue-700 underline flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="truncate max-w-[60px]">Link</span>
            </a>
            <button
              onClick={() => handleCopyLink(value)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              title="Copy link"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      
      case 'rating':
        if (value === null || value === undefined || value === '') return '-';
        return <StarRating value={Number(value)} size={14} />;
      
      case 'percent':
        return value !== undefined && value !== null ? `${value}%` : '-';
      
      case 'currency':
        return value !== undefined && value !== null ? `$${value}` : '-';
      
      case 'number':
        return value !== undefined && value !== null ? value : '-';
      
      case 'dropdown':
        if (!value) return '-';
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
            {value}
          </span>
        );
      
      default:
        return value || '-';
    }
  };

  // Row background logic
  const getRowBackground = () => {
    if (isSelected) return 'bg-blue-50 dark:bg-blue-900/30';
    if (row.rowColor && row.rowColor !== '#FFFFFF') {
       // We adjust opacity slightly for light mode to ensure text is readable if color is dark
       // But assuming user picks light pastel colors usually. 
       // For safety, we can apply it as style with opacity.
       return ''; // Handled via style
    }
    return 'bg-white dark:bg-gray-800';
  };

  return (
    <div
      className={`flex items-center border-b border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors absolute top-0 left-0 w-full ${getRowBackground()}`}
      style={{
        ...style,
        backgroundColor: !isSelected && row.rowColor && row.rowColor !== '#FFFFFF' ? `${row.rowColor}33` : undefined // 20% opacity for better visibility
      }}
    >
      {columns.map((column) => (
        <div
          key={column.key}
          className="flex-shrink-0 px-3 py-2 text-sm text-gray-700 dark:text-gray-300"
          style={{ 
            width: column.width, 
            minWidth: column.width
          }}
        >
          {renderCellContent(column)}
        </div>
      ))}
    </div>
  );
});

TableRow.displayName = 'TableRow';

// Skeleton row for loading state
const SkeletonRow = ({ index, columns, totalWidth }) => (
  <div
    className="flex items-center border-b border-gray-100 dark:border-gray-700"
    style={{ height: 52, width: totalWidth }}
  >
    {columns.map((col, colIdx) => (
      <div
        key={colIdx}
        className="flex-shrink-0 px-3 py-2"
        style={{ width: col.width, minWidth: col.width }}
      >
        <div 
          className="h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
          style={{ width: `${60 + (index * colIdx) % 40}%` }}
        />
      </div>
    ))}
  </div>
);

const SalesTable = ({ onEditRow, onViewActivity, permissions, loading }) => {
  const { user } = useContext(AuthContext);
  const parentRef = useRef(null);
  
  const {
    rows,
    // loading, // Removed: using prop instead
    customColumns = [],
    selectedRows,
    toggleRowSelection,
    selectAllRows,
    clearSelection,
    pagination,
    goToPage,
    deleteRow,
    updateRow,
    lockRow,
    unlockRow,
    lockedRows = {}
  } = useSalesStore();

  useEffect(() => {
    // Ensure we have the latest custom columns
    // eslint-disable-next-line no-unused-expressions
    useSalesStore.getState().fetchCustomColumns && useSalesStore.getState().fetchCustomColumns();
  }, []);

  const COLUMNS = [...BASE_COLUMNS, ...mapCustomColumns(customColumns)];
  const TOTAL_WIDTH = COLUMNS.reduce((acc, col) => acc + col.width, 0);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 53, // Estimated row height
    overscan: 10,
  });

  const handleSelectAll = () => {
    if (selectedRows.size === rows.length) {
      clearSelection();
    } else {
      selectAllRows();
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this row?')) return;
    try {
      await deleteRow(id);
      toast.success('Row deleted successfully');
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  // Loading state with skeleton
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 h-full flex flex-col">

        <div className="overflow-hidden flex-1 relative">
           {/* Header for skeleton view */}
           <div 
             className="flex items-center bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border-b border-gray-200 dark:border-gray-700 absolute top-0 z-10"
             style={{ height: 48, width: TOTAL_WIDTH }}
           >
             {COLUMNS.map((col) => (
                <div key={col.key} className="flex-shrink-0 px-3 py-3 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400" style={{ width: col.width }}>
                  {col.label}
                </div>
             ))}
           </div>
           
           <div className="mt-[48px] px-0">
              {[...Array(10)].map((_, i) => (
                <SkeletonRow key={i} index={i} columns={COLUMNS} totalWidth={TOTAL_WIDTH} />
              ))}
           </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (rows.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-16 text-center border border-gray-200 dark:border-gray-700"
      >
        <div className="text-7xl mb-6">📊</div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          No bids yet. Add your first record!
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          Start tracking your sales pipeline by adding your first bid record. 
          Click the "Add Row" button above to get started.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Scroll container for X-AXIS ONLY - Y axis is handled by page scroll/virtualizer */}
      <div 
        ref={parentRef}
        className="overflow-auto w-full h-full"
      >
        {/* Table with min-width to ensure all columns fit */}
        <div style={{ minWidth: TOTAL_WIDTH, height: `${rowVirtualizer.getTotalSize()}px` }} className="relative">
          {/* Table Header - Sticky */}
          <div 
            className="flex items-center bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10"
            style={{ height: 48, width: TOTAL_WIDTH }}
          >
            {COLUMNS.map((column) => (
              <div
                key={column.key}
                className="flex-shrink-0 px-3 py-3 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400"
                style={{ 
                  width: column.width, 
                  minWidth: column.width
                }}
              >
                {column.key === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={selectedRows.size === rows.length && rows.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  />
                ) : (
                  column.label
                )}
              </div>
            ))}
          </div>

          {/* Table Body - Virtualized */}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <TableRow
                  key={row._id}
                  row={row}
                  columns={COLUMNS}
                  isSelected={selectedRows.has(row._id)}
                  onToggleSelection={toggleRowSelection}
                  onEditRow={onEditRow}
                  onViewActivity={onViewActivity}
                  onDelete={handleDelete}
                  permissions={permissions}
                  lockedRows={lockedRows}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    top: 48, // Offset by header height to avoid overlap with sticky header
                    position: 'absolute',
                    left: 0,
                    width: '100%'
                  }}
                />
              );
            })}
        </div>
      </div>

      {/* Pagination Footer - Fixed at bottom */}
      {pagination.pages > 1 && (
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-6 py-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 shrink-0">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing page <span className="font-semibold text-gray-900 dark:text-white">{pagination.page}</span> of{' '}
            <span className="font-semibold text-gray-900 dark:text-white">{pagination.pages}</span>
            <span className="mx-2">•</span>
            <span className="font-semibold text-gray-900 dark:text-white">{pagination.total}</span> total rows
          </div>
          <div className="flex gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium text-sm shadow-sm transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page === pagination.pages}
              className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium text-sm shadow-sm transition-all"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesTable;
