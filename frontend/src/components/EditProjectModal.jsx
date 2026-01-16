import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Save, AlertCircle, Loader, Calendar, Users, DollarSign,
  Link2, FileText, Briefcase, Clock, Globe, Mail, Phone, Tag,
  CheckCircle2, ChevronDown, Edit3, TrendingUp, Lock, Plus, Bell, Image, Shield
} from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select"
import { Badge } from "../components/ui/badge"
import { toast } from "react-toastify"
import Database from '../services/database';
import ReminderPanel from './ReminderPanel';
import ReminderModal from './ReminderModal';
import AuthContext from '../context/AuthContext';
import CoverImageUploader from './CoverImageUploader';
import DatePickerModal from './DatePickerModal';

const EditProjectModal = ({ isOpen, onClose, project, onProjectUpdated, departmentManagers = [] }) => {
  // Get user from AuthContext instead of localStorage
  const { user } = useContext(AuthContext);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    projectUrl: '',
    startDate: '',
    projectSource: 'Direct',
    upworkId: '',
    billingCycle: 'hourly',
    fixedPrice: '',
    hourlyPrice: '',
    dueDate: '',
    clientName: '',
    clientEmail: '',
    clientWhatsappNumber: '',
    projectCategory: '',
    assignees: [],
    estimatedTime: '',
    status: 'planning',
    priority: 'medium',
    visibility: 'public'
  });
  // Use departmentManagers prop directly instead of fetching employees
  const managers = useMemo(() => departmentManagers || [], [departmentManagers]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  
  // Reminder modal state
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderKey, setReminderKey] = useState(0); // For forcing re-render of ReminderPanel
  
  // Cover image state (managed locally for instant UI updates)
  const [coverImage, setCoverImage] = useState(null);
  const [coverImageHistory, setCoverImageHistory] = useState([]);
  
  // Date picker visibility state
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  
  // Get user role from AuthContext
  const userRole = user?.role || 'employee';
  const canManageReminders = userRole === 'admin' || userRole === 'manager';

  useEffect(() => {
    if (isOpen && project) {
      const fetchFullProject = async () => {
        try {
          const response = await Database.getProject(project.id || project._id);
          const fullProject = response.data;
          setFormData({
            title: fullProject.name || '',
            description: fullProject.description || '',
            projectUrl: fullProject.projectUrl || '',
            startDate: fullProject.startDate ? new Date(fullProject.startDate).toISOString().split('T')[0] : '',
            projectSource: fullProject.projectSource || 'Direct',
            upworkId: fullProject.upworkId || '',
            billingCycle: fullProject.billingCycle || 'hourly',
            fixedPrice: fullProject.fixedPrice || '',
            hourlyPrice: fullProject.hourlyPrice || '',
            dueDate: fullProject.dueDate ? new Date(fullProject.dueDate).toISOString().split('T')[0] : '',
            clientName: fullProject.clientDetails?.clientName || '',
            clientEmail: fullProject.clientDetails?.clientEmail || '',
            clientWhatsappNumber: fullProject.clientDetails?.clientWhatsappNumber || '',
            projectCategory: fullProject.projectCategory || '',
            assignees: fullProject.members?.map(m => typeof m === 'string' ? m : m._id) || [],
            estimatedTime: fullProject.estimatedTime || '',
            status: fullProject.status || 'planning',
            priority: fullProject.priority || 'medium',
            visibility: fullProject.visibility || 'public'
          });
          // Set cover image state from fetched project
          setCoverImage(fullProject.coverImage || null);
          setCoverImageHistory(fullProject.coverImageHistory || []);
          // fetchEmployees removed - now using departmentManagers prop directly
          await fetchCategories(fullProject);
        } catch (error) {
          console.error('Error fetching full project:', error);
        }
      };
      fetchFullProject();
    }
  }, [isOpen, project]);

  // fetchEmployees removed - now using departmentManagers prop directly

  const fetchCategories = async (project) => {
    try {
      const response = await Database.getCategoriesByDepartment(project.department._id);
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    
    // Auto-save status change immediately
    if (name === 'status') {
      autoSaveStatus(value);
    }
  };

  // Auto-save status without requiring Save button click
  const autoSaveStatus = async (newStatus) => {
    try {
      const projectId = project.id || project._id;
      await Database.updateProject(projectId, { status: newStatus });
      // Show subtle confirmation
      toast.success(`Status updated to "${newStatus.replace('-', ' ')}"`, {
        autoClose: 2000,
        hideProgressBar: true,
      });
      if (onProjectUpdated) {
        onProjectUpdated({ ...project, status: newStatus });
      }
    } catch (error) {
      console.error('Error auto-saving status:', error);
      toast.error('Failed to update status');
      // Revert the status in form if save failed
      setFormData(prev => ({ ...prev, status: project.status }));
    }
  };

  const handleAssigneeChange = (userId) => {
    setFormData(prev => ({
      ...prev,
      assignees: prev.assignees.includes(userId)
        ? prev.assignees.filter(id => id !== userId)
        : [...prev.assignees, userId]
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (formData.title.length < 3) newErrors.title = 'Title must be at least 3 characters';
    if (!formData.startDate) newErrors.startDate = 'Start date is required';
    if (!formData.dueDate) newErrors.dueDate = 'Due date is required';
    if (new Date(formData.startDate) >= new Date(formData.dueDate)) {
      newErrors.dueDate = 'Due date must be after start date';
    }
    if (formData.assignees.length === 0) newErrors.assignees = 'At least one assignee is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const updates = {
        name: formData.title,
        description: formData.description,
        projectUrl: formData.projectUrl,
        startDate: formData.startDate,
        projectSource: formData.projectSource,
        upworkId: formData.upworkId,
        billingCycle: formData.billingCycle,
        fixedPrice: formData.fixedPrice,
        hourlyPrice: formData.hourlyPrice,
        dueDate: formData.dueDate,
        clientDetails: {
          clientName: formData.clientName,
          clientEmail: formData.clientEmail,
          clientWhatsappNumber: formData.clientWhatsappNumber,
        },
        projectCategory: formData.projectCategory,
        members: formData.assignees,
        estimatedTime: formData.estimatedTime,
        status: formData.status,
        priority: formData.priority,
        visibility: formData.visibility
      };

      const response = await Database.updateProject(project.id || project._id, updates);

      if (response.success) {
        onProjectUpdated(response.data);
        onClose();
        alert('Project updated successfully!');
      } else {
        throw new Error(response.message || 'Failed to update project');
      }
    } catch (error) {
      console.error('Error updating project:', error);
      alert(error.message || 'Failed to update project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !project) return null;

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { 
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1]
      } 
    },
    exit: { 
      opacity: 0, 
      scale: 0.95, 
      y: 20,
      transition: { duration: 0.2 } 
    },
  };

  const fieldVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: (i) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: i * 0.03,
        duration: 0.3,
        ease: "easeOut"
      }
    })
  };

  const statusColors = {
    planning: 'from-gray-500 to-gray-600',
    'in-progress': 'from-blue-500 to-blue-600',
    completed: 'from-green-500 to-green-600',
    'on-hold': 'from-yellow-500 to-yellow-600'
  };

  const priorityColors = {
    low: 'from-green-500 to-emerald-600',
    medium: 'from-yellow-500 to-orange-600',
    high: 'from-orange-500 to-red-600',
    urgent: 'from-red-500 to-pink-600'
  };

  return (
    <>
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-md flex items-center justify-center z-60 p-4"
        onClick={onClose}
      >
        <motion.div
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <motion.div 
                  initial={{ rotate: -180, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="bg-white/20 backdrop-blur-sm p-2.5 rounded-xl"
                >
                  <Edit3 className="h-6 w-6" />
                </motion.div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold">Edit Project</h2>
                  <p className="text-indigo-100 text-sm mt-0.5">Update project details and settings</p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-colors"
              >
                <X className="h-6 w-6" />
              </motion.button>
            </div>
          </div>

          {/* Form Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-200px)] px-8 py-6">
            <form onSubmit={handleSubmit} className="space-y-6 pb-8">
              {/* Title */}
              <motion.div custom={0} variants={fieldVariants} initial="hidden" animate="visible">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Project Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                    errors.title ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-transparent hover:border-indigo-300'
                  }`}
                  placeholder="Enter project title"
                />
                <AnimatePresence>
                  {errors.title && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-red-600 text-sm mt-2 flex items-center gap-1"
                    >
                      <AlertCircle size={14} /> {errors.title}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Description */}
              <motion.div custom={1} variants={fieldVariants} initial="hidden" animate="visible">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none hover:border-indigo-300"
                  placeholder="Describe the project..."
                />
              </motion.div>

              {/* Cover Image */}
              <motion.div custom={1.5} variants={fieldVariants} initial="hidden" animate="visible">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Image className="h-4 w-4 text-purple-600" />
                  Cover Image
                </label>
                <CoverImageUploader
                  projectId={project?.id || project?._id}
                  currentCover={coverImage}
                  coverHistory={coverImageHistory}
                  onCoverChange={(data) => {
                    if (data) {
                      // Extract cover image from response
                      const newCoverImage = data.coverImage || data;
                      const newCoverHistory = data.coverImageHistory || coverImageHistory;
                      
                      // Update local state for instant preview
                      setCoverImage(newCoverImage);
                      setCoverImageHistory(newCoverHistory);
                      
                      // Update parent for global state sync
                      if (onProjectUpdated) {
                        onProjectUpdated({
                          ...project,
                          coverImage: newCoverImage,
                          coverImageHistory: newCoverHistory
                        });
                      }
                    } else {
                      // Cover was removed
                      setCoverImage(null);
                      if (onProjectUpdated) {
                        onProjectUpdated({
                          ...project,
                          coverImage: null
                        });
                      }
                    }
                  }}
                />
              </motion.div>

              {/* Status & Visibility Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    Status
                  </label>
                  <div className="relative">
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300 bg-gradient-to-r ${statusColors[formData.status]} text-gray-700 font-semibold appearance-none cursor-pointer`}
                    >
                      <option value="planning">Planning</option>
                      <option value="in-progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="on-hold">On Hold</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white pointer-events-none" />
                  </div>
                </motion.div>
                
                <motion.div custom={3} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Globe className="h-4 w-4 text-green-600" />
                    Visibility
                  </label>
                  <div className="relative">
                    <select
                      name="visibility"
                      value={formData.visibility}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300"
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                  </div>
                </motion.div>
              </div>

              {/* Priority / Client Reminder Section */}
              <AnimatePresence mode="wait">
                {formData.status === 'completed' && canManageReminders ? (
                  <motion.div 
                    key="reminder-section"
                    custom={4} 
                    variants={fieldVariants} 
                    initial="hidden" 
                    animate="visible"
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-5 rounded-2xl border border-indigo-200/60 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                          <Bell className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-gray-900">Client Reminder</h4>
                          <p className="text-xs text-gray-500 mt-0.5">Set follow-up reminders for completed projects</p>
                        </div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => setShowReminderModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
                      >
                        <Calendar className="h-4 w-4" />
                        Manage Reminders
                      </motion.button>
                    </div>
                    <ReminderPanel
                      key={reminderKey}
                      projectId={project?.id || project?._id}
                      clientInfo={{
                        clientName: formData.clientName,
                        clientEmail: formData.clientEmail,
                        clientWhatsappNumber: formData.clientWhatsappNumber
                      }}
                      onOpenReminderModal={() => setShowReminderModal(true)}
                      compact={true}
                    />
                  </motion.div>
                ) : (
                  <motion.div 
                    key="priority-section"
                    custom={4} 
                    variants={fieldVariants} 
                    initial="hidden" 
                    animate="visible"
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                  >
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        Priority
                      </label>
                      <div className="relative">
                        <select
                          name="priority"
                          value={formData.priority}
                          onChange={handleInputChange}
                          className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300 bg-gradient-to-r ${priorityColors[formData.priority]} text-gray-700 font-semibold appearance-none cursor-pointer`}
                        >
                          <option value="low">Low Priority</option>
                          <option value="medium">Medium Priority</option>
                          <option value="high">High Priority</option>
                          <option value="urgent">Urgent</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white pointer-events-none" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div custom={5} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                    <Calendar className="h-4 w-4 text-green-600" />
                    Start Date *
                  </label>
                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setShowStartDatePicker(true)}
                    className={`w-full px-4 py-3 border-2 rounded-xl cursor-pointer transition-all duration-200 flex items-center justify-between group bg-white dark:bg-gray-800 ${
                      errors.startDate 
                        ? "border-red-500 bg-red-50 dark:bg-red-900/20" 
                        : "border-gray-300 dark:border-gray-600 hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"
                    }`}
                  >
                    <span className={`text-sm font-medium ${
                      formData.startDate 
                        ? 'text-gray-900 dark:text-white' 
                        : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {formData.startDate 
                        ? new Date(formData.startDate).toLocaleDateString('en-US', { 
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })
                        : 'Click to select date'
                      }
                    </span>
                    {formData.startDate && (
                      <motion.button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData(prev => ({ ...prev, startDate: '' }));
                          if (errors.startDate) setErrors(prev => ({ ...prev, startDate: '' }));
                        }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        className="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={16} />
                      </motion.button>
                    )}
                  </motion.div>
                  <AnimatePresence>
                    {errors.startDate && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-red-600 text-sm mt-2 flex items-center gap-1"
                      >
                        <AlertCircle size={14} /> {errors.startDate}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
                <motion.div custom={6} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                    <Calendar className="h-4 w-4 text-red-600" />
                    Due Date *
                  </label>
                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setShowDueDatePicker(true)}
                    className={`w-full px-4 py-3 border-2 rounded-xl cursor-pointer transition-all duration-200 flex items-center justify-between group bg-white dark:bg-gray-800 ${
                      errors.dueDate 
                        ? "border-red-500 bg-red-50 dark:bg-red-900/20" 
                        : "border-gray-300 dark:border-gray-600 hover:border-red-400 dark:hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    }`}
                  >
                    <span className={`text-sm font-medium ${
                      formData.dueDate 
                        ? 'text-gray-900 dark:text-white' 
                        : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {formData.dueDate 
                        ? new Date(formData.dueDate).toLocaleDateString('en-US', { 
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })
                        : 'Click to select date'
                      }
                    </span>
                    {formData.dueDate && (
                      <motion.button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormData(prev => ({ ...prev, dueDate: '' }));
                          if (errors.dueDate) setErrors(prev => ({ ...prev, dueDate: '' }));
                        }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        className="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={16} />
                      </motion.button>
                    )}
                  </motion.div>
                  <AnimatePresence>
                    {errors.dueDate && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-red-600 text-sm mt-2 flex items-center gap-1"
                      >
                        <AlertCircle size={14} /> {errors.dueDate}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>

              {/* Date Picker Modals */}
              <DatePickerModal
                isOpen={showStartDatePicker}
                onClose={() => setShowStartDatePicker(false)}
                onSelectDate={(date) => {
                  setFormData(prev => ({ ...prev, startDate: date || '' }));
                  if (errors.startDate) setErrors(prev => ({ ...prev, startDate: '' }));
                  // If due date is before new start date, clear it
                  if (date && formData.dueDate && new Date(formData.dueDate) < new Date(date)) {
                    setFormData(prev => ({ ...prev, dueDate: '' }));
                  }
                }}
                selectedDate={formData.startDate}
                title="Select Start Date"
              />
              <DatePickerModal
                isOpen={showDueDatePicker}
                onClose={() => setShowDueDatePicker(false)}
                onSelectDate={(date) => {
                  setFormData(prev => ({ ...prev, dueDate: date || '' }));
                  if (errors.dueDate) setErrors(prev => ({ ...prev, dueDate: '' }));
                }}
                selectedDate={formData.dueDate}
                title="Select Due Date"
                minDate={formData.startDate || null}
              />

              {/* Project URL & Estimated Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div custom={7} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Link2 className="h-4 w-4 text-blue-600" />
                    Project URL
                  </label>
                  <input
                    type="text"
                    name="projectUrl"
                    value={formData.projectUrl}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300"
                    placeholder="https://example.com"
                  />
                </motion.div>
                <motion.div custom={8} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Clock className="h-4 w-4 text-orange-600" />
                    Estimated Time
                  </label>
                  <input
                    type="text"
                    name="estimatedTime"
                    value={formData.estimatedTime}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300"
                    placeholder="e.g., 3 days, 40h"
                  />
                </motion.div>
              </div>

              {/* Project Source */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div custom={9} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Briefcase className="h-4 w-4 text-indigo-600" />
                    Project Source
                  </label>
                  <select
                    name="projectSource"
                    value={formData.projectSource}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300"
                  >
                    <option value="Direct">Direct Client</option>
                    <option value="Upwork">Upwork</option>
                    <option value="Contra">Contra</option>
                  </select>
                </motion.div>
                <AnimatePresence>
                  {formData.projectSource === 'Upwork' && (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                    >
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                        <Tag className="h-4 w-4 text-green-600" />
                        Upwork ID
                      </label>
                      <input
                        type="text"
                        name="upworkId"
                        value={formData.upworkId}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300"
                        placeholder="Enter Upwork ID"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Billing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div custom={10} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    Billing Type
                  </label>
                  <select
                    name="billingCycle"
                    value={formData.billingCycle}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300"
                  >
                    <option value="hourly">Hourly Rate</option>
                    <option value="fixed">Fixed Price</option>
                  </select>
                </motion.div>
                <AnimatePresence mode="wait">
                  {formData.billingCycle === 'fixed' ? (
                    <motion.div
                      key="fixed"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                        <DollarSign className="h-4 w-4 text-green-600" />
                        Fixed Price
                      </label>
                      <input
                        type="number"
                        name="fixedPrice"
                        value={formData.fixedPrice}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300"
                        placeholder="$0.00"
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="hourly"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                        <DollarSign className="h-4 w-4 text-green-600" />
                        Hourly Rate
                      </label>
                      <input
                        type="number"
                        name="hourlyPrice"
                        value={formData.hourlyPrice}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300"
                        placeholder="$/hr"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Client Details */}
              <motion.div custom={11} variants={fieldVariants} initial="hidden" animate="visible" className="bg-gradient-to-br from-gray-50 to-indigo-50 p-6 rounded-2xl border border-gray-200">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
                  <Mail className="h-5 w-5 text-indigo-600" />
                  Client Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    name="clientName"
                    value={formData.clientName}
                    onChange={handleInputChange}
                    placeholder="Client Name"
                    className="w-full px-4 py-3 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300"
                  />
                  <input
                    type="email"
                    name="clientEmail"
                    value={formData.clientEmail}
                    onChange={handleInputChange}
                    placeholder="client@email.com"
                    className="w-full px-4 py-3 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300"
                  />
                  <input
                    type="text"
                    name="clientWhatsappNumber"
                    value={formData.clientWhatsappNumber}
                    onChange={handleInputChange}
                    placeholder="+1 234 567 8900"
                    className="w-full px-4 py-3 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300"
                  />
                </div>
              </motion.div>

              {/* Project Category */}
              <motion.div custom={12} variants={fieldVariants} initial="hidden" animate="visible">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Tag className="h-4 w-4 text-pink-600" />
                  Project Category
                </label>
                <div className="relative">
                  <select
                    name="projectCategory"
                    value={formData.projectCategory}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-300 appearance-none cursor-pointer"
                  >
                    <option value="">Select a category</option>
                    {categories.map((category) => (
                      <option key={category._id} value={category.name}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                </div>
              </motion.div>

              {/* Assignees - Now showing only managers */}
              <motion.div custom={13} variants={fieldVariants} initial="hidden" animate="visible">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Shield className="h-4 w-4 text-purple-600" />
                  Project Manager *
                </label>
                {managers.length === 0 ? (
                  /* Empty state when no managers are available */
                  <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-amber-800">No Manager Available</p>
                      <p className="text-xs text-amber-600">Please assign a manager to this department first.</p>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-xl p-4 bg-gradient-to-br from-white to-gray-50 space-y-2">
                    {managers.map((manager, index) => (
                      <motion.label
                        key={manager._id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center gap-3 p-3 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors group"
                      >
                        <input
                          type="checkbox"
                          checked={formData.assignees.includes(manager._id)}
                          onChange={() => handleAssigneeChange(manager._id)}
                          className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold group-hover:scale-110 transition-transform">
                          {(manager.name || "U").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{manager.name}</span>
                            <Shield size={14} className="text-blue-500" />
                          </div>
                          <div className="text-xs text-gray-500">{manager.email || "No email"}</div>
                          <div className="text-xs text-blue-600 font-medium">Manager</div>
                        </div>
                        {formData.assignees.includes(manager._id) && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="text-indigo-600"
                          >
                            <CheckCircle2 className="h-5 w-5" />
                          </motion.div>
                        )}
                      </motion.label>
                    ))}
                  </div>
                )}
                {errors.assignees && (
                  <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                    <AlertCircle size={14} /> {errors.assignees}
                  </p>
                )}
              </motion.div>
            </form>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-5 border-t border-gray-200 flex justify-between items-center">
            <motion.button
              whileHover={{ scale: 1.02, x: -4 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={onClose}
              className="px-6 py-3 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 font-semibold transition-all shadow-sm"
            >
              Cancel
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02, x: 4 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-lg shadow-indigo-500/30"
            >
              {loading ? (
                <>
                  <Loader size={20} className="animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <Save size={20} />
                  Save Changes
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
    
    {/* Reminder Modal - Outside AnimatePresence since it handles its own animation */}
    {canManageReminders && (
      <ReminderModal
        isOpen={showReminderModal}
        onClose={() => setShowReminderModal(false)}
        projectId={project?.id || project?._id}
        projectName={formData.title}
        clientInfo={{
          clientName: formData.clientName,
          clientEmail: formData.clientEmail,
          clientWhatsappNumber: formData.clientWhatsappNumber
        }}
        onReminderCreated={() => {
          // Refresh the reminder panel by incrementing the key
          setReminderKey(prev => prev + 1);
          toast.success('Reminder saved successfully!');
        }}
      />
    )}
  </>
  );
};

export default EditProjectModal;