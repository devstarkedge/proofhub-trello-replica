"use client";

import { useState, useEffect, useCallback, useMemo, memo, useRef, useContext } from "react";
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Plus, AlertCircle, Loader, Calendar, Users, DollarSign,
  Link2, FileText, Briefcase, Clock, Globe, Mail, Phone, Tag,
  CheckCircle2, ChevronDown, ChevronLeft, Shield, User, Crown, Search, Image,
  Maximize2, Minimize2, Info, Paperclip, ArrowRight, Trash2
} from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { Badge } from "./ui/badge";
import { toast } from "react-toastify";
import Database from "../services/database";
import ReactCountryFlag from "react-country-flag";
import CoverImageUploader from "./CoverImageUploader";
import EnterpriseFileUploader from "./EnterpriseFileUploader";
import AuthContext from '../context/AuthContext';
import ProjectOptionsDropdown from './ProjectOptionsDropdown';
import DatePickerModal from "./DatePickerModal";

// Country codes data
const COUNTRY_CODES = [
  { code: "+91", country: "IND", countryCode: "IN", name: "India", digits: 10 },
  { code: "+1", country: "USA", countryCode: "US", name: "United States", digits: 10 },
  { code: "+44", country: "UK", countryCode: "GB", name: "United Kingdom", digits: 10 },
  { code: "+61", country: "AUS", countryCode: "AU", name: "Australia", digits: 9 },
  { code: "+86", country: "CHN", countryCode: "CN", name: "China", digits: 11 },
  { code: "+81", country: "JPN", countryCode: "JP", name: "Japan", digits: 10 },
  { code: "+49", country: "DEU", countryCode: "DE", name: "Germany", digits: 10 },
  { code: "+33", country: "FRA", countryCode: "FR", name: "France", digits: 9 },
  { code: "+971", country: "UAE", countryCode: "AE", name: "UAE", digits: 9 },
  { code: "+65", country: "SGP", countryCode: "SG", name: "Singapore", digits: 8 },
  { code: "+55", country: "BRA", countryCode: "BR", name: "Brazil", digits: 11 },
  { code: "+7", country: "RUS", countryCode: "RU", name: "Russia", digits: 10 },
  { code: "+39", country: "ITA", countryCode: "IT", name: "Italy", digits: 10 },
  { code: "+34", country: "ESP", countryCode: "ES", name: "Spain", digits: 9 },
  { code: "+82", country: "KOR", countryCode: "KR", name: "South Korea", digits: 10 },
  { code: "+92", country: "PAK", countryCode: "PK", name: "Pakistan", digits: 10 },
  { code: "+880", country: "BGD", countryCode: "BD", name: "Bangladesh", digits: 10 },
  { code: "+27", country: "ZAF", countryCode: "ZA", name: "South Africa", digits: 9 },
  { code: "+60", country: "MYS", countryCode: "MY", name: "Malaysia", digits: 9 },
  { code: "+63", country: "PHL", countryCode: "PH", name: "Philippines", digits: 10 },
  { code: "+966", country: "SAU", countryCode: "SA", name: "Saudi Arabia", digits: 9 },
  { code: "+64", country: "NZL", countryCode: "NZ", name: "New Zealand", digits: 9 },
  { code: "+41", country: "CHE", countryCode: "CH", name: "Switzerland", digits: 9 },
  { code: "+31", country: "NLD", countryCode: "NL", name: "Netherlands", digits: 9 },
  { code: "+46", country: "SWE", countryCode: "SE", name: "Sweden", digits: 9 },
];

// Validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PROJECT_URL_REGEX = /^https?:\/\/([a-z0-9-]+\.)+[a-z]{2,}(?:[:0-9]*)?(?:\/\S*)?$/i;

// Drawer variants
const drawerVariants = {
  hidden: { x: '100%', opacity: 0 },
  visible: { 
    x: 0, 
    opacity: 1,
    transition: { type: 'spring', damping: 30, stiffness: 300 } 
  },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2 } }
};

// Form field component
const FormField = ({ label, icon: Icon, required, error, helperText, children, className = '' }) => (
  <div className={`space-y-2 ${className}`}>
    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
      {Icon && <Icon className="h-4 w-4 text-blue-600" />}
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
);

