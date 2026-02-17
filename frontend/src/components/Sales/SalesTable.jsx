import React, { useRef, useState, useCallback, useContext, memo, useEffect } from 'react';
import { formatSalesDate } from '../../utils/dateUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Star, ExternalLink, History, Edit2, Trash2, Lock, Copy, 
  ChevronLeft, ChevronRight, Loader2, DollarSign, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import StarRating from '../ui/StarRating';
import { toast } from 'react-toastify';
import useSalesStore from '../../store/salesStore';
import AuthContext from '../../context/AuthContext';
import { useVirtualizer } from '@tanstack/react-virtual';

// Column configuration for the table - Dynamic widths
const BASE_COLUMNS = [
  { key: 'checkbox', label: '', minWidth: 50, type: null },
  { key: 'date', label: 'Date', minWidth: 110, type: 'date' },
  { key: 'monthName', label: 'Month', minWidth: 90, type: 'text', readOnly: true },
  { key: 'platform', label: 'Platform', minWidth: 130, type: 'dropdown' },
  { key: 'status', label: 'Status', minWidth: 120, type: 'dropdown' },
  { key: 'bidLink', label: 'Bid Link', minWidth: 110, type: 'link' },
  { key: 'profile', label: 'Profile', minWidth: 130, type: 'dropdown' },
  { key: 'technology', label: 'Technology', minWidth: 140, type: 'dropdown' },
  { key: 'clientRating', label: 'Client Rating', minWidth: 130, type: 'rating' },
  { key: 'clientHireRate', label: '% Hire Rate', minWidth: 120, type: 'percent' },
  { key: 'clientBudget', label: 'Client Budget', minWidth: 140, type: 'dropdown' },
  { key: 'clientSpending', label: 'Client Spending', minWidth: 150, type: 'text' },
  { key: 'clientLocation', label: 'Client Location', minWidth: 150, type: 'dropdown' },
  { key: 'replyFromClient', label: 'Reply From Client', minWidth: 160, type: 'dropdown' },
  { key: 'followUps', label: 'Follow Ups', minWidth: 130, type: 'dropdown' },
  { key: 'followUpDate', label: 'Follow Up Date', minWidth: 150, type: 'date' },
  { key: 'connects', label: 'Connects', minWidth: 100, type: 'number' },
  { key: 'rate', label: 'Rate', minWidth: 90, type: 'currency' },
  { key: 'proposalScreenshot', label: 'Proposal Screenshot', minWidth: 180, type: 'link' },
  { key: 'comments', label: 'Comments', minWidth: 200, type: 'text' }
];

// Actions column - placed at the end after custom columns
const ACTIONS_COLUMN = { key: 'actions', label: 'Actions', minWidth: 150, type: null };

