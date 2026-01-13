import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import * as XLSX from 'xlsx';
import {
  X,
  Calendar,
  User,
  Clock,
  AlertCircle,
  FileText,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  CheckCircle2,
  Circle,
  TrendingUp,
  BarChart3,
  Bell,
  CalendarDays
} from 'lucide-react';
import DepartmentContext from '../context/DepartmentContext';
import AuthContext from '../context/AuthContext';
import Database from '../services/database';
import Header from '../components/Header';
import ReminderCalendar from '../components/ReminderCalendar';
import { ModernCalendarGrid, CalendarTaskModal } from '../components/calendar';
import ReminderModal from '../components/ReminderModal';
import HtmlContent from '../components/ui/HtmlContent';

const CalendarView = () => {
  const { currentDepartment } = useContext(DepartmentContext);
  const { user } = useContext(AuthContext);
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState({ total: 0, high: 0, medium: 0, low: 0, overdue: 0 });
  
  // Tab state: 'tasks' or 'reminders'
  const [activeTab, setActiveTab] = useState('tasks');
  
  // Reminder modal state
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  
  // Check if user can see reminders tab
  const canViewReminders = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'manager';

  // Task creation from calendar state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedDateForTask, setSelectedDateForTask] = useState(null);

  const handleSelectReminder = (reminder) => {
    setSelectedReminder(reminder);
    setSelectedProject({
      id: reminder.project?._id,
      _id: reminder.project?._id,
      name: reminder.project?.name
    });
    setShowReminderModal(true);
  };

  useEffect(() => {
    if (currentDepartment) {
      loadEvents();
    } else {
      setEvents([]);
      setFilteredEvents([]);
      setLoading(false);
    }
  }, [currentDepartment]);

  useEffect(() => {
    applyFilters();
  }, [events, filterPriority, filterStatus]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const response = await Database.getCardsByDepartment(currentDepartment._id);
      const allCards = response.data || [];

      const calendarEvents = allCards
        .filter(card => card.dueDate)
        .map(card => ({
          id: card._id,
          title: card.title,
          start: new Date(card.dueDate),
          backgroundColor: getPriorityColor(card.priority),
          borderColor: getPriorityColor(card.priority),
          extendedProps: {
            cardId: card._id,
            assignees: card.assignees || [], // Store complete assignees array
            status: card.list?.title || 'N/A',
            description: card.description,
            priority: card.priority || 'Default',
            projectName: card.board?.name || 'N/A',
            labels: card.labels || [],
            createdBy: card.createdBy
          }
        }));

      setEvents(calendarEvents);
      calculateStats(calendarEvents);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (eventList) => {
    const now = new Date();
    const stats = {
      total: eventList.length,
      high: eventList.filter(e => e.extendedProps.priority === 'High').length,
      medium: eventList.filter(e => e.extendedProps.priority === 'Medium').length,
      low: eventList.filter(e => e.extendedProps.priority === 'Low').length,
      overdue: eventList.filter(e => new Date(e.start) < now).length
    };
    setStats(stats);
  };

  const applyFilters = () => {
    let filtered = [...events];

    if (filterPriority !== 'all') {
      filtered = filtered.filter(event => event.extendedProps.priority === filterPriority);
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(event => event.extendedProps.status === filterStatus);
    }

    setFilteredEvents(filtered);
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return '#EF4444';
      case 'Medium': return '#F59E0B';
      case 'Low': return '#10B981';
      default: return '#6B7280';
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'High': return <AlertCircle className="w-4 h-4" />;
      case 'Medium': return <TrendingUp className="w-4 h-4" />;
      case 'Low': return <CheckCircle2 className="w-4 h-4" />;
      default: return <Circle className="w-4 h-4" />;
    }
  };

  const handleEventClick = (info) => {
    setSelectedEvent(info.event);
    setShowEventModal(true);
  };

  const closeEventModal = () => {
    setShowEventModal(false);
    setSelectedEvent(null);
  };

  const handleRefresh = () => {
    loadEvents();
  };

  // Handle date click to create task
  const handleDateClick = (info) => {
    setSelectedDateForTask(info.dateStr);
    setShowTaskModal(true);
  };

  // Handle task created from calendar
  const handleTaskCreated = (newTask) => {
    // Optimistically add the new task to the calendar
    if (newTask) {
      const newEvent = {
        id: newTask._id,
        title: newTask.title,
        start: newTask.startDate ? new Date(newTask.startDate) : (newTask.dueDate ? new Date(newTask.dueDate) : null),
        end: newTask.dueDate ? new Date(newTask.dueDate) : null,
        backgroundColor: getPriorityColor(newTask.priority),
        borderColor: getPriorityColor(newTask.priority),
        extendedProps: {
          cardId: newTask._id,
          assignees: newTask.assignees || [],
          status: newTask.list?.title || newTask.listTitle || 'N/A',
          description: newTask.description,
          priority: newTask.priority || 'Default',
          projectName: newTask.board?.name || newTask.project?.name || 'N/A',
          labels: newTask.labels || [],
          createdBy: newTask.createdBy,
          startDate: newTask.startDate,
          dueDate: newTask.dueDate,
          isStart: !!newTask.startDate,
          isDue: !!newTask.dueDate
        }
      };
      setEvents(prev => [...prev, newEvent]);
      calculateStats([...events, newEvent]);
    }
    setShowTaskModal(false);
    // Also refresh to get accurate data
    loadEvents();
  };

  const exportCalendar = () => {
    if (filteredEvents.length === 0) {
      alert('No tasks to export');
      return;
    }

    const exportData = filteredEvents.map(event => ({
      'Task': event.title || '',
      'Assignee': event.extendedProps.assignee || '',
      'Priority': event.extendedProps.priority || '',
      'Status': event.extendedProps.status || '',
      'Due Date': event.start
        ? new Date(event.start).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        : 'No due date',
      'Description': event.extendedProps.description || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Add title row
    XLSX.utils.sheet_add_aoa(worksheet, [['Calendar Tasks Export']], { origin: 'A1' });

    // Move data down by one row
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let R = range.e.r; R >= 0; --R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R + 1, c: C });
        const addr_old = XLSX.utils.encode_cell({ r: R, c: C });
        if (worksheet[addr_old]) worksheet[addr] = worksheet[addr_old];
        delete worksheet[addr_old];
      }
    }

    // Update range
    worksheet['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: range.e.r + 1, c: range.e.c }
    });

    // Set column widths
    worksheet['!cols'] = [
      { wch: 40 }, // Task
      { wch: 25 }, // Assignee
      { wch: 12 }, // Priority
      { wch: 15 }, // Status
      { wch: 15 }, // Due Date
      { wch: 50 }  // Description
    ];

    // Style the title
    const titleCell = worksheet['A1'];
    if (titleCell) {
      titleCell.s = {
        font: { bold: true, sz: 16 },
        alignment: { horizontal: 'center' },
        fill: { fgColor: { rgb: 'FFE6F3FF' } }
      };
    }

    // Style headers
    const headers = ['A2', 'B2', 'C2', 'D2', 'E2', 'F2'];
    headers.forEach(addr => {
      if (worksheet[addr]) {
        worksheet[addr].s = {
          font: { bold: true, color: { rgb: 'FFFFFFFF' } },
          fill: { fgColor: { rgb: 'FF4F81BD' } },
          alignment: { horizontal: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: 'FF000000' } },
            bottom: { style: 'thin', color: { rgb: 'FF000000' } },
            left: { style: 'thin', color: { rgb: 'FF000000' } },
            right: { style: 'thin', color: { rgb: 'FF000000' } }
          }
        };
      }
    });

    // Style data cells
    const dataRange = XLSX.utils.decode_range(worksheet['!ref']);
    for (let R = 2; R <= dataRange.e.r; ++R) {
      for (let C = 0; C <= dataRange.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (worksheet[addr]) {
          worksheet[addr].s = {
            border: {
              top: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
              bottom: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
              left: { style: 'thin', color: { rgb: 'FFD3D3D3' } },
              right: { style: 'thin', color: { rgb: 'FFD3D3D3' } }
            },
            alignment: C === 0 || C === 5 ? { horizontal: 'left' } : { horizontal: 'center' }
          };
        }
      }
    }

    // Merge title cells
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Calendar Tasks');

    const fileName = `calendar_tasks_export_${currentDepartment?.name || 'all'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const uniqueStatuses = [...new Set(events.map(e => e.extendedProps.status))];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <Header />
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg"
                >
                  <Calendar className="w-6 h-6 text-white" />
                </motion.div>
                {/* <h1 className="text-3xl font-bold text-gray-900">Calendar View</h1> */}
              </div>
              <p className="text-gray-600 ml-1">
                {currentDepartment 
                  ? `Task deadlines and schedules for ${currentDepartment.name}` 
                  : 'Select a department to view the calendar'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRefresh}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 border border-gray-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 border border-gray-200"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={exportCalendar}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Tab Navigation */}
        {canViewReminders && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-white rounded-xl shadow-md p-1.5 mb-6 w-fit"
          >
            <button
              onClick={() => setActiveTab('tasks')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'tasks'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <CalendarDays size={18} />
              Task Deadlines
            </button>
            <button
              onClick={() => setActiveTab('reminders')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'reminders'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Bell size={18} />
              Client Reminders
            </button>
          </motion.div>
        )}

        {/* Stats Cards - Only show for tasks tab */}
        <AnimatePresence>
          {currentDepartment && activeTab === 'tasks' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6"
            >
              <motion.div
                whileHover={{ scale: 1.05, y: -5 }}
                className="bg-white rounded-xl shadow-md p-4 border-l-4 border-blue-500"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Tasks</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-blue-500" />
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.05, y: -5 }}
                className="bg-white rounded-xl shadow-md p-4 border-l-4 border-red-500"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">High Priority</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.high}</p>
                  </div>
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.05, y: -5 }}
                className="bg-white rounded-xl shadow-md p-4 border-l-4 border-yellow-500"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Medium</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.medium}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-yellow-500" />
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.05, y: -5 }}
                className="bg-white rounded-xl shadow-md p-4 border-l-4 border-green-500"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Low Priority</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.low}</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.05, y: -5 }}
                className="bg-white rounded-xl shadow-md p-4 border-l-4 border-orange-500"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Overdue</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.overdue}</p>
                  </div>
                  <Clock className="w-8 h-8 text-orange-500" />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Conditional Content based on Active Tab */}
        {activeTab === 'reminders' && canViewReminders ? (
          /* Client Reminders Calendar View - Using Modern Calendar */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <ModernCalendarGrid
              departmentId={currentDepartment?._id !== 'all' ? currentDepartment?._id : null}
              onSelectReminder={handleSelectReminder}
            />
          </motion.div>
        ) : (
          /* Tasks Calendar Content */
          <>
            {/* Filters Section */}
            <AnimatePresence>
              {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <motion.div
                initial={{ y: -20 }}
                animate={{ y: 0 }}
                className="bg-white rounded-xl shadow-md p-6 mb-6"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Filter Tasks
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Priority Level
                    </label>
                    <select
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="all">All Priorities</option>
                      <option value="High">High Priority</option>
                      <option value="Medium">Medium Priority</option>
                      <option value="Low">Low Priority</option>
                      <option value="Default">Default</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="all">All Statuses</option>
                      {uniqueStatuses.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {(filterPriority !== 'all' || filterStatus !== 'all') && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setFilterPriority('all');
                      setFilterStatus('all');
                    }}
                    className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Clear all filters
                  </motion.button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Calendar Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl shadow-xl p-6 backdrop-blur-sm border border-gray-100"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-96">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="mb-4"
              >
                <RefreshCw className="w-8 h-8 text-blue-600" />
              </motion.div>
              <div className="text-xl font-medium text-gray-700">Loading calendar...</div>
            </div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              events={filteredEvents}
              eventClick={handleEventClick}
              dateClick={handleDateClick}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
              }}
              height="auto"
              eventDisplay="block"
              selectable={true}
              selectMirror={true}
              dayMaxEvents={true}
              eventClassNames="cursor-pointer hover:opacity-80 transition-opacity"
            />
          )}
        </motion.div>

        {/* Priority Legend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 bg-white rounded-xl shadow-lg p-6 border border-gray-100"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Priority Legend
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100"
            >
              <div className="w-4 h-4 bg-red-500 rounded-full shadow-md"></div>
              <span className="text-sm font-medium text-gray-700">High Priority</span>
            </motion.div>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-100"
            >
              <div className="w-4 h-4 bg-yellow-500 rounded-full shadow-md"></div>
              <span className="text-sm font-medium text-gray-700">Medium Priority</span>
            </motion.div>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-100"
            >
              <div className="w-4 h-4 bg-green-500 rounded-full shadow-md"></div>
              <span className="text-sm font-medium text-gray-700">Low Priority</span>
            </motion.div>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
            >
              <div className="w-4 h-4 bg-gray-500 rounded-full shadow-md"></div>
              <span className="text-sm font-medium text-gray-700">Default</span>
            </motion.div>
          </div>
        </motion.div>
          </>
        )}
      </div>

      {/* Event Modal */}
      <AnimatePresence>
        {showEventModal && selectedEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-md backdrop-saturate-150 flex items-center justify-center p-4 z-50"

            onClick={closeEventModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <FileText className="w-6 h-6" />
                    Task Details
                  </h3>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={closeEventModal}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X size={20} className="text-white" />
                  </motion.button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                <div className="space-y-5">
                  {/* Title */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <FileText size={18} className="text-blue-600" />
                      Title
                    </h4>
                    <p className="text-gray-700 text-lg font-medium">{selectedEvent.title}</p>
                  </motion.div>

                  {/* Project Name */}
                  {selectedEvent.extendedProps.projectName && selectedEvent.extendedProps.projectName !== 'N/A' && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.12 }}
                      className="flex items-center gap-2"
                    >
                      <span className="text-sm text-gray-500">Project:</span>
                      <span className="text-sm font-medium text-blue-600">{selectedEvent.extendedProps.projectName}</span>
                    </motion.div>
                  )}

                  {/* Priority Badge */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 }}
                  >
                    <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <AlertCircle size={18} className="text-gray-600" />
                      Priority
                    </h4>
                    <div 
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm"
                      style={{ 
                        backgroundColor: `${getPriorityColor(selectedEvent.extendedProps.priority)}20`,
                        color: getPriorityColor(selectedEvent.extendedProps.priority)
                      }}
                    >
                      {getPriorityIcon(selectedEvent.extendedProps.priority)}
                      {selectedEvent.extendedProps.priority}
                    </div>
                  </motion.div>

                  {/* Assignees Section - Shows all assignees with avatars */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-blue-50 p-4 rounded-xl border border-blue-100"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <User size={16} className="text-blue-600" />
                      <span className="font-semibold text-gray-900 text-sm">
                        Assignees ({selectedEvent.extendedProps.assignees?.length || 0})
                      </span>
                    </div>
                    {selectedEvent.extendedProps.assignees && selectedEvent.extendedProps.assignees.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {selectedEvent.extendedProps.assignees.map((assignee, index) => (
                          <motion.div
                            key={assignee._id || index}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.25 + index * 0.05 }}
                            className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg shadow-sm border border-blue-100"
                          >
                            {/* Avatar */}
                            {assignee.avatar ? (
                              <img 
                                src={assignee.avatar} 
                                alt={assignee.name}
                                className="w-8 h-8 rounded-full object-cover border-2 border-blue-200"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold border-2 border-blue-200">
                                {assignee.name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                            )}
                            {/* Name */}
                            <span className="text-gray-700 font-medium text-sm">{assignee.name}</span>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm italic">No assignees</p>
                    )}
                  </motion.div>

                  {/* Status Section */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="bg-purple-50 p-4 rounded-xl border border-purple-100"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={16} className="text-purple-600" />
                      <span className="font-semibold text-gray-900 text-sm">Status</span>
                    </div>
                    <p className="text-gray-700 font-medium">{selectedEvent.extendedProps.status}</p>
                  </motion.div>

                  {/* Due Date */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-gradient-to-r from-orange-50 to-red-50 p-4 rounded-xl border border-orange-100"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar size={18} className="text-orange-600" />
                      <span className="font-semibold text-gray-900">Due Date</span>
                    </div>
                    <p className="text-gray-700 font-medium">
                      {new Date(selectedEvent.start).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                    {new Date(selectedEvent.start) < new Date() && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 flex items-center gap-2 text-red-600 text-sm font-medium"
                      >
                        <AlertCircle size={14} />
                        This task is overdue
                      </motion.div>
                    )}
                  </motion.div>

                  {/* Description - Rendered as HTML */}
                  {selectedEvent.extendedProps.description && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.35 }}
                      className="bg-gray-50 p-4 rounded-xl border border-gray-200"
                    >
                      <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <FileText size={16} className="text-gray-600" />
                        Description
                      </h4>
                      <div className="bg-white rounded-lg p-4 border border-gray-100">
                        <HtmlContent 
                          html={selectedEvent.extendedProps.description}
                          maxHeight="300px"
                          className="text-gray-700"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
          clientInfo={selectedReminder?.client}
          onReminderSaved={() => {}}
        />
      )}

      {/* Task Creation Modal */}
      <CalendarTaskModal
        isOpen={showTaskModal}
        onClose={() => {
          setShowTaskModal(false);
          setSelectedDateForTask(null);
        }}
        selectedDate={selectedDateForTask}
        departmentId={currentDepartment?._id}
        onTaskCreated={handleTaskCreated}
      />
    </div>
  );
};

export default CalendarView;