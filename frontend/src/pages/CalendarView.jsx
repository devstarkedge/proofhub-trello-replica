import React, { useState, useEffect, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
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
  BarChart3
} from 'lucide-react';
import TeamContext from '../context/TeamContext';
import Database from '../services/database';
import Header from '../components/Header';

const CalendarView = () => {
  const { currentDepartment } = useContext(TeamContext);
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState({ total: 0, high: 0, medium: 0, low: 0, overdue: 0 });

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
            assignee: card.assignees && card.assignees.length > 0 ? card.assignees[0].name : 'Unassigned',
            status: card.list?.title || 'N/A',
            description: card.description,
            priority: card.priority || 'Default'
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

  const exportCalendar = () => {
    const dataStr = JSON.stringify(events, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `calendar-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
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

        {/* Stats Cards */}
        <AnimatePresence>
          {currentDepartment && (
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
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
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
                    <p className="text-gray-700 text-lg">{selectedEvent.title}</p>
                  </motion.div>

                  {/* Priority Badge */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 }}
                  >
                    <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
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

                  {/* Assignee and Status Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-blue-50 p-4 rounded-xl border border-blue-100"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <User size={16} className="text-blue-600" />
                        <span className="font-semibold text-gray-900 text-sm">Assignee</span>
                      </div>
                      <p className="text-gray-700 font-medium">{selectedEvent.extendedProps.assignee}</p>
                    </motion.div>

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
                  </div>

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

                  {/* Description */}
                  {selectedEvent.extendedProps.description && (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.35 }}
                      className="bg-gray-50 p-4 rounded-xl border border-gray-200"
                    >
                      <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <FileText size={16} className="text-gray-600" />
                        Description
                      </h4>
                      <p className="text-gray-700 text-sm leading-relaxed">{selectedEvent.extendedProps.description}</p>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CalendarView;