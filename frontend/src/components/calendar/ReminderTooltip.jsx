import React, { memo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { 
  Calendar, Clock, User, FileText, 
  AlertCircle, CheckCircle2, AlertTriangle 
} from 'lucide-react';

/**
 * ReminderTooltip - Hover preview tooltip for reminder details
 * Shows project, client, date/time, and purpose on hover
 */
const ReminderTooltip = memo(({ 
  reminders = [], 
  date,
  children,
  className = '' 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0, placement: 'bottom' });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const showTimeoutRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  // Calculate tooltip position to avoid going off-screen
  const calculatePosition = () => {
    if (!triggerRef.current) return;
    
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = Math.min(reminders.length * 80 + 60, 350);
    const padding = 12;
    
    let x = rect.left + rect.width / 2 - tooltipWidth / 2;
    let y = rect.bottom + padding;
    let placement = 'bottom';

    // Check right boundary
    if (x + tooltipWidth > window.innerWidth - padding) {
      x = window.innerWidth - tooltipWidth - padding;
    }
    
    // Check left boundary
    if (x < padding) {
      x = padding;
    }

    // Check bottom boundary - show above if not enough space
    if (y + tooltipHeight > window.innerHeight - padding) {
      y = rect.top - tooltipHeight - padding;
      placement = 'top';
    }

    setPosition({ x, y, placement });
  };

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    showTimeoutRef.current = setTimeout(() => {
      calculatePosition();
      setIsVisible(true);
    }, 200); // Small delay for better UX
  };

  const handleMouseLeave = () => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  // Get status display info
  const getStatusInfo = (reminder) => {
    const status = reminder.status;
    const scheduledDate = new Date(reminder.scheduledDate);
    const now = new Date();
    const hoursUntil = (scheduledDate - now) / (1000 * 60 * 60);

    if (status === 'completed') {
      return { color: 'text-green-500', bg: 'bg-green-50', icon: CheckCircle2, label: 'Completed' };
    }
    if (status === 'cancelled') {
      return { color: 'text-gray-500', bg: 'bg-gray-50', icon: AlertCircle, label: 'Cancelled' };
    }
    if (hoursUntil < 0) {
      return { color: 'text-red-500', bg: 'bg-red-50', icon: AlertCircle, label: 'Overdue' };
    }
    if (hoursUntil <= 24) {
      return { color: 'text-orange-500', bg: 'bg-orange-50', icon: AlertTriangle, label: 'Due Soon' };
    }
    return { color: 'text-blue-500', bg: 'bg-blue-50', icon: Clock, label: 'Scheduled' };
  };

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const tooltipVariants = {
    hidden: { 
      opacity: 0, 
      scale: 0.95,
      y: position.placement === 'top' ? 10 : -10 
    },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { 
        duration: 0.2, 
        ease: [0.4, 0, 0.2, 1] 
      }
    },
    exit: { 
      opacity: 0, 
      scale: 0.95,
      y: position.placement === 'top' ? 10 : -10,
      transition: { duration: 0.15 }
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={className}
      >
        {children}
      </div>

      {createPortal(
        <AnimatePresence>
          {isVisible && reminders.length > 0 && (
            <motion.div
              ref={tooltipRef}
              variants={tooltipVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed z-[100] w-80"
              style={{ 
                left: position.x, 
                top: position.y,
                pointerEvents: 'none'
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {/* Glassmorphism tooltip card */}
              <div className="
                bg-white/95 backdrop-blur-xl 
                rounded-2xl shadow-2xl 
                border border-white/50
                overflow-hidden
              ">
                {/* Header */}
                <div className="px-4 py-3 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span className="font-semibold text-gray-900 text-sm">
                      {new Date(date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                    <span className="ml-auto text-xs text-gray-500">
                      {reminders.length} reminder{reminders.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Reminders list */}
                <div className="max-h-64 overflow-y-auto">
                  {reminders.slice(0, 5).map((reminder, index) => {
                    const statusInfo = getStatusInfo(reminder);
                    const StatusIcon = statusInfo.icon;

                    return (
                      <div
                        key={reminder._id || index}
                        className={`px-4 py-3 ${index !== reminders.slice(0, 5).length - 1 ? 'border-b border-gray-100' : ''}`}
                      >
                        {/* Project name with status badge */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`flex-shrink-0 p-1 rounded-lg ${statusInfo.bg}`}>
                            <StatusIcon className={`w-3 h-3 ${statusInfo.color}`} />
                          </span>
                          <span className="font-medium text-gray-900 text-sm truncate">
                            {reminder.project?.name || 'Unknown Project'}
                          </span>
                        </div>

                        {/* Client & Time */}
                        <div className="flex items-center gap-3 text-xs text-gray-500 mb-1">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span className="truncate max-w-[100px]">
                              {reminder.client?.name || 'N/A'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(reminder.scheduledDate)}</span>
                          </div>
                        </div>

                        {/* Notes preview */}
                        {reminder.notes && (
                          <div className="flex items-start gap-1 mt-1.5">
                            <FileText className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-gray-500 line-clamp-2">
                              {reminder.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Show more indicator */}
                {reminders.length > 5 && (
                  <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-center">
                    <span className="text-xs text-indigo-600 font-medium">
                      +{reminders.length - 5} more reminder{reminders.length - 5 > 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
});

ReminderTooltip.displayName = 'ReminderTooltip';

export default ReminderTooltip;
