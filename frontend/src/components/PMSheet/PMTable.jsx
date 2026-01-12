import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, ArrowUpDown, Search, Download, Loader2 } from 'lucide-react';

/**
 * PMTable - High-performance, virtualized table component for PM Sheet
 * Supports sorting, filtering, sticky headers, and virtualization for large datasets
 */
const PMTable = ({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'No data available',
  loadingMessage = 'Loading data...',
  onRowClick = null,
  rowClassName = '',
  stickyHeader = true,
  virtualizeThreshold = 100,
  rowHeight = 48,
  maxHeight = '600px',
  searchable = false,
  exportable = false,
  onExport = null,
  groupBy = null,
  expandable = false,
  renderExpandedRow = null,
  className = ''
}) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const containerRef = useRef(null);

  // Handle sorting
  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    
    const query = searchQuery.toLowerCase();
    return data.filter(row => {
      return columns.some(col => {
        const value = col.accessor ? (typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor]) : '';
        return String(value).toLowerCase().includes(query);
      });
    });
  }, [data, searchQuery, columns]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    
    const column = columns.find(col => col.id === sortConfig.key || col.accessor === sortConfig.key);
    if (!column) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = typeof column.accessor === 'function' ? column.accessor(a) : a[column.accessor];
      const bValue = typeof column.accessor === 'function' ? column.accessor(b) : b[column.accessor];

      if (column.sortType === 'number') {
        return sortConfig.direction === 'asc' ? (aValue || 0) - (bValue || 0) : (bValue || 0) - (aValue || 0);
      }
      
      if (column.sortType === 'date') {
        return sortConfig.direction === 'asc' 
          ? new Date(aValue) - new Date(bValue) 
          : new Date(bValue) - new Date(aValue);
      }

      // Default string sort
      const aStr = String(aValue || '').toLowerCase();
      const bStr = String(bValue || '').toLowerCase();
      return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [filteredData, sortConfig, columns]);

  // Group data if groupBy is specified
  const groupedData = useMemo(() => {
    if (!groupBy) return null;

    const groups = {};
    sortedData.forEach(row => {
      const groupKey = typeof groupBy === 'function' ? groupBy(row) : row[groupBy];
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(row);
    });
    return groups;
  }, [sortedData, groupBy]);

  // Virtual scrolling logic
  const shouldVirtualize = sortedData.length > virtualizeThreshold;
  
  const handleScroll = useCallback((e) => {
    if (!shouldVirtualize) return;
    
    const scrollTop = e.target.scrollTop;
    const start = Math.floor(scrollTop / rowHeight);
    const visibleCount = Math.ceil(parseInt(maxHeight) / rowHeight) + 10;
    
    setVisibleRange({
      start: Math.max(0, start - 5),
      end: Math.min(sortedData.length, start + visibleCount + 5)
    });
  }, [shouldVirtualize, rowHeight, maxHeight, sortedData.length]);

  // Toggle row expansion
  const toggleRowExpansion = useCallback((rowId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  }, []);

  // Get sort icon
  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="w-4 h-4 opacity-30" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="w-4 h-4" /> 
      : <ChevronDown className="w-4 h-4" />;
  };

  // Render cell content
  const renderCell = (row, column, rowIndex) => {
    if (column.render) {
      return column.render(row, rowIndex);
    }
    
    const value = typeof column.accessor === 'function' 
      ? column.accessor(row) 
      : row[column.accessor];
    
    return value ?? '-';
  };

  // Render table rows
  const renderRows = () => {
    const dataToRender = shouldVirtualize 
      ? sortedData.slice(visibleRange.start, visibleRange.end)
      : sortedData;

    const startIndex = shouldVirtualize ? visibleRange.start : 0;

    return dataToRender.map((row, index) => {
      const actualIndex = startIndex + index;
      const rowId = row._id || row.id || actualIndex;
      const isExpanded = expandedRows.has(rowId);

      return (
        <React.Fragment key={rowId}>
          <tr
            className={`
              border-b transition-colors duration-150
              ${onRowClick ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700' : ''}
              ${rowClassName}
            `}
            style={shouldVirtualize ? { height: rowHeight } : {}}
            onClick={() => {
              if (expandable) toggleRowExpansion(rowId);
              if (onRowClick) onRowClick(row, actualIndex);
            }}
          >
            {expandable && (
              <td className="px-3 py-3 w-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRowExpansion(rowId);
                  }}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4 rotate-180" />}
                </button>
              </td>
            )}
            {columns.map((column) => (
              <td
                key={column.id || column.accessor}
                className={`px-4 py-3 text-sm ${column.className || ''}`}
                style={{ 
                  textAlign: column.align || 'left',
                  minWidth: column.minWidth,
                  maxWidth: column.maxWidth,
                  width: column.width
                }}
              >
                {renderCell(row, column, actualIndex)}
              </td>
            ))}
          </tr>
          {expandable && isExpanded && renderExpandedRow && (
            <tr className="bg-gray-50 dark:bg-gray-800">
              <td colSpan={columns.length + 1} className="px-4 py-4">
                {renderExpandedRow(row, actualIndex)}
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    });
  };

  // Render grouped rows
  const renderGroupedRows = () => {
    if (!groupedData) return renderRows();

    return Object.entries(groupedData).map(([groupKey, groupRows]) => (
      <React.Fragment key={groupKey}>
        <tr className="bg-gray-100 dark:bg-gray-700">
          <td 
            colSpan={columns.length + (expandable ? 1 : 0)} 
            className="px-4 py-3 font-semibold text-sm"
          >
            {groupKey} ({groupRows.length})
          </td>
        </tr>
        {groupRows.map((row, index) => {
          const rowId = row._id || row.id || `${groupKey}-${index}`;
          return (
            <tr
              key={rowId}
              className={`
                border-b transition-colors duration-150
                ${onRowClick ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700' : ''}
                ${rowClassName}
              `}
              onClick={() => onRowClick && onRowClick(row, index)}
            >
              {columns.map((column) => (
                <td
                  key={column.id || column.accessor}
                  className={`px-4 py-3 text-sm ${column.className || ''}`}
                  style={{ textAlign: column.align || 'left' }}
                >
                  {renderCell(row, column, index)}
                </td>
              ))}
            </tr>
          );
        })}
      </React.Fragment>
    ));
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
      {/* Table toolbar */}
      {(searchable || exportable) && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
          {searchable && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
          {exportable && onExport && (
            <button
              onClick={() => onExport(sortedData)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </div>
      )}

      {/* Table container */}
      <div
        ref={containerRef}
        className="overflow-auto"
        style={{ maxHeight }}
        onScroll={handleScroll}
      >
        {shouldVirtualize && (
          <div style={{ height: visibleRange.start * rowHeight }} />
        )}
        
        <table className="w-full">
          <thead className={stickyHeader ? 'sticky top-0 z-10' : ''}>
            <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              {expandable && <th className="px-3 py-3 w-10"></th>}
              {columns.map((column) => (
                <th
                  key={column.id || column.accessor}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 ${column.headerClassName || ''}`}
                  style={{ 
                    textAlign: column.align || 'left',
                    minWidth: column.minWidth,
                    maxWidth: column.maxWidth,
                    width: column.width
                  }}
                >
                  {column.sortable !== false ? (
                    <button
                      onClick={() => handleSort(column.id || column.accessor)}
                      className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      {column.header}
                      {getSortIcon(column.id || column.accessor)}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={columns.length + (expandable ? 1 : 0)} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <span className="text-gray-500 dark:text-gray-400">{loadingMessage}</span>
                  </div>
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (expandable ? 1 : 0)} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                      <Search className="w-8 h-8 text-gray-400" />
                    </div>
                    <span className="text-gray-500 dark:text-gray-400">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : groupBy ? (
              renderGroupedRows()
            ) : (
              renderRows()
            )}
          </tbody>
        </table>

        {shouldVirtualize && (
          <div style={{ height: (sortedData.length - visibleRange.end) * rowHeight }} />
        )}
      </div>

      {/* Table footer with count */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>
            {searchQuery && `Showing ${sortedData.length} of ${data.length} results`}
            {!searchQuery && `Total: ${data.length} records`}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PMTable;
