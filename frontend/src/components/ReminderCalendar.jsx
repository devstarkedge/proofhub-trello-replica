import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  Bell, Clock, CheckCircle2, AlertCircle, AlertTriangle,
  X, Loader, User
} from 'lucide-react';
import Database from '../services/database';

/**
 * ReminderCalendar - Calendar view showing reminder dots and counts
 * Clicking a date shows reminders for that day
 */
const ReminderCalendar = memo(({ departmentId, onSelectReminder, className = '' }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reminders, setReminders] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDateReminders, setSelectedDateReminders] = useState([]);

  // Get calendar data
  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    // Previous month days to show
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const prevMonthDays = [];
    for (let i = startDay - 1; i >= 0; i--) {
      prevMonthDays.push({
        day: prevMonthLastDay - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthLastDay - i)
      });
    }
    
    // Current month days
    const currentMonthDays = [];
    for (let i = 1; i <= daysInMonth; i++) {
      currentMonthDays.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      });
    }
    
    // Next month days to fill the grid
    const totalDays = [...prevMonthDays, ...currentMonthDays];
    const nextMonthDays = [];
    const remaining = 42 - totalDays.length; // 6 weeks * 7 days
    for (let i = 1; i <= remaining; i++) {
      nextMonthDays.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      });
    }
    
    return [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];
  }, [currentDate]);

  // Fetch reminders for the current month
  const fetchReminders = useCallback(async () => {
    try {
      setLoading(true);
      
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);
      
      const filters = {};
      if (departmentId) filters.department = departmentId;
      
      const response = await Database.getCalendarReminders(
        startDate.toISOString(),
        endDate.toISOString(),
        filters
      );
      
      if (response.success) {
        setReminders(response.data.groupedByDate || {});
      }
    } catch (error) {
      console.error('Error fetching calendar reminders:', error);
    } finally {
      setLoading(false);
    }
  }, [currentDate, departmentId]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // Navigate months
  const goToPreviousMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setSelectedDate(null);
  };

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setSelectedDate(null);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(null);
  };

  // Handle date click
  const handleDateClick = (dateInfo) => {
    const dateKey = dateInfo.date.toISOString().split('T')[0];
    setSelectedDate(dateKey);
    setSelectedDateReminders(reminders[dateKey] || []);
  };

  // Get reminder info for a date
  const getDateReminderInfo = (date) => {
    const dateKey = date.toISOString().split('T')[0];
    const dateReminders = reminders[dateKey] || [];
    
    if (dateReminders.length === 0) return null;
    
    const hasOverdue = dateReminders.some(r => r.status === 'pending' && new Date(r.scheduledDate) < new Date());
    const hasDueSoon = dateReminders.some(r => {
      if (r.status !== 'pending') return false;
      const scheduledDate = new Date(r.scheduledDate);
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      return scheduledDate <= tomorrow && scheduledDate > now;
    });
    const hasCompleted = dateReminders.some(r => r.status === 'completed');
    
    return {
      count: dateReminders.length,
      hasOverdue,
      hasDueSoon,
      hasCompleted,
      reminders: dateReminders
    };
  };

  // Format date for display
  const formatMonthYear = () => {
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Status badge helper
  const getStatusBadge = (status) => {
    const badges = {
      pending: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Clock },
      sent: { bg: 'bg-indigo-100', text: 'text-indigo-700', icon: Bell },
      completed: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2 },
      missed: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle },
      cancelled: { bg: 'bg-gray-100', text: 'text-gray-700', icon: X }
    };
    return badges[status] || badges.pending;
  };

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">Reminder Calendar</h3>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={goToPreviousMonth}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={goToToday}
            className="px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            Today
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={goToNextMonth}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </motion.button>
        </div>
      </div>

      {/* Month/Year Display */}
      <div className="px-4 py-2 text-center">
        <h4 className="text-lg font-semibold text-gray-900">{formatMonthYear()}</h4>
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="h-6 w-6 animate-spin text-indigo-600" />
          </div>
        ) : (
          <>
            {/* Week day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map(day => (
                <div key={day} className="text-center text-xs font-semibold text-gray-500 py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-1">
              {calendarData.map((dateInfo, index) => {
                const reminderInfo = getDateReminderInfo(dateInfo.date);
                const dateKey = dateInfo.date.toISOString().split('T')[0];
                const isSelected = selectedDate === dateKey;
                
                return (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleDateClick(dateInfo)}
                    className={`
                      relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm
                      transition-colors cursor-pointer
                      ${dateInfo.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}
                      ${isToday(dateInfo.date) ? 'bg-indigo-100 font-bold text-indigo-700' : ''}
                      ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50' : 'hover:bg-gray-100'}
                    `}
                    aria-label={`${dateInfo.date.toLocaleDateString()} - ${reminderInfo?.count || 0} reminders`}
                  >
                    <span>{dateInfo.day}</span>
                    
                    {/* Reminder dots */}
                    {reminderInfo && (
                      <div className="absolute bottom-1 flex gap-0.5">
                        {reminderInfo.hasOverdue && (
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        )}
                        {reminderInfo.hasDueSoon && (
                          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                        )}
                        {!reminderInfo.hasOverdue && !reminderInfo.hasDueSoon && reminderInfo.count > 0 && (
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        )}
                        {reminderInfo.hasCompleted && (
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        )}
                      </div>
                    )}
                    
                    {/* Reminder count badge */}
                    {reminderInfo && reminderInfo.count > 1 && (
                      <span className="absolute top-0 right-0 -mt-1 -mr-1 h-4 min-w-4 flex items-center justify-center text-[10px] font-bold text-white bg-indigo-600 rounded-full px-1">
                        {reminderInfo.count}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-gray-200 flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-gray-600">Overdue</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-orange-500" />
          <span className="text-gray-600">Due Soon</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="text-gray-600">Upcoming</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-gray-600">Completed</span>
        </div>
      </div>

      {/* Selected Date Reminders */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-200"
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">
                  {new Date(selectedDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                  })}
                </h4>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setSelectedDate(null)}
                  className="p-1 hover:bg-gray-100 rounded-lg"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </motion.button>
              </div>

              {selectedDateReminders.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No reminders for this date
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedDateReminders.map((reminder) => {
                    const statusBadge = getStatusBadge(reminder.status);
                    const StatusIcon = statusBadge.icon;
                    
                    return (
                      <motion.div
                        key={reminder._id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => onSelectReminder?.(reminder)}
                      >
                        <div className={`p-1.5 rounded-lg ${statusBadge.bg}`}>
                          <StatusIcon className={`h-4 w-4 ${statusBadge.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {reminder.project?.name || 'Unknown Project'}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <User className="h-3 w-3" />
                            <span className="truncate">{reminder.client?.name || 'N/A'}</span>
                          </div>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge.bg} ${statusBadge.text}`}>
                          {reminder.status}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

ReminderCalendar.displayName = 'ReminderCalendar';

export default ReminderCalendar;
