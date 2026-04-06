import React, { useRef, useState, useCallback, useContext, memo, useEffect, useMemo } from 'react';
import { formatSalesDate } from '../../utils/dateUtils';
import { motion } from 'framer-motion';
import {
  ExternalLink, History, Edit2, Trash2, Lock, Copy,
  ChevronLeft, ChevronRight, DollarSign, ArrowUp, ArrowDown, ArrowUpDown,
  User
} from 'lucide-react';
import StarRating from '../ui/StarRating';
import { toast } from 'react-toastify';
import useSalesStore from '../../store/salesStore';
import AuthContext from '../../context/AuthContext';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SALES_FIELD_LABELS } from '../../config/salesFieldConfig';

/* ═══════════════════════════════════════════════════════════
   COLUMN CONFIGURATION — Priority-Based Width System
   HIGH  = fixed small width (always visible, never squeezed)
   MEDIUM = auto-fit (reasonable default, resizable)
   LOW   = flexible / expandable (long content, truncated)
   ═══════════════════════════════════════════════════════════ */

const BASE_COLUMNS = [
  { key: 'checkbox',           label: '',                    width: 44,  minWidth: 44,  maxWidth: 44,  priority: 'high',   type: null },
  { key: 'date',               label: 'Date',                width: 115, minWidth: 90,  maxWidth: 160, priority: 'high',   type: 'date' },
  { key: 'monthName',          label: 'Month',               width: 95,  minWidth: 70,  maxWidth: 140, priority: 'high',   type: 'text', readOnly: true },
  { key: 'name',               label: 'Name',                width: 130, minWidth: 90,  maxWidth: 220, priority: 'high',   type: 'name' },
  { key: 'platform',           label: 'Platform',            width: 130, minWidth: 90,  maxWidth: 220, priority: 'medium', type: 'dropdown' },
  { key: 'status',             label: 'Status',              width: 120, minWidth: 80,  maxWidth: 180, priority: 'high',   type: 'dropdown' },
  { key: 'bidLink',            label: 'Bid Link',            width: 110, minWidth: 80,  maxWidth: 250, priority: 'low',    type: 'link' },
  { key: 'profile',            label: 'Profile',             width: 130, minWidth: 90,  maxWidth: 220, priority: 'medium', type: 'dropdown' },
  { key: 'technology',         label: 'Technology',          width: 140, minWidth: 100, maxWidth: 240, priority: 'medium', type: 'dropdown' },
  { key: 'clientRating',       label: 'Client Rating',       width: 125, minWidth: 100, maxWidth: 170, priority: 'medium', type: 'rating' },
  { key: 'clientHireRate',     label: '% Hire Rate',         width: 110, minWidth: 85,  maxWidth: 150, priority: 'medium', type: 'percent' },
  { key: 'clientBudget',       label: 'Client Budget',       width: 130, minWidth: 100, maxWidth: 200, priority: 'medium', type: 'dropdown' },
  { key: 'clientSpending',     label: 'Client Spending',     width: 140, minWidth: 100, maxWidth: 220, priority: 'medium', type: 'text' },
  { key: 'clientLocation',     label: 'Client Location',     width: 140, minWidth: 100, maxWidth: 220, priority: 'medium', type: 'dropdown' },
  { key: 'replyFromClient',    label: 'Reply From Client',   width: 150, minWidth: 110, maxWidth: 240, priority: 'medium', type: 'dropdown' },
  { key: 'followUps',          label: 'Follow Ups',          width: 120, minWidth: 90,  maxWidth: 180, priority: 'medium', type: 'dropdown' },
  { key: 'followUpDate',       label: 'Follow Up Date',      width: 140, minWidth: 110, maxWidth: 180, priority: 'high',   type: 'date' },
  { key: 'connects',           label: 'Connects',            width: 95,  minWidth: 70,  maxWidth: 140, priority: 'medium', type: 'number' },
  { key: 'rate',               label: 'Rate',                width: 85,  minWidth: 65,  maxWidth: 140, priority: 'medium', type: 'currency' },
  { key: 'proposalScreenshot', label: 'Proposal Screenshot', width: 170, minWidth: 120, maxWidth: 280, priority: 'low',    type: 'link' },
  { key: 'comments',           label: 'Comments',            width: 200, minWidth: 120, maxWidth: 400, priority: 'low',    type: 'text' },
];

