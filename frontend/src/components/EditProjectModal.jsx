"use client";

import React, { useState, useEffect, useCallback, useContext, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Save, AlertCircle, Loader, Calendar, Users, DollarSign,
  Link2, FileText, Briefcase, Clock, Globe, Mail, Phone, Tag,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Edit3, 
  TrendingUp, Lock, Plus, Bell, Image, Shield, History, Paperclip,
  Settings, Info, ArrowRight, Eye, EyeOff, Maximize2, Minimize2
} from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { toast } from "react-toastify";
import Database from '../services/database';
import ReminderPanel from './ReminderPanel';
import ReminderModal from './ReminderModal';
import AuthContext from '../context/AuthContext';
import CoverImageUploader from './CoverImageUploader';
import DatePickerModal from './DatePickerModal';
import EnterpriseFileUploader from './EnterpriseFileUploader';
import ActivityTimeline from './ActivityTimeline';
import ProjectOptionsDropdown from './ProjectOptionsDropdown';
import RichTextEditor from './RichTextEditor';

// Enterprise drawer variants
const drawerVariants = {
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

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 }
};

// Tab navigation component
const TabNavigation = React.memo(({ tabs, activeTab, onTabChange }) => (
  <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          activeTab === tab.id
            ? 'bg-white text-indigo-600 shadow-sm'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
      >
        <tab.icon size={16} />
        {tab.label}
        {tab.badge && (
          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-xs font-semibold rounded-full">
            {tab.badge}
          </span>
        )}
      </button>
    ))}
  </div>
));

