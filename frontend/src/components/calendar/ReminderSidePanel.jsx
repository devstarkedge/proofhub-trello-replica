import React, { memo, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Calendar, Clock, User, Mail, Phone, FileText,
  CheckCircle2, AlertCircle, AlertTriangle, Send,
  MessageSquare, ChevronLeft, ChevronRight, Loader,
  ExternalLink, Copy, Edit2, Trash2, MoreVertical,
  RefreshCw, Save
} from 'lucide-react';
import { toast } from 'react-toastify';
import Database from '../../services/database';

/**
 * ReminderSidePanel - Right side drawer showing detailed reminder list
 * Opens when clicking on a date in the calendar
 */
const ReminderSidePanel = memo(({
  isOpen,
  onClose,
  date,
  reminders = [],
  onReminderAction,
  onEditReminder,
  onRefresh,
  loading = false
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedReminderId, setExpandedReminderId] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [editingClientId, setEditingClientId] = useState(null);
  const [editClientData, setEditClientData] = useState({ name: '', email: '', phone: '' });
  const itemsPerPage = 10;

  // Reset page when date changes
  useEffect(() => {
    setCurrentPage(1);
    setExpandedReminderId(null);
  }, [date]);

  // Pagination
  const totalPages = Math.ceil(reminders.length / itemsPerPage);
  const paginatedReminders = reminders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Get status display info
  const getStatusInfo = (reminder) => {
    const status = reminder.status;
    const scheduledDate = new Date(reminder.scheduledDate);
    const now = new Date();
    const hoursUntil = (scheduledDate - now) / (1000 * 60 * 60);

    if (status === 'completed') {
      return { color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200', icon: CheckCircle2, label: 'Completed' };
    }
    if (status === 'cancelled') {
      return { color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200', icon: X, label: 'Cancelled' };
    }
    if (hoursUntil < 0) {
      return { color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-200', icon: AlertCircle, label: 'Overdue' };
    }
    if (hoursUntil <= 24) {
      return { color: 'text-orange-600', bg: 'bg-orange-100', border: 'border-orange-200', icon: AlertTriangle, label: 'Due Soon' };
    }
    return { color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-200', icon: Clock, label: 'Scheduled' };
  };

  // Format date and time
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
  };

  // WhatsApp handler
  const handleWhatsApp = (reminder) => {
    const client = reminder.client || {};
    const project = reminder.project || {};
    
    if (!client.phone) {
      toast.warning('No phone number available. Click the edit icon to add client phone number.', {
        autoClose: 5000
      });
      return;
    }

    const message = encodeURIComponent(
      `Hi ${client.name || 'there'},\n\n` +
      `This is a follow-up regarding your project: ${project.name || 'Project'}\n\n` +
      `Scheduled Date: ${formatDateTime(reminder.scheduledDate).date}\n` +
      `Time: ${formatDateTime(reminder.scheduledDate).time}\n\n` +
      `${reminder.notes ? `Notes: ${reminder.notes}\n\n` : ''}` +
      `Please let us know if you have any questions.`
    );
    
    const phone = client.phone.replace(/[^0-9+]/g, '');
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
    toast.success('Opening WhatsApp...');
  };

  // Email handler
  const handleEmail = (reminder) => {
    const client = reminder.client || {};
    const project = reminder.project || {};
    
    if (!client.email) {
      toast.warning('No email address available. Click the edit icon to add client email.', {
        autoClose: 5000
      });
      return;
    }

    const subject = encodeURIComponent(`Follow-up: ${project.name || 'Project'}`);
    const body = encodeURIComponent(
      `Dear ${client.name || 'Valued Client'},\n\n` +
      `This is a follow-up regarding your project: ${project.name || 'Project'}\n\n` +
      `Scheduled Date: ${formatDateTime(reminder.scheduledDate).date}\n` +
      `Time: ${formatDateTime(reminder.scheduledDate).time}\n\n` +
      `${reminder.notes ? `Notes: ${reminder.notes}\n\n` : ''}` +
      `Please let us know if you have any questions or concerns.\n\n` +
      `Best regards`
    );
    
    window.location.href = `mailto:${client.email}?subject=${subject}&body=${body}`;
    toast.success('Opening email client...');
  };

  // Copy contact info
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  // Handle reminder actions
  const handleSendNow = async (reminder) => {
    setActionLoading(prev => ({ ...prev, [reminder._id]: 'send' }));
    try {
      await Database.sendReminderNow(reminder._id);
      toast.success('Reminder sent successfully!');
      onRefresh?.();
    } catch (error) {
      toast.error('Failed to send reminder');
    } finally {
      setActionLoading(prev => ({ ...prev, [reminder._id]: null }));
    }
  };

  const handleComplete = async (reminder) => {
    setActionLoading(prev => ({ ...prev, [reminder._id]: 'complete' }));
    try {
      await Database.completeReminder(reminder._id, 'Marked as complete');
      toast.success('Reminder marked as complete');
      onRefresh?.();
    } catch (error) {
      toast.error('Failed to complete reminder');
    } finally {
      setActionLoading(prev => ({ ...prev, [reminder._id]: null }));
    }
  };

  const handleCancel = async (reminder) => {
    if (!window.confirm('Are you sure you want to cancel this reminder?')) return;
    setActionLoading(prev => ({ ...prev, [reminder._id]: 'cancel' }));
    try {
      await Database.cancelReminder(reminder._id, 'Cancelled by user');
      toast.success('Reminder cancelled');
      onRefresh?.();
    } catch (error) {
      toast.error('Failed to cancel reminder');
    } finally {
      setActionLoading(prev => ({ ...prev, [reminder._id]: null }));
    }
  };

  // Start editing client info
  const startEditingClient = (reminder) => {
    setEditingClientId(reminder._id);
    setEditClientData({
      name: reminder.client?.name || '',
      email: reminder.client?.email || '',
      phone: reminder.client?.phone || ''
    });
  };

  // Save client info
  const saveClientInfo = async (reminder) => {
    setActionLoading(prev => ({ ...prev, [reminder._id]: 'saveClient' }));
    try {
      await Database.updateReminderClient(reminder._id, editClientData);
      toast.success('Client info updated successfully!');
      setEditingClientId(null);
      onRefresh?.();
    } catch (error) {
      toast.error('Failed to update client info');
    } finally {
      setActionLoading(prev => ({ ...prev, [reminder._id]: null }));
    }
  };

  // Sync client from project
  const syncClientFromProject = async (reminder) => {
    setActionLoading(prev => ({ ...prev, [reminder._id]: 'sync' }));
    try {
      await Database.syncReminderClientFromProject(reminder._id);
      toast.success('Client info synced from project!');
      onRefresh?.();
    } catch (error) {
      toast.error('Failed to sync client info: ' + error.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [reminder._id]: null }));
    }
  };

  const panelVariants = {
    hidden: { x: '100%', opacity: 0 },
    visible: { 
      x: 0, 
      opacity: 1,
      transition: { 
        type: 'spring', 
        damping: 30, 
        stiffness: 300 
      }
    },
    exit: { 
      x: '100%', 
      opacity: 0,
      transition: { duration: 0.2 }
    }
  };

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Side Panel */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">
                      {date ? new Date(date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric'
                      }) : 'Reminders'}
                    </h2>
                    <p className="text-indigo-100 text-sm">
                      {reminders.length} reminder{reminders.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X className="h-5 w-5" />
                </motion.button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader className="w-8 h-8 text-indigo-600 animate-spin" />
                </div>
              ) : reminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <Calendar className="w-16 h-16 text-gray-300 mb-4" />
                  <p className="font-medium">No reminders for this date</p>
                  <p className="text-sm text-gray-400">Select another date to view reminders</p>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {paginatedReminders.map((reminder, index) => {
                    const statusInfo = getStatusInfo(reminder);
                    const StatusIcon = statusInfo.icon;
                    const dateTime = formatDateTime(reminder.scheduledDate);
                    const isExpanded = expandedReminderId === reminder._id;
                    const isLoading = actionLoading[reminder._id];
                    const isActionable = reminder.status !== 'completed' && reminder.status !== 'cancelled';

                    return (
                      <motion.div
                        key={reminder._id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`
                          rounded-2xl border-2 overflow-hidden
                          transition-all duration-300
                          ${isExpanded ? 'shadow-lg' : 'shadow-sm hover:shadow-md'}
                          ${statusInfo.border}
                          bg-white
                        `}
                      >
                        {/* Reminder Header */}
                        <div
                          className="p-4 cursor-pointer"
                          onClick={() => setExpandedReminderId(isExpanded ? null : reminder._id)}
                        >
                          <div className="flex items-start gap-3">
                            {/* Status Icon */}
                            <div className={`p-2 rounded-xl ${statusInfo.bg}`}>
                              <StatusIcon className={`h-5 w-5 ${statusInfo.color}`} />
                            </div>

                            {/* Project & Client Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-gray-900 truncate">
                                  {reminder.project?.name || 'Unknown Project'}
                                </h3>
                                <span className={`
                                  text-xs font-medium px-2 py-0.5 rounded-full
                                  ${statusInfo.bg} ${statusInfo.color}
                                `}>
                                  {statusInfo.label}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <User className="h-3.5 w-3.5" />
                                <span className="truncate">
                                  {reminder.client?.name || 'No client'}
                                </span>
                              </div>

                              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>{dateTime.time}</span>
                                </div>
                                {reminder.frequency && reminder.frequency !== 'one-time' && (
                                  <span className="px-2 py-0.5 bg-gray-100 rounded-full">
                                    {reminder.frequency}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Expand indicator */}
                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              className="text-gray-400"
                            >
                              <ChevronRight className="h-5 w-5" />
                            </motion.div>
                          </div>
                        </div>

                        {/* Expanded Content */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-4">
                                {/* Client Details */}
                                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                      <User className="h-4 w-4" />
                                      Client Information
                                    </h4>
                                    <div className="flex items-center gap-1">
                                      {editingClientId === reminder._id ? (
                                        <>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              saveClientInfo(reminder);
                                            }}
                                            disabled={actionLoading[reminder._id] === 'saveClient'}
                                            className="p-1.5 bg-green-100 hover:bg-green-200 text-green-600 rounded-lg transition-colors"
                                            title="Save"
                                          >
                                            {actionLoading[reminder._id] === 'saveClient' ? (
                                              <Loader className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                              <Save className="h-3.5 w-3.5" />
                                            )}
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingClientId(null);
                                            }}
                                            className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                                            title="Cancel"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              startEditingClient(reminder);
                                            }}
                                            className="p-1.5 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-colors"
                                            title="Edit client info"
                                          >
                                            <Edit2 className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              syncClientFromProject(reminder);
                                            }}
                                            disabled={actionLoading[reminder._id] === 'sync'}
                                            className="p-1.5 bg-purple-100 hover:bg-purple-200 text-purple-600 rounded-lg transition-colors"
                                            title="Sync from project"
                                          >
                                            {actionLoading[reminder._id] === 'sync' ? (
                                              <Loader className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                              <RefreshCw className="h-3.5 w-3.5" />
                                            )}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {editingClientId === reminder._id ? (
                                    // Edit Mode
                                    <div className="grid grid-cols-1 gap-3">
                                      <div>
                                        <label className="text-xs text-gray-500 mb-1 block">Name</label>
                                        <input
                                          type="text"
                                          value={editClientData.name}
                                          onChange={(e) => setEditClientData(prev => ({ ...prev, name: e.target.value }))}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                          placeholder="Client name"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs text-gray-500 mb-1 block">Email</label>
                                        <input
                                          type="email"
                                          value={editClientData.email}
                                          onChange={(e) => setEditClientData(prev => ({ ...prev, email: e.target.value }))}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                          placeholder="client@email.com"
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs text-gray-500 mb-1 block">Phone (with country code)</label>
                                        <input
                                          type="tel"
                                          value={editClientData.phone}
                                          onChange={(e) => setEditClientData(prev => ({ ...prev, phone: e.target.value }))}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                          placeholder="+1234567890"
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    // Display Mode
                                    <div className="grid grid-cols-1 gap-2 text-sm">
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-500">Name:</span>
                                        <span className="font-medium text-gray-900">
                                          {reminder.client?.name || <span className="text-gray-400 italic">Not set</span>}
                                        </span>
                                      </div>
                                      
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-500 flex items-center gap-1">
                                          <Mail className="h-3.5 w-3.5" />
                                          Email:
                                        </span>
                                        <div className="flex items-center gap-2">
                                          {reminder.client?.email ? (
                                            <>
                                              <span className="text-gray-900 truncate max-w-[150px]">
                                                {reminder.client.email}
                                              </span>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  copyToClipboard(reminder.client.email, 'Email');
                                                }}
                                                className="p-1 hover:bg-gray-200 rounded"
                                              >
                                                <Copy className="h-3.5 w-3.5 text-gray-400" />
                                              </button>
                                            </>
                                          ) : (
                                            <span className="text-gray-400 italic">Not set</span>
                                          )}
                                        </div>
                                      </div>
                                      
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-500 flex items-center gap-1">
                                          <Phone className="h-3.5 w-3.5" />
                                          Phone:
                                        </span>
                                        <div className="flex items-center gap-2">
                                          {reminder.client?.phone ? (
                                            <>
                                              <span className="text-gray-900">
                                                {reminder.client.phone}
                                              </span>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  copyToClipboard(reminder.client.phone, 'Phone');
                                                }}
                                                className="p-1 hover:bg-gray-200 rounded"
                                              >
                                                <Copy className="h-3.5 w-3.5 text-gray-400" />
                                              </button>
                                            </>
                                          ) : (
                                            <span className="text-gray-400 italic">Not set</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Notes */}
                                {reminder.notes && (
                                  <div className="bg-indigo-50 rounded-xl p-4">
                                    <h4 className="text-sm font-semibold text-indigo-700 flex items-center gap-2 mb-2">
                                      <FileText className="h-4 w-4" />
                                      Notes
                                    </h4>
                                    <p className="text-sm text-gray-700">
                                      {reminder.notes}
                                    </p>
                                  </div>
                                )}

                                {/* Communication Shortcuts */}
                                <div className="flex gap-2">
                                  <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleWhatsApp(reminder);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors"
                                  >
                                    <MessageSquare className="h-4 w-4" />
                                    WhatsApp
                                  </motion.button>
                                  
                                  <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEmail(reminder);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors"
                                  >
                                    <Mail className="h-4 w-4" />
                                    Email
                                  </motion.button>
                                </div>

                                {/* Action Buttons */}
                                {isActionable && (
                                  <div className="flex gap-2 pt-2 border-t border-gray-100">
                                    <motion.button
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSendNow(reminder);
                                      }}
                                      disabled={isLoading === 'send'}
                                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
                                    >
                                      {isLoading === 'send' ? (
                                        <Loader className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Send className="h-4 w-4" />
                                      )}
                                      Send Now
                                    </motion.button>
                                    
                                    <motion.button
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleComplete(reminder);
                                      }}
                                      disabled={isLoading === 'complete'}
                                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-xl font-medium hover:bg-green-100 transition-colors disabled:opacity-50"
                                    >
                                      {isLoading === 'complete' ? (
                                        <Loader className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="h-4 w-4" />
                                      )}
                                      Complete
                                    </motion.button>
                                    
                                    <motion.button
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onEditReminder?.(reminder);
                                      }}
                                      className="p-2 bg-gray-50 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </motion.button>
                                    
                                    <motion.button
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancel(reminder);
                                      }}
                                      disabled={isLoading === 'cancel'}
                                      className="p-2 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50"
                                    >
                                      {isLoading === 'cancel' ? (
                                        <Loader className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </motion.button>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg bg-white border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg bg-white border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </motion.button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

ReminderSidePanel.displayName = 'ReminderSidePanel';

export default ReminderSidePanel;
