"use client";

import React, { useState, useEffect, useCallback, useContext, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Save, AlertCircle, Loader, Calendar, Users, DollarSign,
  Link2, FileText, Briefcase, Clock, Globe, Mail, Phone, Tag,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Edit3, 
  TrendingUp, Lock, Plus, Bell, Image, Shield, History, Paperclip,
  Settings, Info, ArrowRight, Eye, EyeOff, Maximize2, Minimize2, Activity
} from 'lucide-react';
import { toast } from "react-toastify";
import { COUNTRY_CODES, clientDetailsFromForm, splitClientPhone, validateProjectClient } from '../../../shared/projectClient.mjs';
import Database from '../services/database';
import useProjectAccess from '../hooks/useProjectAccess';
import ReminderPanel from './ReminderPanel';
import ReminderModal from './ReminderModal';
import AuthContext from '../context/AuthContext';
import CoverImageUploader from './CoverImageUploader';
import DatePickerModal from './DatePickerModal';
import EnterpriseFileUploader from './EnterpriseFileUploader';
import ActivityTimeline from './ActivityTimeline';
import ProjectOptionsDropdown from './ProjectOptionsDropdown';
import RichTextEditor from './RichTextEditor';
import MilestoneScheduleEditor from './MilestoneScheduleEditor';
import BasicInfoSection from './ProjectModals/sections/BasicInfoSection';
import ProjectDetailsSection from './ProjectModals/sections/ProjectDetailsSection';
import ClientSection from './ProjectModals/sections/ClientSection';
import FilesTab from './ProjectModals/tabs/FilesTab';
import TeamTab from './ProjectModals/tabs/TeamTab';
import { createEmptyMilestone, validateMilestoneSchedule } from '../utils/milestones';

import { TabNavigation } from './ProjectModals/shared/TabNavigation';
import { StatusBadge, PriorityBadge } from './ProjectModals/shared/Badges';
import { drawerVariants, overlayVariants } from './ProjectModals/shared/animations';
import FormField from './ProjectModals/sections/FormField';
import { useFileUploadSimulation } from './ProjectModals/shared/useFileUploadSimulation';

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning', dot: 'bg-gray-400', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'in-progress', label: 'In Progress', dot: 'bg-blue-500', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'completed', label: 'Completed', dot: 'bg-green-500', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'on-hold', label: 'On Hold', dot: 'bg-yellow-500', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' }
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', dot: 'bg-emerald-500', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'medium', label: 'Medium', dot: 'bg-amber-500', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'high', label: 'High', dot: 'bg-orange-500', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'urgent', label: 'Urgent', dot: 'bg-red-500', color: 'bg-red-100 text-red-700 border-red-200' }
];

