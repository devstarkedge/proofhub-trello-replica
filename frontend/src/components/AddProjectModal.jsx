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
import RichTextEditor from './RichTextEditor';
import MilestoneScheduleEditor from './MilestoneScheduleEditor';
import { createEmptyMilestone, validateMilestoneSchedule } from '../utils/milestones';
import BasicInfoSection from './ProjectModals/sections/BasicInfoSection';
import ProjectDetailsSection from './ProjectModals/sections/ProjectDetailsSection';
import ClientSection from './ProjectModals/sections/ClientSection';
import FilesTab from './ProjectModals/tabs/FilesTab';
import TeamTab from './ProjectModals/tabs/TeamTab';

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

// Form field component — CSS transitions instead of framer-motion for error messages
const FormField = memo(({ label, icon: Icon, required, error, helperText, children, className = '' }) => (
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
    <p
      className={`text-red-600 text-sm flex items-center gap-1 transition-all duration-200 ${
        error ? 'opacity-100 max-h-8' : 'opacity-0 max-h-0 overflow-hidden'
      }`}
    >
      <AlertCircle size={14} /> {error || ''}
    </p>
  </div>
));

// Tab component
const Tab = memo(({ tabs, activeTab, onTabChange }) => (
  <div className="flex gap-2 px-6">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`flex items-center gap-2 px-6 py-3 rounded-t-xl text-sm font-semibold transition-all ${
          activeTab === tab.id
            ? 'bg-[#f4f5f7] text-blue-600'
            : 'text-white/80 hover:text-white hover:bg-white/10'
        }`}
      >
        <tab.icon size={16} />
        {tab.label}
      </button>
    ))}
  </div>
));

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
    totalProjectBudget: "",
    milestoneWorkflow: "sequential",
    milestones: [],
    dueDate: "",
    clientName: "",
    clientEmail: "",
    clientCountryCode: "+91",
    clientMobileNumber: "",
    projectCategory: "",
    assignees: [],
    estimatedTime: "",
    visibility: "public",
    projectType: "Hired Client",
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
  const [projectTypeDropdownOpen, setProjectTypeDropdownOpen] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState(null);
  const [coverImagePreview, setCoverImagePreview] = useState(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [draftStatus, setDraftStatus] = useState("");
  const draftTimerRef = useRef(null);
  const urlValidationTimer = useRef(null);
  const countryDropdownRef = useRef(null);
  const categoryDropdownRef = useRef(null);
  const visibilityDropdownRef = useRef(null);
  const projectTypeDropdownRef = useRef(null);
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
      if (projectTypeDropdownOpen && projectTypeDropdownRef.current && !projectTypeDropdownRef.current.contains(event.target)) {
        setProjectTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [countryDropdownOpen, categoryDropdownOpen, projectTypeDropdownOpen]);

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
        setDraftStatus("Draft Saved ✅");
        setTimeout(() => setDraftStatus(""), 2000);
      } catch (error) {
        console.error('Failed to save project draft:', error);
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [isOpen, draftKey]);

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

  const handleProjectTypeChange = useCallback((type) => {
    setFormData((prev) => {
      const next = { ...prev, projectType: type };
      // Clear client/billing fields when switching to Inhouse
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
        next.clientCountryCode = '+91';
        next.clientMobileNumber = '';
      }
      return next;
    });
    setProjectTypeDropdownOpen(false);
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
      // Debounce URL validation to avoid per-keystroke regex + state updates
      clearTimeout(urlValidationTimer.current);
      urlValidationTimer.current = setTimeout(() => {
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
      }, 300);
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
    // Only validate client fields for Hired Client projects
    if (formData.projectType !== 'Inhouse') {
      if (formData.clientEmail && !EMAIL_REGEX.test(formData.clientEmail)) {
        newErrors.clientEmail = "Invalid email format";
      }
      if (formData.clientMobileNumber && formData.clientMobileNumber.length !== selectedCountry.digits) {
        newErrors.clientMobileNumber = `Must be ${selectedCountry.digits} digits`;
      }
      if (formData.billingCycle === 'milestone') {
        const milestoneError = validateMilestoneSchedule(formData);
        if (milestoneError) newErrors.milestones = milestoneError;
      }
    }
    setErrors(newErrors);
    return { isValid: Object.keys(newErrors).length === 0, errors: newErrors };
  }, [formData, selectedCountry]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (formData.projectUrl && !projectUrlValid) {
      toast.error("Please enter a valid project URL");
      return;
    }
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
        projectCategory: formData.projectCategory,
        projectType: formData.projectType,
        runBackgroundTasks: true
      };

      // Only include client/billing fields for Hired Client projects
      if (formData.projectType !== 'Inhouse') {
        projectData.projectUrl = formData.projectUrl;
        projectData.projectSource = formData.projectSource;
        projectData.upworkId = formData.upworkId;
        projectData.billingCycle = formData.billingCycle;
        if (formData.billingCycle === 'fixed') projectData.fixedPrice = formData.fixedPrice;
        if (['hr', 'hourly'].includes(formData.billingCycle)) projectData.hourlyPrice = formData.hourlyPrice;
        if (formData.billingCycle === 'milestone') {
          projectData.totalProjectBudget = formData.totalProjectBudget;
          projectData.milestoneWorkflow = formData.milestoneWorkflow;
          projectData.milestones = formData.milestones.map((milestone, order) => ({
            title: milestone.title,
            amount: milestone.amount,
            dueDate: milestone.dueDate,
            order
          }));
        }
        projectData.estimatedTime = formData.estimatedTime;
        projectData.clientDetails = {
          clientName: formData.clientName,
          clientEmail: formData.clientEmail,
          clientWhatsappNumber: fullPhoneNumber
        };
      }

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

  const isDetailsComplete = useMemo(() => {
    if (!formData.title.trim() || formData.title.trim().length < 3) return false;
    if (!formData.startDate) return false;
    if (formData.projectUrl && !PROJECT_URL_REGEX.test(formData.projectUrl)) return false;
    return true;
  }, [formData]);

  const isFormReady = useMemo(() => {
    if (!isDetailsComplete) return false;
    if (formData.assignees.length === 0) return false;
    return true;
  }, [isDetailsComplete, formData.assignees.length]);

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
            className={`fixed right-0 top-0 h-full ${drawerWidth} bg-[#f4f5f7] shadow-2xl z-[61] flex flex-col`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex-shrink-0 bg-blue-600 pt-5">
              <div className="flex items-center justify-between px-6">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95"
                  >
                    <ChevronLeft size={24} />
                  </button>
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
                        <div
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
                        </div>
                      )}
                    </AnimatePresence>
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
                    onClick={onClose}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95 hover:rotate-90 duration-200"
                  >
                    <X size={24} />
                  </button>
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

                    {/* Project Details */}
                    {formData.projectType !== 'Inhouse' && (
                      <ProjectDetailsSection
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
                        projectUrlValid={projectUrlValid}
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
                        handleDeleteCategory={handleDeleteCategory}
                        handleCreateCategory={(name, description) => {
                          setNewCategoryName(name);
                          setNewCategoryDescription(description);
                          handleCreateCategory();
                        }}
                      />
                    )}

                    {/* Client Information */}
                    {formData.projectType !== 'Inhouse' && (
                      <ClientSection
                        clientName={formData.clientName}
                        clientEmail={formData.clientEmail}
                        clientCountryCode={formData.clientCountryCode}
                        clientMobileNumber={formData.clientMobileNumber}
                        errors={errors}
                        handleInputChange={handleInputChange}
                        handleBlur={handleBlur}
                        handleCountryCodeChange={handleCountryCodeChange}
                        handleMobileNumberChange={handleMobileNumberChange}
                      />
                    )}
                  </form>
                )}

                {/* Files Tab */}
                {activeTab === 'files' && (
                  <FilesTab
                    pendingFiles={pendingFiles}
                    handleFilesAdded={handleFilesAdded}
                    handleRemovePendingFile={handleRemovePendingFile}
                    handleRetryUpload={handleRetryUpload}
                    uploadErrors={uploadErrors}
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
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-6 py-3 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  Cancel
                </button>

                {isDetailsComplete && formData.assignees.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('team')}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 font-semibold transition-all active:scale-[0.98] shadow-lg shadow-blue-500/30"
                  >
                    <Users size={20} />
                    Select Project Manager
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSaving || !isFormReady}
                    className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 font-semibold transition-all active:scale-[0.98] shadow-lg shadow-blue-500/30"
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
                  </button>
                )}
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