// Tab component
const Tab = ({ tabs, activeTab, onTabChange }) => (
  <div className="flex gap-1 p-1 bg-white/10 rounded-xl backdrop-blur-sm">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          activeTab === tab.id
            ? 'bg-white text-blue-600 shadow-sm'
            : 'text-white/80 hover:text-white hover:bg-white/10'
        }`}
      >
        <tab.icon size={16} />
        {tab.label}
      </button>
    ))}
  </div>
);

const EnterpriseAddProjectModal = memo(({ isOpen, onClose, departmentId, onProjectAdded, departmentManagers = [] }) => {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('details');
  const [isFullScreen, setIsFullScreen] = useState(false);

  const initialFormData = useMemo(() => ({
    title: "",
    description: "",
    projectUrl: "",
    startDate: "",
    projectSource: "Direct",
    upworkId: "",
    billingCycle: "hr",
    fixedPrice: "",
    hourlyPrice: "",
    dueDate: "",
    clientName: "",
    clientEmail: "",
    clientCountryCode: "+91",
    clientMobileNumber: "",
    projectCategory: "",
    assignees: [],
    estimatedTime: "",
    visibility: "public",
  }), []);

  const [formData, setFormData] = useState(initialFormData);
  const managers = useMemo(() => departmentManagers || [], [departmentManagers]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [projectUrlValid, setProjectUrlValid] = useState(true);
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [visibilityDropdownOpen, setVisibilityDropdownOpen] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState(null);
  const [coverImagePreview, setCoverImagePreview] = useState(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [draftStatus, setDraftStatus] = useState("");
  const draftTimerRef = useRef(null);
  const countryDropdownRef = useRef(null);
  const categoryDropdownRef = useRef(null);
  const visibilityDropdownRef = useRef(null);
  const uploadProgressTimers = useRef(new Map());

  // Filter countries
  const filteredCountries = useMemo(() => {
    if (!countrySearchQuery.trim()) return COUNTRY_CODES;
    const query = countrySearchQuery.toLowerCase().trim();
    return COUNTRY_CODES.filter(country =>
      country.code.toLowerCase().includes(query) ||
      country.country.toLowerCase().includes(query) ||
      country.name.toLowerCase().includes(query)
    );
  }, [countrySearchQuery]);

  const selectedCountry = useMemo(() =>
    COUNTRY_CODES.find(c => c.code === formData.clientCountryCode) || COUNTRY_CODES[0],
    [formData.clientCountryCode]
  );

  const tabs = useMemo(() => [
    { id: 'details', label: 'Details', icon: FileText },
    { id: 'files', label: 'Files', icon: Paperclip },
    { id: 'team', label: 'Team', icon: Users }
  ], []);

  // Draft key
  const draftKey = useMemo(() => (
    departmentId ? `projectDraft:add:${departmentId}` : 'projectDraft:add:global'
  ), [departmentId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (countryDropdownOpen && countryDropdownRef.current && !countryDropdownRef.current.contains(event.target)) {
        setCountryDropdownOpen(false);
      }
      if (categoryDropdownOpen && categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setCategoryDropdownOpen(false);
      }
      if (visibilityDropdownOpen && visibilityDropdownRef.current && !visibilityDropdownRef.current.contains(event.target)) {
        setVisibilityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [countryDropdownOpen, categoryDropdownOpen]);

  // Fetch categories
  useEffect(() => {
    if (isOpen && departmentId) fetchCategories();
  }, [isOpen, departmentId]);

  // Reset form on close
  useEffect(() => {
    if (!isOpen) {
      setFormData(initialFormData);
      setErrors({});
      setTouched({});
      setShowAddCategory(false);
      setPendingFiles([]);
      setUploadErrors([]);
      setDraftStatus("");
      setActiveTab('details');
      // Clear progress timers
      uploadProgressTimers.current.forEach((timer) => clearInterval(timer));
      uploadProgressTimers.current.clear();
    }
  }, [isOpen, initialFormData]);

  // Cleanup progress timers on unmount
  useEffect(() => {
    return () => {
      uploadProgressTimers.current.forEach((timer) => clearInterval(timer));
      uploadProgressTimers.current.clear();
    };
  }, []);

  // Restore draft
  useEffect(() => {
    if (!isOpen) return;
    try {
      const draftRaw = localStorage.getItem(draftKey);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        if (draft?.formData) {
          setFormData(prev => ({ ...prev, ...draft.formData }));
          setDraftStatus("Draft restored ✅");
          setTimeout(() => setDraftStatus(""), 3000);
        }
      }
    } catch (error) {
      console.error('Failed to restore project draft:', error);
    }
  }, [isOpen, draftKey]);

  // Auto-save draft
  useEffect(() => {
    if (!isOpen) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);

    draftTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          formData,
          savedAt: new Date().toISOString()
        }));
        setDraftStatus("Draft Saved ✅");
        setTimeout(() => setDraftStatus(""), 2000);
      } catch (error) {
        console.error('Failed to save project draft:', error);
      }
    }, 1000);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [formData, isOpen, draftKey]);

  const fetchCategories = useCallback(async () => {
    if (!departmentId) return;
    setCategoryLoading(true);
    try {
      const response = await Database.getCategoriesByDepartment(departmentId);
      if (response.success) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setCategoryLoading(false);
    }
  }, [departmentId]);

  const handleCategoryChange = useCallback((value) => {
    if (value === "add-new") {
      setShowAddCategory(true);
    } else {
      setFormData((prev) => ({ ...prev, projectCategory: value }));
    }
  }, []);

  const handleCreateCategory = useCallback(async () => {
    if (!newCategoryName.trim()) {
      toast.error("Category name is required");
      return;
    }
    try {
      const response = await Database.createCategory(newCategoryName.trim(), newCategoryDescription.trim(), departmentId);
      if (response.success) {
        const newCategory = response.data;
        setCategories((prev) => [...prev, newCategory]);
        setFormData((prev) => ({ ...prev, projectCategory: newCategory.name }));
        setShowAddCategory(false);
        setNewCategoryName("");
        setNewCategoryDescription("");
        toast.success("Category created!");
      }
    } catch (error) {
      toast.error(error.message || "Failed to create category");
    }
  }, [newCategoryName, newCategoryDescription, departmentId]);

  const handleDeleteCategory = useCallback(async (categoryId, categoryName, e) => {
    e.stopPropagation(); // Prevent dropdown from closing
    
    if (!window.confirm(`Are you sure you want to delete "${categoryName}"?`)) {
      return;
    }

    try {
      // Optimistically remove from UI
      setCategories((prev) => prev.filter((cat) => cat._id !== categoryId));
      
      // If the deleted category was selected, clear the selection
      if (formData.projectCategory === categoryName) {
        setFormData((prev) => ({ ...prev, projectCategory: "" }));
      }

      const response = await Database.deleteCategory(categoryId);
      if (response.success) {
        toast.success("Category deleted successfully!");
      }
    } catch (error) {
      // Revert on error by refetching
      fetchCategories();
      toast.error(error.message || "Failed to delete category");
    }
  }, [formData.projectCategory, fetchCategories]);

  const fetchDepartmentTeams = useCallback(async () => {
    try {
      const response = await Database.getTeams();
      return response.data.filter((team) => team.department && team.department._id === departmentId);
    } catch (error) {
      return [];
    }
  }, [departmentId]);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    if ((name === 'fixedPrice' || name === 'hourlyPrice') && parseFloat(value) < 0) return;

    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }

    if (name === 'projectUrl') {
      const trimmed = value.trim();
      if (!trimmed) {
        setProjectUrlValid(false);
        setErrors((prev) => ({ ...prev, projectUrl: "" }));
      } else if (!PROJECT_URL_REGEX.test(trimmed)) {
        setProjectUrlValid(false);
        setErrors((prev) => ({ ...prev, projectUrl: "Please enter a valid URL" }));
      } else {
        setProjectUrlValid(true);
        setErrors((prev) => ({ ...prev, projectUrl: "" }));
      }
    }
  }, [errors]);

  const handleBlur = useCallback((fieldName) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }));

    if (fieldName === 'clientEmail' && formData.clientEmail) {
      if (!EMAIL_REGEX.test(formData.clientEmail)) {
        setErrors((prev) => ({ ...prev, clientEmail: "Invalid email format" }));
      } else {
        setErrors((prev) => ({ ...prev, clientEmail: "" }));
      }
    }

    if (fieldName === 'clientMobileNumber' && formData.clientMobileNumber) {
      if (formData.clientMobileNumber.length !== selectedCountry.digits) {
        setErrors((prev) => ({
          ...prev,
          clientMobileNumber: `Must be ${selectedCountry.digits} digits`
        }));
      } else {
        setErrors((prev) => ({ ...prev, clientMobileNumber: "" }));
      }
    }
  }, [formData.clientEmail, formData.clientMobileNumber, selectedCountry]);

  const handleMobileNumberChange = useCallback((e) => {
    const value = e.target.value.replace(/\D/g, '');
    const truncatedValue = value.slice(0, selectedCountry.digits);
    setFormData((prev) => ({ ...prev, clientMobileNumber: truncatedValue }));
  }, [selectedCountry.digits]);

  const handleCountryCodeChange = useCallback((code) => {
    setFormData((prev) => ({
      ...prev,
      clientCountryCode: code,
      clientMobileNumber: ""
    }));
    setErrors((prev) => ({ ...prev, clientMobileNumber: "" }));
    setCountryDropdownOpen(false);
  }, []);

  const handleAssigneeChange = useCallback((employeeId) => {
    setFormData((prev) => ({
      ...prev,
      assignees: prev.assignees.includes(employeeId)
        ? prev.assignees.filter((id) => id !== employeeId)
        : [...prev.assignees, employeeId],
    }));
    if (errors.assignees) {
      setErrors((prev) => ({ ...prev, assignees: "" }));
    }
  }, [errors.assignees]);

  // Start progress simulation for a file (animates 0% -> 90%)
  const startProgressSimulation = useCallback((id) => {
    if (uploadProgressTimers.current.has(id)) return;
    const timer = setInterval(() => {
      setPendingFiles(prev => prev.map(fileItem => {
        if (fileItem.id !== id || fileItem.status !== 'uploading') return fileItem;
        const current = Number(fileItem.progress) || 0;
        if (current >= 90) {
          // Stop at 90%, mark as ready for actual upload
          clearInterval(uploadProgressTimers.current.get(id));
          uploadProgressTimers.current.delete(id);
          return { ...fileItem, progress: 90, status: 'ready' };
        }
        const increment = 3 + Math.round(Math.random() * 5);
        return { ...fileItem, progress: Math.min(90, current + increment) };
      }));
    }, 300);
    uploadProgressTimers.current.set(id, timer);
  }, []);

  // Stop progress simulation for a file
  const stopProgressSimulation = useCallback((id) => {
    const timer = uploadProgressTimers.current.get(id);
    if (timer) {
      clearInterval(timer);
      uploadProgressTimers.current.delete(id);
    }
  }, []);

  const handleFilesAdded = useCallback((files) => {
    const newItems = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: 'uploading' // Start as uploading to show progress bar
    }));
    setPendingFiles((prev) => [...prev, ...newItems]);
    setUploadErrors([]);

    // Start progress simulation for each file
    newItems.forEach(item => startProgressSimulation(item.id));
  }, [startProgressSimulation]);

  const handleRemovePendingFile = useCallback((item) => {
    // Stop any running progress simulation
    stopProgressSimulation(item.id);
    setPendingFiles((prev) => prev.filter((f) => f.id !== item.id));
  }, [stopProgressSimulation]);

  const updatePendingFile = useCallback((id, updates) => {
    setPendingFiles((prev) => prev.map((fileItem) => (
      fileItem.id === id ? { ...fileItem, ...updates } : fileItem
    )));
  }, []);

  // Retry failed upload
  const handleRetryUpload = useCallback((item) => {
    // Reset status and restart progress simulation
    updatePendingFile(item.id, { status: 'uploading', progress: 0, error: null });
    startProgressSimulation(item.id);
  }, [updatePendingFile, startProgressSimulation]);

  const validateForm = useCallback(() => {
    const newErrors = {};
    if (!formData.title.trim()) newErrors.title = "Title is required";
    else if (formData.title.length < 3) newErrors.title = "Title must be at least 3 characters";
    if (!formData.startDate) newErrors.startDate = "Start date is required";
    if (formData.dueDate && new Date(formData.startDate) >= new Date(formData.dueDate)) {
      newErrors.dueDate = "Due date must be after start date";
    }
    if (formData.assignees.length === 0) newErrors.assignees = "At least one assignee is required";
    if (formData.clientEmail && !EMAIL_REGEX.test(formData.clientEmail)) {
      newErrors.clientEmail = "Invalid email format";
    }
    if (formData.clientMobileNumber && formData.clientMobileNumber.length !== selectedCountry.digits) {
      newErrors.clientMobileNumber = `Must be ${selectedCountry.digits} digits`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, selectedCountry]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (formData.projectUrl && !projectUrlValid) {
      toast.error("Please enter a valid project URL");
      return;
    }
    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      setActiveTab('details');
      return;
    }

    setIsSaving(true);

    // Optimistic UI update
    const optimisticProject = {
      _id: `temp-${Date.now()}`,
      name: formData.title,
      description: formData.description,
      status: "planning",
      startDate: formData.startDate,
      dueDate: formData.dueDate,
      members: formData.assignees,
      visibility: formData.visibility,
      isOptimistic: true,
      createdAt: new Date().toISOString()
    };

    onProjectAdded(optimisticProject);
    onClose();
    toast.info("Creating project...", { autoClose: 2000 });

    try {
      const deptTeams = await fetchDepartmentTeams();
      const defaultTeam = deptTeams.length > 0 ? deptTeams[0]._id : null;

      const fullPhoneNumber = formData.clientMobileNumber
        ? `${formData.clientCountryCode}${formData.clientMobileNumber}`
        : "";

      const projectData = {
        name: formData.title,
        description: formData.description,
        team: defaultTeam || "",
        department: departmentId,
        members: formData.assignees,
        background: "#6366f1",
        startDate: formData.startDate,
        dueDate: formData.dueDate,
        visibility: formData.visibility,
        projectUrl: formData.projectUrl,
        projectSource: formData.projectSource,
        upworkId: formData.upworkId,
        billingCycle: formData.billingCycle,
        fixedPrice: formData.fixedPrice,
        hourlyPrice: formData.hourlyPrice,
        clientDetails: {
          clientName: formData.clientName,
          clientEmail: formData.clientEmail,
          clientWhatsappNumber: fullPhoneNumber
        },
        projectCategory: formData.projectCategory,
        estimatedTime: formData.estimatedTime,
        runBackgroundTasks: true
      };

      const response = await Database.createProject(projectData);

      if (response.success) {
        const createdProject = response.data;

        // Upload cover image
        if (coverImageFile) {
          try {
            const coverResult = await Database.uploadProjectCoverImage(createdProject._id, coverImageFile);
            if (coverResult.success) {
              createdProject.coverImage = coverResult.data.coverImage;
            }
          } catch (coverError) {
            toast.warning("Cover image upload failed");
          }
        }

        // Upload attachments (files that are 'ready' or still 'uploading')
        const filesToUpload = pendingFiles.filter(
          (item) => item.status === 'ready' || item.status === 'uploading' || item.status === 'queued'
        );
        if (filesToUpload.length > 0) {
          const failed = [];
          for (const item of filesToUpload) {
            // Start from current progress (usually 90% for 'ready' files)
            const startProgress = item.status === 'ready' ? 90 : (item.progress || 0);
            updatePendingFile(item.id, { status: 'uploading', progress: startProgress });
            try {
              await Database.uploadProjectAttachment(
                createdProject._id,
                item.file,
                (progress) => {
                  // Map actual upload progress to 90-100% range for 'ready' files
                  const mappedProgress = item.status === 'ready' 
                    ? 90 + Math.round(progress * 0.1) 
                    : progress;
                  updatePendingFile(item.id, { progress: mappedProgress });
                }
              );
              updatePendingFile(item.id, { status: 'done', progress: 100 });
            } catch (uploadError) {
              updatePendingFile(item.id, { status: 'error', error: uploadError?.message });
              failed.push(item.file.name);
            }
          }
          if (failed.length > 0) {
            toast.warning(`${failed.length} files failed to upload`);
          }
        }

        onProjectAdded(createdProject, optimisticProject._id);
        setFormData(initialFormData);
        setCoverImageFile(null);
        setCoverImagePreview(null);
        setPendingFiles([]);
        localStorage.removeItem(draftKey);
        toast.success("Project created successfully!");
      } else {
        onProjectAdded(null, optimisticProject._id, true);
        throw new Error(response.message || "Failed to create project");
      }
    } catch (error) {
      onProjectAdded(null, optimisticProject._id, true);
      toast.error(error.message || "Failed to create project");
    } finally {
      setIsSaving(false);
    }
  }, [formData, validateForm, fetchDepartmentTeams, departmentId, onProjectAdded, onClose, initialFormData, projectUrlValid, coverImageFile, pendingFiles, updatePendingFile, draftKey]);

  const selectedEmployees = useMemo(() =>
    formData.assignees.map(assigneeId => managers.find(mgr => mgr._id === assigneeId)).filter(Boolean),
    [formData.assignees, managers]
  );

  const isFormReady = useMemo(() => {
    if (!formData.title.trim() || formData.title.trim().length < 3) return false;
    if (!formData.startDate) return false;
    if (formData.assignees.length === 0) return false;
    if (formData.projectUrl && !PROJECT_URL_REGEX.test(formData.projectUrl)) return false;
    return true;
  }, [formData]);

  if (!isOpen) return null;

  const drawerWidth = isFullScreen ? 'w-full' : 'w-full max-w-5xl';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
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
            <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onClose}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  >
                    <ChevronLeft size={24} />
                  </motion.button>
                  <div>
                    <h2 className="text-xl font-bold text-white">Add New Project</h2>
                    <p className="text-blue-200 text-sm">Fill in the details to create a new project</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {draftStatus && (
                    <span className="text-sm text-emerald-300 bg-emerald-500/20 px-3 py-1 rounded-full">
                      {draftStatus}
                    </span>
                  )}
                  <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-sm text-white">
                    <span className="font-medium">Status:</span>
                    <span>Planning</span>
                  </div>

                  <div className="relative" ref={visibilityDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setVisibilityDropdownOpen(!visibilityDropdownOpen)}
                      className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-sm text-white hover:bg-white/20 transition-all font-medium min-w-[100px] justify-between border border-white/10"
                    >
                      <div className="flex items-center gap-2">
                        <Globe size={14} className={formData.visibility === 'public' ? 'text-blue-200' : 'text-gray-300'} />
                        <span className="capitalize">{formData.visibility}</span>
                      </div>
                      <ChevronDown size={14} className={`transition-transform duration-200 ${visibilityDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {visibilityDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute right-0 top-full mt-2 w-40 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 origin-top-right"
                        >
                          <div className="p-1">
                            {['public', 'private'].map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, visibility: option }));
                                  setVisibilityDropdownOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                  formData.visibility === option 
                                    ? 'bg-blue-50 text-blue-600 font-medium' 
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                              >
                                {option === 'public' ? <Globe size={16} /> : <Shield size={16} />}
                                <span className="capitalize">{option}</span>
                                {formData.visibility === option && <CheckCircle2 size={14} className="ml-auto" />}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
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
                    onClick={onClose}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  >
                    <X size={24} />
                  </motion.button>
                </div>
              </div>

              {/* Tabs */}
              <div className="mt-4">
                <Tab tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6">
                {/* Details Tab */}
                {activeTab === 'details' && (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Cover Image */}
                    <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Image size={16} className="text-purple-600" />
                        Cover Image (Optional)
                      </h3>
                      <CoverImageUploader
                        projectId={null}
                        currentCover={null}
                        coverHistory={[]}
                        onCoverChange={(data) => {
                          if (data && data.file) {
                            setCoverImageFile(data.file);
                            setCoverImagePreview(data.previewUrl);
                          } else {
                            setCoverImageFile(null);
                            setCoverImagePreview(null);
                          }
                        }}
                      />
                    </section>

                    {/* Basic Info */}
                    <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Info size={16} className="text-blue-600" />
                        Basic Information
                      </h3>

                      <div className="space-y-5">
                        <FormField label="Project Title" icon={FileText} required error={errors.title}>
                          <input
                            type="text"
                            name="title"
                            value={formData.title}
                            onChange={handleInputChange}
                            className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                              errors.title ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-blue-300'
                            }`}
                            placeholder="Enter a descriptive project title"
                          />
                        </FormField>

                        <FormField label="Description" icon={FileText} helperText="No character limit - describe your project in detail">
                          <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleInputChange}
                            rows={6}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none hover:border-blue-300"
                            placeholder="Describe the project goals, deliverables, and requirements..."
                          />
                          {formData.description && (
                            <p className="text-xs text-gray-400">{formData.description.length.toLocaleString()} characters</p>
                          )}
                        </FormField>
                      </div>
                    </section>

                    {/* Dates */}
                    <section className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Calendar size={16} className="text-green-600" />
                        Timeline
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Start Date" icon={Calendar} required error={errors.startDate}>
                          <div
                            onClick={() => setShowStartDatePicker(true)}
                            className={`w-full px-4 py-3 border rounded-xl cursor-pointer flex items-center justify-between hover:border-blue-300 ${
                              errors.startDate ? 'border-red-500 bg-red-50' : 'border-gray-300'
                            }`}
                          >
                            <span className={formData.startDate ? 'text-gray-900' : 'text-gray-400'}>
                              {formData.startDate
                                ? new Date(formData.startDate).toLocaleDateString('en-US', {
                                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                                  })
                                : 'Select start date'}
                            </span>
                            <Calendar size={16} className="text-gray-400" />
                          </div>
                        </FormField>

                        <FormField label="Due Date" icon={Calendar} error={errors.dueDate}>
                          <div
                            onClick={() => setShowDueDatePicker(true)}
                            className={`w-full px-4 py-3 border rounded-xl cursor-pointer flex items-center justify-between hover:border-blue-300 ${
                              errors.dueDate ? 'border-red-500 bg-red-50' : 'border-gray-300'
                            }`}
                          >
                            <span className={formData.dueDate ? 'text-gray-900' : 'text-gray-400'}>
                              {formData.dueDate
                                ? new Date(formData.dueDate).toLocaleDateString('en-US', {
                                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                                  })
                                : 'Select due date'}
                            </span>
                            <Calendar size={16} className="text-gray-400" />
                          </div>
                        </FormField>
                      </div>
                    </section>

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
                            allowManage={true}
                            showLabel={false}
                            theme="blue"
                          />
                        </FormField>

                        {formData.projectSource === 'Upwork' && (
                          <FormField label="Upwork ID" icon={Tag}>
                            <input
                              type="text"
                              name="upworkId"
                              value={formData.upworkId}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-300"
                              placeholder="Upwork Job ID"
                            />
                          </FormField>
                        )}

                        <FormField label="Billing Type" icon={DollarSign}>
                          <ProjectOptionsDropdown
                            optionType="billingType"
                            value={formData.billingCycle}
                            onChange={(val) => setFormData((prev) => ({ ...prev, billingCycle: val }))}
                            allowManage={true}
                            showLabel={false}
                            theme="blue"
                          />
                        </FormField>

                        {formData.billingCycle === 'fixed' ? (
                          <FormField label="Fixed Price" icon={DollarSign}>
                            <input
                              type="number"
                              name="fixedPrice"
                              value={formData.fixedPrice}
                              onChange={handleInputChange}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-300"
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
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-300"
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
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-300"
                            placeholder="e.g., 3 days, 40h"
                          />
                        </FormField>

                        <FormField label="Project URL" icon={Link2} error={errors.projectUrl}>
                          <input
                            type="text"
                            name="projectUrl"
                            value={formData.projectUrl}
                            onChange={handleInputChange}
                            className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              errors.projectUrl ? 'border-red-500 bg-red-50' : projectUrlValid && formData.projectUrl ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-300'
                            }`}
                            placeholder="https://example.com"
                          />
                        </FormField>

                        <FormField label="Category" icon={Tag}>
                          <div className="relative" ref={categoryDropdownRef}>
                            <div
                              onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl cursor-pointer flex items-center justify-between hover:border-blue-300 bg-white"
                            >
                              <span className={formData.projectCategory ? 'text-gray-900' : 'text-gray-400'}>
                                {formData.projectCategory || 'Select category'}
                              </span>
                              <ChevronDown size={16} className={`text-gray-400 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
                            </div>

                            {categoryDropdownOpen && (
                              <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                                {categories.length === 0 ? (
                                  <div className="px-4 py-3 text-sm text-gray-500">
                                    No categories available
                                  </div>
                                ) : (
                                  categories.map((cat) => (
                                    <div
                                      key={cat._id}
                                      className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 group transition-colors border-b border-gray-100 last:border-b-0"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setFormData((prev) => ({ ...prev, projectCategory: cat.name }));
                                          setCategoryDropdownOpen(false);
                                        }}
                                        className="flex-1 text-left text-sm text-gray-700 hover:text-gray-900"
                                      >
                                        {cat.name}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => handleDeleteCategory(cat._id, cat.name, e)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all ml-2"
                                        title="Delete category"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  ))
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowAddCategory(true);
                                    setCategoryDropdownOpen(false);
                                  }}
                                  className="w-full px-4 py-2.5 flex items-center gap-2 text-blue-600 hover:bg-blue-50 text-sm font-medium transition-colors border-t border-gray-200"
                                >
                                  <Plus size={14} />
                                  Add New Category
                                </button>
                              </div>
                            )}
                          </div>
                        </FormField>
                      </div>

                      {/* Add Category Form */}
                      <AnimatePresence>
                        {showAddCategory && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 p-4 bg-pink-50 border border-pink-200 rounded-xl"
                          >
                            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <Plus size={14} className="text-pink-600" />
                              New Category
                            </h4>
                            <div className="space-y-3">
                              <input
                                type="text"
                                placeholder="Category name"
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                              />
                              <textarea
                                placeholder="Description (optional)"
                                value={newCategoryDescription}
                                onChange={(e) => setNewCategoryDescription(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleCreateCategory}
                                  className="flex-1 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 font-medium"
                                >
                                  Create
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setShowAddCategory(false); setNewCategoryName(""); setNewCategoryDescription(""); }}
                                  className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </section>

                    {/* Client Information */}
                    <section className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-200">
                      <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Mail size={16} className="text-blue-600" />
                        Client Information
                      </h3>

                      <div className="space-y-4">
                        <FormField label="Client Name" icon={User}>
                          <input
                            type="text"
                            name="clientName"
                            value={formData.clientName}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-300"
                            placeholder="Client's full name"
                          />
                        </FormField>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField label="Email Address" icon={Mail} error={errors.clientEmail}>
                            <input
                              type="email"
                              name="clientEmail"
                              value={formData.clientEmail}
                              onChange={handleInputChange}
                              onBlur={() => handleBlur('clientEmail')}
                              className={`w-full px-4 py-3 border bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                errors.clientEmail ? 'border-red-500' : 'border-gray-300 hover:border-blue-300'
                              }`}
                              placeholder="client@company.com"
                            />
                          </FormField>

                          <FormField label="Phone Number" icon={Phone} error={errors.clientMobileNumber}>
                            <div className="flex gap-2">
                              {/* Country Code */}
                              <div className="relative" ref={countryDropdownRef}>
                                <button
                                  type="button"
                                  onClick={() => setCountryDropdownOpen(!countryDropdownOpen)}
                                  className="flex items-center gap-2 px-3 py-3 border border-gray-300 bg-white rounded-xl hover:border-blue-300 h-[50px] min-w-[110px]"
                                >
                                  <ReactCountryFlag countryCode={selectedCountry.countryCode} svg style={{ width: '1.2em', height: '1.2em' }} />
                                  <span className="text-sm font-medium">{selectedCountry.code}</span>
                                  <ChevronDown size={14} className="text-gray-400" />
                                </button>

                                <AnimatePresence>
                                  {countryDropdownOpen && (
                                    <motion.div
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: 10 }}
                                      className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50"
                                    >
                                      <div className="p-2 border-b border-gray-100">
                                        <input
                                          type="text"
                                          value={countrySearchQuery}
                                          onChange={(e) => setCountrySearchQuery(e.target.value)}
                                          placeholder="Search..."
                                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                      </div>
                                      <div className="max-h-48 overflow-y-auto">
                                        {filteredCountries.map((country) => (
                                          <div
                                            key={country.code}
                                            onClick={() => handleCountryCodeChange(country.code)}
                                            className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                                              formData.clientCountryCode === country.code ? 'bg-blue-50' : ''
                                            }`}
                                          >
                                            <ReactCountryFlag countryCode={country.countryCode} svg style={{ width: '1.2em', height: '1.2em' }} />
                                            <span className="flex-1 text-sm">{country.name}</span>
                                            <span className="text-xs text-gray-500">{country.code}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>

                              <input
                                type="text"
                                inputMode="numeric"
                                value={formData.clientMobileNumber}
                                onChange={handleMobileNumberChange}
                                onBlur={() => handleBlur('clientMobileNumber')}
                                placeholder={`${selectedCountry.digits}-digit number`}
                                className={`flex-1 px-4 py-3 border bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  errors.clientMobileNumber ? 'border-red-500' : 'border-gray-300 hover:border-blue-300'
                                }`}
                              />
                            </div>
                          </FormField>
                        </div>
                      </div>
                    </section>
                  </form>
                )}

                {/* Files Tab */}
                {activeTab === 'files' && (
                  <div className="space-y-6">
                    {/* Files info banner */}
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Paperclip size={20} className="text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-gray-900">Attach Project Files</h4>
                        <p className="text-xs text-gray-600 mt-0.5">
                          Upload documents, images, videos, and more. Files will be saved when you create the project.
                        </p>
                      </div>
                      {pendingFiles.length > 0 && (
                        <span className="px-3 py-1.5 bg-white text-blue-700 text-sm font-medium rounded-lg border border-blue-200 shadow-sm">
                          {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} ready
                        </span>
                      )}
                    </div>

                    <EnterpriseFileUploader
                      title="Project Attachments"
                      description="Drag & drop files here, or click to browse"
                      helperText="Supported: PDF, Docs, Images, Videos, Spreadsheets, Audio (Max 25MB each)"
                      pendingFiles={pendingFiles}
                      existingFiles={[]}
                      onFilesAdded={handleFilesAdded}
                      onRemovePending={handleRemovePendingFile}
                      onRetryUpload={handleRetryUpload}
                      errors={uploadErrors}
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
                        Project manager
                        {formData.assignees.length > 0 && (
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 text-xs font-semibold rounded-full">
                            {formData.assignees.length} selected
                          </span>
                        )}
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
                              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
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

                    {/* Selected Team Summary */}
                    {selectedEmployees.length > 0 && (
                      <section className="bg-white rounded-2xl p-5 border border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Selected Team Members</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedEmployees.map((mgr) => (
                            <Badge
                              key={mgr._id}
                              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-2 flex items-center gap-2"
                            >
                              <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold">
                                {(mgr?.name || 'U').charAt(0).toUpperCase()}
                              </div>
                              {mgr?.name || 'Unknown'}
                              <button
                                type="button"
                                onClick={() => handleAssigneeChange(mgr._id)}
                                className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                              >
                                <X size={14} />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-6 py-3 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 font-semibold transition-all disabled:opacity-50"
                >
                  Cancel
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit}
                  disabled={isSaving || !isFormReady}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 font-semibold transition-all shadow-lg shadow-blue-500/30"
                >
                  {isSaving ? (
                    <>
                      <Loader size={20} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={20} />
                      Create Project
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Date Pickers */}
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
        </>
      )}
    </AnimatePresence>,
    document.body
  );
});

EnterpriseAddProjectModal.displayName = 'EnterpriseAddProjectModal';

export default EnterpriseAddProjectModal;