const ACTIONS_COLUMN = {
  key: 'actions', label: 'Actions', width: 130, minWidth: 100, maxWidth: 180, priority: 'high', type: null,
};

const mapCustomColumns = (customColumns) =>
  customColumns.map(col => ({
    key: col.key,
    label: col.name,
    width: 150,
    minWidth: 100,
    maxWidth: 300,
    priority: 'low',
    type: col.type || 'text',
  }));

/* ═══════════════════════════════════════════════════════════ */
const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 44;

/* ═══════════════════════════════════════════════════════════
   NAME AVATAR — deterministic color based on name string
   ═══════════════════════════════════════════════════════════ */
const NAME_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
  'bg-pink-500', 'bg-orange-500', 'bg-lime-600', 'bg-fuchsia-500'
];
const getNameColor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length];
};
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
};

/* ═══════════════════════════════════════════════════════════
   CELL TOOLTIP — shown on hover when text is truncated
   ═══════════════════════════════════════════════════════════ */
const CellTooltip = memo(({ text, children }) => {
  const cellRef = useRef(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const handleEnter = useCallback(() => {
    const el = cellRef.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth + 2) {
      const rect = el.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 });
      setShow(true);
    }
  }, []);

  const handleLeave = useCallback(() => setShow(false), []);

  if (!text || typeof text !== 'string' || text.length < 10) {
    return <div ref={cellRef} className="truncate w-full">{children}</div>;
  }

  return (
    <>
      <div
        ref={cellRef}
        className="truncate w-full"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </div>
      {show && (
        <div
          className="fixed z-[9999] max-w-xs px-3 py-2 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-lg pointer-events-none break-words whitespace-normal"
          style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
        >
          {text}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45" />
        </div>
      )}
    </>
  );
});
CellTooltip.displayName = 'CellTooltip';

/* ═══════════════════════════════════════════════════════════
   TABLE ROW — Memoized for virtual scrolling performance
   ═══════════════════════════════════════════════════════════ */
