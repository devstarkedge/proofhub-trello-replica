import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Calendar, Clock, CheckCircle2, AlertCircle, AlertTriangle,
  Filter, ChevronDown, Search, RefreshCw, TrendingUp, Users,
  Loader, X, Eye, Check, XCircle, BarChart3
} from 'lucide-react';
import { toast } from 'react-toastify';
import Database from '../services/database';
import { useClientInfo } from '../context/ClientInfoContext';

/**
 * ReminderDashboard - Full dashboard for viewing and managing reminders
 * Shows stats, filters, and list of reminders
 */
const ReminderDashboard = memo(({ departmentId, className = '' }) => {
  // Stats state
  const [stats, setStats] = useState({
    upcoming: 0,
    dueSoon: 0,
    overdue: 0,
    completed: 0,
    missed: 0,
    total: 0,
    awaitingResponse: 0,
    successRatio: 0
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Reminders list state
  const [reminders, setReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0
  });

  // Filter state
  const [filters, setFilters] = useState({
    status: '',
    client: '',
    project: '',
    manager: '',
    startDate: '',
    endDate: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Selected reminder for actions
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const { getClientForProject, upsertClientInfoBatch } = useClientInfo();

  const getProjectId = useCallback((reminder) => (
    reminder?.project?._id || reminder?.project?.id || reminder?.project || reminder?.projectId
  ), []);

  // Fetch dashboard stats
  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const queryParams = {};
      if (departmentId) queryParams.department = departmentId;

      const response = await Database.getReminderDashboardStats(queryParams);
      if (response.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching reminder stats:', error);
      toast.error('Failed to load reminder statistics');
    } finally {
      setStatsLoading(false);
    }
  }, [departmentId]);

  // Fetch reminders list
  const fetchReminders = useCallback(async (page = 1) => {
    try {
      setRemindersLoading(true);
      
      const queryParams = {
        page,
        limit: pagination.limit,
        ...filters
      };

      if (departmentId) queryParams.department = departmentId;
      if (searchTerm) queryParams.client = searchTerm;

      // Remove empty filters
      Object.keys(queryParams).forEach(key => {
        if (!queryParams[key]) delete queryParams[key];
      });

      const response = await Database.getAllReminders(queryParams);
      if (response.success) {
        const remindersData = response.data || [];
        setReminders(remindersData);
        upsertClientInfoBatch(
          remindersData.map(reminder => ({
            projectId: getProjectId(reminder),
            source: reminder.project?.clientDetails || reminder.client || {},
            fallback: reminder.client || {}
          }))
        );
        setPagination(response.pagination);
      }
    } catch (error) {
      console.error('Error fetching reminders:', error);
      toast.error('Failed to load reminders');
    } finally {
      setRemindersLoading(false);
    }
  }, [departmentId, filters, searchTerm, pagination.limit, getProjectId, upsertClientInfoBatch]);

  const remindersWithLiveClient = useMemo(() => (
    reminders.map(reminder => ({
      ...reminder,
      client: getClientForProject(getProjectId(reminder), reminder.client || {})
    }))
  ), [reminders, getClientForProject, getProjectId]);

  // Initial fetch
  useEffect(() => {
    fetchStats();
    fetchReminders(1);
  }, [fetchStats, fetchReminders]);

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    fetchReminders(1);
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      client: '',
      project: '',
      manager: '',
      startDate: '',
      endDate: ''
    });
    setSearchTerm('');
    fetchReminders(1);
  };

  // Handle reminder actions
  const handleCompleteReminder = async (reminderId) => {
    try {
      setActionLoading(reminderId);
      const response = await Database.completeReminder(reminderId);
      if (response.success) {
        toast.success('Reminder marked as completed');
        fetchStats();
        fetchReminders(pagination.page);
      }
    } catch (error) {
      console.error('Error completing reminder:', error);
      toast.error('Failed to complete reminder');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelReminder = async (reminderId) => {
    try {
      setActionLoading(reminderId);
      const response = await Database.cancelReminder(reminderId);
      if (response.success) {
        toast.success('Reminder cancelled');
        fetchStats();
        fetchReminders(pagination.page);
      }
    } catch (error) {
      console.error('Error cancelling reminder:', error);
      toast.error('Failed to cancel reminder');
    } finally {
      setActionLoading(null);
    }
  };

  // Stats cards config
  const statsCards = useMemo(() => [
    {
      key: 'upcoming',
      label: 'Upcoming',
      value: stats.upcoming,
      icon: Calendar,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    {
      key: 'dueSoon',
      label: 'Due Soon',
      value: stats.dueSoon,
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200'
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: stats.overdue,
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200'
    },
    {
      key: 'completed',
      label: 'Completed',
      value: stats.completed,
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    {
      key: 'missed',
      label: 'Missed',
      value: stats.missed,
      icon: XCircle,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200'
    },
    {
      key: 'successRatio',
      label: 'Success Rate',
      value: `${stats.successRatio}%`,
      icon: TrendingUp,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200'
    }
  ], [stats]);

  // Status badge helper
  const getStatusBadge = (status) => {
    const badges = {
      pending: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Pending' },
      sent: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Sent' },
      completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
      missed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Missed' },
      cancelled: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Cancelled' }
    };
    return badges[status] || badges.pending;
  };

  // Format date helper
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 rounded-2xl">
            <Bell className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Reminder Dashboard</h2>
            <p className="text-sm text-gray-500">Manage and track client reminders</p>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            fetchStats();
            fetchReminders(1);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          aria-label="Refresh data"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </motion.button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statsCards.map((card, index) => {
          const IconComponent = card.icon;
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`${card.bgColor} ${card.borderColor} border rounded-2xl p-4 hover:shadow-md transition-shadow cursor-pointer`}
              onClick={() => card.key !== 'successRatio' && handleFilterChange('status', card.key === 'dueSoon' ? 'pending' : card.key)}
            >
              {statsLoading ? (
                <div className="animate-pulse">
                  <div className="h-8 w-8 bg-gray-200 rounded-lg mb-2"></div>
                  <div className="h-6 w-12 bg-gray-200 rounded mb-1"></div>
                  <div className="h-4 w-16 bg-gray-200 rounded"></div>
                </div>
              ) : (
                <>
                  <div className={`p-2 ${card.bgColor} rounded-lg w-fit mb-2`}>
                    <IconComponent className={`h-5 w-5 ${card.color}`} />
                  </div>
                  <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-gray-600 font-medium">{card.label}</p>
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Awaiting Response Alert */}
      {stats.awaitingResponse > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {stats.awaitingResponse} project{stats.awaitingResponse !== 1 ? 's' : ''} awaiting client response
            </p>
            <p className="text-xs text-amber-600">
              These projects have had 3+ reminders sent without response
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleFilterChange('status', 'pending')}
            className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
          >
            View
          </motion.button>
        </motion.div>
      )}

      {/* Filters Section */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Search & Filter Toggle */}
        <div className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by client name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchReminders(1)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl transition-colors ${
              showFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </motion.button>
        </div>

        {/* Expanded Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-gray-200"
            >
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="sent">Sent</option>
                    <option value="completed">Completed</option>
                    <option value="missed">Missed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={applyFilters}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Apply
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={clearFilters}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Clear
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Reminders List */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Project</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Scheduled</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Sent</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {remindersLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-32"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-28"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-8"></div></td>
                    <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-20 ml-auto"></div></td>
                  </tr>
                ))
              ) : remindersWithLiveClient.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-12 text-center">
                    <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No reminders found</p>
                    <p className="text-gray-400 text-sm">Try adjusting your filters</p>
                  </td>
                </tr>
              ) : (
                remindersWithLiveClient.map((reminder) => {
                  const statusBadge = getStatusBadge(reminder.status);
                  const isOverdue = reminder.status === 'pending' && new Date(reminder.scheduledDate) < new Date();
                  
                  return (
                    <motion.tr
                      key={reminder._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`hover:bg-gray-50 transition-colors ${isOverdue ? 'bg-red-50/50' : ''}`}
                    >
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900 truncate max-w-[200px]">
                          {reminder.project?.name || 'Unknown Project'}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                            {(reminder.client?.name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-gray-700 truncate max-w-[120px]">
                            {reminder.client?.name || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <Calendar className="h-3.5 w-3.5 text-gray-400" />
                          {formatDate(reminder.scheduledDate)}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-600 font-medium">
                          {reminder.reminderCount || 0}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {reminder.status === 'pending' && (
                            <>
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleCompleteReminder(reminder._id)}
                                disabled={actionLoading === reminder._id}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Mark as completed"
                              >
                                {actionLoading === reminder._id ? (
                                  <Loader className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleCancelReminder(reminder._id)}
                                disabled={actionLoading === reminder._id}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Cancel reminder"
                              >
                                <X className="h-4 w-4" />
                              </motion.button>
                            </>
                          )}
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setSelectedReminder(reminder)}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </motion.button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => fetchReminders(pagination.page - 1)}
                disabled={pagination.page === 1 || remindersLoading}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Previous
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => fetchReminders(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages || remindersLoading}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Next
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

ReminderDashboard.displayName = 'ReminderDashboard';

export default ReminderDashboard;
