import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, RefreshCw, Calendar, Clock, Check, ChevronDown, ChevronUp,
  Sun, Moon, Repeat, Trash2, Save, AlertCircle
} from 'lucide-react';
import { toast } from 'react-toastify';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun', fullLabel: 'Sunday' },
  { value: 1, label: 'Mon', fullLabel: 'Monday' },
  { value: 2, label: 'Tue', fullLabel: 'Tuesday' },
  { value: 3, label: 'Wed', fullLabel: 'Wednesday' },
  { value: 4, label: 'Thu', fullLabel: 'Thursday' },
  { value: 5, label: 'Fri', fullLabel: 'Friday' },
  { value: 6, label: 'Sat', fullLabel: 'Saturday' }
];

const WEEKS_OF_MONTH = [
  { value: 1, label: 'First' },
  { value: 2, label: 'Second' },
  { value: 3, label: 'Third' },
  { value: 4, label: 'Fourth' },
  { value: -1, label: 'Last' }
];

const MONTHS = [
  { value: 0, label: 'January' },
  { value: 1, label: 'February' },
  { value: 2, label: 'March' },
  { value: 3, label: 'April' },
  { value: 4, label: 'May' },
  { value: 5, label: 'June' },
  { value: 6, label: 'July' },
  { value: 7, label: 'August' },
  { value: 8, label: 'September' },
  { value: 9, label: 'October' },
  { value: 10, label: 'November' },
  { value: 11, label: 'December' }
];

