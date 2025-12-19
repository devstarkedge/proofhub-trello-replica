import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const DatePickerModal = ({ isOpen, onClose, onSelectDate, selectedDate, title }) => {
  const [currentMonth, setCurrentMonth] = useState(
    selectedDate ? new Date(selectedDate) : new Date()
  );
  const modalRef = useRef(null);

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
    const selectedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const dateString = selectedDate.toISOString().split('T')[0];
    onSelectDate(dateString);
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

  const monthYear = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
      >
        <motion.div
          ref={modalRef}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl shadow-2xl overflow-hidden w-96 max-w-[90vw]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
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
          <div className="p-6">
            {/* Month/Year Navigation */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handlePrevMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft size={20} className="text-gray-600" />
              </button>
              <h3 className="text-lg font-semibold text-gray-900 text-center flex-1">
                {monthYear}
              </h3>
              <button
                onClick={handleNextMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Next month"
              >
                <ChevronRight size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-2 mb-4">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-bold text-gray-500 uppercase py-2"
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

                return (
                  <motion.button
                    key={day}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleDateClick(day)}
                    className={`
                      aspect-square rounded-lg font-semibold text-sm
                      transition-all duration-200 flex items-center justify-center
                      ${selected
                        ? 'bg-blue-600 text-white shadow-lg'
                        : today
                        ? 'bg-blue-100 text-blue-600 border-2 border-blue-400'
                        : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    {day}
                  </motion.button>
                );
              })}
            </div>

            {/* Quick Select Buttons */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-600 mb-3 uppercase">Quick Select</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Today', offset: 0 },
                  { label: 'Tomorrow', offset: 1 },
                  { label: '+7 days', offset: 7 },
                ].map((option) => (
                  <motion.button
                    key={option.label}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      const date = new Date();
                      date.setDate(date.getDate() + option.offset);
                      const dateString = date.toISOString().split('T')[0];
                      onSelectDate(dateString);
                      onClose();
                    }}
                    className="px-3 py-2 bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-700 text-sm font-medium rounded-lg transition-colors"
                  >
                    {option.label}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DatePickerModal;
