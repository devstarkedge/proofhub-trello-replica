import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  Loader, RefreshCw, Settings
} from 'lucide-react';
import Database from '../../services/database';
import CalendarCell from './CalendarCell';
import ReminderSidePanel from './ReminderSidePanel';
import GlobalTimeline from './GlobalTimeline';
import CalendarSearch from './CalendarSearch';
import ExportTools from './ExportTools';
import ReminderModal from '../ReminderModal';
import { useClientInfo } from '../../context/ClientInfoContext';

/**
 * ModernCalendarGrid - Enterprise-level calendar component
 * Features: Modern UI, hover previews, side panel, search, timeline, export
 * Note: Department filter is controlled by the header/parent component
 */
const ModernCalendarGrid = memo(({ 
  departmentId,
  onSelectReminder,
  className = '' 
}) => {
  // State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [reminders, setReminders] = useState({});
  const [allReminders, setAllReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [searchFilters, setSearchFilters] = useState(null);
  
  // Side panel state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelReminders, setPanelReminders] = useState([]);
  
  // Modal state
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const { getClientForProject, getClientDetailsForProject } = useClientInfo();

  const getProjectId = useCallback((reminder) => (
    reminder?.project?._id || reminder?.project?.id || reminder?.project || reminder?.projectId
  ), []);

  const resolveReminderClient = useCallback((reminder) => {
    if (!reminder) return reminder;
    return {
      ...reminder,
      client: getClientForProject(getProjectId(reminder), reminder.client || {})
    };
  }, [getClientForProject, getProjectId]);

  const remindersWithLiveClient = useMemo(() => {
    const next = {};
    Object.keys(reminders).forEach(dateKey => {
      next[dateKey] = (reminders[dateKey] || []).map(resolveReminderClient);
    });
    return next;
  }, [reminders, resolveReminderClient]);

  const allRemindersWithLiveClient = useMemo(() => (
    allReminders.map(resolveReminderClient)
  ), [allReminders, resolveReminderClient]);

  const selectedReminderWithLiveClient = useMemo(() => (
    selectedReminder ? resolveReminderClient(selectedReminder) : null
  ), [selectedReminder, resolveReminderClient]);

  // Calendar data calculation
  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    // Previous month days
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
    
    // Next month days to fill grid (6 weeks)
    const totalDays = [...prevMonthDays, ...currentMonthDays];
    const nextMonthDays = [];
    const remaining = 42 - totalDays.length;
    for (let i = 1; i <= remaining; i++) {
      nextMonthDays.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      });
    }
    
    return [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];
  }, [currentDate]);

  // Fetch reminders for the current view (with extended range for timeline)
  const fetchReminders = useCallback(async (showRefreshIndicator = false) => {
    try {
      if (showRefreshIndicator) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      
      // Fetch 3 months of data for timeline
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month + 2, 0);
      
      const filters = {};
      // Use departmentId from props (controlled by header)
      if (departmentId && departmentId !== 'all') {
        filters.department = departmentId;
      }
      
      // Apply search filters if present
      if (searchFilters) {
        if (searchFilters.status && searchFilters.status !== 'all') {
          filters.status = searchFilters.status;
        }
        if (searchFilters.startDate) {
          startDate.setTime(new Date(searchFilters.startDate).getTime());
        }
        if (searchFilters.endDate) {
          endDate.setTime(new Date(searchFilters.endDate).getTime());
        }
      }
      
      const response = await Database.getCalendarReminders(
        startDate.toISOString(),
        endDate.toISOString(),
        filters
      );
      
      if (response.success) {
        const groupedData = response.data.groupedByDate || {};
        
        // Filter by search query if present
        if (searchFilters?.query) {
          const query = searchFilters.query.toLowerCase();
          Object.keys(groupedData).forEach(dateKey => {
            groupedData[dateKey] = groupedData[dateKey].filter(reminder => 
              reminder.project?.name?.toLowerCase().includes(query) ||
              reminder.client?.name?.toLowerCase().includes(query) ||
              reminder.notes?.toLowerCase().includes(query)
            );
            if (groupedData[dateKey].length === 0) {
              delete groupedData[dateKey];
            }
          });
        }
        
        // Filter by client name if present
        if (searchFilters?.client) {
          const clientQuery = searchFilters.client.toLowerCase();
          Object.keys(groupedData).forEach(dateKey => {
            groupedData[dateKey] = groupedData[dateKey].filter(reminder => 
              reminder.client?.name?.toLowerCase().includes(clientQuery)
            );
            if (groupedData[dateKey].length === 0) {
              delete groupedData[dateKey];
            }
          });
        }
        
        setReminders(groupedData);
        setAllReminders(response.data.reminders || []);
      }
    } catch (error) {
      console.error('Error fetching calendar reminders:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentDate, departmentId, searchFilters]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  // Navigation handlers
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

  // Date click handler
  const handleDateClick = (dateInfo) => {
    const dateKey = dateInfo.date.toISOString().split('T')[0];
    const dateReminders = remindersWithLiveClient[dateKey] || [];
    
    setSelectedDate(dateKey);
    setPanelReminders(dateReminders);
    
    if (dateReminders.length > 0) {
      setIsPanelOpen(true);
    }
  };

  // Timeline date click handler
  const handleTimelineDateClick = (dateString) => {
    const dateReminders = remindersWithLiveClient[dateString] || [];
    const dateObj = new Date(dateString);
    
    // Navigate to the month if different
    if (dateObj.getMonth() !== currentDate.getMonth() || 
        dateObj.getFullYear() !== currentDate.getFullYear()) {
      setCurrentDate(new Date(dateObj.getFullYear(), dateObj.getMonth(), 1));
    }
    
    setSelectedDate(dateString);
    setPanelReminders(dateReminders);
    setIsPanelOpen(true);
  };

  useEffect(() => {
    if (selectedDate) {
      setPanelReminders(remindersWithLiveClient[selectedDate] || []);
    }
  }, [selectedDate, remindersWithLiveClient]);

  // Edit reminder handler
  const handleEditReminder = (reminder) => {
    setSelectedReminder(reminder);
    setSelectedProject({
      id: reminder.project?._id,
      _id: reminder.project?._id,
      name: reminder.project?.name
    });
    setShowReminderModal(true);
  };

  // Search handler
  const handleSearch = (filters) => {
    setSearchFilters(filters);
  };

  const handleClearSearch = () => {
    setSearchFilters(null);
  };

  // Helper functions
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

  // Get reminders for export (based on current view or selection)
  const exportReminders = useMemo(() => {
    if (selectedDate && panelReminders.length > 0) {
      return panelReminders;
    }
    return allRemindersWithLiveClient;
  }, [selectedDate, panelReminders, allRemindersWithLiveClient]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Search Bar - Department is controlled by header */}
      <CalendarSearch
        onSearch={handleSearch}
        onClear={handleClearSearch}
      />

      {/* Global Timeline */}
      <GlobalTimeline
        reminders={remindersWithLiveClient}
        selectedDate={selectedDate}
        onDateClick={handleTimelineDateClick}
      />

      {/* Main Calendar Card */}
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-gray-200/50 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-indigo-500/5 to-purple-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                <CalendarIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{formatMonthYear()}</h2>
                <p className="text-sm text-gray-500">
                  {Object.values(remindersWithLiveClient).flat().length} reminders this period
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Export Tools */}
              <ExportTools
                reminders={exportReminders}
                selectedDate={selectedDate}
              />

              {/* Refresh Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => fetchReminders(true)}
                disabled={refreshing}
                className="
                  p-2.5 bg-white border border-gray-200 rounded-xl
                  text-gray-600 hover:text-indigo-600 hover:border-indigo-300
                  shadow-sm hover:shadow-md transition-all
                  disabled:opacity-50
                "
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </motion.button>

              {/* Navigation */}
              <div className="flex items-center bg-gray-100 rounded-xl p-1">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={goToPreviousMonth}
                  className="p-2 hover:bg-white rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-5 w-5 text-gray-600" />
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={goToToday}
                  className="px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-white rounded-lg transition-colors"
                >
                  Today
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={goToNextMonth}
                  className="p-2 hover:bg-white rounded-lg transition-colors"
                >
                  <ChevronRight className="h-5 w-5 text-gray-600" />
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader className="h-10 w-10 animate-spin text-indigo-600 mx-auto mb-4" />
                <p className="text-gray-500">Loading calendar...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Week day headers */}
              <div className="grid grid-cols-7 gap-2 mb-3">
                {weekDays.map(day => (
                  <div 
                    key={day} 
                    className="text-center text-xs font-bold text-gray-400 uppercase tracking-wider py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar days grid */}
              <div className="grid grid-cols-7 gap-2">
                {calendarData.map((dateInfo, index) => {
                  const dateKey = dateInfo.date.toISOString().split('T')[0];
                  const dateReminders = remindersWithLiveClient[dateKey] || [];
                  
                  return (
                    <CalendarCell
                      key={index}
                      dateInfo={dateInfo}
                      reminders={dateReminders}
                      isToday={isToday(dateInfo.date)}
                      isSelected={selectedDate === dateKey}
                      onClick={() => handleDateClick(dateInfo)}
                      onReminderClick={(reminder) => {
                        onSelectReminder?.(reminder);
                        handleEditReminder(reminder);
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Legend */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <span className="font-semibold text-gray-500 uppercase tracking-wider">Legend:</span>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-gray-600">Overdue</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-orange-500" />
              <span className="text-gray-600">Due Soon (24h)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-indigo-500" />
              <span className="text-gray-600">Scheduled</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-gray-600">Completed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side Panel */}
      <ReminderSidePanel
        isOpen={isPanelOpen}
        onClose={() => {
          setIsPanelOpen(false);
          setSelectedDate(null);
        }}
        date={selectedDate}
        reminders={panelReminders}
        onRefresh={() => fetchReminders(true)}
        onEditReminder={handleEditReminder}
      />

      {/* Reminder Modal */}
      {showReminderModal && selectedProject && (
        <ReminderModal
          isOpen={showReminderModal}
          onClose={() => {
            setShowReminderModal(false);
            setSelectedReminder(null);
            setSelectedProject(null);
          }}
          projectId={selectedProject._id}
          projectName={selectedProject.name}
          clientInfo={getClientDetailsForProject(
            selectedProject._id,
            selectedReminderWithLiveClient?.client || {}
          )}
          existingReminder={selectedReminderWithLiveClient}
          onReminderCreated={() => {
            fetchReminders(true);
            setShowReminderModal(false);
          }}
        />
      )}
    </div>
  );
});

ModernCalendarGrid.displayName = 'ModernCalendarGrid';

export default ModernCalendarGrid;