// Main Enterprise Edit Project Modal
const EnterpriseEditProjectModal = React.memo(({ 
  isOpen, 
  onClose, 
  project, 
  onProjectUpdated, 
  departmentManagers = [],
  draftScope
}) => {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('details');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [loadedProject, setLoadedProject] = useState(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
  const priorityDropdownRef = useRef(null);
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
    totalProjectBudget: '',
    milestoneWorkflow: 'sequential',
    milestones: [],
    dueDate: '',
    clientName: '',
    clientEmail: '',
    clientCountryCode: '',
    clientMobileNumber: '',
    projectCategory: '',
    technologies: [],
    marketingContact: false,
    assignees: [],
    estimatedTime: '',
    status: 'planning',
    priority: 'medium',
    visibility: 'public',
    projectType: 'Hired Client'
  });

  const managers = useMemo(() => departmentManagers || [], [departmentManagers]);
  const selectedEmployees = useMemo(() =>
    formData.assignees.map(id => managers.find(m => m._id === id)).filter(Boolean),
    [formData.assignees, managers]
  );
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  
  // File management state
  const {
    pendingFiles,
    setPendingFiles,
    uploadErrors,
    setUploadErrors,
    handleRemovePendingFile,
    updatePendingFile,
    startProgressSimulation,
    stopProgressSimulation,
  } = useFileUploadSimulation();
  const [projectFiles, setProjectFiles] = useState([]);
  
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
  const [projectTypeDropdownOpen, setProjectTypeDropdownOpen] = useState(false);
  const projectTypeDropdownRef = useRef(null);

  const userRole = user?.role || 'employee';
  // Close status & priority dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (statusDropdownOpen && statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) {
        setStatusDropdownOpen(false);
      }
      if (priorityDropdownOpen && priorityDropdownRef.current && !priorityDropdownRef.current.contains(e.target)) {
        setPriorityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusDropdownOpen, priorityDropdownOpen]);

  // Check if current user is authorized to edit status & priority (Admin or Assigned Manager)
  const canEditStatusAndPriority = useMemo(() => {
    if (!user) return false;
    const role = (user.role || '').toLowerCase();
    if (role === 'admin') return true;
    if (role !== 'manager') return false;

    const currentProject = loadedProject || project;
    const userId = String(user._id || user.id || '');
    const projId = String(currentProject?.id || currentProject?._id || '');
    const deptId = String(
      currentProject?.departmentId ||
      currentProject?.department?._id ||
      currentProject?.department ||
      ''
    );

    // 1. Check if manager is in departmentManagers prop
    if (Array.isArray(departmentManagers) && departmentManagers.some(m => String(m?._id || m?.id || m) === userId)) {
      return true;
    }

    // 2. Check manager's assigned departments
    const userDeptIds = (Array.isArray(user.department) ? user.department : (user.department ? [user.department] : []))
      .map(d => String(d?._id || d || ''));
    if (deptId && userDeptIds.includes(deptId)) {
      return true;
    }

    // 3. Check if manager is assigned to this project
    const userAllowedProjects = (Array.isArray(user.allowedProjects) ? user.allowedProjects : [])
      .map(p => String(p?._id || p || ''));
    if (projId && userAllowedProjects.includes(projId)) {
      return true;
    }

    const projectMembers = (Array.isArray(currentProject?.members) ? currentProject.members : [])
      .map(m => String(m?._id || m?.id || m || ''));
    if (projectMembers.includes(userId)) {
      return true;
    }

    // 4. Check if manager is project owner
    const ownerId = String(currentProject?.owner?._id || currentProject?.owner || '');
    if (ownerId && ownerId === userId) {
      return true;
    }

    return false;
  }, [user, project, loadedProject, departmentManagers]);
  const canManageReminders = userRole === 'admin' || userRole === 'manager';

  // Draft key for localStorage
  const draftKey = useMemo(() => {
    const id = project?.id || project?._id;
    return `projectDraft:${draftScope}:edit:${id || 'unknown'}`;
  }, [project, draftScope]);

  // Tabs configuration
  const tabs = useMemo(() => [
    { id: 'details', label: 'Details', icon: FileText },
    { id: 'files', label: 'Files', icon: Paperclip, badge: projectFiles.length || undefined },
    { id: 'team', label: 'Team', icon: Users, badge: formData.assignees.length || undefined },
    { id: 'activity', label: 'Activity', icon: History, badge: activityLog.length || undefined }
  ], [projectFiles.length, formData.assignees.length, activityLog.length]);

  // Keep a ref to formData to avoid re-triggering the auto-save effect on every change
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  // Auto-save draft using interval + ref (avoids re-render cascade on every keystroke)
  useEffect(() => {
    if (!isOpen || !loadedProject?.canEdit) return;

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
  }, [isOpen, draftKey, loadedProject?.canEdit]);

  // Load project data
  useEffect(() => {
    let cancelled = false;
    if (isOpen && project) {
      const fetchFullProject = async () => {
        try {
          const response = await Database.getProject(project.id || project._id);
          if (cancelled) return;
          const fullProject = response.data;
          if (!fullProject?.canEdit) {
            toast.error('You do not have permission to edit this project');
            onClose();
            return;
          }
          setLoadedProject(fullProject);
          
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
            totalProjectBudget: fullProject.totalProjectBudget || '',
            milestoneWorkflow: fullProject.milestoneWorkflow || 'sequential',
            milestones: (fullProject.milestones || []).map((milestone, order) => ({
              ...milestone,
              amount: milestone.amount,
              dueDate: milestone.dueDate ? String(milestone.dueDate).slice(0, 10) : '',
              order
            })),
            dueDate: fullProject.dueDate ? new Date(fullProject.dueDate).toISOString().split('T')[0] : '',
            clientName: fullProject.clientDetails?.clientName || '',
            clientEmail: fullProject.clientDetails?.clientEmail || '',
            ...splitClientPhone(fullProject.clientDetails?.clientWhatsappNumber),
            projectCategory: fullProject.projectCategory || '',
            technologies: (fullProject.technologies || []).map(technology => technology._id || technology),
            marketingContact: fullProject.clientDetails?.marketingContact === true,
            assignees: fullProject.members?.map(m => typeof m === 'string' ? m : m._id) || [],
            estimatedTime: fullProject.estimatedTime || '',
            status: fullProject.status || 'planning',
            priority: fullProject.priority || 'medium',
            visibility: fullProject.visibility || 'public',
            projectType: fullProject.projectType || 'Hired Client'
          });
          // Restore after loading the server record, so the fetch does not
          // overwrite autosaved selections or checkbox changes.
          try {
            const draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
            if (draft?.formData) {
              setFormData(previous => ({ ...previous, ...draft.formData }));
              setDraftStatus('Draft restored ✅');
            }
          } catch (error) { console.error('Failed to restore project draft:', error); }
          
          setCoverImage(fullProject.coverImage || null);
          setCoverImageHistory(fullProject.coverImageHistory || []);
          await fetchCategories(fullProject);
          
          // Attachments and activity are now fetched lazily when their tabs are selected
        } catch (error) {
          if (cancelled) return;
          console.error('Error fetching full project:', error);
          toast.error('Failed to load project details');
        }
      };
      fetchFullProject();
    }
    return () => { cancelled = true; };
  }, [isOpen, project, draftKey]);

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

  const handleProjectTypeChange = useCallback((type) => {
    setFormData(prev => {
      const next = { ...prev, projectType: type };
      if (type === 'Inhouse') {
        next.projectSource = 'Direct';
        next.billingCycle = 'hr';
        next.fixedPrice = '';
        next.hourlyPrice = '';
        next.totalProjectBudget = '';
        next.milestones = [];
        next.projectUrl = '';
        next.upworkId = '';
        next.estimatedTime = '';
        next.clientName = '';
        next.clientEmail = '';
        next.clientCountryCode = '';
        next.clientMobileNumber = '';
        next.marketingContact = false;
      }
      return next;
    });
    setProjectTypeDropdownOpen(false);
  }, []);

  // File handlers

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
    // Only validate client fields for Hired Client projects
    if (formData.projectType !== 'Inhouse') {
      Object.assign(newErrors, validateProjectClient(formData.projectType, clientDetailsFromForm(formData)));
      if (formData.billingCycle === 'milestone') {
        const milestoneError = validateMilestoneSchedule(formData);
        if (milestoneError) newErrors.milestones = milestoneError;
      }
    }
    setErrors(newErrors);
    return { isValid: Object.keys(newErrors).length === 0, errors: newErrors };
  };

  // Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!loadedProject?.canEdit) return;
    const validation = validateForm();
    if (!validation.isValid) {
      const errorMessages = Object.values(validation.errors).filter(Boolean);
      toast.error(
        <div>
          <p className="font-semibold mb-1">Please fix the validation errors:</p>
          <ul className="list-disc pl-4 text-sm">
            {errorMessages.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      );
      return;
    }

    setLoading(true);
    try {
      const updates = {
        name: formData.title,
        description: formData.description,
        startDate: formData.startDate,
        dueDate: formData.dueDate,
        projectCategory: formData.projectCategory,
        technologies: formData.technologies,
        members: formData.assignees,
        status: formData.status,
        priority: formData.priority,
        visibility: formData.visibility,
        projectType: formData.projectType
      };

      // Only include client/billing fields for Hired Client projects
      if (formData.projectType !== 'Inhouse') {
        updates.projectUrl = formData.projectUrl;
        updates.projectSource = formData.projectSource;
        updates.upworkId = formData.upworkId;
        updates.billingCycle = formData.billingCycle;
        if (formData.billingCycle === 'fixed') updates.fixedPrice = formData.fixedPrice;
        if (['hr', 'hourly'].includes(formData.billingCycle)) updates.hourlyPrice = formData.hourlyPrice;
        if (formData.billingCycle === 'milestone') {
          updates.totalProjectBudget = formData.totalProjectBudget;
          updates.milestoneWorkflow = formData.milestoneWorkflow;
          updates.milestones = formData.milestones.map((milestone, order) => ({
            _id: milestone._id,
            title: milestone.title,
            amount: milestone.amount,
            dueDate: milestone.dueDate,
            order
          }));
        }
        updates.estimatedTime = formData.estimatedTime;
        updates.clientDetails = {
          ...clientDetailsFromForm(formData),
        };
      }

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
      if (error.fieldErrors) { setErrors(prev => ({ ...prev, ...error.fieldErrors })); setActiveTab('details'); }
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

  if (!isOpen || !project || !loadedProject?.canEdit) return null;

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
            className={`fixed right-0 top-0 h-full ${drawerWidth} bg-[#f4f5f7] shadow-2xl z-[61] flex flex-col`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex-shrink-0 bg-blue-600 pt-5">
              <div className="flex items-center justify-between px-6">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-white truncate max-w-md">
                        {formData.title || 'Edit Project'}
                      </h2>
                      {canEditStatusAndPriority ? (
                        <div className="flex items-center gap-2">
                          {/* Status Dropdown */}
                          <div className="relative" ref={statusDropdownRef}>
                            <button
                              type="button"
                              onClick={() => {
                                setStatusDropdownOpen(prev => !prev);
                                setPriorityDropdownOpen(false);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 hover:bg-white/30 text-white border border-white/20 transition-all active:scale-95 shadow-sm cursor-pointer"
                              title="Click to change status"
                            >
                              <span className={`w-2 h-2 rounded-full ${STATUS_OPTIONS.find(o => o.value === formData.status)?.dot || 'bg-gray-300'}`} />
                              <span>{STATUS_OPTIONS.find(o => o.value === formData.status)?.label || formData.status}</span>
                              <ChevronDown size={12} className={`transition-transform duration-200 ${statusDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {statusDropdownOpen && (
                              <div className="absolute left-0 top-full mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-[70] py-1 text-gray-800">
                                {STATUS_OPTIONS.map(opt => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      setFormData(prev => ({ ...prev, status: opt.value }));
                                      setStatusDropdownOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors hover:bg-gray-50 cursor-pointer ${formData.status === opt.value ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-700'}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                                      <span>{opt.label}</span>
                                    </div>
                                    {formData.status === opt.value && <CheckCircle2 size={13} className="text-blue-600" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Priority Dropdown */}
                          <div className="relative" ref={priorityDropdownRef}>
                            <button
                              type="button"
                              onClick={() => {
                                setPriorityDropdownOpen(prev => !prev);
                                setStatusDropdownOpen(false);
                              }}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white/20 hover:bg-white/30 text-white border border-white/20 transition-all active:scale-95 shadow-sm cursor-pointer"
                              title="Click to change priority"
                            >
                              <span className={`w-2 h-2 rounded-full ${PRIORITY_OPTIONS.find(o => o.value === formData.priority)?.dot || 'bg-amber-300'}`} />
                              <span>{PRIORITY_OPTIONS.find(o => o.value === formData.priority)?.label || formData.priority}</span>
                              <ChevronDown size={12} className={`transition-transform duration-200 ${priorityDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {priorityDropdownOpen && (
                              <div className="absolute left-0 top-full mt-2 w-40 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-[70] py-1 text-gray-800">
                                {PRIORITY_OPTIONS.map(opt => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      setFormData(prev => ({ ...prev, priority: opt.value }));
                                      setPriorityDropdownOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors hover:bg-gray-50 cursor-pointer ${formData.priority === opt.value ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-700'}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                                      <span>{opt.label}</span>
                                    </div>
                                    {formData.priority === opt.value && <CheckCircle2 size={13} className="text-indigo-600" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <StatusBadge status={formData.status} />
                          <PriorityBadge priority={formData.priority} />
                        </div>
                      )}
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

                  {/* Project Type Dropdown */}
                  <div className="relative" ref={projectTypeDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setProjectTypeDropdownOpen(!projectTypeDropdownOpen)}
                      className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-sm text-white hover:bg-white/20 transition-all font-medium min-w-[130px] justify-between border border-white/10"
                    >
                      <div className="flex items-center gap-2">
                        <Briefcase size={14} className={formData.projectType === 'Inhouse' ? 'text-emerald-300' : 'text-orange-300'} />
                        <span>{formData.projectType}</span>
                      </div>
                      <ChevronDown size={14} className={`transition-transform duration-200 ${projectTypeDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {projectTypeDropdownOpen && (
                      <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 origin-top-right">
                        <div className="p-1">
                          {[{ value: 'Inhouse', icon: Shield, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                            { value: 'Hired Client', icon: Briefcase, color: 'text-orange-600', bg: 'bg-orange-50' }
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => handleProjectTypeChange(option.value)}
                              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                formData.projectType === option.value
                                  ? `${option.bg} ${option.color} font-medium`
                                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                              }`}
                            >
                              <option.icon size={16} />
                              <span>{option.value}</span>
                              {formData.projectType === option.value && <CheckCircle2 size={14} className="ml-auto" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFullScreen(!isFullScreen)}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95"
                  >
                    {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95 hover:rotate-90 duration-200"
                  >
                    <X size={24} />
                  </button>
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
                        <BasicInfoSection
                          title={formData.title}
                          description={formData.description}
                          startDate={formData.startDate}
                          dueDate={formData.dueDate}
                          errors={errors}
                          handleInputChange={handleInputChange}
                          handleDescriptionChange={(val) => setFormData(prev => ({ ...prev, description: val }))}
                          handleStartDateChange={(date) => {
                            setFormData(prev => ({ ...prev, startDate: date || '' }));
                            if (errors.startDate) setErrors(prev => ({ ...prev, startDate: '' }));
                            if (date && formData.dueDate && new Date(formData.dueDate) < new Date(date)) {
                              setFormData(prev => ({ ...prev, dueDate: '' }));
                            }
                          }}
                          handleDueDateChange={(date) => {
                            setFormData(prev => ({ ...prev, dueDate: date || '' }));
                            if (errors.dueDate) setErrors(prev => ({ ...prev, dueDate: '' }));
                          }}
                        />

                        {/* Status & Priority Section */}
                        <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                              <Activity size={16} className="text-indigo-600" />
                              Status & Priority
                            </h3>
                            {!canEditStatusAndPriority && (
                              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1 font-medium">
                                <Lock size={12} /> View only (Admin & Authorized Manager only)
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField label="Status" icon={CheckCircle2} required>
                              <select
                                name="status"
                                value={formData.status}
                                disabled={!canEditStatusAndPriority}
                                onChange={handleInputChange}
                                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-900 transition-all ${!canEditStatusAndPriority ? "bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200" : "bg-white border-gray-300 hover:border-blue-300 cursor-pointer"}`}
                              >
                                {STATUS_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </FormField>

                            <FormField label="Priority" icon={TrendingUp} required>
                              <select
                                name="priority"
                                value={formData.priority}
                                disabled={!canEditStatusAndPriority}
                                onChange={handleInputChange}
                                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-900 transition-all ${!canEditStatusAndPriority ? "bg-gray-100 text-gray-500 cursor-not-allowed border-gray-200" : "bg-white border-gray-300 hover:border-blue-300 cursor-pointer"}`}
                              >
                                {PRIORITY_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </FormField>
                          </div>
                        </section>

                        {/* Client Reminder Card (for completed projects) */}
                        {(formData.status === 'completed' || project?.status === 'completed') && canManageReminders && (
                          <section className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-5 border border-indigo-200 shadow-sm">
                            <div className="flex items-center justify-between flex-wrap gap-4">
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
                                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg cursor-pointer"
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
                                  clientWhatsappNumber: clientDetailsFromForm(formData).clientWhatsappNumber
                                }}
                                onOpenReminderModal={() => setShowReminderModal(true)}
                                compact={true}
                              />
                            </div>
                          </section>
                        )}

                        {/* Project Details */}
                          <ProjectDetailsSection
                            projectType={formData.projectType}
                            technologies={formData.technologies}
                            projectSource={formData.projectSource}
                            upworkId={formData.upworkId}
                            billingCycle={formData.billingCycle}
                            fixedPrice={formData.fixedPrice}
                            hourlyPrice={formData.hourlyPrice}
                            totalProjectBudget={formData.totalProjectBudget}
                            milestoneWorkflow={formData.milestoneWorkflow}
                            milestones={formData.milestones}
                            estimatedTime={formData.estimatedTime}
                            projectUrl={formData.projectUrl}
                            projectCategory={formData.projectCategory}
                            categories={categories}
                            errors={errors}
                            projectUrlValid={true} // Validated inside handleInputChange in Edit usually
                            handleInputChange={handleInputChange}
                            handleDropdownChange={(name, val) => {
                              setFormData(prev => {
                                if (name === 'billingCycle') {
                                  return {
                                    ...prev,
                                    billingCycle: val,
                                    fixedPrice: val === 'fixed' ? prev.fixedPrice : '',
                                    hourlyPrice: ['hr', 'hourly'].includes(val) ? prev.hourlyPrice : '',
                                    milestones: val === 'milestone' && prev.milestones.length === 0
                                      ? [{ ...createEmptyMilestone(), order: 0 }]
                                      : prev.milestones
                                  };
                                }
                                return { ...prev, [name]: val };
                              });
                            }}
                            handleMilestonesChange={(milestones) => setFormData(prev => ({ ...prev, milestones }))}
                            handleBudgetChange={(totalProjectBudget) => setFormData(prev => ({ ...prev, totalProjectBudget }))}
                            handleWorkflowChange={(milestoneWorkflow) => setFormData(prev => ({ ...prev, milestoneWorkflow }))}
                            handleCategoryChange={(category) => setFormData(prev => ({ ...prev, projectCategory: category }))}
                            handleDeleteCategory={() => {}} // Category deletion in edit usually less critical or handled via API
                            handleCreateCategory={(name, description) => {}} // Add Category form not typically inside Edit Modal
                          />

                        {/* Client Information */}
                        {formData.projectType !== 'Inhouse' && (
                          <ClientSection
                            marketingContact={formData.marketingContact}
                            required={formData.projectType === 'Hired Client'}
                            clientName={formData.clientName}
                            clientEmail={formData.clientEmail}
                            clientCountryCode={formData.clientCountryCode}
                            clientMobileNumber={formData.clientMobileNumber}
                            errors={errors}
                            handleInputChange={handleInputChange}
                            handleBlur={(field) => setErrors(prev => ({ ...prev, [field]: validateProjectClient(formData.projectType, clientDetailsFromForm(formData))[field] || '' }))}
                            handleCountryCodeChange={(code) => {
                              setFormData(prev => ({ ...prev, clientCountryCode: code, clientMobileNumber: '' }));
                              setErrors(prev => ({ ...prev, clientMobileNumber: '' }));
                            }}
                            handleMobileNumberChange={(event) => {
                              const country = COUNTRY_CODES.find(item => item.code === formData.clientCountryCode);
                              const value = event.target.value.replace(/\D/g, '');
                              setFormData(prev => ({ ...prev, clientMobileNumber: country ? value.slice(0, country.digits) : value }));
                              setErrors(prev => ({ ...prev, clientMobileNumber: '' }));
                            }}
                          />
                        )}
                      </form>
                  )}

                  {/* Files Tab */}
                  {activeTab === 'files' && (
                    <FilesTab
                      pendingFiles={pendingFiles}
                      existingFiles={projectFiles}
                      handleFilesAdded={handleFilesAdded}
                      handleRemovePendingFile={handleRemovePendingFile}
                      handleRemoveExisting={handleDeleteExistingFile}
                      uploadErrors={uploadErrors}
                      showVersionHistory={true}
                    />
                  )}

                  {/* Team Tab */}
                  {activeTab === 'team' && (
                    <TeamTab
                      managers={managers}
                      assignees={formData.assignees}
                      selectedEmployees={selectedEmployees}
                      errors={errors}
                      handleAssigneeChange={handleAssigneeChange}
                    />
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
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-6 py-3 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  Cancel
                </button>
                
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 font-semibold transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/30"
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
                </button>
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
                clientWhatsappNumber: clientDetailsFromForm(formData).clientWhatsappNumber
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
});

EnterpriseEditProjectModal.displayName = 'EnterpriseEditProjectModal';

export default function EditProjectModal(props) {
  const { canEdit, scopeKey } = useProjectAccess(props.project);
  return canEdit && props.isOpen ? <EnterpriseEditProjectModal {...props} key={`${scopeKey}:${props.project?._id || props.project?.id}`} draftScope={scopeKey} /> : null;
}
