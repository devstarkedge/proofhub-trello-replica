import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Calendar, Clock, Bell, User, Mail, Phone, Copy,
  Send, Save, CheckCircle2, AlertCircle, ChevronDown,
  History, MessageSquare, Loader, ExternalLink, RefreshCw
} from 'lucide-react';
import { toast } from 'react-toastify';
import Database from '../services/database';

/**
 * ReminderModal - Full reminder management modal
 * Allows setting date/frequency, viewing client info, adding notes, and viewing history
 */
const ReminderModal = memo(({
  isOpen,
  onClose,
  projectId,
  projectName,
  clientInfo,
  onReminderCreated,
  existingReminder = null
}) => {
  const modalRef = useRef(null);
  const dateInputRef = useRef(null);

  // Form state
  const [formData, setFormData] = useState({
    scheduledDate: '',
    scheduledTime: '10:00',
    frequency: 'one-time',
    customIntervalDays: 7,
    notes: '',
    priority: 'medium'
  });
  
  const [loading, setLoading] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [errors, setErrors] = useState({});
  
  // Local client data state - allows real-time updates while modal is open
  const [liveClientInfo, setLiveClientInfo] = useState(null);

  // Initialize form with existing reminder data
  useEffect(() => {
    if (existingReminder) {
      const date = new Date(existingReminder.scheduledDate);
      setFormData({
        scheduledDate: date.toISOString().split('T')[0],
        scheduledTime: date.toTimeString().slice(0, 5),
        frequency: existingReminder.frequency || 'one-time',
        customIntervalDays: existingReminder.customIntervalDays || 7,
        notes: existingReminder.notes || '',
        priority: existingReminder.priority || 'medium'
      });
    } else {
      // Default to tomorrow at 10:00 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setFormData(prev => ({
        ...prev,
        scheduledDate: tomorrow.toISOString().split('T')[0],
        scheduledTime: '10:00'
      }));
    }
  }, [existingReminder, isOpen]);

  // Fetch reminder history
  const fetchHistory = useCallback(async () => {
    if (!projectId) return;
    
    try {
      setHistoryLoading(true);
      const response = await Database.getProjectReminders(projectId, { limit: 10 });
      if (response.success) {
        setHistory(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching reminder history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  // Fetch fresh client info from project and listen for real-time updates
  useEffect(() => {
    if (!isOpen || !projectId) {
      setLiveClientInfo(null);
      return;
    }

    // Fetch fresh client info from project
    const fetchFreshClientInfo = async () => {
      try {
        const response = await Database.getProject(projectId);
        if (response.success && response.data?.clientDetails) {
          setLiveClientInfo(response.data.clientDetails);
        }
      } catch (error) {
        console.error('Error fetching fresh client info:', error);
        // Fall back to clientInfo prop if fetch fails
      }
    };

    fetchFreshClientInfo();

    // Listen for project updates while modal is open
    const handleBoardUpdate = (event) => {
      const { boardId, updates } = event.detail || {};
      if (boardId === projectId && updates?.clientDetails) {
        console.log('Client details updated while modal open, refreshing...');
        setLiveClientInfo(updates.clientDetails);
      }
    };

    window.addEventListener('socket-board-updated', handleBoardUpdate);
    return () => window.removeEventListener('socket-board-updated', handleBoardUpdate);
  }, [isOpen, projectId]);

  // Handle escape key and focus trap
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      // Focus the modal for accessibility
      modalRef.current?.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Quick select date handlers
  const handleQuickSelect = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setFormData(prev => ({
      ...prev,
      scheduledDate: date.toISOString().split('T')[0]
    }));
    setErrors(prev => ({ ...prev, scheduledDate: '' }));
  };

  // Form validation
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.scheduledDate) {
      newErrors.scheduledDate = 'Please select a date';
    } else {
      const selectedDate = new Date(`${formData.scheduledDate}T${formData.scheduledTime}`);
      if (selectedDate <= new Date()) {
        newErrors.scheduledDate = 'Date must be in the future';
      }
    }

    if (formData.frequency === 'custom' && (!formData.customIntervalDays || formData.customIntervalDays < 1)) {
      newErrors.customIntervalDays = 'Please enter a valid interval';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (sendNow = false) => {
    if (!validateForm()) return;

    const setLoadingState = sendNow ? setSendingNow : setLoading;
    setLoadingState(true);

    try {
      const scheduledDateTime = new Date(`${formData.scheduledDate}T${formData.scheduledTime}`);
      
      const reminderData = {
        projectId,
        scheduledDate: scheduledDateTime.toISOString(),
        frequency: formData.frequency,
        customIntervalDays: formData.frequency === 'custom' ? formData.customIntervalDays : undefined,
        notes: formData.notes,
        priority: formData.priority
      };

      let response;
      if (existingReminder) {
        response = await Database.updateReminder(existingReminder._id, reminderData);
      } else {
        response = await Database.createReminder(reminderData);
      }

      if (response.success) {
        // If send now requested, trigger send
        if (sendNow && response.data?._id) {
          await Database.sendReminderNow(response.data._id);
          toast.success('Reminder saved and sent successfully!');
        } else {
          toast.success(existingReminder ? 'Reminder updated successfully!' : 'Reminder created successfully!');
        }
        
        onReminderCreated?.(response.data);
        onClose();
      } else {
        throw new Error(response.message || 'Failed to save reminder');
      }
    } catch (error) {
      console.error('Error saving reminder:', error);
      toast.error(error.message || 'Failed to save reminder');
    } finally {
      setLoadingState(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  // Format history timestamp
  const formatHistoryDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get status badge for history items
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

  if (!isOpen) return null;

  // Use live client info if available, otherwise fall back to prop
  const currentClientInfo = liveClientInfo || clientInfo || {};

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } 
    },
    exit: { 
      opacity: 0, 
      scale: 0.95, 
      y: 20,
      transition: { duration: 0.2 } 
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-70 p-4"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-modal-title"
      >
        <motion.div
          ref={modalRef}
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          tabIndex={-1}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ rotate: -180, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  className="bg-white/20 backdrop-blur-sm p-2.5 rounded-xl"
                >
                  <Bell className="h-5 w-5" />
                </motion.div>
                <div>
                  <h2 id="reminder-modal-title" className="text-xl font-bold">
                    {existingReminder ? 'Edit Reminder' : 'Set Reminder'}
                  </h2>
                  <p className="text-indigo-100 text-sm">{projectName}</p>
                </div>
              </div>
              
              {/* Client Avatar Preview */}
              {currentClientInfo?.clientName && (
                <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
                  <div className="h-7 w-7 rounded-full bg-white/30 flex items-center justify-center text-xs font-bold">
                    {currentClientInfo.clientName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium">{currentClientInfo.clientName}</span>
                </div>
              )}

              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </motion.button>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-180px)]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
              {/* Left Column - Date & Settings */}
              <div className="space-y-5">
                {/* Quick Select Buttons */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                    <Calendar className="h-4 w-4 text-indigo-600" />
                    Quick Select
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Tomorrow', days: 1 },
                      { label: '3 Days', days: 3 },
                      { label: '7 Days', days: 7 },
                      { label: '14 Days', days: 14 }
                    ].map((option) => (
                      <motion.button
                        key={option.days}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => handleQuickSelect(option.days)}
                        className="px-4 py-2 bg-gray-100 hover:bg-indigo-100 hover:text-indigo-700 text-gray-700 text-sm font-medium rounded-xl transition-colors"
                      >
                        {option.label}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Date & Time Picker */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      <Calendar className="h-4 w-4 text-indigo-600" />
                      Date *
                    </label>
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={formData.scheduledDate}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, scheduledDate: e.target.value }));
                        setErrors(prev => ({ ...prev, scheduledDate: '' }));
                      }}
                      min={new Date().toISOString().split('T')[0]}
                      className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                        errors.scheduledDate ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-indigo-300'
                      }`}
                      aria-invalid={!!errors.scheduledDate}
                      aria-describedby={errors.scheduledDate ? 'date-error' : undefined}
                    />
                    {errors.scheduledDate && (
                      <p id="date-error" className="text-red-600 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {errors.scheduledDate}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      <Clock className="h-4 w-4 text-indigo-600" />
                      Time
                    </label>
                    <input
                      type="time"
                      value={formData.scheduledTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                    />
                  </div>
                </div>

                {/* Frequency */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <RefreshCw className="h-4 w-4 text-indigo-600" />
                    Frequency
                  </label>
                  <div className="relative">
                    <select
                      value={formData.frequency}
                      onChange={(e) => setFormData(prev => ({ ...prev, frequency: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer hover:border-indigo-300"
                    >
                      <option value="one-time">One-time</option>
                      <option value="every-3-days">Every 3 days</option>
                      <option value="weekly">Weekly</option>
                      <option value="custom">Custom interval</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Custom Interval */}
                <AnimatePresence>
                  {formData.frequency === 'custom' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                        Repeat every (days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={formData.customIntervalDays}
                        onChange={(e) => setFormData(prev => ({ ...prev, customIntervalDays: parseInt(e.target.value) || 1 }))}
                        className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                          errors.customIntervalDays ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-indigo-300'
                        }`}
                      />
                      {errors.customIntervalDays && (
                        <p className="text-red-600 text-xs mt-1">{errors.customIntervalDays}</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Priority */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <AlertCircle className="h-4 w-4 text-indigo-600" />
                    Priority
                  </label>
                  <div className="flex gap-2">
                    {['low', 'medium', 'high'].map((priority) => (
                      <motion.button
                        key={priority}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, priority }))}
                        className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                          formData.priority === priority
                            ? priority === 'low' ? 'bg-green-500 text-white'
                              : priority === 'medium' ? 'bg-yellow-500 text-white'
                              : 'bg-red-500 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {priority.charAt(0).toUpperCase() + priority.slice(1)}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <MessageSquare className="h-4 w-4 text-indigo-600" />
                    Internal Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    maxLength={1000}
                    placeholder="Add notes about this reminder (internal only)..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none hover:border-indigo-300"
                  />
                  <p className="text-xs text-gray-400 mt-1 text-right">
                    {formData.notes.length}/1000
                  </p>
                </div>
              </div>

              {/* Right Column - Client Info & History */}
              <div className="space-y-5">
                {/* Client Contact Preview */}
                <div className="bg-gradient-to-br from-gray-50 to-indigo-50 rounded-2xl p-5 border border-gray-200">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
                    <User className="h-4 w-4 text-indigo-600" />
                    Client Information
                  </h3>
                  
                  {currentClientInfo?.clientName || currentClientInfo?.clientEmail || currentClientInfo?.clientWhatsappNumber ? (
                    <div className="space-y-3">
                      {currentClientInfo.clientName && (
                        <div className="flex items-center justify-between p-3 bg-white rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                              {currentClientInfo.clientName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{currentClientInfo.clientName}</p>
                              <p className="text-xs text-gray-500">Client</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {currentClientInfo.clientEmail && (
                        <div className="flex items-center justify-between p-3 bg-white rounded-xl group">
                          <div className="flex items-center gap-3">
                            <Mail className="h-5 w-5 text-gray-400" />
                            <span className="text-sm text-gray-700">{currentClientInfo.clientEmail}</span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => copyToClipboard(currentClientInfo.clientEmail, 'Email')}
                              className="p-1.5 hover:bg-gray-100 rounded-lg"
                              aria-label="Copy email"
                            >
                              <Copy className="h-4 w-4 text-gray-500" />
                            </motion.button>
                            <motion.a
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              href={`mailto:${currentClientInfo.clientEmail}`}
                              className="p-1.5 hover:bg-gray-100 rounded-lg"
                              aria-label="Send email"
                            >
                              <ExternalLink className="h-4 w-4 text-gray-500" />
                            </motion.a>
                          </div>
                        </div>
                      )}

                      {currentClientInfo.clientWhatsappNumber && (
                        <div className="flex items-center justify-between p-3 bg-white rounded-xl group">
                          <div className="flex items-center gap-3">
                            <Phone className="h-5 w-5 text-gray-400" />
                            <span className="text-sm text-gray-700">{currentClientInfo.clientWhatsappNumber}</span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => copyToClipboard(currentClientInfo.clientWhatsappNumber, 'Phone')}
                              className="p-1.5 hover:bg-gray-100 rounded-lg"
                              aria-label="Copy phone"
                            >
                              <Copy className="h-4 w-4 text-gray-500" />
                            </motion.button>
                            <motion.a
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              href={`https://wa.me/${currentClientInfo.clientWhatsappNumber.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 hover:bg-gray-100 rounded-lg"
                              aria-label="Open WhatsApp"
                            >
                              <ExternalLink className="h-4 w-4 text-gray-500" />
                            </motion.a>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No client information available
                    </p>
                  )}
                </div>

                {/* Reminder History */}
                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
                    <History className="h-4 w-4 text-indigo-600" />
                    Reminder History
                  </h3>

                  {historyLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader className="h-6 w-6 animate-spin text-indigo-600" />
                    </div>
                  ) : history.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                      {history.map((item) => {
                        const statusBadge = getStatusBadge(item.status);
                        return (
                          <motion.div
                            key={item._id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-white p-3 rounded-xl border border-gray-100"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-500">
                                {formatHistoryDate(item.scheduledDate)}
                              </span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge.bg} ${statusBadge.text}`}>
                                {statusBadge.label}
                              </span>
                            </div>
                            {item.notes && (
                              <p className="text-sm text-gray-600 line-clamp-2">{item.notes}</p>
                            )}
                            {item.createdBy && (
                              <p className="text-xs text-gray-400 mt-1">
                                By {item.createdBy.name}
                              </p>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No reminder history yet
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 font-semibold transition-all"
            >
              Cancel
            </motion.button>
            
            <div className="flex gap-3 w-full sm:w-auto">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={sendingNow || loading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-white border-2 border-indigo-600 text-indigo-600 rounded-xl hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all"
              >
                {sendingNow ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Save & Send Now
                  </>
                )}
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={loading || sendingNow}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-lg shadow-indigo-500/30"
              >
                {loading ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Reminder
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

ReminderModal.displayName = 'ReminderModal';

export default ReminderModal;