const RecurringSettingsModal = ({
  isOpen,
  onClose,
  card,
  existingRecurrence,
  onSave,
  onDelete
}) => {
  // Schedule Type
  const [scheduleType, setScheduleType] = useState('daily');
  
  // Daily Options
  const [skipWeekends, setSkipWeekends] = useState(false);
  
  // Weekly Options
  const [selectedDays, setSelectedDays] = useState([1, 2, 3, 4, 5]); // Mon-Fri default
  
  // Monthly Options
  const [monthlyType, setMonthlyType] = useState('sameDate');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [weekOfMonth, setWeekOfMonth] = useState(1);
  const [dayOfWeekMonthly, setDayOfWeekMonthly] = useState(1);
  
  // Yearly Options
  const [yearlyMonth, setYearlyMonth] = useState(0);
  const [yearlyDay, setYearlyDay] = useState(1);
  
  // Days After Options
  const [daysAfter, setDaysAfter] = useState(1);
  
  // Custom Options
  const [customRepeatDays, setCustomRepeatDays] = useState(7);
  const [customDaysOfWeek, setCustomDaysOfWeek] = useState([]);
  const [customWeeksOfMonth, setCustomWeeksOfMonth] = useState([]);
  
  // Recur Behavior
  const [recurBehavior, setRecurBehavior] = useState('onSchedule');
  
  // Task Options
  const [taskSkipWeekends, setTaskSkipWeekends] = useState(false);
  const [createNewTask, setCreateNewTask] = useState(false);
  
  // End Conditions
  const [endConditionType, setEndConditionType] = useState('never');
  const [endAfterOccurrences, setEndAfterOccurrences] = useState(10);
  const [endOnDate, setEndOnDate] = useState('');
  
  // Dates and Times
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('23:00');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  
  // Subtask Template
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskDescription, setSubtaskDescription] = useState('');
  
  // UI State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing recurrence data
  useEffect(() => {
    if (existingRecurrence) {
      setScheduleType(existingRecurrence.scheduleType || 'daily');
      setSkipWeekends(existingRecurrence.dailyOptions?.skipWeekends || false);
      setSelectedDays(existingRecurrence.weeklyOptions?.daysOfWeek || [1, 2, 3, 4, 5]);
      setMonthlyType(existingRecurrence.monthlyOptions?.type || 'sameDate');
      setDayOfMonth(existingRecurrence.monthlyOptions?.dayOfMonth || 1);
      setWeekOfMonth(existingRecurrence.monthlyOptions?.weekOfMonth || 1);
      setDayOfWeekMonthly(existingRecurrence.monthlyOptions?.dayOfWeek || 1);
      setYearlyMonth(existingRecurrence.yearlyOptions?.month || 0);
      setYearlyDay(existingRecurrence.yearlyOptions?.dayOfMonth || 1);
      setDaysAfter(existingRecurrence.daysAfterOptions?.days || 1);
      setCustomRepeatDays(existingRecurrence.customOptions?.repeatEveryDays || 7);
      setCustomDaysOfWeek(existingRecurrence.customOptions?.daysOfWeek || []);
      setCustomWeeksOfMonth(existingRecurrence.customOptions?.weeksOfMonth || []);
      setRecurBehavior(existingRecurrence.recurBehavior || 'onSchedule');
      setTaskSkipWeekends(existingRecurrence.taskOptions?.skipWeekends || false);
      setCreateNewTask(existingRecurrence.taskOptions?.createNewTask || false);
      setEndConditionType(existingRecurrence.endCondition?.type || 'never');
      setEndAfterOccurrences(existingRecurrence.endCondition?.occurrences || 10);
      setEndOnDate(existingRecurrence.endCondition?.endDate 
        ? new Date(existingRecurrence.endCondition.endDate).toISOString().split('T')[0] 
        : '');
      setDueDate(existingRecurrence.dueDate 
        ? new Date(existingRecurrence.dueDate).toISOString().split('T')[0] 
        : '');
      setDueTime(existingRecurrence.dueTime || '23:00');
      setStartDate(existingRecurrence.startDate 
        ? new Date(existingRecurrence.startDate).toISOString().split('T')[0] 
        : '');
      setStartTime(existingRecurrence.startTime || '');
      setSubtaskTitle(existingRecurrence.subtaskTemplate?.title || '');
      setSubtaskDescription(existingRecurrence.subtaskTemplate?.description || '');
    } else if (card) {
      // Initialize from card data
      setDueDate(card.dueDate 
        ? new Date(card.dueDate).toISOString().split('T')[0] 
        : new Date().toISOString().split('T')[0]);
      setStartDate(card.startDate 
        ? new Date(card.startDate).toISOString().split('T')[0] 
        : '');
      setSubtaskTitle(card.title ? `${card.title} - Recurring` : 'Recurring Task');
    }
  }, [existingRecurrence, card]);

  const toggleDay = (day) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort((a, b) => a - b));
    }
  };

  const toggleCustomDay = (day) => {
    if (customDaysOfWeek.includes(day)) {
      setCustomDaysOfWeek(customDaysOfWeek.filter(d => d !== day));
    } else {
      setCustomDaysOfWeek([...customDaysOfWeek, day].sort((a, b) => a - b));
    }
  };

  const toggleCustomWeek = (week) => {
    if (customWeeksOfMonth.includes(week)) {
      setCustomWeeksOfMonth(customWeeksOfMonth.filter(w => w !== week));
    } else {
      setCustomWeeksOfMonth([...customWeeksOfMonth, week].sort((a, b) => a - b));
    }
  };

  const handleSave = async () => {
    if (!dueDate) {
      toast.error('Please select a due date');
      return;
    }

    setSaving(true);
    try {
      const recurrenceData = {
        cardId: card._id || card.id,
        scheduleType,
        dailyOptions: {
          skipWeekends
        },
        weeklyOptions: {
          daysOfWeek: selectedDays
        },
        monthlyOptions: {
          type: monthlyType,
          dayOfMonth,
          weekOfMonth,
          dayOfWeek: dayOfWeekMonthly
        },
        yearlyOptions: {
          month: yearlyMonth,
          dayOfMonth: yearlyDay
        },
        daysAfterOptions: {
          days: daysAfter
        },
        customOptions: {
          repeatEveryDays: customRepeatDays,
          daysOfWeek: customDaysOfWeek,
          weeksOfMonth: customWeeksOfMonth
        },
        recurBehavior,
        taskOptions: {
          skipWeekends: taskSkipWeekends,
          createNewTask
        },
        endCondition: {
          type: endConditionType,
          occurrences: endAfterOccurrences,
          endDate: endOnDate || null
        },
        dueDate,
        dueTime,
        startDate: startDate || null,
        startTime: startTime || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        subtaskTemplate: {
          title: subtaskTitle || `${card.title} - Recurring`,
          description: subtaskDescription,
          priority: card.priority || 'medium',
          assignees: card.assignees || [],
          tags: card.labels || []
        }
      };

      await onSave(recurrenceData);
      toast.success(existingRecurrence ? 'Recurrence updated!' : 'Recurring task created!');
      onClose();
    } catch (error) {
      console.error('Error saving recurrence:', error);
      toast.error('Failed to save recurrence');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingRecurrence) return;
    
    if (!window.confirm('Are you sure you want to stop this recurring task?')) return;
    
    try {
      await onDelete(existingRecurrence._id);
      toast.success('Recurring task stopped');
      onClose();
    } catch (error) {
      console.error('Error deleting recurrence:', error);
      toast.error('Failed to stop recurrence');
    }
  };

  const getScheduleSummary = () => {
    switch (scheduleType) {
      case 'daily':
        return skipWeekends ? 'Every weekday' : 'Every day';
      case 'weekly':
        const dayNames = selectedDays.map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label).join(', ');
        return `Every week on ${dayNames}`;
      case 'monthly':
        if (monthlyType === 'sameDate') return `On day ${dayOfMonth} of every month`;
        if (monthlyType === 'firstDay') return 'On the first day of every month';
        if (monthlyType === 'lastDay') return 'On the last day of every month';
        const weekName = WEEKS_OF_MONTH.find(w => w.value === weekOfMonth)?.label;
        const dayName = DAYS_OF_WEEK.find(d => d.value === dayOfWeekMonthly)?.fullLabel;
        return `On the ${weekName} ${dayName} of every month`;
      case 'yearly':
        const monthName = MONTHS.find(m => m.value === yearlyMonth)?.label;
        return `Every year on ${monthName} ${yearlyDay}`;
      case 'daysAfter':
        return `${daysAfter} day${daysAfter > 1 ? 's' : ''} after completion`;
      case 'custom':
        return `Every ${customRepeatDays} day${customRepeatDays > 1 ? 's' : ''}`;
      default:
        return 'Custom schedule';
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl"
        >
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 p-6 flex items-center justify-between z-10 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                <RefreshCw className="text-white" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  {existingRecurrence ? 'Edit Recurring Task' : 'Set Up Recurring Task'}
                </h2>
                <p className="text-sm text-gray-600 font-medium">{card?.title}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 shadow-sm"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-8 space-y-10">
            {/* Top Row: Schedule Summary and Timing */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Schedule Summary */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-1 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 text-blue-700 mb-4">
                  <div className="p-3 bg-blue-100 rounded-xl">
                    <Repeat size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg">Schedule</h4>
                    <p className="text-sm text-blue-600">Configuration</p>
                  </div>
                </div>
                <div className="text-center">
                  <span className="font-semibold text-base text-gray-900 block">{getScheduleSummary()}</span>
                </div>
              </motion.div>

              {/* Timing Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="lg:col-span-2 space-y-6"
              >
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                  <Calendar size={24} className="text-blue-600" />
                  Schedule Timing
                </h3>

                {/* Due Date & Time */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      Due Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:border-gray-300"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      Due Time
                    </label>
                    <input
                      type="time"
                      value={dueTime}
                      onChange={(e) => setDueTime(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white shadow-sm hover:border-gray-300"
                    />
                  </div>
                </div>

                {/* Start Date & Time (Optional) */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      Start Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white shadow-sm hover:border-gray-300"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white shadow-sm hover:border-gray-300"
                    />
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Schedule Type */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-6"
            >
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                <Repeat size={24} className="text-purple-600" />
                Repeat Schedule
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { value: 'daily', label: 'Daily', icon: Sun },
                  { value: 'weekly', label: 'Weekly', icon: Calendar },
                  { value: 'monthly', label: 'Monthly', icon: Calendar },
                  { value: 'yearly', label: 'Yearly', icon: Calendar },
                  { value: 'daysAfter', label: 'Days After', icon: Check },
                  { value: 'custom', label: 'Custom', icon: RefreshCw }
                ].map((type) => (
                  <motion.button
                    key={type.value}
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setScheduleType(type.value)}
                    className={`p-5 rounded-xl border-2 text-sm font-semibold transition-all duration-200 shadow-sm ${
                      scheduleType === type.value
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 border-blue-500 text-white shadow-lg'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:shadow-md bg-white'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <type.icon size={20} className={scheduleType === type.value ? 'text-white' : 'text-gray-500'} />
                      <span className="text-center leading-tight">{type.label}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Schedule-specific Options */}
            {scheduleType === 'daily' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-br from-orange-50 to-yellow-50 border border-orange-200 rounded-xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Sun size={20} className="text-orange-600" />
                  <div>
                    <h4 className="font-semibold text-gray-900">Daily Options</h4>
                    <p className="text-sm text-gray-600">Configure your daily recurrence</p>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={skipWeekends}
                      onChange={(e) => setSkipWeekends(e.target.checked)}
                      className="w-5 h-5 text-orange-600 border-orange-300 rounded focus:ring-orange-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Skip weekends</span>
                      <p className="text-xs text-gray-500">Only repeat on weekdays</p>
                    </div>
                  </label>
                </div>
              </motion.div>
            )}

            {scheduleType === 'weekly' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Calendar size={20} className="text-green-600" />
                  <div>
                    <h4 className="font-semibold text-gray-900">Weekly Options</h4>
                    <p className="text-sm text-gray-600">Choose which days to repeat</p>
                  </div>
                </div>
                <div className="flex gap-3 flex-wrap">
                  {DAYS_OF_WEEK.map((day) => (
                    <motion.button
                      key={day.value}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleDay(day.value)}
                      className={`w-12 h-12 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm ${
                        selectedDays.includes(day.value)
                          ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg'
                          : 'bg-white border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      {day.label}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {scheduleType === 'monthly' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6 shadow-sm space-y-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Calendar size={20} className="text-purple-600" />
                  <div>
                    <h4 className="font-semibold text-gray-900">Monthly Options</h4>
                    <p className="text-sm text-gray-600">Configure monthly recurrence pattern</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    { value: 'sameDate', label: 'Same date each month', desc: 'Repeat on the same day number' },
                    { value: 'firstDay', label: 'First day of month', desc: 'Always on the 1st' },
                    { value: 'lastDay', label: 'Last day of month', desc: 'Always on the last day' },
                    { value: 'defaultDay', label: 'Specific day of week', desc: 'Like "Second Tuesday"' }
                  ].map((option) => (
                    <label key={option.value} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/50 transition-colors">
                      <input
                        type="radio"
                        name="monthlyType"
                        value={option.value}
                        checked={monthlyType === option.value}
                        onChange={(e) => setMonthlyType(e.target.value)}
                        className="mt-1 w-4 h-4 text-purple-600 border-purple-300 focus:ring-purple-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700">{option.label}</span>
                        <p className="text-xs text-gray-500">{option.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {monthlyType === 'sameDate' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/70 rounded-lg p-4 border border-purple-100"
                  >
                    <label className="block text-sm font-medium text-gray-700 mb-2">Day of month</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
                      className="w-24 px-4 py-2 border-2 border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    />
                  </motion.div>
                )}

                {monthlyType === 'defaultDay' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/70 rounded-lg p-4 border border-purple-100"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Week</label>
                        <select
                          value={weekOfMonth}
                          onChange={(e) => setWeekOfMonth(parseInt(e.target.value))}
                          className="w-full px-4 py-2 border-2 border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white"
                        >
                          {WEEKS_OF_MONTH.map((week) => (
                            <option key={week.value} value={week.value}>{week.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Day</label>
                        <select
                          value={dayOfWeekMonthly}
                          onChange={(e) => setDayOfWeekMonthly(parseInt(e.target.value))}
                          className="w-full px-4 py-2 border-2 border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all bg-white"
                        >
                          {DAYS_OF_WEEK.map((day) => (
                            <option key={day.value} value={day.value}>{day.fullLabel}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {scheduleType === 'yearly' && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Month</label>
                    <select
                      value={yearlyMonth}
                      onChange={(e) => setYearlyMonth(parseInt(e.target.value))}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      {MONTHS.map((month) => (
                        <option key={month.value} value={month.value}>{month.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Day</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={yearlyDay}
                      onChange={(e) => setYearlyDay(parseInt(e.target.value) || 1)}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {scheduleType === 'daysAfter' && (
              <div className="bg-gray-50 rounded-lg p-4">
                <label className="block text-sm text-gray-600 mb-1">
                  Days after marked complete
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={daysAfter}
                    onChange={(e) => setDaysAfter(parseInt(e.target.value) || 1)}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">days</span>
                </div>
              </div>
            )}

            {scheduleType === 'custom' && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Repeat every</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={customRepeatDays}
                      onChange={(e) => setCustomRepeatDays(parseInt(e.target.value) || 1)}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">days</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-2">On specific days (optional)</label>
                  <div className="flex gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day.value}
                        onClick={() => toggleCustomDay(day.value)}
                        className={`w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                          customDaysOfWeek.includes(day.value)
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-2">On specific weeks (optional)</label>
                  <div className="flex gap-2">
                    {WEEKS_OF_MONTH.filter(w => w.value > 0).map((week) => (
                      <button
                        key={week.value}
                        onClick={() => toggleCustomWeek(week.value)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          customWeeksOfMonth.includes(week.value)
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {week.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Row: Creation Trigger and End Conditions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Recur Behavior */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-4"
              >
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                  <Check size={24} className="text-teal-600" />
                  Creation Trigger
                </h3>
                <div className="space-y-3">
                  {[
                    { value: 'onSchedule', label: 'On schedule', desc: 'At 11:00 PM or immediately if completed earlier', icon: Clock },
                    { value: 'whenComplete', label: 'When complete', desc: 'When status changes to CLOSED', icon: Check },
                    { value: 'whenDone', label: 'When done', desc: 'When status changes to DONE or CLOSED', icon: Check }
                  ].map((option) => (
                    <motion.label
                      key={option.value}
                      whileHover={{ scale: 1.01 }}
                      className={`flex items-start gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                        recurBehavior === option.value
                          ? 'border-teal-500 bg-gradient-to-r from-teal-50 to-green-50 shadow-md'
                          : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="recurBehavior"
                        value={option.value}
                        checked={recurBehavior === option.value}
                        onChange={(e) => setRecurBehavior(e.target.value)}
                        className="mt-1 w-5 h-5 text-teal-600 border-gray-300 focus:ring-teal-500"
                      />
                      <option.icon size={22} className={`mt-0.5 ${recurBehavior === option.value ? 'text-teal-600' : 'text-gray-400'}`} />
                      <div>
                        <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                        <span className="block text-xs text-gray-600 mt-1">{option.desc}</span>
                      </div>
                    </motion.label>
                  ))}
                </div>
              </motion.div>

              {/* End Conditions */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="space-y-4"
              >
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                  <AlertCircle size={24} className="text-amber-600" />
                  End Conditions
                </h3>
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center gap-3 cursor-pointer p-4 rounded-lg hover:bg-white/50 transition-colors">
                    <input
                      type="radio"
                      name="endCondition"
                      value="never"
                      checked={endConditionType === 'never'}
                      onChange={(e) => setEndConditionType(e.target.value)}
                      className="w-5 h-5 text-amber-600 border-amber-300 focus:ring-amber-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Repeat forever</span>
                      <p className="text-xs text-gray-500">No end date - continues indefinitely</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 rounded-lg hover:bg-white/50 transition-colors">
                    <input
                      type="radio"
                      name="endCondition"
                      value="afterOccurrences"
                      checked={endConditionType === 'afterOccurrences'}
                      onChange={(e) => setEndConditionType(e.target.value)}
                      className="w-5 h-5 text-amber-600 border-amber-300 focus:ring-amber-500"
                    />
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-sm font-medium text-gray-700">After</span>
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={endAfterOccurrences}
                        onChange={(e) => setEndAfterOccurrences(parseInt(e.target.value) || 1)}
                        disabled={endConditionType !== 'afterOccurrences'}
                        className="w-24 px-3 py-2 border-2 border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:bg-gray-100 transition-all"
                      />
                      <span className="text-sm font-medium text-gray-700">occurrences</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 rounded-lg hover:bg-white/50 transition-colors">
                    <input
                      type="radio"
                      name="endCondition"
                      value="onDate"
                      checked={endConditionType === 'onDate'}
                      onChange={(e) => setEndConditionType(e.target.value)}
                      className="w-5 h-5 text-amber-600 border-amber-300 focus:ring-amber-500"
                    />
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-sm font-medium text-gray-700">End on</span>
                      <input
                        type="date"
                        value={endOnDate}
                        onChange={(e) => setEndOnDate(e.target.value)}
                        disabled={endConditionType !== 'onDate'}
                        className="px-3 py-2 border-2 border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:bg-gray-100 transition-all"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Advanced Options */}
            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              >
                {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                Advanced options
              </button>
              
              {showAdvanced && (
                <div className="mt-4 space-y-4 bg-gray-50 rounded-lg p-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={taskSkipWeekends}
                      onChange={(e) => setTaskSkipWeekends(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Skip weekends for all instances</span>
                  </label>

                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="text-yellow-600 mt-0.5" />
                      <div>
                        <p className="text-sm text-yellow-800 font-medium">Subtask Mode (Recommended)</p>
                        <p className="text-xs text-yellow-700">
                          Each recurring instance will be created as a subtask under the parent task.
                          This keeps your task list organized.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Subtask title template</label>
                    <input
                      type="text"
                      value={subtaskTitle}
                      onChange={(e) => setSubtaskTitle(e.target.value)}
                      placeholder="e.g., Weekly Report - Recurring"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Subtask description (optional)</label>
                    <textarea
                      value={subtaskDescription}
                      onChange={(e) => setSubtaskDescription(e.target.value)}
                      placeholder="Description for each recurring instance..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gradient-to-r from-gray-50 to-white border-t border-gray-200 p-8 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-4">
              {existingRecurrence && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDelete}
                  className="flex items-center gap-3 px-6 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 border border-red-200 hover:border-red-300 shadow-sm font-medium"
                >
                  <Trash2 size={18} />
                  <span>Stop Recurrence</span>
                </motion.button>
              )}
            </div>
            <div className="flex gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className="px-8 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-semibold shadow-sm"
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={saving || !dueDate}
                className="flex items-center gap-3 px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-blue-500 disabled:hover:to-blue-600 font-semibold shadow-lg hover:shadow-xl"
              >
                {saving ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>{existingRecurrence ? 'Update Recurrence' : 'Save Recurrence'}</span>
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default RecurringSettingsModal;
