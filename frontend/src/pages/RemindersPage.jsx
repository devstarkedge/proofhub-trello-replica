import React, { useState, useEffect, useContext, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Calendar, Clock, CheckCircle2, AlertCircle, AlertTriangle,
  Send, Trash2, Eye, RefreshCw, Filter, ChevronDown, Search,
  BarChart3, TrendingUp, Users, Loader, X, Mail, Phone, User,
  CalendarDays, List
} from 'lucide-react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import ReminderCalendar from '../components/ReminderCalendar';
import { ModernCalendarGrid } from '../components/calendar';
import ReminderModal from '../components/ReminderModal';
import ViewProjectModal from '../components/ViewProjectModal';
import AuthContext from '../context/AuthContext';
import DepartmentContext from '../context/DepartmentContext';
import Database from '../services/database';
import { toast } from 'react-toastify';

/**
 * RemindersPage - Dedicated page for managing client reminders
 * Accessible via /reminders route for Admin and Manager roles
 */
const RemindersPage = memo(() => {
  const { user } = useContext(AuthContext);
  const { currentDepartment, departments } = useContext(DepartmentContext);
  
  // View mode: 'list' or 'calendar'
  const [viewMode, setViewMode] = useState('list');
  
  // Data states
  const [reminders, setReminders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  
  // Modal states
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // Check if user can access this page
  const canAccess = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'manager';

  // Fetch reminders and stats
  const fetchData = useCallback(async (showRefreshIndicator = false) => {
    if (!canAccess) return;
    
    try {
      if (showRefreshIndicator) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      const filters = {};
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (selectedDepartment !== 'all') filters.department = selectedDepartment;
      
      const [remindersRes, statsRes] = await Promise.all([
        Database.getAllReminders(filters),
        Database.getReminderDashboardStats(filters)
      ]);
      
      setReminders(remindersRes.data || []);
      // Stats are nested in statsRes.data.stats
      setStats(statsRes.data?.stats || null);
    } catch (error) {
      console.error('Error fetching reminders:', error);
      toast.error('Failed to load reminders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canAccess, statusFilter, selectedDepartment]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter reminders by search query
  const filteredReminders = reminders.filter(reminder => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      reminder.project?.name?.toLowerCase().includes(query) ||
      reminder.client?.name?.toLowerCase().includes(query) ||
      reminder.client?.email?.toLowerCase().includes(query)
    );
  });

  // Handle reminder actions
  const handleSendNow = async (reminder) => {
    try {
      await Database.sendReminderNow(reminder._id);
      toast.success('Reminder sent successfully!');
      fetchData(true);
    } catch (error) {
      toast.error('Failed to send reminder');
    }
  };

  const handleComplete = async (reminder) => {
    try {
      await Database.completeReminder(reminder._id, 'Marked as complete');
      toast.success('Reminder marked as complete');
      fetchData(true);
    } catch (error) {
      toast.error('Failed to complete reminder');
    }
  };

  const handleCancel = async (reminder) => {
    if (!window.confirm('Are you sure you want to cancel this reminder?')) return;
    try {
      await Database.cancelReminder(reminder._id, 'Cancelled by user');
      toast.success('Reminder cancelled');
      fetchData(true);
    } catch (error) {
      toast.error('Failed to cancel reminder');
    }
  };

  const handleViewReminder = (reminder) => {
    setSelectedReminder(reminder);
    setSelectedProject({
      id: reminder.project?._id,
      _id: reminder.project?._id,
      name: reminder.project?.name
    });
    setShowReminderModal(true);
  };

  const handleViewProject = (projectId) => {
    setSelectedProjectId(projectId);
    setShowProjectModal(true);
  };

  // Get status display info
  const getStatusDisplay = (reminder) => {
    const status = reminder.status;
    const scheduledDate = new Date(reminder.scheduledDate);
    const now = new Date();
    const hoursUntil = (scheduledDate - now) / (1000 * 60 * 60);

    if (status === 'completed') {
      return { color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle2, label: 'Completed' };
    }
    if (status === 'cancelled') {
      return { color: 'text-gray-600', bg: 'bg-gray-100', icon: X, label: 'Cancelled' };
    }
    if (hoursUntil < 0) {
      return { color: 'text-red-600', bg: 'bg-red-100', icon: AlertCircle, label: 'Overdue' };
    }
    if (hoursUntil <= 24) {
      return { color: 'text-orange-600', bg: 'bg-orange-100', icon: AlertTriangle, label: 'Due Soon' };
    }
    return { color: 'text-blue-600', bg: 'bg-blue-100', icon: Clock, label: 'Scheduled' };
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Access denied view
  if (!canAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
        <Header />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to access this page.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <Sidebar />
      <div className="flex-1 lg:ml-64">
        <Header />
        <main className="p-6 space-y-6">
          {/* Header Section */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4"
          >
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/30">
                  <Bell className="text-white" size={28} />
                </div>
                Client Reminders
              </h1>
              <p className="text-gray-600 mt-2">Manage follow-up reminders for completed projects</p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-white/80 backdrop-blur-sm rounded-xl shadow-sm border border-gray-200/50 p-1.5">
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    viewMode === 'list' 
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30' 
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <List size={18} />
                  List View
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    viewMode === 'calendar' 
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30' 
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <CalendarDays size={18} />
                  Calendar View
                </button>
              </div>

              {viewMode === 'list' && (
                <>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => fetchData(true)}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all border border-gray-200"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 rounded-xl shadow-md hover:shadow-lg transition-all border border-gray-200"
                  >
                    <Filter className="w-4 h-4" />
                    Filters
                    <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>

          {/* Stats Cards */}
          {stats && viewMode === 'list' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4"
            >
              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.total || 0}</p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-blue-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-indigo-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Pending</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.upcoming || 0}</p>
                  </div>
                  <Clock className="w-8 h-8 text-indigo-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-orange-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Due Soon</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.dueSoon || 0}</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-orange-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-red-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Overdue</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.overdue || 0}</p>
                  </div>
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Completed</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.completed || 0}</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-purple-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Success Rate</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.successRatio || 0}%</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-purple-500" />
                </div>
              </div>
            </motion.div>
          )}

          {/* Filters Section - List View Only */}
          <AnimatePresence>
            {showFilters && viewMode === 'list' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white rounded-xl shadow-sm p-4 border border-gray-200"
              >
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="text"
                        placeholder="Search by project or client..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="min-w-[150px]">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="sent">Sent</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div className="min-w-[150px]">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                    <select
                      value={selectedDepartment}
                      onChange={(e) => setSelectedDepartment(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      {departments.map(dept => (
                        <option key={dept._id} value={dept._id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Content */}
          {loading && viewMode !== 'calendar' ? (
            <div className="flex items-center justify-center py-20">
              <Loader className="w-10 h-10 text-indigo-600 animate-spin" />
            </div>
          ) : viewMode === 'calendar' ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <ModernCalendarGrid
                departmentId={selectedDepartment !== 'all' ? selectedDepartment : null}
                onSelectReminder={handleViewReminder}
              />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              {/* Table Header */}
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Reminders ({filteredReminders.length})
                </h3>
              </div>

              {filteredReminders.length === 0 ? (
                <div className="text-center py-16">
                  <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No reminders found</h3>
                  <p className="text-gray-500">Set reminders on completed projects to see them here</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredReminders.map((reminder, index) => {
                    const statusDisplay = getStatusDisplay(reminder);
                    const StatusIcon = statusDisplay.icon;
                    
                    return (
                      <motion.div
                        key={reminder._id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="px-6 py-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-4">
                          {/* Project & Client Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <h4
                                className="font-semibold text-gray-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
                                onClick={() => handleViewProject(reminder.project?._id)}
                              >
                                {reminder.project?.name || 'Unknown Project'}
                              </h4>
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusDisplay.bg} ${statusDisplay.color}`}>
                                <StatusIcon size={14} />
                                {statusDisplay.label}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              {reminder.client?.name && (
                                <span className="flex items-center gap-1.5">
                                  <User size={14} />
                                  {reminder.client.name}
                                </span>
                              )}
                              {reminder.client?.email && (
                                <span className="flex items-center gap-1.5">
                                  <Mail size={14} />
                                  {reminder.client.email}
                                </span>
                              )}
                              {reminder.client?.phone && (
                                <span className="flex items-center gap-1.5">
                                  <Phone size={14} />
                                  {reminder.client.phone}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Scheduled Date */}
                          <div className="text-right">
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <Calendar size={16} className="text-indigo-500" />
                              {formatDate(reminder.scheduledDate)}
                            </div>
                            {reminder.frequency && reminder.frequency !== 'once' && (
                              <span className="text-xs text-gray-500 mt-1">
                                Repeats: {reminder.frequency}
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleViewReminder(reminder)}
                              className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="View Details"
                            >
                              <Eye size={18} />
                            </motion.button>
                            
                            {reminder.status !== 'completed' && reminder.status !== 'cancelled' && (
                              <>
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => handleSendNow(reminder)}
                                  className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Send Now"
                                >
                                  <Send size={18} />
                                </motion.button>
                                
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => handleComplete(reminder)}
                                  className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                  title="Mark Complete"
                                >
                                  <CheckCircle2 size={18} />
                                </motion.button>
                                
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => handleCancel(reminder)}
                                  className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Cancel"
                                >
                                  <Trash2 size={18} />
                                </motion.button>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </main>
      </div>

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
          clientInfo={{
            clientName: selectedReminder?.client?.name || '',
            clientEmail: selectedReminder?.client?.email || '',
            clientWhatsappNumber: selectedReminder?.client?.phone || ''
          }}
          existingReminder={selectedReminder}
          onReminderSaved={() => fetchData(true)}
        />
      )}

      {/* Project View Modal */}
      {showProjectModal && selectedProjectId && (
        <ViewProjectModal
          isOpen={showProjectModal}
          onClose={() => {
            setShowProjectModal(false);
            setSelectedProjectId(null);
          }}
          projectId={selectedProjectId}
        />
      )}
    </div>
  );
});

RemindersPage.displayName = 'RemindersPage';

export default RemindersPage;
