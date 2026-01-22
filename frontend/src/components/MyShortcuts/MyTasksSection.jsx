import React, { memo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckSquare, ChevronRight, ChevronDown, RefreshCw, 
  AlertCircle, Calendar, FolderKanban, Clock 
} from 'lucide-react';
import useMyShortcutsStore from '../../store/myShortcutsStore';

const MyTasksSection = () => {
  const navigate = useNavigate();
  const { tasksGrouped, totalTasks, loading, errors, fetchTasksGrouped } = useMyShortcutsStore();
  const [expandedProjects, setExpandedProjects] = useState({});

  const toggleProject = useCallback((projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  }, []);

  const handleTaskClick = useCallback((task) => {
    const { departmentId, projectId, taskId } = task.navigationContext || {};
    if (departmentId && projectId && taskId) {
      navigate(`/workflow/${departmentId}/${projectId}/${taskId}`);
    }
  }, [navigate]);

  const getStatusColor = (status) => {
    const colors = {
      'to-do': 'bg-gray-100 text-gray-700',
      'in-progress': 'bg-blue-100 text-blue-700',
      'done': 'bg-green-100 text-green-700',
      'review': 'bg-purple-100 text-purple-700',
      'blocked': 'bg-red-100 text-red-700'
    };
    return colors[status?.toLowerCase()] || colors['to-do'];
  };

  const getPriorityColor = (priority) => {
    const colors = {
      'high': 'text-red-500',
      'medium': 'text-orange-500',
      'low': 'text-green-500'
    };
    return colors[priority?.toLowerCase()] || 'text-gray-400';
  };

  const formatDueDate = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diff = d - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return { text: `${Math.abs(days)}d overdue`, isOverdue: true };
    if (days === 0) return { text: 'Due today', isOverdue: false };
    if (days === 1) return { text: 'Due tomorrow', isOverdue: false };
    return { text: `Due in ${days}d`, isOverdue: false };
  };

  if (loading.tasks && tasksGrouped.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="w-40 h-5 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="border border-gray-100 rounded-xl p-4">
              <div className="w-32 h-4 bg-gray-200 rounded animate-pulse mb-3"></div>
              <div className="space-y-2">
                {[1, 2, 3].map(j => (
                  <div key={j} className="h-12 bg-gray-100 rounded-lg animate-pulse"></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (errors.tasks) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-red-100">
        <div className="flex items-center gap-3 text-red-500 mb-4">
          <AlertCircle size={20} />
          <span>Failed to load tasks</span>
        </div>
        <button 
          onClick={fetchTasksGrouped}
          className="text-sm text-blue-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
            <CheckSquare className="text-white" size={18} />
          </div>
          My Tasks
          <span className="text-sm font-normal text-gray-500">({totalTasks} total)</span>
        </h2>
        <button
          onClick={fetchTasksGrouped}
          disabled={loading.tasks}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw size={16} className={loading.tasks ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
      </div>

      {tasksGrouped.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <CheckSquare size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No tasks assigned to you</p>
          <p className="text-sm mt-1">Tasks assigned to you will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasksGrouped.map((projectGroup, index) => {
            const isExpanded = expandedProjects[projectGroup.project._id] !== false; // Default to expanded
            
            return (
              <motion.div
                key={projectGroup.project._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="border border-gray-100 rounded-xl overflow-hidden"
              >
                {/* Project Header */}
                <button
                  onClick={() => toggleProject(projectGroup.project._id)}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FolderKanban size={18} className="text-indigo-500" />
                    <span className="font-medium text-gray-900">{projectGroup.project.name}</span>
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                      {projectGroup.taskCount} tasks
                    </span>
                  </div>
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown size={18} className="text-gray-400" />
                  </motion.div>
                </button>

                {/* Tasks List */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="p-2 space-y-1">
                        {projectGroup.tasks.map((task) => {
                          const dueInfo = formatDueDate(task.dueDate);
                          
                          return (
                            <motion.div
                              key={task._id}
                              whileHover={{ x: 4 }}
                              onClick={() => handleTaskClick(task)}
                              className="flex items-center justify-between p-3 hover:bg-blue-50 rounded-lg cursor-pointer transition-all group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-2 h-2 rounded-full ${getPriorityColor(task.priority)}`} style={{ backgroundColor: 'currentColor' }}></div>
                                <span className="text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                                  {task.title}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {dueInfo && (
                                  <span className={`text-xs flex items-center gap-1 ${dueInfo.isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                                    <Clock size={12} />
                                    {dueInfo.text}
                                  </span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(task.status)}`}>
                                  {task.status || 'To Do'}
                                </span>
                                <ChevronRight size={16} className="text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                              </div>
                            </motion.div>
                          );
                        })}
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
  );
};

export default memo(MyTasksSection);