// Status badge component
const StatusBadge = React.memo(({ status }) => {
  const statusConfig = {
    planning: { color: 'bg-gray-100 text-gray-700 border-gray-300', label: 'Planning' },
    'in-progress': { color: 'bg-blue-100 text-blue-700 border-blue-300', label: 'In Progress' },
    completed: { color: 'bg-green-100 text-green-700 border-green-300', label: 'Completed' },
    'on-hold': { color: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'On Hold' }
  };
  const config = statusConfig[status] || statusConfig.planning;
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${config.color}`}>
      {config.label}
    </span>
  );
});

// Priority badge component
const PriorityBadge = React.memo(({ priority }) => {
  const priorityConfig = {
    low: { color: 'bg-emerald-100 text-emerald-700', label: 'Low' },
    medium: { color: 'bg-amber-100 text-amber-700', label: 'Medium' },
    high: { color: 'bg-orange-100 text-orange-700', label: 'High' },
    urgent: { color: 'bg-red-100 text-red-700', label: 'Urgent' }
  };
  const config = priorityConfig[priority] || priorityConfig.medium;
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
});

// Form field component with validation
const FormField = React.memo(({ 
  label, 
  icon: Icon, 
  required, 
  error, 
  helperText, 
  children,
  className = ''
}) => (
  <div className={`space-y-2 ${className}`}>
    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
      {Icon && <Icon className="h-4 w-4 text-indigo-600" />}
      {label}
      {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {helperText && !error && (
      <p className="text-xs text-gray-500">{helperText}</p>
    )}
    <AnimatePresence>
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="text-red-600 text-sm flex items-center gap-1"
        >
          <AlertCircle size={14} /> {error}
        </motion.p>
      )}
    </AnimatePresence>
  </div>
));

// Main Enterprise Edit Project Modal
const EnterpriseEditProjectModal = ({ 
  isOpen, 
  onClose, 
  project, 
  onProjectUpdated, 
  departmentManagers = [] 
}) => {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('details');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderKey, setReminderKey] = useState(0);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    projectUrl: '',
    startDate: '',
    projectSource: 'Direct',
    upworkId: '',
    billingCycle: 'hr',
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

  const managers = useMemo(() => departmentManagers || [], [departmentManagers]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  
  // File management state
  const [pendingFiles, setPendingFiles] = useState([]);
  const [projectFiles, setProjectFiles] = useState([]);
  const [uploadErrors, setUploadErrors] = useState([]);
  const uploadProgressTimers = useRef(new Map());
  
  // Activity state
  const [activityLog, setActivityLog] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  
  // Draft state
  const [draftStatus, setDraftStatus] = useState('');
  const draftTimerRef = useRef(null);
  
  // Cover image state
  const [coverImage, setCoverImage] = useState(null);
  const [coverImageHistory, setCoverImageHistory] = useState([]);
  
  // Date picker state
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);

  const userRole = user?.role || 'employee';
  const canManageReminders = userRole === 'admin' || userRole === 'manager';

  // Draft key for localStorage
  const draftKey = useMemo(() => {
    const id = project?.id || project?._id;
    return id ? `projectDraft:${id}` : 'projectDraft:unknown';
  }, [project]);

  // Tabs configuration
  const tabs = useMemo(() => [
    { id: 'details', label: 'Details', icon: FileText },
    { id: 'files', label: 'Files', icon: Paperclip, badge: projectFiles.length || undefined },
    { id: 'team', label: 'Team', icon: Users, badge: formData.assignees.length || undefined },
    { id: 'activity', label: 'Activity', icon: History, badge: activityLog.length || undefined }
  ], [projectFiles.length, formData.assignees.length, activityLog.length]);

  // Restore draft on open
  useEffect(() => {
    if (!isOpen) return;
    try {
      const draftRaw = localStorage.getItem(draftKey);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        if (draft?.formData) {
          setFormData(prev => ({ ...prev, ...draft.formData }));
          setDraftStatus('Draft restored ✅');
          setTimeout(() => setDraftStatus(''), 3000);
        }
      }
    } catch (error) {
      console.error('Failed to restore project draft:', error);
    }
  }, [isOpen, draftKey]);

  // Keep a ref to formData to avoid re-triggering the auto-save effect on every change
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  // Auto-save draft using interval + ref (avoids re-render cascade on every keystroke)
  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          formData: formDataRef.current,
          savedAt: new Date().toISOString()
        }));
        setDraftStatus('Draft Saved ✅');
        setTimeout(() => setDraftStatus(''), 2000);
      } catch (error) {
        console.error('Failed to save project draft:', error);
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [isOpen, draftKey]);

  // Load project data
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
            billingCycle: fullProject.billingCycle === 'hourly' ? 'hr' : (fullProject.billingCycle || 'hr'),
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
          
          setCoverImage(fullProject.coverImage || null);
          setCoverImageHistory(fullProject.coverImageHistory || []);
          await fetchCategories(fullProject);
          
          // Attachments and activity are now fetched lazily when their tabs are selected
        } catch (error) {
          console.error('Error fetching full project:', error);
          toast.error('Failed to load project details');
        }
      };
      fetchFullProject();
    }
  }, [isOpen, project]);

  // Track which tabs have had their data fetched
  const fetchedTabsRef = useRef({});

  // Reset fetched tabs when project changes
  useEffect(() => {
    fetchedTabsRef.current = {};
  }, [project]);

  // Lazy fetch attachments when files tab is selected
  useEffect(() => {
    if (activeTab === 'files' && !fetchedTabsRef.current.files && isOpen && project) {
      fetchedTabsRef.current.files = true;
      const projectId = project._id || project.id;
      Database.getProjectAttachments(projectId)
        .then(res => setProjectFiles(res.data || []))
        .catch(err => console.error('Error fetching attachments:', err));
    }
  }, [activeTab, isOpen, project]);

  // Lazy fetch activity when activity tab is selected
  useEffect(() => {
    if (activeTab === 'activity' && !fetchedTabsRef.current.activity && isOpen && project) {
      fetchedTabsRef.current.activity = true;
      setActivityLoading(true);
      const projectId = project._id || project.id;
      Database.getProjectActivity(projectId)
        .then(res => setActivityLog(res.data || []))
        .catch(err => console.error('Error fetching activity:', err))
        .finally(() => setActivityLoading(false));
    }
  }, [activeTab, isOpen, project]);

  const fetchCategories = async (project) => {
    try {
      const response = await Database.getCategoriesByDepartment(project.department._id);
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  }, [errors]);

  const handleAssigneeChange = useCallback((userId) => {
    setFormData(prev => ({
      ...prev,
      assignees: prev.assignees.includes(userId)
        ? prev.assignees.filter(id => id !== userId)
        : [...prev.assignees, userId]
    }));
  }, []);

  // File handlers
  const handleRemovePendingFile = useCallback((item) => {
    setPendingFiles(prev => prev.filter(f => f.id !== item.id));
  }, []);

  const handleDeleteExistingFile = useCallback(async (fileItem) => {
    try {
      await Database.deleteAttachment(fileItem._id);
      setProjectFiles(prev => prev.filter(f => f._id !== fileItem._id));
      toast.success('File removed from project');
    } catch (error) {
      console.error('Error deleting attachment:', error);
      toast.error(error.message || 'Failed to delete file');
    }
  }, []);

  const updatePendingFile = useCallback((id, updates) => {
    setPendingFiles(prev => prev.map(fileItem => (
      fileItem.id === id ? { ...fileItem, ...updates } : fileItem
    )));
  }, []);

  const startProgressSimulation = useCallback((id) => {
    if (uploadProgressTimers.current.has(id)) return;
    const timer = setInterval(() => {
      setPendingFiles(prev => prev.map(fileItem => {
        if (fileItem.id !== id || fileItem.status !== 'uploading') return fileItem;
        const current = Number(fileItem.progress) || 0;
        if (current >= 90) return fileItem;
        const increment = 3 + Math.round(Math.random() * 5);
        return { ...fileItem, progress: Math.min(90, current + increment) };
      }));
    }, 300);
    uploadProgressTimers.current.set(id, timer);
  }, []);

  const stopProgressSimulation = useCallback((id) => {
    const timer = uploadProgressTimers.current.get(id);
    if (timer) {
      clearInterval(timer);
      uploadProgressTimers.current.delete(id);
    }
  }, []);

  useEffect(() => {
    return () => {
      uploadProgressTimers.current.forEach((timer) => clearInterval(timer));
      uploadProgressTimers.current.clear();
    };
  }, []);

  const uploadPendingFile = useCallback(async (item) => {
    const projectId = project?._id || project?.id;
    if (!projectId) return;

    updatePendingFile(item.id, { status: 'uploading', progress: 1 });
    startProgressSimulation(item.id);
    try {
      const result = await Database.uploadProjectAttachment(
        projectId,
        item.file,
        (progress) => updatePendingFile(item.id, { progress, status: 'uploading' })
      );
      stopProgressSimulation(item.id);
      updatePendingFile(item.id, { status: 'done', progress: 100 });

      if (result?.data) {
        setProjectFiles(prev => [result.data, ...prev]);
      }
      setPendingFiles(prev => prev.filter(f => f.id !== item.id));
    } catch (uploadError) {
      stopProgressSimulation(item.id);
      const message = uploadError?.message || 'Upload failed';
      updatePendingFile(item.id, { status: 'error', error: message });
      setUploadErrors(prev => [...prev, `${item.file?.name || 'File'}: ${message}`]);
    }
  }, [project, updatePendingFile, startProgressSimulation, stopProgressSimulation]);

  const handleFilesAdded = useCallback((files) => {
    const newItems = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: 'queued'
    }));
    setPendingFiles(prev => [...prev, ...newItems]);
    setUploadErrors([]);

    newItems.forEach(uploadPendingFile);
  }, [uploadPendingFile]);

  // Validation
  const validateForm = () => {
    const newErrors = {};
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (formData.title.length > 0 && formData.title.length < 3) newErrors.title = 'Title must be at least 3 characters';
    if (!formData.startDate) newErrors.startDate = 'Start date is required';
    // if (!formData.dueDate) newErrors.dueDate = 'Due date is required';
    if (formData.startDate && formData.dueDate && new Date(formData.startDate) >= new Date(formData.dueDate)) {
      newErrors.dueDate = 'Due date must be after start date';
    }
    if (formData.assignees.length === 0) newErrors.assignees = 'At least one assignee is required';
    if (formData.clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.clientEmail)) {
      newErrors.clientEmail = 'Invalid email format';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Please fix the validation errors');
      return;
    }

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

      // Upload pending files (only queued/failed)
      const filesToUpload = pendingFiles.filter(
        (item) => item.status === 'queued' || item.status === 'error'
      );
      if (filesToUpload.length > 0) {
        const failed = [];
        for (const item of filesToUpload) {
          updatePendingFile(item.id, { status: 'uploading', progress: 10 });
          try {
            await Database.uploadProjectAttachment(
              project._id || project.id,
              item.file,
              (progress) => updatePendingFile(item.id, { progress })
            );
            updatePendingFile(item.id, { status: 'done', progress: 100 });
          } catch (uploadError) {
            const message = uploadError?.message || 'Upload failed';
            updatePendingFile(item.id, { status: 'error', error: message });
            failed.push(`${item.file.name}: ${message}`);
          }
        }
        
        if (failed.length > 0) {
          setUploadErrors(failed);
          toast.warning('Some files failed to upload');
        } else {
          setPendingFiles([]);
        }
      }

      if (response.success) {
        localStorage.removeItem(draftKey);
        onProjectUpdated(response.data);
        toast.success('Project updated successfully!');
        onClose();
      } else {
        throw new Error(response.message || 'Failed to update project');
      }
    } catch (error) {
      console.error('Error updating project:', error);
      toast.error(error.message || 'Failed to update project');
    } finally {
      setLoading(false);
    }
  };

  // Close handler
  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  if (!isOpen || !project) return null;

  const drawerWidth = isFullScreen ? 'w-full' : 'w-full max-w-5xl';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
          />

          {/* Drawer */}
          <motion.div
            variants={drawerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`fixed right-0 top-0 h-full ${drawerWidth} bg-white shadow-2xl z-[61] flex flex-col`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex-shrink-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleClose}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  >
                    <ChevronLeft size={24} />
                  </motion.button>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-white truncate max-w-md">
                        {formData.title || 'Edit Project'}
                      </h2>
                      <StatusBadge status={formData.status} />
                      <PriorityBadge priority={formData.priority} />
                    </div>
                    <p className="text-indigo-200 text-sm mt-1">
                      Last updated: {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : 'Never'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {draftStatus && (
                    <span className="text-sm text-emerald-300 bg-emerald-500/20 px-3 py-1 rounded-full">
                      {draftStatus}
                    </span>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsFullScreen(!isFullScreen)}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  >
                    {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleClose}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  >
                    <X size={24} />
                  </motion.button>
                </div>
              </div>
              
              {/* Tab Navigation */}
              <div className="mt-4">
                <TabNavigation tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
              <div className="h-full overflow-y-auto">
                <div className="p-6">
                  {/* Details Tab */}
                  {activeTab === 'details' && (
                    <form onSubmit={handleSubmit} className="space-y-6">
                      {/* Cover Image */}
                      <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <Image size={16} className="text-purple-600" />
                          Cover Image
                        </h3>
                        <CoverImageUploader
                          projectId={project?.id || project?._id}
                          currentCover={coverImage}
                          coverHistory={coverImageHistory}
                          onCoverChange={(data) => {
                            if (data) {
                              const newCoverImage = data.coverImage || data;
                              const newCoverHistory = data.coverImageHistory || coverImageHistory;
                              setCoverImage(newCoverImage);
                              setCoverImageHistory(newCoverHistory);
                              if (onProjectUpdated) {
                                onProjectUpdated({
                                  ...project,
                                  coverImage: newCoverImage,
                                  coverImageHistory: newCoverHistory
                                });
                              }
                            } else {
                              setCoverImage(null);
                              if (onProjectUpdated) {
                                onProjectUpdated({ ...project, coverImage: null });
                              }
                            }
                          }}
                        />
                      </section>

                      {/* Basic Info */}
                      <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <Info size={16} className="text-indigo-600" />
                          Basic Information
                        </h3>
                        
                        <div className="space-y-5">
                          <FormField label="Project Title" icon={FileText} required error={errors.title}>
                            <input
                              type="text"
                              name="title"
                              value={formData.title}
                              onChange={handleInputChange}
                              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                                errors.title ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-indigo-300'
                              }`}
                              placeholder="Enter project title"
                            />
                          </FormField>

                          <FormField label="Description" icon={FileText}>
                            <RichTextEditor
                              content={formData.description}
                              onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
                              placeholder="Describe the project goals, deliverables, and requirements..."
                              startExpanded={true}
                              allowMentions={false}
                              enableAttachments={false}
                              showLinkTool={false}
                              showImageTool={false}
                              editorMinHeightClass="min-h-[120px]"
                              className="bg-white border border-gray-300 rounded-xl p-2 hover:border-indigo-300"
                            />
                          </FormField>
                        </div>
                      </section>

                      {/* Status & Dates */}
                      <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <Calendar size={16} className="text-green-600" />
                          Status & Timeline
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <FormField label="Status" icon={TrendingUp}>
                            <select
                              name="status"
                              value={formData.status}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                            >
                              <option value="planning">Planning</option>
                              <option value="in-progress">In Progress</option>
                              <option value="completed">Completed</option>
                              <option value="on-hold">On Hold</option>
                            </select>
                          </FormField>

                          <FormField label="Priority" icon={AlertCircle}>
                            <select
                              name="priority"
                              value={formData.priority}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="urgent">Urgent</option>
                            </select>
                          </FormField>

                          <FormField label="Start Date" icon={Calendar} required error={errors.startDate}>
                            <div
                              onClick={() => setShowStartDatePicker(true)}
                              className={`w-full px-4 py-3 border rounded-xl cursor-pointer flex items-center justify-between hover:border-indigo-300 ${
                                errors.startDate ? 'border-red-500 bg-red-50' : 'border-gray-300'
                              }`}
                            >
                              <span className={formData.startDate ? 'text-gray-900' : 'text-gray-400'}>
                                {formData.startDate
                                  ? new Date(formData.startDate).toLocaleDateString()
                                  : 'Select date'}
                              </span>
                              <Calendar size={16} className="text-gray-400" />
                            </div>
                          </FormField>

                          <FormField label="Due Date" icon={Calendar}  error={errors.dueDate}>
                            <div
                              onClick={() => setShowDueDatePicker(true)}
                              className={`w-full px-4 py-3 border rounded-xl cursor-pointer flex items-center justify-between hover:border-indigo-300 ${
                                errors.dueDate ? 'border-red-500 bg-red-50' : 'border-gray-300'
                              }`}
                            >
                              <span className={formData.dueDate ? 'text-gray-900' : 'text-gray-400'}>
                                {formData.dueDate
                                  ? new Date(formData.dueDate).toLocaleDateString()
                                  : 'Select date'}
                              </span>
                              <Calendar size={16} className="text-gray-400" />
                            </div>
                          </FormField>
                        </div>
                      </section>

                      {/* Reminder Section (for completed projects) */}
                      {formData.status === 'completed' && canManageReminders && (
                        <section className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-5 border border-indigo-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                                <Bell className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-gray-900">Client Reminder</h4>
                                <p className="text-xs text-gray-500">Set follow-up reminders for completed projects</p>
                              </div>
                            </div>
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              type="button"
                              onClick={() => setShowReminderModal(true)}
                              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md"
                            >
                              <Calendar size={16} />
                              Manage Reminders
                            </motion.button>
                          </div>
                          <div className="mt-4">
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
                          </div>
                        </section>
                      )}

                      {/* Project Details */}
                      <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <Briefcase size={16} className="text-indigo-600" />
                          Project Details
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <FormField label="Project Source" icon={Briefcase}>
                            <ProjectOptionsDropdown
                              optionType="projectSource"
                              value={formData.projectSource}
                              onChange={(val) => setFormData((prev) => ({ ...prev, projectSource: val }))}
                              showLabel={false}
                              theme="indigo"
                            />
                          </FormField>

                          {formData.projectSource === 'Upwork' && (
                            <FormField label="Upwork ID" icon={Tag}>
                              <input
                                type="text"
                                name="upworkId"
                                value={formData.upworkId}
                                onChange={handleInputChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                                placeholder="Enter Upwork ID"
                              />
                            </FormField>
                          )}

                          <FormField label="Billing Type" icon={DollarSign}>
                            <ProjectOptionsDropdown
                              optionType="billingType"
                              value={formData.billingCycle}
                              onChange={(val) => setFormData((prev) => ({ ...prev, billingCycle: val }))}
                              showLabel={false}
                              theme="indigo"
                            />
                          </FormField>

                          {formData.billingCycle === 'fixed' ? (
                            <FormField label="Fixed Price" icon={DollarSign}>
                              <input
                                type="number"
                                name="fixedPrice"
                                value={formData.fixedPrice}
                                onChange={handleInputChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                                placeholder="$0.00"
                                min="0"
                              />
                            </FormField>
                          ) : (
                            <FormField label="Hourly Rate" icon={DollarSign}>
                              <input
                                type="number"
                                name="hourlyPrice"
                                value={formData.hourlyPrice}
                                onChange={handleInputChange}
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                                placeholder="$/hr"
                                min="0"
                              />
                            </FormField>
                          )}

                          <FormField label="Estimated Time" icon={Clock}>
                            <input
                              type="text"
                              name="estimatedTime"
                              value={formData.estimatedTime}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                              placeholder="e.g., 3 days, 40h"
                            />
                          </FormField>

                          <FormField label="Website URL" icon={Link2}>
                            <input
                              type="text"
                              name="projectUrl"
                              value={formData.projectUrl}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                              placeholder="https://example.com"
                            />
                          </FormField>

                          <FormField label="Category" icon={Tag}>
                            <select
                              name="projectCategory"
                              value={formData.projectCategory}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                            >
                              <option value="">Select category</option>
                              {categories.map((cat) => (
                                <option key={cat._id} value={cat.name}>{cat.name}</option>
                              ))}
                            </select>
                          </FormField>

                          <FormField label="Visibility" icon={Globe}>
                            <select
                              name="visibility"
                              value={formData.visibility}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                            >
                              <option value="public">Public</option>
                              <option value="private">Private</option>
                            </select>
                          </FormField>
                        </div>
                      </section>

                      {/* Client Information */}
                      <section className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <Mail size={16} className="text-blue-600" />
                          Client Information
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <FormField label="Client Name">
                            <input
                              type="text"
                              name="clientName"
                              value={formData.clientName}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                              placeholder="Client name"
                            />
                          </FormField>

                          <FormField label="Client Email" error={errors.clientEmail}>
                            <input
                              type="email"
                              name="clientEmail"
                              value={formData.clientEmail}
                              onChange={handleInputChange}
                              className={`w-full px-4 py-3 border bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                                errors.clientEmail ? 'border-red-500' : 'border-gray-300 hover:border-indigo-300'
                              }`}
                              placeholder="client@email.com"
                            />
                          </FormField>

                          <FormField label="Phone Number">
                            <input
                              type="text"
                              name="clientWhatsappNumber"
                              value={formData.clientWhatsappNumber}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all hover:border-indigo-300"
                              placeholder="+1 234 567 8900"
                            />
                          </FormField>
                        </div>
                      </section>

                    </form>
                  )}

                  {/* Files Tab */}
                  {activeTab === 'files' && (
                    <div className="space-y-6">
                      {/* Files info banner */}
                      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                          <Paperclip size={20} className="text-indigo-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-gray-900">Project Files</h4>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Manage attachments for this project. Click any file to preview.
                          </p>
                        </div>
                        {(pendingFiles.length > 0 || projectFiles.length > 0) && (
                          <span className="px-3 py-1.5 bg-white text-indigo-700 text-sm font-medium rounded-lg border border-indigo-200 shadow-sm">
                            {pendingFiles.length + projectFiles.length} file{(pendingFiles.length + projectFiles.length) !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      <EnterpriseFileUploader
                        title="Project Attachments"
                        description="Drag & drop files here, or click to browse"
                        helperText="Supported: PDF, Docs, Images, Videos, Spreadsheets, Audio (Max 25MB each)"
                        pendingFiles={pendingFiles}
                        existingFiles={projectFiles}
                        onFilesAdded={handleFilesAdded}
                        onRemovePending={handleRemovePendingFile}
                        onRemoveExisting={handleDeleteExistingFile}
                        errors={uploadErrors}
                        showVersionHistory={true}
                        showPreview={true}
                      />
                    </div>
                  )}

                  {/* Team Tab */}
                  {activeTab === 'team' && (
                    <div className="space-y-6">
                      <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                          <Shield size={16} className="text-purple-600" />
                          Project Manager
                          <span className="text-xs text-gray-500 font-normal">
                            ({formData.assignees.length} assigned)
                          </span>
                        </h3>
                        
                        {managers.length === 0 ? (
                          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                            <AlertCircle className="h-5 w-5 text-amber-600" />
                            <div>
                              <p className="text-sm font-medium text-amber-800">No Manager Available</p>
                              <p className="text-xs text-amber-600">Please assign a manager to this department first.</p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-96 overflow-y-auto">
                            {managers.map((manager) => (
                              <label
                                key={manager._id}
                                className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all ${
                                  formData.assignees.includes(manager._id)
                                    ? 'bg-indigo-50 border-2 border-indigo-300'
                                    : 'bg-white border border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={formData.assignees.includes(manager._id)}
                                  onChange={() => handleAssigneeChange(manager._id)}
                                  className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
                                  {(manager.name || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-gray-900">{manager.name}</span>
                                    <Shield size={14} className="text-blue-500" />
                                  </div>
                                  <p className="text-sm text-gray-500">{manager.email || 'No email'}</p>
                                  <p className="text-xs text-blue-600 font-medium">Manager</p>
                                </div>
                                {formData.assignees.includes(manager._id) && (
                                  <CheckCircle2 className="h-6 w-6 text-indigo-600" />
                                )}
                              </label>
                            ))}
                          </div>
                        )}
                        
                        {errors.assignees && (
                          <p className="text-red-600 text-sm mt-3 flex items-center gap-1">
                            <AlertCircle size={14} /> {errors.assignees}
                          </p>
                        )}
                      </section>
                    </div>
                  )}

                  {/* Activity Tab */}
                  {activeTab === 'activity' && (
                    <div className="space-y-6">
                      <ActivityTimeline
                        activities={activityLog}
                        loading={activityLoading}
                        projectCreatedAt={project.createdAt}
                        projectUpdatedAt={project.updatedAt}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-6 py-3 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 font-semibold transition-all disabled:opacity-50"
                >
                  Cancel
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 font-semibold transition-all shadow-lg shadow-indigo-500/30"
                >
                  {loading ? (
                    <>
                      <Loader size={20} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={20} />
                      Save Changes
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Date Picker Modals */}
          <DatePickerModal
            isOpen={showStartDatePicker}
            onClose={() => setShowStartDatePicker(false)}
            onSelectDate={(date) => {
              setFormData(prev => ({ ...prev, startDate: date || '' }));
              if (errors.startDate) setErrors(prev => ({ ...prev, startDate: '' }));
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

          {/* Reminder Modal */}
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
                setReminderKey(prev => prev + 1);
                toast.success('Reminder saved successfully!');
              }}
            />
          )}
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default EnterpriseEditProjectModal;
