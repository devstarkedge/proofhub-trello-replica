import React, { useState, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Calendar,
  Loader2,
  ChevronDown,
  Building2,
  FolderOpen,
  ListTodo,
  Type,
  FileText,
  Check
} from 'lucide-react';
import Database from '../../services/database';
import { toast } from 'react-toastify';
import DatePickerModal from '../DatePickerModal';

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: { duration: 0.15 }
  }
};

const CalendarTaskModal = memo(({
  isOpen,
  onClose,
  selectedDate,
  departmentId: initialDepartmentId,
  onTaskCreated
}) => {
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startDate: '',
    dueDate: '',
    departmentId: '',
    projectId: '',
    listId: '',
    priority: null,
    assignees: []
  });

  // Data state
  const [departments, setDepartments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [lists, setLists] = useState([]);

  // Loading states
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Date picker state
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        title: '',
        description: '',
        startDate: selectedDate ? new Date(selectedDate).toISOString().split('T')[0] : '',
        dueDate: '',
        departmentId: initialDepartmentId || '',
        projectId: '',
        listId: '',
        priority: null,
        assignees: []
      });
      setProjects([]);
      setLists([]);

      // Load departments
      fetchDepartments();

      // If initial department provided, load projects
      if (initialDepartmentId) {
        fetchProjects(initialDepartmentId);
      }
    }
  }, [isOpen, selectedDate, initialDepartmentId]);

  // Fetch departments
  const fetchDepartments = async () => {
    setLoadingDepartments(true);
    try {
      const response = await Database.getDepartments();
      if (response.success) {
        setDepartments(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
      toast.error('Failed to load departments');
    } finally {
      setLoadingDepartments(false);
    }
  };

  // Fetch projects for department
  const fetchProjects = async (departmentId) => {
    if (!departmentId) {
      setProjects([]);
      return;
    }

    setLoadingProjects(true);
    try {
      const response = await Database.getCalendarProjects(departmentId);
      if (response.success) {
        setProjects(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setLoadingProjects(false);
    }
  };

  // Fetch lists for project
  const fetchLists = async (projectId) => {
    if (!projectId) {
      setLists([]);
      return;
    }

    setLoadingLists(true);
    try {
      const response = await Database.getCalendarLists(projectId);
      if (response.success) {
        setLists(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching lists:', error);
      toast.error('Failed to load statuses');
    } finally {
      setLoadingLists(false);
    }
  };

  // Handle department change
  const handleDepartmentChange = useCallback((e) => {
    const departmentId = e.target.value;
    setFormData(prev => ({
      ...prev,
      departmentId,
      projectId: '',
      listId: ''
    }));
    setProjects([]);
    setLists([]);
    fetchProjects(departmentId);
  }, []);

  // Handle project change
  const handleProjectChange = useCallback((e) => {
    const projectId = e.target.value;
    setFormData(prev => ({
      ...prev,
      projectId,
      listId: ''
    }));
    setLists([]);
    fetchLists(projectId);
  }, []);

  // Handle list change
  const handleListChange = useCallback((e) => {
    setFormData(prev => ({
      ...prev,
      listId: e.target.value
    }));
  }, []);

  // Handle input change
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  // Handle due date selection
  const handleDueDateSelect = useCallback((date) => {
    setFormData(prev => ({
      ...prev,
      dueDate: date ? new Date(date).toISOString().split('T')[0] : ''
    }));
    setShowDueDatePicker(false);
  }, []);

  // Validation
  const isValid = formData.title.trim() &&
    formData.departmentId &&
    formData.projectId &&
    formData.listId;

  // Handle submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isValid || submitting) return;

    setSubmitting(true);
    try {
      const response = await Database.createCalendarTask({
        title: formData.title.trim(),
        description: formData.description.trim(),
        startDate: formData.startDate || null,
        dueDate: formData.dueDate || null,
        departmentId: formData.departmentId,
        projectId: formData.projectId,
        listId: formData.listId,
        priority: formData.priority,
        assignees: formData.assignees
      });

      if (response.success) {
        toast.success('Task created successfully!');
        onTaskCreated?.(response.data);
        onClose();
      } else {
        toast.error(response.message || 'Failed to create task');
      }
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error(error.message || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  // Close modal on escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-500 to-indigo-600">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Create Task</h2>
                  <p className="text-sm text-white/80">
                    {selectedDate ? new Date(selectedDate).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : 'Select a date'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Date Section */}
              <div className="grid grid-cols-2 gap-4">
                {/* Start Date (Auto-filled) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Date
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Due Date <span className="text-gray-400">(Optional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDueDatePicker(true)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-left text-gray-900 dark:text-gray-100 hover:border-gray-300 dark:hover:border-gray-500 transition-colors flex items-center justify-between"
                  >
                    <span className={formData.dueDate ? '' : 'text-gray-400'}>
                      {formData.dueDate
                        ? new Date(formData.dueDate).toLocaleDateString()
                        : 'Select due date'}
                    </span>
                    <Calendar className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Department <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <select
                    value={formData.departmentId}
                    onChange={handleDepartmentChange}
                    disabled={loadingDepartments}
                    className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="">Select department</option>
                    {departments.map(dept => (
                      <option key={dept._id} value={dept._id}>{dept.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  {loadingDepartments && (
                    <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
                  )}
                </div>
              </div>

              {/* Project (appears after department selection) */}
              <AnimatePresence>
                {formData.departmentId && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Project <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <select
                        value={formData.projectId}
                        onChange={handleProjectChange}
                        disabled={loadingProjects || projects.length === 0}
                        className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer disabled:opacity-50"
                      >
                        <option value="">
                          {loadingProjects ? 'Loading...' : projects.length === 0 ? 'No projects available' : 'Select project'}
                        </option>
                        {projects.map(project => (
                          <option key={project._id} value={project._id}>{project.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                      {loadingProjects && (
                        <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Status/List (appears after project selection) */}
              <AnimatePresence>
                {formData.projectId && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Status / List <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <ListTodo className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <select
                        value={formData.listId}
                        onChange={handleListChange}
                        disabled={loadingLists || lists.length === 0}
                        className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer disabled:opacity-50"
                      >
                        <option value="">
                          {loadingLists ? 'Loading...' : lists.length === 0 ? 'No statuses available' : 'Select status'}
                        </option>
                        {lists.map(list => (
                          <option key={list._id} value={list._id}>{list.title}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                      {loadingLists && (
                        <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Task Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Task Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="Enter task name"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description <span className="text-gray-400">(Optional)</span>
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Enter task description..."
                    rows={3}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isValid || submitting}
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Create Task
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Due Date Picker Modal - Rendered outside AnimatePresence to prevent click bubbling */}
      <DatePickerModal
        isOpen={showDueDatePicker}
        onClose={() => setShowDueDatePicker(false)}
        onSelectDate={handleDueDateSelect}
        selectedDate={formData.dueDate}
        title="Select Due Date"
      />
    </>,
    document.body
  );
});

CalendarTaskModal.displayName = 'CalendarTaskModal';

export default CalendarTaskModal;
