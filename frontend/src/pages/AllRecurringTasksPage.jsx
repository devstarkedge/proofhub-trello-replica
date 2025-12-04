import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Calendar, Clock, User, Edit2, Trash2, ChevronLeft,
  Play, Pause, AlertCircle, Check, X, MoreVertical, Search, Filter
} from 'lucide-react';
import { toast } from 'react-toastify';
import Database from '../services/database';
import RecurringSettingsModal from '../components/RecurringSettingsModal';
import { useDebounce } from '../hooks/useDebounce';

const SCHEDULE_TYPE_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  daysAfter: 'Days After',
  custom: 'Custom'
};

const BEHAVIOR_LABELS = {
  whenComplete: 'When Complete',
  whenDone: 'When Done',
  onSchedule: 'On Schedule'
};

const AllRecurringTasksPage = ({ boardId, boardName, onBack, onOpenCard }) => {
  const [recurrences, setRecurrences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebounce(searchQuery, 200);
  const [filterActive, setFilterActive] = useState('all'); // 'all', 'active', 'inactive'
  const [selectedRecurrence, setSelectedRecurrence] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(null);

  useEffect(() => {
    loadRecurrences();
  }, [boardId]);

  const loadRecurrences = async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      const response = await Database.getAllRecurrences(boardId, true);
      setRecurrences(response.data || []);
    } catch (error) {
      console.error('Error loading recurrences:', error);
      toast.error('Failed to load recurring tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (recurrence) => {
    try {
      await Database.updateRecurrence(recurrence._id, { isActive: !recurrence.isActive });
      setRecurrences(recurrences.map(r => 
        r._id === recurrence._id ? { ...r, isActive: !r.isActive } : r
      ));
      toast.success(recurrence.isActive ? 'Recurrence paused' : 'Recurrence resumed');
    } catch (error) {
      console.error('Error toggling recurrence:', error);
      toast.error('Failed to update recurrence');
    }
  };

  // Stop recurrence (soft delete - keeps in list with "Stopped" tag)
  const handleStopRecurrence = async (recurrenceId) => {
    if (!window.confirm('Are you sure you want to stop this recurring task? It will remain visible with a "Stopped" status.')) return;
    
    setActionMenuOpen(null);
    try {
      await Database.deleteRecurrence(recurrenceId, false); // soft delete
      setRecurrences(recurrences.map(r => 
        r._id === recurrenceId ? { ...r, isActive: false } : r
      ));
      toast.success('Recurring task stopped');
    } catch (error) {
      console.error('Error stopping recurrence:', error);
      toast.error('Failed to stop recurrence');
    }
  };

  // Permanently delete recurrence from database
  const handlePermanentDelete = async (recurrenceId) => {
    if (!window.confirm('Are you sure you want to permanently delete this recurring task? This action cannot be undone.')) return;
    
    setActionMenuOpen(null);
    try {
      await Database.deleteRecurrence(recurrenceId, true); // hard delete
      setRecurrences(recurrences.filter(r => r._id !== recurrenceId));
      toast.success('Recurring task deleted permanently');
    } catch (error) {
      console.error('Error deleting recurrence:', error);
      toast.error('Failed to delete recurrence');
    }
  };

  const handleDelete = async (recurrenceId) => {
    if (!window.confirm('Are you sure you want to stop this recurring task?')) return;
    
    try {
      await Database.deleteRecurrence(recurrenceId);
      setRecurrences(recurrences.filter(r => r._id !== recurrenceId));
      toast.success('Recurring task stopped');
    } catch (error) {
      console.error('Error deleting recurrence:', error);
      toast.error('Failed to delete recurrence');
    }
  };

  const handleEdit = (recurrence) => {
    setSelectedRecurrence(recurrence);
    setShowEditModal(true);
    setActionMenuOpen(null);
  };

  const handleSaveRecurrence = async (recurrenceData) => {
    try {
      await Database.updateRecurrence(selectedRecurrence._id, recurrenceData);
      await loadRecurrences();
      setShowEditModal(false);
      setSelectedRecurrence(null);
    } catch (error) {
      console.error('Error updating recurrence:', error);
      throw error;
    }
  };

  const handleDeleteRecurrence = async (recurrenceId) => {
    try {
      await Database.deleteRecurrence(recurrenceId);
      await loadRecurrences();
      setShowEditModal(false);
      setSelectedRecurrence(null);
    } catch (error) {
      console.error('Error deleting recurrence:', error);
      throw error;
    }
  };

  const handleTriggerRecurrence = async (recurrenceId) => {
    try {
      await Database.triggerRecurrence(recurrenceId);
      await loadRecurrences();
      toast.success('Next instance created');
    } catch (error) {
      console.error('Error triggering recurrence:', error);
      toast.error('Failed to create next instance');
    }
    setActionMenuOpen(null);
  };

  const getScheduleDescription = (recurrence) => {
    const type = recurrence.scheduleType;
    switch (type) {
      case 'daily':
        return recurrence.dailyOptions?.skipWeekends ? 'Every weekday' : 'Every day';
      case 'weekly':
        const days = recurrence.weeklyOptions?.daysOfWeek || [];
        const dayNames = days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
        return `Weekly on ${dayNames}`;
      case 'monthly':
        const monthlyType = recurrence.monthlyOptions?.type;
        if (monthlyType === 'sameDate') return `Day ${recurrence.monthlyOptions?.dayOfMonth || 1} of month`;
        if (monthlyType === 'firstDay') return 'First day of month';
        if (monthlyType === 'lastDay') return 'Last day of month';
        return 'Monthly';
      case 'yearly':
        return 'Yearly';
      case 'daysAfter':
        return `${recurrence.daysAfterOptions?.days || 1} days after completion`;
      case 'custom':
        return `Every ${recurrence.customOptions?.repeatEveryDays || 1} days`;
      default:
        return 'Custom';
    }
  };

  // OPTIMIZED: Use memoized filter with debounced search query
  const filteredRecurrences = useMemo(() => {
    return recurrences.filter(r => {
      // Filter by active status
      if (filterActive === 'active' && !r.isActive) return false;
      if (filterActive === 'inactive' && r.isActive) return false;
      
      // Filter by debounced search query (prevents filtering on every keystroke)
      if (debouncedSearchQuery) {
        const cardTitle = r.card?.title?.toLowerCase() || '';
        const template = r.subtaskTemplate?.title?.toLowerCase() || '';
        const query = debouncedSearchQuery.toLowerCase();
        if (!cardTitle.includes(query) && !template.includes(query)) return false;
      }
      
      return true;
    });
  }, [recurrences, filterActive, debouncedSearchQuery]);

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={onBack}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ChevronLeft size={20} />
                  Back
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <RefreshCw className="text-blue-600" size={24} />
                    All Recurring Tasks
                  </h1>
                  <p className="text-sm text-gray-500">{boardName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search recurring tasks..."
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
                  />
                </div>
                <select
                  value={filterActive}
                  onChange={(e) => setFilterActive(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Tasks</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="animate-spin text-blue-600" size={32} />
            </div>
          ) : filteredRecurrences.length === 0 ? (
            <div className="text-center py-12">
              <RefreshCw className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No recurring tasks found</h3>
              <p className="text-gray-500">
                {searchQuery || filterActive !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Set up recurring tasks from the task detail modal'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecurrences.map((recurrence) => (
                <motion.div
                  key={recurrence._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white rounded-xl border shadow-sm ${
                    recurrence.isActive ? 'border-gray-200' : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  <div className="p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: Task Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <button
                            onClick={() => onOpenCard?.(recurrence.card)}
                            className="text-lg font-semibold text-gray-900 hover:text-blue-600 truncate transition-colors"
                          >
                            {recurrence.card?.title || 'Unknown Task'}
                          </button>
                          {!recurrence.isActive && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-medium">
                              Stopped
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <RefreshCw size={14} className="text-blue-500" />
                            <span>{getScheduleDescription(recurrence)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock size={14} className="text-gray-400" />
                            <span>{BEHAVIOR_LABELS[recurrence.recurBehavior] || 'On Schedule'}</span>
                          </div>
                          {recurrence.nextOccurrence && (
                            <div className="flex items-center gap-1.5">
                              <Calendar size={14} className="text-green-500" />
                              <span>
                                Next: {new Date(recurrence.nextOccurrence).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Check size={14} className="text-purple-500" />
                            <span>{recurrence.completedOccurrences || 0} instances created</span>
                          </div>
                        </div>

                        {/* Assignees */}
                        {recurrence.subtaskTemplate?.assignees?.length > 0 && (
                          <div className="flex items-center gap-2 mt-4">
                            <User size={15} className="text-gray-400" />
                            <div className="flex -space-x-2">
                              {recurrence.subtaskTemplate.assignees.slice(0, 5).map((assignee, idx) => (
                                <div
                                  key={assignee._id || idx}
                                  className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs border-2 border-white"
                                  title={assignee.name}
                                >
                                  {assignee.name?.[0]?.toUpperCase() || '?'}
                                </div>
                              ))}
                              {recurrence.subtaskTemplate.assignees.length > 5 && (
                                <div className="w-7 h-7 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center text-xs border-2 border-white">
                                  +{recurrence.subtaskTemplate.assignees.length - 5}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleActive(recurrence)}
                          className={`p-2 rounded-lg transition-colors ${
                            recurrence.isActive
                              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                          title={recurrence.isActive ? 'Pause' : 'Resume'}
                        >
                          {recurrence.isActive ? <Pause size={18} /> : <Play size={18} />}
                        </button>
                        <button
                          onClick={() => handleEdit(recurrence)}
                          className="p-2 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => setActionMenuOpen(actionMenuOpen === recurrence._id ? null : recurrence._id)}
                            className="p-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                          >
                            <MoreVertical size={18} />
                          </button>
                          
                          <AnimatePresence>
                            {actionMenuOpen === recurrence._id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                              >
                                <button
                                  onClick={() => handleTriggerRecurrence(recurrence._id)}
                                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                                >
                                  <RefreshCw size={16} />
                                  Create Next Instance
                                </button>
                                <button
                                  onClick={() => onOpenCard?.(recurrence.card)}
                                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                                >
                                  <Calendar size={16} />
                                  View Parent Task
                                </button>
                                <hr className="my-1" />
                                {recurrence.isActive && (
                                  <button
                                    onClick={() => handleStopRecurrence(recurrence._id)}
                                    className="w-full px-4 py-2 text-left text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2"
                                  >
                                    <Pause size={16} />
                                    Stop Recurrence
                                  </button>
                                )}
                                <button
                                  onClick={() => handlePermanentDelete(recurrence._id)}
                                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                >
                                  <Trash2 size={16} />
                                  Delete Permanently
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>

                    {/* End Condition Info */}
                    {recurrence.endCondition?.type !== 'never' && (
                      <div className="mt-4 pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <AlertCircle size={14} />
                          {recurrence.endCondition?.type === 'afterOccurrences' && (
                            <span>
                              Ends after {recurrence.endCondition.occurrences} occurrences
                              ({recurrence.completedOccurrences || 0}/{recurrence.endCondition.occurrences} completed)
                            </span>
                          )}
                          {recurrence.endCondition?.type === 'onDate' && (
                            <span>
                              Ends on {new Date(recurrence.endCondition.endDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedRecurrence && (
        <RecurringSettingsModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedRecurrence(null);
          }}
          card={selectedRecurrence.card}
          existingRecurrence={selectedRecurrence}
          onSave={handleSaveRecurrence}
          onDelete={handleDeleteRecurrence}
        />
      )}

      {/* Click outside to close action menu */}
      {actionMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setActionMenuOpen(null)}
        />
      )}
    </div>
  );
};

export default AllRecurringTasksPage;
