import React, { useState, useEffect, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, TrendingUp, AlertTriangle, Flame, MoreHorizontal } from 'lucide-react';
import { createPortal } from 'react-dom';
import Database from '../../services/database';

/**
 * Smart hover preview card showing task-wise logged time summary
 * Features adaptive display, consistent task colors, and viewport-aware positioning
 */
const DateCellHoverCard = memo(({ 
  userId, 
  date, 
  isVisible, 
  anchorRef,
  onLoad 
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'bottom' });
  const cardRef = useRef(null);

  // Fetch hover data when visible
  useEffect(() => {
    if (!isVisible || !userId || !date) {
      setData(null);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await Database.getDateHoverDetails(userId, date);
        setData(response.data);
        onLoad?.(response.data);
      } catch (err) {
        console.error('Failed to fetch hover data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isVisible, userId, date, onLoad]);

  // Calculate position relative to anchor and viewport
  useEffect(() => {
    if (!isVisible || !anchorRef?.current) return;

    const updatePosition = () => {
      const anchor = anchorRef.current.getBoundingClientRect();
      const cardWidth = 260;
      const cardHeight = 200;
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };

      let top = anchor.bottom + 8;
      let left = anchor.left + (anchor.width / 2) - (cardWidth / 2);
      let placement = 'bottom';

      // Adjust for right edge
      if (left + cardWidth > viewport.width - 16) {
        left = viewport.width - cardWidth - 16;
      }
      // Adjust for left edge
      if (left < 16) {
        left = 16;
      }
      // Adjust for bottom edge - show above if no room below
      if (top + cardHeight > viewport.height - 16) {
        top = anchor.top - cardHeight - 8;
        placement = 'top';
      }

      setPosition({ top, left, placement });
    };

    updatePosition();
    // Recalculate on scroll/resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, anchorRef]);

  if (!isVisible) return null;

  const getStatusIcon = () => {
    if (!data) return null;
    if (data.status === 'over-logged') return <Flame className="w-3.5 h-3.5 text-orange-500" />;
    if (data.status === 'under-logged') return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
    return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  };

  const getStatusBg = () => {
    if (!data) return 'bg-gray-50';
    if (data.status === 'over-logged') return 'bg-gradient-to-r from-orange-50 to-red-50';
    if (data.status === 'under-logged') return 'bg-gradient-to-r from-amber-50 to-yellow-50';
    return 'bg-gradient-to-r from-emerald-50 to-green-50';
  };

  const card = (
    <AnimatePresence>
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: position.placement === 'bottom' ? -4 : 4, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: position.placement === 'bottom' ? -4 : 4, scale: 0.95 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="fixed z-[9999] pointer-events-none"
        style={{
          top: position.top,
          left: position.left,
          minWidth: '220px',
          maxWidth: '280px'
        }}
      >
        <div className="rounded-xl shadow-2xl border border-gray-200/80 backdrop-blur-sm bg-white overflow-hidden">
          {/* Header */}
          <div className={`px-3 py-2 ${getStatusBg()} border-b border-gray-100`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs font-medium text-gray-600">
                  {new Date(date).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </span>
              </div>
              {data && (
                <div className="flex items-center gap-1">
                  {getStatusIcon()}
                  <span className="text-sm font-bold text-gray-900">
                    {Math.floor((data.totalMinutes || 0) / 60)}h {(data.totalMinutes || 0) % 60}m
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-3 bg-white">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="text-xs text-red-500 text-center py-2">{error}</div>
            ) : data?.tasks?.length > 0 ? (
              <div className="space-y-2">
                {data.tasks.map((task, index) => (
                  <div key={task.taskId || index} className="flex items-start gap-2">
                    <div 
                      className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
                      style={{ backgroundColor: task.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">
                        {task.taskTitle}
                      </div>
                      <div className="text-xs text-gray-500">
                        {task.formatted}
                      </div>
                    </div>
                  </div>
                ))}
                
                {data.hasMore && (
                  <div className="flex items-center gap-1.5 pt-1 text-xs text-gray-400">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    <span>+{data.remainingCount} more task{data.remainingCount > 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-400 text-center py-2">
                No tasks found
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );

  // Use portal to render outside the table cell (avoids overflow:hidden issues)
  return createPortal(card, document.body);
});

DateCellHoverCard.displayName = 'DateCellHoverCard';

export default DateCellHoverCard;
