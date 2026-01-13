import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, XCircle } from 'lucide-react';

const DatePickerModal = ({ 
  isOpen, 
  onClose, 
  onSelectDate, 
  selectedDate, 
  title,
  minDate = null // Optional: Minimum selectable date (for validation like Due Date >= Start Date)
}) => {
  const [currentMonth, setCurrentMonth] = useState(
    selectedDate ? new Date(selectedDate) : new Date()
  );
  const modalRef = useRef(null);

  // Reset current month when selectedDate changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentMonth(selectedDate ? new Date(selectedDate) : new Date());
    }
  }, [isOpen, selectedDate]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleDateClick = (day) => {
    const clickedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    
    // Check if date is disabled (before minDate)
    if (isDateDisabled(day)) return;
    
    // Format as YYYY-MM-DD using local date (not UTC to avoid timezone shift)
    const year = clickedDate.getFullYear();
    const month = String(clickedDate.getMonth() + 1).padStart(2, '0');
    const dayStr = String(clickedDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${dayStr}`;
    onSelectDate(dateString);
    onClose();
  };

  const handleClearDate = () => {
    onSelectDate(null);
    onClose();
  };

  const isSelectedDate = (day) => {
    if (!selectedDate) return false;
    const selected = new Date(selectedDate);
    return (
      selected.getDate() === day &&
      selected.getMonth() === currentMonth.getMonth() &&
      selected.getFullYear() === currentMonth.getFullYear()
    );
  };

  const isToday = (day) => {
    const today = new Date();
    return (
      today.getDate() === day &&
      today.getMonth() === currentMonth.getMonth() &&
      today.getFullYear() === currentMonth.getFullYear()
    );
  };

  // Check if a date is disabled (before minDate)
  const isDateDisabled = (day) => {
    if (!minDate) return false;
    const checkDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const minDateObj = new Date(minDate);
    // Reset time to compare only dates
    checkDate.setHours(0, 0, 0, 0);
    minDateObj.setHours(0, 0, 0, 0);
    return checkDate < minDateObj;
  };

  // Check if quick select date would be disabled
  const isQuickSelectDisabled = (offset) => {
    if (!minDate) return false;
    const quickDate = new Date();
    quickDate.setDate(quickDate.getDate() + offset);
    const minDateObj = new Date(minDate);
    quickDate.setHours(0, 0, 0, 0);
    minDateObj.setHours(0, 0, 0, 0);
    return quickDate < minDateObj;
  };

  const monthYear = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100]"
      >
        <motion.div
          ref={modalRef}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden w-96 max-w-[90vw]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-indigo-800 px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{title || 'Select Date'}</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X size={20} className="text-white" />
            </button>
          </div>

          {/* Calendar Body */}
          <div className="p-6 dark:bg-gray-800">
            {/* Month/Year Navigation */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handlePrevMonth}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
              </button>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-center flex-1">
                {monthYear}
              </h3>
              <button
                onClick={handleNextMonth}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label="Next month"
              >
                <ChevronRight size={20} className="text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-2 mb-4">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-2">
              {/* Empty days before month starts */}
              {emptyDays.map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {/* Days of month */}
              {days.map((day) => {
                const selected = isSelectedDate(day);
                const today = isToday(day);
                const disabled = isDateDisabled(day);

                return (
                  <motion.button
                    key={day}
                    whileHover={disabled ? {} : { scale: 1.05 }}
                    whileTap={disabled ? {} : { scale: 0.95 }}
                    onClick={() => handleDateClick(day)}
                    disabled={disabled}
                    className={`
                      aspect-square rounded-lg font-semibold text-sm
                      transition-all duration-200 flex items-center justify-center
                      ${disabled
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50'
                        : selected
                        ? 'bg-blue-600 text-white shadow-lg'
                        : today
                        ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border-2 border-blue-400 dark:border-blue-500'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }
                    `}
                  >
                    {day}
                  </motion.button>
                );
              })}
            </div>

            {/* Quick Select Buttons */}
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3 uppercase">Quick Select</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Today', offset: 0 },
                  { label: 'Tomorrow', offset: 1 },
                  { label: '+7 days', offset: 7 },
                ].map((option) => {
                  const quickDisabled = isQuickSelectDisabled(option.offset);
                  return (
                    <motion.button
                      key={option.label}
                      whileHover={quickDisabled ? {} : { scale: 1.02 }}
                      whileTap={quickDisabled ? {} : { scale: 0.98 }}
                      disabled={quickDisabled}
                      onClick={() => {
                        if (quickDisabled) return;
                        const date = new Date();
                        date.setDate(date.getDate() + option.offset);
                        // Format as YYYY-MM-DD using local date (not UTC to avoid timezone shift)
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const dateString = `${year}-${month}-${day}`;
                        onSelectDate(dateString);
                        onClose();
                      }}
                      className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        quickDisabled
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                          : 'bg-gray-100 dark:bg-gray-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-gray-700 dark:text-gray-200 hover:text-blue-700 dark:hover:text-blue-400'
                      }`}
                    >
                      {option.label}
                    </motion.button>
                  );
                })}
                {/* Clear Date Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleClearDate}
                  className="px-3 py-2 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                  <XCircle size={14} />
                  Clear
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DatePickerModal;
