import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * VirtualizedTable - High-performance table for 10k+ rows
 * Uses windowing technique to render only visible rows
 * Includes sticky headers and first column
 */
const VirtualizedTable = ({
  data = [],
  columns = [],
  rowHeight = 48,
  headerHeight = 44,
  containerHeight = 600,
  onRowClick,
  renderRow,
  stickyFirstColumn = true,
  loading = false,
  emptyState
}) => {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });

  // Calculate visible rows
  const buffer = 5; // Extra rows to render for smooth scrolling
  
  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        const newScrollTop = containerRef.current.scrollTop;
        setScrollTop(newScrollTop);
        
        const start = Math.max(0, Math.floor(newScrollTop / rowHeight) - buffer);
        const visibleCount = Math.ceil(containerHeight / rowHeight) + (buffer * 2);
        const end = Math.min(data.length, start + visibleCount);
        
        setVisibleRange({ start, end });
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll(); // Initial calculation
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [data.length, rowHeight, containerHeight]);

  // Memoize visible data slice
  const visibleData = useMemo(() => {
    return data.slice(visibleRange.start, visibleRange.end);
  }, [data, visibleRange]);

  const totalHeight = data.length * rowHeight;
  const offsetY = visibleRange.start * rowHeight;

  // Loading state
  if (loading) {
    return (
      <div 
        className="flex items-center justify-center"
        style={{ height: containerHeight }}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#10b981' }} />
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Loading data...
          </span>
        </div>
      </div>
    );
  }

  // Empty state
  if (data.length === 0 && emptyState) {
    return (
      <div 
        className="flex items-center justify-center"
        style={{ height: containerHeight }}
      >
        {emptyState}
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="overflow-auto relative"
      style={{ height: containerHeight }}
    >
      {/* Sticky Header */}
      <div 
        className="sticky top-0 z-20 flex"
        style={{ 
          backgroundColor: 'var(--color-bg-muted)',
          minWidth: 'fit-content'
        }}
      >
        {columns.map((col, idx) => (
          <div
            key={col.key || idx}
            className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider flex-shrink-0 ${
              idx === 0 && stickyFirstColumn ? 'sticky left-0 z-30' : ''
            }`}
            style={{ 
              width: col.width || 150,
              minWidth: col.minWidth || 100,
              color: 'var(--color-text-secondary)',
              backgroundColor: idx === 0 && stickyFirstColumn 
                ? 'var(--color-bg-muted)' 
                : 'transparent',
              borderRight: idx === 0 && stickyFirstColumn 
                ? '1px solid var(--color-border-subtle)' 
                : 'none'
            }}
          >
            <div className="flex items-center gap-1">
              {col.icon && <col.icon className="w-4 h-4" />}
              {col.label}
            </div>
          </div>
        ))}
      </div>

      {/* Virtual Scroll Container */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Visible Rows */}
        <div
          style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0
          }}
        >
          {visibleData.map((row, idx) => {
            const actualIndex = visibleRange.start + idx;
            
            if (renderRow) {
              return renderRow(row, actualIndex, columns, stickyFirstColumn);
            }

            return (
              <div
                key={row.id || actualIndex}
                className="flex items-center transition-colors duration-150 cursor-pointer hover:bg-opacity-50"
                style={{ 
                  height: rowHeight,
                  borderTop: '1px solid var(--color-border-subtle)',
                  backgroundColor: 'var(--color-bg-secondary)'
                }}
                onClick={() => onRowClick?.(row, actualIndex)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)';
                }}
              >
                {columns.map((col, colIdx) => (
                  <div
                    key={col.key || colIdx}
                    className={`px-3 py-2 text-sm flex-shrink-0 ${
                      colIdx === 0 && stickyFirstColumn ? 'sticky left-0 z-10' : ''
                    }`}
                    style={{ 
                      width: col.width || 150,
                      minWidth: col.minWidth || 100,
                      color: 'var(--color-text-secondary)',
                      backgroundColor: colIdx === 0 && stickyFirstColumn 
                        ? 'var(--color-bg-secondary)' 
                        : 'transparent',
                      borderRight: colIdx === 0 && stickyFirstColumn 
                        ? '1px solid var(--color-border-subtle)' 
                        : 'none'
                    }}
                  >
                    {col.render ? col.render(row[col.key], row, actualIndex) : row[col.key]}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Row count indicator */}
      <div 
        className="sticky bottom-0 left-0 right-0 px-4 py-2 text-xs border-t"
        style={{ 
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border-subtle)',
          color: 'var(--color-text-muted)'
        }}
      >
        Showing {visibleRange.start + 1} - {Math.min(visibleRange.end, data.length)} of {data.length.toLocaleString()} rows
      </div>
    </div>
  );
};

/**
 * InfiniteScrollTable - Alternative with infinite scroll pagination
 */
export const InfiniteScrollTable = ({
  fetchData,
  columns,
  pageSize = 50,
  rowHeight = 48,
  containerHeight = 600,
  renderRow,
  stickyFirstColumn = true
}) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const containerRef = useRef(null);
  const loadingRef = useRef(false);

  // Load initial data
  useEffect(() => {
    loadMore(1);
  }, []);

  const loadMore = async (pageNum) => {
    if (loadingRef.current || !hasMore) return;
    
    loadingRef.current = true;
    setLoading(true);
    
    try {
      const result = await fetchData(pageNum, pageSize);
      
      if (result.data.length < pageSize) {
        setHasMore(false);
      }
      
      setData(prev => pageNum === 1 ? result.data : [...prev, ...result.data]);
      setPage(pageNum);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  // Handle scroll to load more
  const handleScroll = useCallback(() => {
    if (!containerRef.current || loading || !hasMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const scrollThreshold = scrollHeight - clientHeight - 200;
    
    if (scrollTop >= scrollThreshold) {
      loadMore(page + 1);
    }
  }, [loading, hasMore, page]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [handleScroll]);

  return (
    <div 
      ref={containerRef}
      className="overflow-auto"
      style={{ height: containerHeight }}
    >
      <VirtualizedTable
        data={data}
        columns={columns}
        rowHeight={rowHeight}
        containerHeight={containerHeight}
        renderRow={renderRow}
        stickyFirstColumn={stickyFirstColumn}
        loading={loading && data.length === 0}
      />
      
      {loading && data.length > 0 && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#10b981' }} />
        </div>
      )}
      
      {!hasMore && data.length > 0 && (
        <div 
          className="text-center py-4 text-sm"
          style={{ color: 'var(--color-text-muted)' }}
        >
          All data loaded
        </div>
      )}
    </div>
  );
};

export default VirtualizedTable;
