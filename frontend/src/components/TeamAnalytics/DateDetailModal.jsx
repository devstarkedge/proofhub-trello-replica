import React, { useState, useEffect, memo, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Clock, Calendar, ChevronDown, ChevronRight,
  AlertTriangle, Flame, CheckCircle2, Folder, FileText,
  Layers, ExternalLink
} from 'lucide-react';
import Database from '../../services/database';

// Lazy load detail modals
const CardDetailModal = lazy(() => import('../CardDetailModal'));
const SubtaskDetailModal = lazy(() => import('../SubtaskDetailModal'));
const SubtaskNanoModal = lazy(() => import('../SubtaskNanoModal'));

/**
 * Detailed modal view showing full hierarchical breakdown of logged time
 * Task → Subtask → Neno Subtask → Time Entries
 */
const DateDetailModal = memo(({ 
  userId, 
  date, 
  isOpen, 
  onClose,
  userName,
  userAvatar
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [expandedSubtasks, setExpandedSubtasks] = useState(new Set());
  
  // Detail modal states - store full objects, not just IDs
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedSubtask, setSelectedSubtask] = useState(null);
  const [selectedNano, setSelectedNano] = useState(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  const navigate = useNavigate();

  // Handlers to open detail modals by fetching full data first
  const handleOpenCard = (taskItem) => {
    // Navigate to workflow page with taskId in URL
    const task = taskItem.task;
    const departmentId = task.departmentId;
    const projectId = task.projectId;
    const taskId = task._id;
    
    if (departmentId && projectId && taskId) {
      navigate(`/workflow/${departmentId}/${projectId}/${taskId}`);
    }
  };

  const handleOpenSubtask = async (subtaskId) => {
    setDrilldownLoading(true);
    try {
      const response = await Database.getSubtask(subtaskId);
      if (response.data) {
        setSelectedSubtask(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch subtask:', err);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const handleOpenNano = async (nanoId) => {
    setDrilldownLoading(true);
    try {
      const response = await Database.getSubtaskNano(nanoId);
      if (response.data) {
        setSelectedNano(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch nano subtask:', err);
    } finally {
      setDrilldownLoading(false);
    }
  };

  // Fetch data when modal opens
  useEffect(() => {
    if (!isOpen || !userId || !date) {
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await Database.getDateDetailedLogs(userId, date);
        setData(response.data);
        // Auto-expand first task
        if (response.data?.hierarchy?.length > 0) {
          setExpandedTasks(new Set([response.data.hierarchy[0].task._id]));
        }
      } catch (err) {
        console.error('Failed to fetch detailed logs:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, userId, date]);

  // Toggle expand/collapse
  const toggleTask = useCallback((taskId) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const toggleSubtask = useCallback((subtaskId) => {
    setExpandedSubtasks(prev => {
      const next = new Set(prev);
      if (next.has(subtaskId)) {
        next.delete(subtaskId);
      } else {
        next.add(subtaskId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!data?.hierarchy) return;
    const allTasks = new Set(data.hierarchy.map(t => t.task._id));
    const allSubtasks = new Set();
    data.hierarchy.forEach(t => {
      t.subtasks?.forEach(s => allSubtasks.add(s.subtask._id));
    });
    setExpandedTasks(allTasks);
    setExpandedSubtasks(allSubtasks);
  }, [data]);

  const collapseAll = useCallback(() => {
    setExpandedTasks(new Set());
    setExpandedSubtasks(new Set());
  }, []);

  // Status helpers
  const getStatusBadge = () => {
    if (!data) return null;
    if (data.status === 'over-logged') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
          <Flame className="w-3 h-3" />
          Over-logged
        </span>
      );
    }
    if (data.status === 'under-logged') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
          <AlertTriangle className="w-3 h-3" />
          Under-logged
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" />
        On Track
      </span>
    );
  };

  // Time entry component
  const TimeEntry = ({ entry, source }) => (
    <div className="flex items-start gap-3 py-2 px-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <div className="flex-shrink-0 mt-0.5">
        <Clock className="w-4 h-4 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-gray-900">
            {entry.formatted}
          </span>
          <span className={`
            text-xs px-1.5 py-0.5 rounded font-medium
            ${source === 'Task' ? 'bg-blue-100 text-blue-700' : 
              source === 'Subtask' ? 'bg-purple-100 text-purple-700' : 
              'bg-pink-100 text-pink-700'}
          `}>
            {source}
          </span>
        </div>
        {entry.description && (
          <p className="text-xs text-gray-500 line-clamp-2">{entry.description}</p>
        )}
        <div className="text-xs text-gray-400 mt-1">
          {new Date(entry.date).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
          {entry.userName && <span className="ml-2">by {entry.userName}</span>}
        </div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {(userAvatar || data?.userAvatar) ? (
                    <img 
                      src={userAvatar || data?.userAvatar} 
                      alt={userName || data?.userName}
                      className="w-12 h-12 rounded-full border-2 border-white/30 object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg">
                      {(userName || data?.userName || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-semibold">
                      {userName || data?.userName || 'User'}
                    </h2>
                    <div className="flex items-center gap-2 text-white/80 text-sm">
                      <Calendar className="w-4 h-4" />
                      {new Date(date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {data?.totalFormatted || '0h 0m'}
                    </div>
                    <div className="text-white/70 text-xs">
                      Expected: {Math.floor((data?.expectedMinutes || 480) / 60)}h
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Status & Controls */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/20">
                <div className="flex items-center gap-2">
                  {getStatusBadge()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={expandAll}
                    className="text-xs text-white/80 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={collapseAll}
                    className="text-xs text-white/80 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
                  >
                    Collapse All
                  </button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-gray-500">Loading detailed logs...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
                  <p className="text-red-500">{error}</p>
                </div>
              ) : data?.hierarchy?.length > 0 ? (
                <div className="space-y-4">
                  {data.hierarchy.map((taskItem) => (
                    <div 
                      key={taskItem.task._id}
                      className="border border-gray-200 rounded-xl overflow-hidden"
                    >
                      {/* Task Header */}
                      <div 
                        className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => toggleTask(taskItem.task._id)}
                      >
                        <div className="flex-shrink-0">
                          {expandedTasks.has(taskItem.task._id) ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: taskItem.task.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Folder className="w-4 h-4 text-blue-500" />
                            <span className="font-medium text-gray-900 truncate">
                              {taskItem.task.title}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenCard(taskItem);
                              }}
                              className="p-1 hover:bg-blue-100 rounded transition-colors"
                              title="Open task details"
                              disabled={drilldownLoading}
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                            </button>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {taskItem.task.projectName}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-gray-700">
                          {Math.floor(taskItem.totalMinutes / 60)}h {taskItem.totalMinutes % 60}m
                        </div>
                      </div>

                      {/* Task Content */}
                      {expandedTasks.has(taskItem.task._id) && (
                        <div className="px-4 pb-4 pt-2 space-y-3">
                          {/* Direct Task Entries */}
                          {taskItem.directEntries?.length > 0 && (
                            <div className="space-y-2">
                              {taskItem.directEntries.map((entry, idx) => (
                                <TimeEntry key={entry._id || idx} entry={entry} source="Task" />
                              ))}
                            </div>
                          )}

                          {/* Subtasks */}
                          {taskItem.subtasks?.length > 0 && (
                            <div className="space-y-2 ml-4">
                              {taskItem.subtasks.map((subtaskItem) => (
                                <div 
                                  key={subtaskItem.subtask._id}
                                  className="border border-gray-100 rounded-lg overflow-hidden"
                                >
                                  {/* Subtask Header */}
                                  <div 
                                    className="flex items-center gap-2 px-3 py-2 bg-purple-50/50 cursor-pointer hover:bg-purple-50 transition-colors"
                                    onClick={() => toggleSubtask(subtaskItem.subtask._id)}
                                  >
                                    <div className="flex-shrink-0">
                                      {expandedSubtasks.has(subtaskItem.subtask._id) ? (
                                        <ChevronDown className="w-4 h-4 text-gray-400" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-gray-400" />
                                      )}
                                    </div>
                                    <FileText className="w-4 h-4 text-purple-500" />
                                    <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                                      {subtaskItem.subtask.title}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenSubtask(subtaskItem.subtask._id);
                                      }}
                                      className="p-1 hover:bg-purple-100 rounded transition-colors"
                                      title="Open subtask details"
                                      disabled={drilldownLoading}
                                    >
                                      <ExternalLink className="w-3 h-3 text-purple-500" />
                                    </button>
                                    <span className="text-xs font-medium text-gray-600">
                                      {Math.floor(subtaskItem.totalMinutes / 60)}h {subtaskItem.totalMinutes % 60}m
                                    </span>
                                  </div>

                                  {/* Subtask Content */}
                                  {expandedSubtasks.has(subtaskItem.subtask._id) && (
                                    <div className="px-3 pb-3 pt-2 space-y-2">
                                      {/* Direct Subtask Entries */}
                                      {subtaskItem.directEntries?.map((entry, idx) => (
                                        <TimeEntry key={entry._id || idx} entry={entry} source="Subtask" />
                                      ))}

                                      {/* Nano Subtasks */}
                                      {subtaskItem.nanoSubtasks?.length > 0 && (
                                        <div className="space-y-2 ml-3">
                                          {subtaskItem.nanoSubtasks.map((nanoItem) => (
                                            <div 
                                              key={nanoItem.nano._id}
                                              className="border border-gray-100 rounded-lg overflow-hidden"
                                            >
                                              <div className="flex items-center gap-2 px-3 py-2 bg-pink-50/50">
                                                <Layers className="w-3.5 h-3.5 text-pink-500" />
                                                <span className="flex-1 text-xs font-medium text-gray-700 truncate">
                                                  {nanoItem.nano.title}
                                                </span>
                                                <button
                                                  onClick={() => handleOpenNano(nanoItem.nano._id)}
                                                  className="p-1 hover:bg-pink-100 rounded transition-colors"
                                                  title="Open neno details"
                                                  disabled={drilldownLoading}
                                                >
                                                  <ExternalLink className="w-3 h-3 text-pink-500" />
                                                </button>
                                                <span className="text-xs font-medium text-gray-600">
                                                  {Math.floor(nanoItem.totalMinutes / 60)}h {nanoItem.totalMinutes % 60}m
                                                </span>
                                              </div>
                                              {nanoItem.entries?.length > 0 && (
                                                <div className="px-3 pb-2 space-y-1.5 pt-1.5">
                                                  {nanoItem.entries.map((entry, idx) => (
                                                    <TimeEntry key={entry._id || idx} entry={entry} source="Neno Subtask" />
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Clock className="w-12 h-12 mb-4" />
                  <p>No time logged on this date</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Drill-down modals */}
      <Suspense fallback={null}>
        {selectedCard && (
          <CardDetailModal
            card={selectedCard}
            onClose={() => setSelectedCard(null)}
          />
        )}
        {selectedSubtask && (
          <SubtaskDetailModal
            subtask={selectedSubtask}
            onClose={() => setSelectedSubtask(null)}
          />
        )}
        {selectedNano && (
          <SubtaskNanoModal
            nano={selectedNano}
            onClose={() => setSelectedNano(null)}
          />
        )}
      </Suspense>
    </>
  );
});

DateDetailModal.displayName = 'DateDetailModal';

export default DateDetailModal;
