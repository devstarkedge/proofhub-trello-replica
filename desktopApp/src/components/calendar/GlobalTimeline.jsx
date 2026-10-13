import React, { memo, useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

/**
 * GlobalTimeline - Horizontal timeline showing upcoming reminder dates
 * Clicking on a date navigates calendar and opens side panel
 */
const GlobalTimeline = memo(({
  reminders = {},
  onDateClick,
  selectedDate,
  className = ''
}) => {
  const scrollContainerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Get upcoming dates with reminders (sorted)
  const upcomingDates = Object.keys(reminders)
    .filter(date => {
      const d = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d >= today;
    })
    .sort((a, b) => new Date(a) - new Date(b))
    .slice(0, 30); // Limit to 30 upcoming dates

  // Check scroll position
  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [upcomingDates]);

  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkScroll, 300);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return {
      day: date.getDate(),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
      month: date.toLocaleDateString('en-US', { month: 'short' })
    };
  };

  // Get reminder count and status summary for a date
  const getDateInfo = (dateString) => {
    const dateReminders = reminders[dateString] || [];
    const count = dateReminders.length;
    
    const hasOverdue = dateReminders.some(r => {
      return r.status === 'pending' && new Date(r.scheduledDate) < new Date();
    });
    
    const hasDueSoon = dateReminders.some(r => {
      if (r.status !== 'pending') return false;
      const scheduledDate = new Date(r.scheduledDate);
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      return scheduledDate <= tomorrow && scheduledDate > now;
    });

    return { count, hasOverdue, hasDueSoon };
  };

  // Check if date is today
  const isToday = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  if (upcomingDates.length === 0) {
    return null;
  }

  return (
    <div className={`bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 shadow-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
            <Calendar className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Upcoming Reminders</h3>
            <p className="text-xs text-gray-500">{upcomingDates.length} dates with reminders</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={`p-1.5 rounded-lg transition-colors ${
              canScrollLeft 
                ? 'hover:bg-gray-100 text-gray-600' 
                : 'text-gray-300 cursor-not-allowed'
            }`}
          >
            <ChevronLeft className="h-4 w-4" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={`p-1.5 rounded-lg transition-colors ${
              canScrollRight 
                ? 'hover:bg-gray-100 text-gray-600' 
                : 'text-gray-300 cursor-not-allowed'
            }`}
          >
            <ChevronRight className="h-4 w-4" />
          </motion.button>
        </div>
      </div>

      {/* Timeline */}
      <div
        ref={scrollContainerRef}
        onScroll={checkScroll}
        className="overflow-x-auto scrollbar-hide px-4 py-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex gap-3 min-w-max">
          {upcomingDates.map((dateString, index) => {
            const formatted = formatDate(dateString);
            const info = getDateInfo(dateString);
            const isSelected = selectedDate === dateString;
            const today = isToday(dateString);

            return (
              <motion.button
                key={dateString}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onDateClick?.(dateString)}
                className={`
                  relative flex flex-col items-center min-w-[70px] p-3 rounded-2xl
                  transition-all duration-200 cursor-pointer
                  ${isSelected 
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30' 
                    : today
                      ? 'bg-indigo-50 text-indigo-700 hover:shadow-md'
                      : 'bg-gray-50 hover:bg-gray-100 hover:shadow-md'
                  }
                `}
              >
                {/* Month label */}
                <span className={`text-[10px] font-medium uppercase tracking-wide ${
                  isSelected ? 'text-indigo-100' : 'text-gray-400'
                }`}>
                  {formatted.month}
                </span>
                
                {/* Day number */}
                <span className={`text-2xl font-bold ${
                  isSelected ? 'text-white' : today ? 'text-indigo-700' : 'text-gray-900'
                }`}>
                  {formatted.day}
                </span>
                
                {/* Weekday */}
                <span className={`text-xs font-medium ${
                  isSelected ? 'text-indigo-100' : 'text-gray-500'
                }`}>
                  {formatted.weekday}
                </span>

                {/* Reminder count badge */}
                <div className={`
                  mt-2 px-2 py-0.5 rounded-full text-xs font-semibold
                  ${isSelected 
                    ? 'bg-white/20 text-white' 
                    : info.hasOverdue
                      ? 'bg-red-100 text-red-700'
                      : info.hasDueSoon
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-blue-100 text-blue-700'
                  }
                `}>
                  {info.count} {info.count === 1 ? 'reminder' : 'reminders'}
                </div>

                {/* Status indicator dots */}
                <div className="absolute -top-1 -right-1 flex gap-0.5">
                  {info.hasOverdue && (
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-white" />
                  )}
                  {info.hasDueSoon && !info.hasOverdue && (
                    <span className="h-2.5 w-2.5 rounded-full bg-orange-500 border-2 border-white" />
                  )}
                </div>

                {/* Today indicator */}
                {today && !isSelected && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                    <span className="text-[9px] font-bold text-indigo-600 bg-white px-1 rounded">
                      TODAY
                    </span>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

GlobalTimeline.displayName = 'GlobalTimeline';

export default GlobalTimeline;