const TableRow = memo(({
  row,
  columns,
  colWidths,
  isSelected,
  onToggleSelection,
  onEditRow,
  onViewActivity,
  onDelete,
  permissions,
  lockedRows,
  style,
  index,
}) => {
  const isLocked = lockedRows[row._id];

  const handleCopyLink = useCallback((e, link) => {
    e.stopPropagation();
    navigator.clipboard.writeText(link);
    toast.success('Link copied!', { autoClose: 1500 });
  }, []);

  const renderCell = (column) => {
    const value = column.key.startsWith('custom_')
      ? (row.customFields?.[column.key] ?? row[column.key])
      : row[column.key];

    /* Checkbox */
    if (column.key === 'checkbox') {
      return (
        <div className="flex items-center justify-center w-full">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelection(row._id)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer transition-colors"
          />
        </div>
      );
    }

    /* Actions */
    if (column.key === 'actions') {
      return (
        <div className="flex items-center justify-center gap-0.5 w-full">
          {permissions?.canViewActivityLog && (
            <button onClick={() => onViewActivity(row)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors" title="Activity Log">
              <History className="w-[15px] h-[15px]" />
            </button>
          )}
          {permissions?.canUpdate && (
            <button onClick={() => onEditRow(row)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md transition-colors" title="Edit">
              <Edit2 className="w-[15px] h-[15px]" />
            </button>
          )}
          {permissions?.canDelete && (
            <button onClick={() => onDelete(row._id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors" title="Delete">
              <Trash2 className="w-[15px] h-[15px]" />
            </button>
          )}
          {isLocked && (
            <div className="p-1.5 text-amber-500 animate-pulse" title={`Locked by ${isLocked.name || isLocked.userName || 'user'}`}>
              <Lock className="w-[15px] h-[15px]" />
            </div>
          )}
        </div>
      );
    }

    /* ─── Data cells by type ─── */
    switch (column.type) {
      case 'name': {
        if (!value) return <span className="text-gray-400 select-none">-</span>;
        const nameStr = String(value);
        return (
          <div className="flex items-center gap-2 min-w-0 w-full">
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white shrink-0 ${getNameColor(nameStr)}`}>
              {getInitials(nameStr)}
            </span>
            <CellTooltip text={nameStr}>
              <span className="truncate font-medium text-gray-800 dark:text-gray-200">{nameStr}</span>
            </CellTooltip>
          </div>
        );
      }

      case 'date':
        return <span className="tabular-nums text-gray-700 dark:text-gray-300">{formatSalesDate(value) || <span className="text-gray-400">-</span>}</span>;

      case 'link':
        if (!value) return <span className="text-gray-400 select-none">-</span>;
        return (
          <div className="flex items-center gap-1 min-w-0 w-full">
            <a href={value} target="_blank" rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 flex items-center gap-1 font-medium transition-colors min-w-0">
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Link</span>
            </a>
            <button onClick={(e) => handleCopyLink(e, value)} className="p-0.5 text-gray-400 hover:text-blue-600 rounded transition-colors shrink-0" title="Copy link">
              <Copy className="w-3 h-3" />
            </button>
          </div>
        );

      case 'rating':
        if (value === null || value === undefined || value === '') return <span className="text-gray-400 select-none">-</span>;
        return <StarRating value={Number(value)} size={14} />;

      case 'percent':
        return value !== undefined && value !== null && value !== ''
          ? <span className="tabular-nums">{value}%</span>
          : <span className="text-gray-400 select-none">-</span>;

      case 'currency':
        return value !== undefined && value !== null && value !== '' ? (
          <span className="inline-flex items-center tabular-nums">
            <DollarSign size={13} className="text-amber-500 mr-0.5 shrink-0" />
            {value}
          </span>
        ) : <span className="text-gray-400 select-none">-</span>;

      case 'number':
        return value !== undefined && value !== null && value !== ''
          ? <span className="tabular-nums">{value}</span>
          : <span className="text-gray-400 select-none">-</span>;

      case 'dropdown':
        if (!value) return <span className="text-gray-400 select-none">-</span>;
        return (
          <CellTooltip text={String(value)}>
            <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-700/40 truncate max-w-full leading-snug">
              {value}
            </span>
          </CellTooltip>
        );

      default: {
        const display = value != null ? String(value) : '';
        if (!display) return <span className="text-gray-400 select-none">-</span>;
        return (
          <CellTooltip text={display}>
            {display}
          </CellTooltip>
        );
      }
    }
  };

  /* Row background */
  const bgClass = isSelected
    ? 'bg-blue-50/70 dark:bg-blue-900/20'
    : index % 2 === 0
      ? 'bg-white dark:bg-[#1e2330]'
      : 'bg-gray-50/50 dark:bg-[#1b2030]';

  const customBg = !isSelected && row.rowColor && row.rowColor !== '#FFFFFF'
    ? `${row.rowColor}1A`
    : undefined;

  return (
    <div
      className={`flex items-stretch border-b border-gray-100 dark:border-gray-700/50 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors duration-75 ${bgClass}`}
      style={{ ...style, backgroundColor: customBg }}
      role="row"
    >
      {columns.map((column, idx) => (
        <div
          key={column.key}
          className="shrink-0 grow-0 flex items-center px-3 text-[13px] text-gray-700 dark:text-gray-300 border-r border-gray-100/70 dark:border-gray-700/30 last:border-r-0 overflow-hidden"
          style={{ width: colWidths[idx], minWidth: colWidths[idx], maxWidth: colWidths[idx], height: ROW_HEIGHT }}
          role="cell"
        >
          {renderCell(column)}
        </div>
      ))}
    </div>
  );
});
TableRow.displayName = 'TableRow';

/* ═══════════════════════════════════════════════════════════
   COLUMN RESIZE HANDLE — drag between headers to resize
   ═══════════════════════════════════════════════════════════ */
const ResizeHandle = memo(({ columnKey, onResizeStart }) => {
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onResizeStart(columnKey, e.clientX);
  }, [columnKey, onResizeStart]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute top-0 -right-[2px] w-[5px] h-full cursor-col-resize z-10 group/rsz"
      title="Drag to resize"
    >
      <div className="absolute inset-y-2 right-[1px] w-[3px] rounded-full bg-gray-300/0 group-hover/rsz:bg-blue-400/70 active:bg-blue-500 transition-colors" />
    </div>
  );
});
ResizeHandle.displayName = 'ResizeHandle';

/* ═══════════════════════════════════════════════════════════
   SKELETON LOADER
   ═══════════════════════════════════════════════════════════ */
const SkeletonRow = memo(({ columns, colWidths, index }) => (
  <div className="flex items-stretch border-b border-gray-100 dark:border-gray-700/40" style={{ height: ROW_HEIGHT }}>
    {columns.map((col, idx) => (
      <div key={col.key} className="shrink-0 flex items-center px-3 border-r border-gray-50 dark:border-gray-700/30 last:border-r-0"
        style={{ width: colWidths[idx], minWidth: colWidths[idx] }}>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" style={{ width: `${50 + ((index * (idx + 1)) % 40)}%` }} />
      </div>
    ))}
  </div>
));
SkeletonRow.displayName = 'SkeletonRow';

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
const SalesTable = ({ onEditRow, onViewActivity, permissions, loading }) => {
  const { user } = useContext(AuthContext);
  const scrollRef = useRef(null);

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
    lockedRows = {},
    sortBy,
    sortOrder,
    setSorting,
    columnWidths: persistedWidths = {},
    setColumnWidth,
  } = useSalesStore();

  /* Live drag state (not persisted until mouseup) */
  const [dragState, setDragState] = useState(null);          // { key, startX, startWidth }
  const [liveDelta, setLiveDelta] = useState(0);

  /* Scroll shadow indicators */
  const [shadows, setShadows] = useState({ left: false, right: false });

  useEffect(() => {
    useSalesStore.getState().fetchCustomColumns?.();
  }, []);

  /* ──── Build columns ──── */
  const COLUMNS = useMemo(
    () => [...BASE_COLUMNS, ...mapCustomColumns(customColumns), ACTIONS_COLUMN],
    [customColumns]
  );

  /* ──── Resolved widths (persisted + live drag overlay) ──── */
  const resolvedWidths = useMemo(() => {
    return COLUMNS.map(col => {
      let w = persistedWidths[col.key] ?? col.width;
      if (dragState && dragState.key === col.key) {
        w = Math.max(col.minWidth, Math.min(col.maxWidth, dragState.startWidth + liveDelta));
      }
      return w;
    });
  }, [COLUMNS, persistedWidths, dragState, liveDelta]);

  const totalWidth = useMemo(() => resolvedWidths.reduce((s, w) => s + w, 0), [resolvedWidths]);

  /* ──── Column resize ──── */
  const onResizeStart = useCallback((columnKey, startX) => {
    const col = COLUMNS.find(c => c.key === columnKey);
    if (!col) return;
    const startWidth = persistedWidths[columnKey] ?? col.width;
    setDragState({ key: columnKey, startX, startWidth });
    setLiveDelta(0);

    const onMove = (e) => {
      setLiveDelta(e.clientX - startX);
    };
    const onUp = (e) => {
      const delta = e.clientX - startX;
      const final = Math.max(col.minWidth, Math.min(col.maxWidth, startWidth + delta));
      setColumnWidth(columnKey, final);
      setDragState(null);
      setLiveDelta(0);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [COLUMNS, persistedWidths, setColumnWidth]);

  /* ──── Scroll shadow detection ──── */
  const updateShadows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const l = el.scrollLeft > 4;
    const r = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
    setShadows(prev => (prev.left === l && prev.right === r) ? prev : { left: l, right: r });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateShadows();
    el.addEventListener('scroll', updateShadows, { passive: true });
    const ro = new ResizeObserver(updateShadows);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateShadows);
      ro.disconnect();
    };
  }, [updateShadows]);

  /* ──── Virtual row renderer ──── */
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  /* ──── Handlers ──── */
  const handleSelectAll = useCallback(() => {
    if (selectedRows.size === rows.length) clearSelection();
    else selectAllRows();
  }, [selectedRows.size, rows.length, clearSelection, selectAllRows]);

  const handleDelete = useCallback(async (id) => {
    if (!confirm('Delete this row?')) return;
    try {
      await deleteRow(id);
      toast.success('Row deleted');
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [deleteRow]);

  const handleSortClick = useCallback((key) => {
    if (key === 'checkbox' || key === 'actions') return;
    setSorting(key, sortBy === key && sortOrder === 'desc' ? 'asc' : 'desc');
  }, [sortBy, sortOrder, setSorting]);

  const getSortIcon = useCallback((key) => {
    if (key === 'checkbox' || key === 'actions') return null;
    if (sortBy === key) {
      return sortOrder === 'desc'
        ? <ArrowDown className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
        : <ArrowUp className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />;
    }
    return <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/hdr:opacity-40 transition-opacity shrink-0" />;
  }, [sortBy, sortOrder]);

  /* ══════════ LOADING ══════════ */
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden h-full flex flex-col">
        <div className="overflow-auto flex-1">
          <div className="flex items-center bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700" style={{ height: HEADER_HEIGHT, minWidth: totalWidth }}>
            {COLUMNS.map((col, idx) => (
              <div key={col.key} className="shrink-0 px-3 flex items-center text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400" style={{ width: resolvedWidths[idx], height: HEADER_HEIGHT }}>
                {col.label}
              </div>
            ))}
          </div>
          {[...Array(14)].map((_, i) => <SkeletonRow key={i} columns={COLUMNS} colWidths={resolvedWidths} index={i} />)}
        </div>
      </div>
    );
  }

  /* ══════════ EMPTY ══════════ */
  if (rows.length === 0) {
    const hasFilters = useSalesStore.getState().filters && Object.values(useSalesStore.getState().filters).some(v => v !== '' && v !== null && v !== undefined);
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-16 text-center"
      >
        <div className="text-6xl mb-5">{hasFilters ? '🔍' : '📊'}</div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {hasFilters ? 'No matching records' : 'No bids yet'}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto text-sm mb-4">
          {hasFilters
            ? 'Try adjusting your filters or search query to find what you\'re looking for.'
            : 'Start tracking your sales pipeline by adding your first bid record.'}
        </p>
        {hasFilters && (
          <button
            onClick={() => useSalesStore.getState().clearFilters()}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 dark:text-blue-400 rounded-xl transition-colors"
          >
            Clear all filters
          </button>
        )}
      </motion.div>
    );
  }

  /* ══════════ TABLE ══════════ */
  return (
    <div className="bg-white dark:bg-[#1a1f2e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-full overflow-hidden relative">
      {/* ── Scroll shadow indicators ── */}
      <div className={`pointer-events-none absolute left-0 top-0 bottom-0 w-5 z-30 transition-opacity duration-200 bg-gradient-to-r from-black/[0.07] dark:from-black/25 to-transparent ${shadows.left ? 'opacity-100' : 'opacity-0'}`} />
      <div className={`pointer-events-none absolute right-0 top-0 bottom-0 w-5 z-30 transition-opacity duration-200 bg-gradient-to-l from-black/[0.07] dark:from-black/25 to-transparent ${shadows.right ? 'opacity-100' : 'opacity-0'}`} />

      {/* ── Single scroll wrapper (both axes) ── */}
      <div ref={scrollRef} className="overflow-auto flex-1 flex flex-col min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>

        {/* ── Table header (sticky) ── */}
        <div
          className="flex items-center bg-gray-50 dark:bg-[#151924] border-b-2 border-gray-200 dark:border-gray-700 sticky top-0 z-20 select-none shrink-0"
          style={{ height: HEADER_HEIGHT, minWidth: totalWidth }}
          role="row"
        >
          {COLUMNS.map((col, idx) => (
            <div
              key={col.key}
              className={`shrink-0 grow-0 relative flex items-center px-3 text-[11px] font-semibold uppercase tracking-wider border-r border-gray-200/50 dark:border-gray-700/50 last:border-r-0 ${
                col.key !== 'checkbox' && col.key !== 'actions'
                  ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/80 group/hdr transition-colors'
                  : ''
              }`}
              style={{ width: resolvedWidths[idx], minWidth: resolvedWidths[idx], maxWidth: resolvedWidths[idx], height: HEADER_HEIGHT }}
              onClick={() => handleSortClick(col.key)}
              role="columnheader"
            >
              {col.key === 'checkbox' ? (
                <div className="flex items-center justify-center w-full">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === rows.length && rows.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400 truncate w-full">
                  <span className="truncate">{col.label}</span>
                  {getSortIcon(col.key)}
                </div>
              )}
              {col.key !== 'checkbox' && <ResizeHandle columnKey={col.key} onResizeStart={onResizeStart} />}
            </div>
          ))}
        </div>

        {/* ── Virtualized body ── */}
        <div
          className="flex-1 min-h-0"
          style={{ minWidth: totalWidth }}
        >
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {rowVirtualizer.getVirtualItems().map((vRow) => {
              const row = rows[vRow.index];
              return (
                <TableRow
                  key={row._id}
                  row={row}
                  columns={COLUMNS}
                  colWidths={resolvedWidths}
                  isSelected={selectedRows.has(row._id)}
                  onToggleSelection={toggleRowSelection}
                  onEditRow={onEditRow}
                  onViewActivity={onViewActivity}
                  onDelete={handleDelete}
                  permissions={permissions}
                  lockedRows={lockedRows}
                  index={vRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${vRow.size}px`,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Pagination ── */}
      {pagination.pages > 1 && (
        <div className="bg-gray-50 dark:bg-[#151924] px-4 py-2.5 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 shrink-0 text-sm">
          <span className="text-gray-500 dark:text-gray-400 text-xs">
            Showing{' '}
            <span className="font-semibold text-gray-800 dark:text-gray-200">
              {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}–{Math.min(pagination.page * pagination.limit, pagination.total)}
            </span>{' '}
            of <span className="font-semibold text-gray-800 dark:text-gray-200">{pagination.total}</span> rows
            <span className="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
            Page <span className="font-semibold text-gray-800 dark:text-gray-200">{pagination.page}</span> of{' '}
            <span className="font-semibold text-gray-800 dark:text-gray-200">{pagination.pages}</span>
          </span>
          <div className="flex gap-1.5 items-center">
            <button
              onClick={() => goToPage(1)}
              disabled={pagination.page === 1}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              First
            </button>
            <button
              onClick={() => goToPage(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            {/* Page number pills */}
            {(() => {
              const pages = [];
              const current = pagination.page;
              const total = pagination.pages;
              let start = Math.max(1, current - 2);
              let end = Math.min(total, start + 4);
              if (end - start < 4) start = Math.max(1, end - 4);
              for (let i = start; i <= end; i++) pages.push(i);
              return pages.map(p => (
                <button
                  key={p}
                  onClick={() => goToPage(p)}
                  className={`inline-flex items-center justify-center w-8 h-8 text-xs font-semibold rounded-lg transition-colors ${
                    p === current
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {p}
                </button>
              ));
            })()}
            <button
              onClick={() => goToPage(pagination.page + 1)}
              disabled={pagination.page === pagination.pages}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => goToPage(pagination.pages)}
              disabled={pagination.page === pagination.pages}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesTable;