// Helper to map custom columns
const mapCustomColumns = (customColumns) =>
  customColumns.map(col => ({ key: col.key, label: col.name, minWidth: 160, type: col.type || 'text' }));

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
        <div className="flex items-center justify-center gap-1.5">
          {permissions?.canViewActivityLog && (
            <button
              onClick={() => onViewActivity(row)}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-md"
              title="View Activity Log"
            >
              <History className="w-4 h-4" />
            </button>
          )}
          {permissions?.canUpdate && (
            <button
              onClick={() => onEditRow(row)}
              className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-md"
              title="Edit Row"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          {permissions?.canDelete && (
            <button
              onClick={() => onDelete(row._id)}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-md"
              title="Delete Row"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {isLocked && (
            <div className="p-2 text-amber-500 animate-pulse" title={`Locked by ${isLocked.name || isLocked.userName || 'another user'}`}>
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
        if (!value) return <span className="text-gray-400">-</span>;
        return (
          <div className="flex items-center gap-1.5">
            <a 
              href={value} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline flex items-center gap-1 transition-colors group/link"
            >
              <ExternalLink className="w-3.5 h-3.5 group-hover/link:scale-110 transition-transform" />
              <span className="truncate max-w-[60px] font-medium">Link</span>
            </a>
            <button
              onClick={() => handleCopyLink(value)}
              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-all hover:scale-110"
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
        return value !== undefined && value !== null ? (
          <div className="flex items-center">
            <DollarSign size={14} style={{ color: '#F59E0B' }} className="mr-0.5" />
            <span>{value}</span>
          </div>
        ) : '-';
      
      case 'number':
        return value !== undefined && value !== null ? value : '-';
      
      case 'dropdown':
        if (!value) return <span className="text-gray-400">-</span>;
        return (
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-700/50 shadow-sm">
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
      className={`flex items-center border-b border-gray-100/60 dark:border-gray-700/60 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-transparent dark:hover:from-blue-900/20 dark:hover:to-transparent hover:shadow-sm transition-all duration-200 absolute top-0 left-0 w-full group ${getRowBackground()}`}
      style={{
        ...style,
        backgroundColor: !isSelected && row.rowColor && row.rowColor !== '#FFFFFF' ? `${row.rowColor}33` : undefined // 20% opacity for better visibility
      }}
    >
      {columns.map((column, index) => (
        <div
          key={column.key}
          className="flex-shrink-0 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-medium border-r border-gray-100/50 dark:border-gray-700/50 last:border-r-0"
          style={{ 
            minWidth: column.minWidth,
            width: 'auto',
            whiteSpace: 'nowrap'
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
const SkeletonRow = ({ index, columns }) => (
  <div
    className="flex items-center border-b border-gray-100 dark:border-gray-700"
    style={{ height: 52, minWidth: 'fit-content' }}
  >
    {columns.map((col, colIdx) => (
      <div
        key={colIdx}
        className="flex-shrink-0 px-4 py-3 border-r border-gray-100/50 dark:border-gray-700/50 last:border-r-0"
        style={{ 
          minWidth: col.minWidth,
          width: 'auto',
          whiteSpace: 'nowrap'
        }}
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
    lockedRows = {},
    dropdownOptions = {},
    sortBy,
    sortOrder,
    setSorting
  } = useSalesStore();

  useEffect(() => {
    // Ensure we have the latest custom columns
    // eslint-disable-next-line no-unused-expressions
    useSalesStore.getState().fetchCustomColumns && useSalesStore.getState().fetchCustomColumns();
  }, []);

  const COLUMNS = [...BASE_COLUMNS, ...mapCustomColumns(customColumns), ACTIONS_COLUMN];

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

  // Sort click handler
  const handleSortClick = useCallback((columnKey) => {
    if (columnKey === 'checkbox' || columnKey === 'actions') return;
    const newOrder = sortBy === columnKey && sortOrder === 'desc' ? 'asc' : 'desc';
    setSorting(columnKey, newOrder);
  }, [sortBy, sortOrder, setSorting]);

  // Get sort icon for a column
  const getSortIcon = (columnKey) => {
    if (columnKey === 'checkbox' || columnKey === 'actions') return null;
    if (sortBy === columnKey) {
      return sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />;
    }
    return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  };

  // Header height
  const HEADER_HEIGHT = 56;

  // Loading state with skeleton
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50 h-full flex flex-col backdrop-blur-sm">

        <div className="overflow-hidden flex-1 relative">
           {/* Header for skeleton view */}
           <div 
             className="flex items-center bg-gray-100 dark:bg-gray-800 border-b-2 border-gray-200 dark:border-gray-700 absolute top-0 z-10 shadow-sm"
             style={{ height: 56, minWidth: 'fit-content' }}
           >
             {COLUMNS.map((col) => (
                <div 
                  key={col.key} 
                  className="flex-shrink-0 px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 border-r border-gray-200/50 dark:border-gray-700/50 last:border-r-0" 
                  style={{ 
                    minWidth: col.minWidth,
                    width: 'auto',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {col.label}
                </div>
             ))}
           </div>
           
           <div className="mt-[56px] px-0">
              {[...Array(10)].map((_, i) => (
                <SkeletonRow key={i} index={i} columns={COLUMNS} />
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
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-20 text-center border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm"
      >
        <div className="text-8xl mb-8 animate-bounce">📊</div>
        <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          No bids yet. Add your first record!
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto text-lg leading-relaxed">
          Start tracking your sales pipeline by adding your first bid record. 
          Click the "Add Row" button above to get started.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50 flex flex-col h-full backdrop-blur-sm">
      {/* Scroll container for X-AXIS ONLY - Y axis is handled by page scroll/virtualizer */}
      <div 
        ref={parentRef}
        className="overflow-auto w-full h-full custom-scrollbar"
      >
        {/* Table with dynamic width to fit content */}
        <div style={{ minWidth: 'fit-content', height: `${rowVirtualizer.getTotalSize() + HEADER_HEIGHT}px` }} className="relative">
          {/* Table Header - Sticky */}
          <div 
            className="flex items-center bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 shadow-sm"
            style={{ height: HEADER_HEIGHT, minWidth: 'fit-content' }}
          >
            {COLUMNS.map((column) => (
              <div
                key={column.key}
                className={`flex-shrink-0 px-4 py-4 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 border-r border-gray-200/50 dark:border-gray-700/50 last:border-r-0 ${column.key !== 'checkbox' && column.key !== 'actions' ? 'cursor-pointer hover:bg-gray-200/60 dark:hover:bg-gray-700/60 select-none transition-colors' : ''}`}
                style={{ 
                  minWidth: column.minWidth,
                  width: 'auto',
                  whiteSpace: 'nowrap'
                }}
                onClick={() => handleSortClick(column.key)}
              >
                {column.key === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={selectedRows.size === rows.length && rows.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all hover:scale-110"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span>{column.label}</span>
                    {getSortIcon(column.key)}
                  </div>
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
                    top: HEADER_HEIGHT,
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
        <div className="bg-gradient-to-r from-gray-50 via-blue-50/30 to-gray-50 dark:from-gray-900 dark:via-blue-900/20 dark:to-gray-900 px-6 py-4 flex items-center justify-between border-t-2 border-blue-100 dark:border-blue-900/50 shrink-0 shadow-inner">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing page <span className="font-bold text-blue-600 dark:text-blue-400">{pagination.page}</span> of{' '}
            <span className="font-bold text-gray-900 dark:text-white">{pagination.pages}</span>
            <span className="mx-2 text-gray-300">•</span>
            <span className="font-bold text-gray-900 dark:text-white">{pagination.total}</span> total rows
          </div>
          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-50 dark:hover:bg-gray-600 hover:border-blue-300 dark:hover:border-blue-600 text-gray-700 dark:text-gray-300 font-semibold text-sm shadow-sm transition-all hover:shadow-md\"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page === pagination.pages}
              className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-50 dark:hover:bg-gray-600 hover:border-blue-300 dark:hover:border-blue-600 text-gray-700 dark:text-gray-300 font-semibold text-sm shadow-sm transition-all hover:shadow-md\"
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
