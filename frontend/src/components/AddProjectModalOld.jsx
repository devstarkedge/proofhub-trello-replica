"use client"

import { useState, useEffect, useCallback, useMemo, memo, useRef, useContext } from "react"
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from "framer-motion"
import {
  X, Plus, AlertCircle, Loader, Calendar, Users, DollarSign,
  Link2, FileText, Briefcase, Clock, Globe, Mail, Phone, Tag,
  CheckCircle2, ChevronDown, Shield, User, Crown, Search, Image
} from "lucide-react"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select"
import { Badge } from "../components/ui/badge"
import { toast } from "react-toastify"
import Database from "../services/database"
import ReactCountryFlag from "react-country-flag"
import CoverImageUploader from "./CoverImageUploader"
import DragDropFileUploader from "./DragDropFileUploader"
import AuthContext from '../context/AuthContext'
import DatePickerModal from "./DatePickerModal"

// Country codes data with ISO codes for flags
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


// Email validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
// Strict project URL regex: require http(s) protocol and a domain (allow subdomains and paths)
const PROJECT_URL_REGEX = /^https?:\/\/([a-z0-9-]+\.)+[a-z]{2,}(?:[:0-9]*)?(?:\/\S*)?$/i

// Memoized animation variants
const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { 
      duration: 0.25,
      ease: [0.4, 0, 0.2, 1]
    } 
  },
  exit: { 
    opacity: 0, 
    scale: 0.95, 
    y: 20,
    transition: { duration: 0.15 } 
  },
}

const fieldVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.02,
      duration: 0.2,
      ease: "easeOut"
    }
  })
}

const AddProjectModal = memo(({ isOpen, onClose, departmentId, onProjectAdded, departmentManagers = [] }) => {
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
    clientCountryCode: "+91", // Default to India
    clientMobileNumber: "",
    projectCategory: "",
    assignees: [],
    estimatedTime: "",
    visibility: "public",
  }), [])

  const [formData, setFormData] = useState(initialFormData)
  // Use departmentManagers prop directly instead of fetching employees
  const managers = useMemo(() => departmentManagers || [], [departmentManagers])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({}) // Track which fields have been touched
  const [isSaving, setIsSaving] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryDescription, setNewCategoryDescription] = useState("")
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false)
  const [visOpen, setVisOpen] = useState(false)
  const [projectUrlValid, setProjectUrlValid] = useState(true)
  const [countrySearchQuery, setCountrySearchQuery] = useState("")
  const [coverImageFile, setCoverImageFile] = useState(null)
  const [coverImagePreview, setCoverImagePreview] = useState(null)
  const [showStartDatePicker, setShowStartDatePicker] = useState(false)
  const [showDueDatePicker, setShowDueDatePicker] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploadErrors, setUploadErrors] = useState([])
  const [draftStatus, setDraftStatus] = useState("")
  const draftTimerRef = useRef(null)
  const countryDropdownRef = useRef(null)
  const visTriggerRef = useRef(null)
  const visMenuRef = useRef(null)
  const countrySearchInputRef = useCallback(node => {
    if (node) {
      // Auto-focus the search input when dropdown opens
      setTimeout(() => node.focus(), 50)
    }
  }, [])

  // Filter countries based on search query
  const filteredCountries = useMemo(() => {
    if (!countrySearchQuery.trim()) return COUNTRY_CODES
    
    const query = countrySearchQuery.toLowerCase().trim()
    return COUNTRY_CODES.filter(country => 
      country.code.toLowerCase().includes(query) ||
      country.code.replace('+', '').includes(query) || // Search without + prefix
      country.country.toLowerCase().includes(query) ||
      country.name.toLowerCase().includes(query) ||
      country.countryCode.toLowerCase().includes(query)
    )
  }, [countrySearchQuery])

  // Reset search when dropdown closes
  useEffect(() => {
    if (!countryDropdownOpen) {
      setCountrySearchQuery("")
    }
  }, [countryDropdownOpen])

  // Close visibility menu when clicking outside
  useEffect(() => {
    const handleOutside = (e) => {
      if (visOpen) {
        const target = e.target
        if (visTriggerRef.current && visTriggerRef.current.contains(target)) return
        if (visMenuRef.current && visMenuRef.current.contains(target)) return
        setVisOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [visOpen])

  // Close country dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (countryDropdownOpen && countryDropdownRef.current && !countryDropdownRef.current.contains(event.target)) {
        setCountryDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [countryDropdownOpen])

  // Get selected country details
  const selectedCountry = useMemo(() => 
    COUNTRY_CODES.find(c => c.code === formData.clientCountryCode) || COUNTRY_CODES[0],
    [formData.clientCountryCode]
  )

  useEffect(() => {
    if (isOpen) {
      fetchCategories()
    }
  }, [isOpen, departmentId])

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData(initialFormData)
      setErrors({})
      setTouched({})
      setShowAddCategory(false)
      setPendingFiles([])
      setUploadErrors([])
      setDraftStatus("")
    }
  }, [isOpen, initialFormData])

  const draftKey = useMemo(() => (
    departmentId ? `projectDraft:${departmentId}` : 'projectDraft:global'
  ), [departmentId])

  // Restore draft on open
  useEffect(() => {
    if (!isOpen) return

    try {
      const draftRaw = localStorage.getItem(draftKey)
      if (draftRaw) {
        const draft = JSON.parse(draftRaw)
        if (draft?.formData) {
          setFormData(prev => ({ ...prev, ...draft.formData }))
          setDraftStatus("Draft restored ✅")
        }
      }
    } catch (error) {
      console.error('Failed to restore project draft:', error)
    }
  }, [isOpen, draftKey])

  // Auto-save draft
  useEffect(() => {
    if (!isOpen) return

    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
    }

    draftTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          formData,
          savedAt: new Date().toISOString()
        }))
        setDraftStatus("Draft Saved ✅")
      } catch (error) {
        console.error('Failed to save project draft:', error)
      }
    }, 800)

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [formData, isOpen, draftKey])

  // fetchEmployees removed - now using departmentManagers prop directly

  const fetchCategories = useCallback(async () => {
    if (!departmentId) return;
    setCategoryLoading(true)
    try {
      const response = await Database.getCategoriesByDepartment(departmentId);
      if (response.success) {
        setCategories(response.data)
      } else {
        throw new Error(response.message || "Failed to load categories")
      }
    } catch (error) {
      console.error("Error fetching categories:", error)
      toast.error("Failed to load categories")
    } finally {
      setCategoryLoading(false)
    }
  }, [departmentId])

  const handleCategoryChange = useCallback((value) => {
    if (value === "add-new") {
      setShowAddCategory(true)
    } else {
      setFormData((prev) => ({ ...prev, projectCategory: value }))
    }
  }, [])

  const handleCreateCategory = useCallback(async () => {
    if (!newCategoryName.trim()) {
      toast.error("Category name is required")
      return
    }

    try {
      const response = await Database.createCategory(newCategoryName.trim(), newCategoryDescription.trim(), departmentId)

      if (response.success) {
        const newCategory = response.data
        setCategories((prev) => [...prev, newCategory])
        setFormData((prev) => ({ ...prev, projectCategory: newCategory.name }))
        setShowAddCategory(false)
        setNewCategoryName("")
        setNewCategoryDescription("")
        toast.success("Category created successfully!")
      } else {
        throw new Error(response.message || "Failed to create category")
      }
    } catch (error) {
      console.error("Error creating category:", error)
      toast.error(error.message || "Failed to create category")
    }
  }, [newCategoryName, newCategoryDescription, departmentId])

  const fetchDepartmentTeams = useCallback(async () => {
    try {
      const response = await Database.getTeams()
      const deptTeams = response.data.filter((team) => team.department && team.department._id === departmentId)
      return deptTeams
    } catch (error) {
      console.error("Error fetching teams:", error)
      return []
    }
  }, [departmentId])

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target

    // Prevent negative values for price fields
    if ((name === 'fixedPrice' || name === 'hourlyPrice') && parseFloat(value) < 0) {
      return
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }))
    }

    // Real-time validation for projectUrl
    if (name === 'projectUrl') {
      const trimmed = value.trim()
      // don't show error for empty field but keep invalid state false
      if (!trimmed) {
        setProjectUrlValid(false)
        setErrors((prev) => ({ ...prev, projectUrl: "" }))
      } else if (trimmed.includes('@')) {
        // Definitely an email -> invalid
        setProjectUrlValid(false)
        setErrors((prev) => ({ ...prev, projectUrl: "Please enter a valid URL." }))
      } else if (!PROJECT_URL_REGEX.test(trimmed)) {
        setProjectUrlValid(false)
        setErrors((prev) => ({ ...prev, projectUrl: "Please enter a valid URL." }))
      } else {
        setProjectUrlValid(true)
        setErrors((prev) => ({ ...prev, projectUrl: "" }))
      }
    }
  }, [errors])

  // Handle blur for validation
  const handleBlur = useCallback((fieldName) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }))
    
    // Validate email on blur
    if (fieldName === 'clientEmail' && formData.clientEmail) {
      if (!EMAIL_REGEX.test(formData.clientEmail)) {
        setErrors((prev) => ({ ...prev, clientEmail: "Please enter a valid email address" }))
      } else {
        setErrors((prev) => ({ ...prev, clientEmail: "" }))
      }
    }

    // Validate mobile number on blur
    if (fieldName === 'clientMobileNumber' && formData.clientMobileNumber) {
      const expectedDigits = selectedCountry.digits
      if (formData.clientMobileNumber.length !== expectedDigits) {
        setErrors((prev) => ({ 
          ...prev, 
          clientMobileNumber: `Mobile number must be ${expectedDigits} digits for ${selectedCountry.country}` 
        }))
      } else {
        setErrors((prev) => ({ ...prev, clientMobileNumber: "" }))
      }
    }
  }, [formData.clientEmail, formData.clientMobileNumber, selectedCountry])

  // Handle mobile number input - only allow numbers
  const handleMobileNumberChange = useCallback((e) => {
    const value = e.target.value.replace(/\D/g, '') // Remove non-digits
    const maxDigits = selectedCountry.digits
    const truncatedValue = value.slice(0, maxDigits) // Limit to expected digits
    
    setFormData((prev) => ({ ...prev, clientMobileNumber: truncatedValue }))
    
    // Real-time validation feedback
    if (truncatedValue && truncatedValue.length !== maxDigits) {
      setErrors((prev) => ({ 
        ...prev, 
        clientMobileNumber: `${truncatedValue.length}/${maxDigits} digits` 
      }))
    } else if (truncatedValue.length === maxDigits) {
      setErrors((prev) => ({ ...prev, clientMobileNumber: "" }))
    }
  }, [selectedCountry.digits])

  // Handle country code change
  const handleCountryCodeChange = useCallback((code) => {
    setFormData((prev) => ({ 
      ...prev, 
      clientCountryCode: code,
      clientMobileNumber: "" // Reset mobile number when country changes
    }))
    setErrors((prev) => ({ ...prev, clientMobileNumber: "" }))
    setCountryDropdownOpen(false)
  }, [])

  const handleAssigneeChange = useCallback((employeeId) => {
    setFormData((prev) => ({
      ...prev,
      assignees: prev.assignees.includes(employeeId)
        ? prev.assignees.filter((id) => id !== employeeId)
        : [...prev.assignees, employeeId],
    }))
    if (errors.assignees) {
      setErrors((prev) => ({ ...prev, assignees: "" }))
    }
  }, [errors.assignees])

  const handleFilesAdded = useCallback((files) => {
    const newItems = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: 'queued'
    }))
    setPendingFiles((prev) => [...prev, ...newItems])
    setUploadErrors([])
  }, [])

  const handleRemovePendingFile = useCallback((item) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== item.id))
  }, [])

  const updatePendingFile = useCallback((id, updates) => {
    setPendingFiles((prev) => prev.map((fileItem) => (
      fileItem.id === id ? { ...fileItem, ...updates } : fileItem
    )))
  }, [])

  const handleRemoveFile = useCallback((item) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== item.id))
  }, [])

  const validateForm = useCallback(() => {
    const newErrors = {}
    if (!formData.title.trim()) newErrors.title = "Title is required"
    else if (formData.title.length < 3) newErrors.title = "Title must be at least 3 characters"
    if (!formData.startDate) newErrors.startDate = "Start date is required"
    if (formData.dueDate && new Date(formData.startDate) >= new Date(formData.dueDate)) {
      newErrors.dueDate = "Due date must be after start date"
    }
    if (formData.assignees.length === 0) newErrors.assignees = "At least one assignee is required"
    
    // Email validation
    if (formData.clientEmail && !EMAIL_REGEX.test(formData.clientEmail)) {
      newErrors.clientEmail = "Please enter a valid email address"
    }
    
    // Mobile number validation
    if (formData.clientMobileNumber) {
      if (formData.clientMobileNumber.length !== selectedCountry.digits) {
        newErrors.clientMobileNumber = `Mobile number must be ${selectedCountry.digits} digits for ${selectedCountry.country}`
      }
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, selectedCountry])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!projectUrlValid) {
      toast.error("Please enter a valid project URL.")
      return
    }
    if (!validateForm()) {
      toast.error("Please fill all required details in the form")
      return
    }

    setIsSaving(true)
    
    // Create optimistic project data for immediate UI update
    const optimisticProject = {
      _id: `temp-${Date.now()}`,
      name: formData.title,
      description: formData.description,
      status: "planning",
      startDate: formData.startDate,
      dueDate: formData.dueDate,
      members: formData.assignees,
      visibility: formData.visibility,
      isOptimistic: true, // Flag for optimistic update
      createdAt: new Date().toISOString()
    }
    
    // Immediately update UI (optimistic update)
    onProjectAdded(optimisticProject)
    onClose()
    toast.info("Creating project...", { autoClose: 2000 })
    
    try {
      const deptTeams = await fetchDepartmentTeams()
      const defaultTeam = deptTeams.length > 0 ? deptTeams[0]._id : null

      // Format phone number with country code
      const fullPhoneNumber = formData.clientMobileNumber 
        ? `${formData.clientCountryCode}${formData.clientMobileNumber}`
        : ""

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
        runBackgroundTasks: true // Signal backend to run heavy tasks in background
      }

      const response = await Database.createProject(projectData)

      if (response.success) {
        const createdProject = response.data;
        
        // Upload cover image if one was selected
        if (coverImageFile) {
          try {
            const coverResult = await Database.uploadProjectCoverImage(createdProject._id, coverImageFile);
            if (coverResult.success) {
              // Merge cover image data with project
              createdProject.coverImage = coverResult.data.coverImage;
            }
          } catch (coverError) {
            console.error("Error uploading cover image:", coverError);
            toast.warning("Project created but cover image upload failed. You can add it later.");
          }
        }
        
        // Upload project attachments
        if (pendingFiles.length > 0) {
          const failed = []
          for (const item of pendingFiles) {
            updatePendingFile(item.id, { status: 'uploading', progress: 0 })
            try {
              await Database.uploadProjectAttachment(
                createdProject._id,
                item.file,
                (progress) => updatePendingFile(item.id, { progress })
              )
              updatePendingFile(item.id, { status: 'done', progress: 100 })
            } catch (uploadError) {
              const message = uploadError?.message || 'Upload failed'
              updatePendingFile(item.id, { status: 'error', error: message })
              failed.push(`${item.file.name}: ${message}`)
            }
          }

          if (failed.length > 0) {
            setUploadErrors(failed)
            toast.warning('Some files failed to upload. You can retry in Edit Project.')
          }
        }

        // Replace optimistic project with real data (including cover image)
        onProjectAdded(createdProject, optimisticProject._id)
        setFormData(initialFormData)
        setCoverImageFile(null)
        setCoverImagePreview(null)
        setPendingFiles([])
        localStorage.removeItem(draftKey)
        toast.success("Project created successfully!")
      } else {
        // Revert optimistic update on failure
        onProjectAdded(null, optimisticProject._id, true) // true = revert
        throw new Error(response.message || "Failed to create project")
      }
    } catch (error) {
      console.error("Error creating project:", error)
      // Revert optimistic update on error
      onProjectAdded(null, optimisticProject._id, true)
      toast.error(error.message || "Failed to create project")
    } finally {
      setIsSaving(false)
    }
  }, [formData, validateForm, fetchDepartmentTeams, departmentId, onProjectAdded, onClose, initialFormData, projectUrlValid, coverImageFile, pendingFiles, updatePendingFile, draftKey])

  // Memoize available managers (those not already assigned)
  const availableEmployees = useMemo(() => 
    managers.filter(manager => !formData.assignees.includes(manager._id)),
    [managers, formData.assignees]
  )

  // Memoize selected managers for badges
  const selectedEmployees = useMemo(() => 
    formData.assignees.map(assigneeId => managers.find(mgr => mgr._id === assigneeId)).filter(Boolean),
    [formData.assignees, managers]
  )

  // Keep Select value in sync with current assignees (clears when none)
  const selectedAssigneeValue = useMemo(() => (
    formData.assignees.length > 0
      ? formData.assignees[formData.assignees.length - 1]
      : null
  ), [formData.assignees])

  const isFormReady = useMemo(() => {
    if (!formData.title.trim()) return false
    if (formData.title.trim().length < 3) return false
    if (!formData.startDate) return false
    if (formData.dueDate && new Date(formData.startDate) >= new Date(formData.dueDate)) return false
    if (formData.assignees.length === 0) return false
    if (formData.clientEmail && !EMAIL_REGEX.test(formData.clientEmail)) return false
    if (formData.projectUrl && !PROJECT_URL_REGEX.test(formData.projectUrl)) return false
    if (formData.clientMobileNumber && formData.clientMobileNumber.length !== selectedCountry.digits) return false
    return true
  }, [formData, selectedCountry.digits])

  // Compute trigger rect for visibility menu positioning (portal)
  const visTriggerRect = visTriggerRef.current ? visTriggerRef.current.getBoundingClientRect() : null
  const visMenuStyle = visTriggerRect ? {
    position: 'absolute',
    top: visTriggerRect.bottom + window.scrollY,
    left: visTriggerRect.left + window.scrollX,
    minWidth: visTriggerRect.width,
    zIndex: 9999
  } : { position: 'absolute', visibility: 'hidden' }

  if (!isOpen) return null

  return (
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
          className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl max-w-6xl w-[92vw] h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <motion.div 
                  initial={{ rotate: -180, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="bg-white/20 backdrop-blur-sm p-2.5 rounded-xl"
                >
                  <Briefcase className="h-6 w-6" />
                </motion.div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold">Add New Project</h2>
                  <p className="text-blue-100 text-sm mt-0.5">Fill in the details to create a new project</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-2 text-xs bg-white/20 px-3 py-1.5 rounded-full">
                  <span className="font-semibold">Status:</span>
                  <span className="capitalize">Planning</span>
                </div>
                <div className="relative">
                  <div
                    ref={visTriggerRef}
                    role="button"
                    tabIndex={0}
                    onClick={() => setVisOpen(v => !v)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setVisOpen(v => !v) }}
                    className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-xl cursor-pointer select-none"
                  >
                    <Globe className="h-4 w-4" />
                    <span className="text-white text-sm font-medium capitalize">{formData.visibility}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${visOpen ? 'rotate-180' : ''}`} />
                  </div>
                  {visOpen && createPortal(
                    <div ref={visMenuRef} style={visMenuStyle} className="bg-white rounded-md shadow-lg z-50 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => { setFormData(prev => ({ ...prev, visibility: 'private' })); setVisOpen(false) }}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      >
                        Private
                      </button>
                      <button
                        type="button"
                        onClick={() => { setFormData(prev => ({ ...prev, visibility: 'public' })); setVisOpen(false) }}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      >
                        Public
                      </button>
                    </div>,
                    document.body
                  )}
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
          </div>

          {/* Content */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 overflow-hidden">
            <div className="lg:col-span-2 overflow-y-auto px-8 py-6">
              <form onSubmit={handleSubmit} className="space-y-6 pb-12">
              {/* Title */}
              <motion.div custom={0} variants={fieldVariants} initial="hidden" animate="visible">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  Project Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    errors.title ? "border-red-500 bg-red-50 shake" : "border-gray-300 focus:border-transparent hover:border-blue-300"
                  }`}
                  placeholder="Enter a descriptive project title"
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
                  <FileText className="h-4 w-4 text-blue-600" />
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none hover:border-blue-300"
                  placeholder="Describe the project goals, deliverables, and requirements..."
                />
              </motion.div>

              {/* Cover Image */}
              <motion.div custom={1.5} variants={fieldVariants} initial="hidden" animate="visible">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Image className="h-4 w-4 text-purple-600" />
                  Cover Image (Optional)
                </label>
                <CoverImageUploader
                  projectId={null} // No project ID yet - new project
                  currentCover={null}
                  coverHistory={[]}
                  onCoverChange={(data) => {
                    if (data && data.file) {
                      setCoverImageFile(data.file)
                      setCoverImagePreview(data.previewUrl)
                    } else {
                      setCoverImageFile(null)
                      setCoverImagePreview(null)
                    }
                  }}
                />
              </motion.div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="visible">
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
                <motion.div custom={3} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                    <Calendar className="h-4 w-4 text-red-600" />
                    Due Date
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

              {/* Assignees - Now showing only managers */}
              <motion.div custom={4} variants={fieldVariants} initial="hidden" animate="visible">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Shield className="h-4 w-4 text-purple-600" />
                  Project Manager *
                </label>
                <div className="space-y-3">
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
                    <>
                      <Select value={selectedAssigneeValue} onValueChange={handleAssigneeChange}>
                        <SelectTrigger className="w-full h-12 rounded-xl border-gray-300 hover:border-blue-300 transition-colors cursor-pointer">
                          <SelectValue placeholder="Click to select project manager..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-64 max-w-xs">
                          {availableEmployees.map((manager) => {
                            return (
                              <SelectItem key={manager._id} value={manager._id} className="py-3">
                                <div className="flex items-center gap-3 w-full">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                                    {(manager.name?.name || manager.name || "U").charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex flex-col flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-gray-900 truncate text-sm">{manager.name?.name || manager.name || "Unknown"}</span>
                                      <Shield size={14} className="text-blue-500" />
                                    </div>
                                    <span className="text-xs text-gray-500 truncate">{manager.email?.email || manager.email || "No email"}</span>
                                    <span className="text-xs text-blue-600 font-medium">Manager</span>
                                  </div>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <AnimatePresence>
                        {selectedEmployees.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex flex-wrap gap-2"
                          >
                            {selectedEmployees.map((manager, index) => (
                              <motion.div
                                key={manager._id}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ delay: index * 0.05 }}
                              >
                                <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-2 text-sm flex items-center gap-2 hover:from-blue-600 hover:to-purple-600 transition-all">
                                  <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold">
                                    {(manager?.name?.name || manager?.name || "U").charAt(0).toUpperCase()}
                                  </div>
                                  {manager?.name?.name || manager?.name || "Unknown"}
                                  <motion.button
                                    whileHover={{ scale: 1.2 }}
                                    whileTap={{ scale: 0.8 }}
                                    type="button"
                                    onClick={() => handleAssigneeChange(manager._id)}
                                    className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                                  >
                                    <X size={14} />
                                  </motion.button>
                                </Badge>
                              </motion.div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </div>
                {errors.assignees && (
                  <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                    <AlertCircle size={14} /> {errors.assignees}
                  </p>
                )}
              </motion.div>

              {/* Estimated Time & URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div custom={5} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Clock className="h-4 w-4 text-orange-600" />
                    Estimated Time
                  </label>
                  <input
                    type="text"
                    name="estimatedTime"
                    value={formData.estimatedTime}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                    placeholder="e.g., 3 days, 40h"
                  />
                </motion.div>
                <motion.div custom={6} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Link2 className="h-4 w-4 text-blue-600" />
                    Project URL
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="projectUrl"
                      value={formData.projectUrl}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 transition-all ${
                        errors.projectUrl ? 'border-red-500 focus:ring-red-200 bg-red-50' : (projectUrlValid ? 'border-green-500 focus:ring-green-200 bg-green-50' : 'border-gray-300 focus:ring-blue-500')
                      }`}
                      placeholder="https://example.com"
                    />
                    {/* Indicator icon */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {projectUrlValid ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (formData.projectUrl ? (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      ) : null)}
                    </div>
                  </div>
                  <AnimatePresence>
                    {errors.projectUrl && formData.projectUrl && (
                      <motion.p
                        initial={{ opacity: 0, y: -5, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -5, height: 0 }}
                        className="text-red-600 text-sm mt-2 flex items-center gap-1"
                      >
                        <AlertCircle size={14} /> {errors.projectUrl}
                      </motion.p>
                    )}
                    {projectUrlValid && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-green-600 text-sm mt-2 flex items-center gap-1"
                      >
                        <CheckCircle2 size={14} /> URL verified
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>

              {/* Project Source */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div custom={7} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Briefcase className="h-4 w-4 text-indigo-600" />
                    Project Source
                  </label>
                  <select
                    name="projectSource"
                    value={formData.projectSource}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                  >
                    <option value="Direct">Direct Client</option>
                    <option value="Upwork">Upwork</option>
                    <option value="Contra">Contra</option>
                  </select>
                </motion.div>
                <motion.div custom={8} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center justify-between text-sm font-semibold text-gray-700 mb-2">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-pink-600" />
                      Project Category
                    </div>
                    {formData.projectCategory && (
                      <Badge className="bg-gradient-to-r from-pink-500 to-purple-500 text-white px-3 py-1 text-sm">
                        {formData.projectCategory}
                      </Badge>
                    )}
                  </label>
                  <div className="space-y-3">
                    <Select onValueChange={handleCategoryChange} value={formData.projectCategory}>
                      <SelectTrigger className="w-full h-12 rounded-xl border-gray-300 hover:border-blue-300 transition-colors cursor-pointer">
                        <SelectValue placeholder="Click to select or add a category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category._id} value={category.name}>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                                {category.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium">{category.name}</div>
                                {category.description && (
                                  <div className="text-xs text-gray-500">{category.description}</div>
                                )}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                        <SelectItem value="add-new">
                          <div className="flex items-center gap-2">
                            <Plus className="h-4 w-4 text-blue-600" />
                            <span className="text-blue-600 font-medium">Add New Category</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </motion.div>
              </div>
              {/* Add New Category Form */}
              <AnimatePresence>
                {showAddCategory && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-gradient-to-br from-pink-50 to-purple-50 p-4 rounded-xl border border-pink-200"
                  >
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Plus className="h-4 w-4 text-pink-600" />
                      Add New Category
                    </h4>
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Category name"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                      />
                      <textarea
                        placeholder="Category description (optional)"
                        value={newCategoryDescription}
                        onChange={(e) => setNewCategoryDescription(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all resize-none"
                      />
                      <div className="flex gap-2">
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          type="button"
                          onClick={handleCreateCategory}
                          className="flex-1 px-4 py-2 bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-lg hover:from-pink-700 hover:to-purple-700 font-medium transition-all"
                        >
                          Create Category
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          type="button"
                          onClick={() => {
                            setShowAddCategory(false)
                            setNewCategoryName("")
                            setNewCategoryDescription("")
                          }}
                          className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-all"
                        >
                          Cancel
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {formData.projectSource === "Upwork" && (
                  <motion.div custom={9} variants={fieldVariants} initial="hidden" animate="visible">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      <Tag className="h-4 w-4 text-green-600" />
                      Upwork ID
                    </label>
                    <input
                      type="text"
                      name="upworkId"
                      value={formData.upworkId}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                      placeholder="Enter Upwork ID"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              

              {/* Billing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div custom={8} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    Billing Type
                  </label>
                  <select
                    name="billingCycle"
                    value={formData.billingCycle}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                  >
                    <option value="hr">Hourly Rate</option>
                    <option value="fixed">Fixed Price</option>
                  </select>
                </motion.div>
                <AnimatePresence mode="wait">
                  {formData.billingCycle === "fixed" ? (
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
                        min="0"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
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
                        min="0"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                        placeholder="$/hr"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Client Details */}
              <motion.div custom={9} variants={fieldVariants} initial="hidden" animate="visible" className="bg-gradient-to-br from-gray-50 to-blue-50 p-6 rounded-2xl border border-gray-200">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-5">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Mail className="h-5 w-5 text-blue-600" />
                  </div>
                  Client Information
                </h3>
                
                <div className="space-y-5">
                  {/* Row 1: Client Name */}
                  <div className="w-full">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-500" />
                        Client Name
                      </span>
                    </label>
                    <input
                      type="text"
                      name="clientName"
                      value={formData.clientName}
                      onChange={handleInputChange}
                      placeholder="Enter client's full name"
                      className="w-full px-4 py-3 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300 text-gray-900 placeholder:text-gray-400"
                    />
                  </div>
                  
                  {/* Row 2: Email and Phone side by side on desktop */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Client Email with validation */}
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <span className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-500" />
                          Email Address
                        </span>
                      </label>
                      <div className="relative">
                        <input
                          type="email"
                          name="clientEmail"
                          value={formData.clientEmail}
                          onChange={handleInputChange}
                          onBlur={() => handleBlur('clientEmail')}
                          placeholder="client@company.com"
                          className={`w-full px-4 py-3 border bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 placeholder:text-gray-400 ${
                            errors.clientEmail && touched.clientEmail 
                              ? "border-red-400 bg-red-50 ring-2 ring-red-100" 
                              : "border-gray-300 hover:border-blue-300"
                          }`}
                        />
                        {formData.clientEmail && !errors.clientEmail && touched.clientEmail && (
                          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
                        )}
                      </div>
                      <AnimatePresence>
                        {errors.clientEmail && touched.clientEmail && (
                          <motion.p
                            initial={{ opacity: 0, y: -5, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -5, height: 0 }}
                            className="text-red-500 text-xs mt-2 flex items-center gap-1.5 font-medium"
                          >
                            <AlertCircle size={14} /> {errors.clientEmail}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                    
                    {/* Mobile Number with Country Code */}
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <span className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-gray-500" />
                          Mobile Number
                        </span>
                      </label>
                      <div className="flex gap-2">
                        {/* Country Code Dropdown with Search */}
                        <div className="relative flex-shrink-0" ref={countryDropdownRef}>
                          <button
                            type="button"
                            onClick={() => setCountryDropdownOpen(!countryDropdownOpen)}
                            className={`flex items-center gap-2 px-3 py-3 border bg-white rounded-xl hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all h-[50px] min-w-[130px] ${
                              countryDropdownOpen ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-300'
                            }`}
                          >
                            <ReactCountryFlag
                              countryCode={selectedCountry.countryCode}
                              svg
                              style={{
                                width: '1.4em',
                                height: '1.4em',
                                borderRadius: '3px',
                                objectFit: 'cover',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                              }}
                              title={selectedCountry.name}
                            />
                            <span className="text-sm font-semibold text-gray-700">{selectedCountry.country}</span>
                            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ml-auto ${countryDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                          
                          <AnimatePresence>
                            {countryDropdownOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                transition={{ duration: 0.15 }}
                                className="absolute bottom-full left-0 mb-2 w-full bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden"
                              >
                                {/* Country List */}
                                <div className="max-h-56 overflow-y-auto">
                                  {filteredCountries.length > 0 ? (
                                    filteredCountries.map((country) => (
                                      <div
                                        key={country.code}
                                        onClick={() => handleCountryCodeChange(country.code)}
                                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-b-0 ${
                                          formData.clientCountryCode === country.code ? 'bg-blue-50 text-blue-700' : ''
                                        }`}
                                      >
                                        <ReactCountryFlag
                                          countryCode={country.countryCode}
                                          svg
                                          style={{
                                            width: '1.2em',
                                            height: '1.2em',
                                            borderRadius: '2px',
                                            objectFit: 'cover',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                          }}
                                          title={country.name}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-xs truncate">{country.name}</div>
                                        </div>
                                        <span className="text-xs font-semibold text-gray-500 flex-shrink-0">{country.code}</span>
                                        {formData.clientCountryCode === country.code && (
                                          <CheckCircle2 className="h-3 w-3 text-blue-600 flex-shrink-0" />
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="px-4 py-8 text-center text-gray-500">
                                      <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                      <p className="text-sm">No countries found</p>
                                      <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Search Input - Now at bottom */}
                                <div className="p-3 border-t border-gray-100 bg-gray-50/50">
                                  <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input
                                      ref={countrySearchInputRef}
                                      type="text"
                                      value={countrySearchQuery}
                                      onChange={(e) => setCountrySearchQuery(e.target.value)}
                                      placeholder="Search country or code..."
                                      className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white placeholder:text-gray-400"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    {countrySearchQuery && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setCountrySearchQuery("")
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                        
                        {/* Mobile Number Input */}
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formData.clientMobileNumber}
                            onChange={handleMobileNumberChange}
                            onBlur={() => handleBlur('clientMobileNumber')}
                            placeholder={`Enter ${selectedCountry.digits}-digit number`}
                            className={`w-full px-4 py-3 border bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all h-[50px] text-gray-900 placeholder:text-gray-400 ${
                              errors.clientMobileNumber && touched.clientMobileNumber && !errors.clientMobileNumber.includes('/')
                                ? "border-red-400 bg-red-50 ring-2 ring-red-100"
                                : "border-gray-300 hover:border-blue-300"
                            }`}
                          />
                          {/* Digit counter badge */}
                          {formData.clientMobileNumber && (
                            <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium px-2 py-1 rounded-full ${
                              formData.clientMobileNumber.length === selectedCountry.digits 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {formData.clientMobileNumber.length}/{selectedCountry.digits}
                            </span>
                          )}
                        </div>
                      </div>
                      <AnimatePresence>
                        {errors.clientMobileNumber && touched.clientMobileNumber && !errors.clientMobileNumber.includes('/') && (
                          <motion.p
                            initial={{ opacity: 0, y: -5, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -5, height: 0 }}
                            className="text-red-500 text-xs mt-2 flex items-center gap-1.5 font-medium"
                          >
                            <AlertCircle size={14} /> {errors.clientMobileNumber}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.div>
            </form>
          </div>

          {/* Right Panel */}
          <aside className="lg:col-span-1 border-l border-gray-200 bg-gray-50/60 overflow-y-auto px-6 py-6 space-y-6">
            <section className="bg-white rounded-2xl border border-gray-200 p-4">
              <DragDropFileUploader
                title="Project Attachments"
                description="Drag & drop files here, or click to browse"
                helperText="PDF, CSV, DOC/DOCX, PPT/PPTX, Images, Video, Audio"
                files={pendingFiles}
                onFilesAdded={handleFilesAdded}
                onRemove={handleRemovePendingFile}
                errors={uploadErrors}
              />
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Project Team</h4>
              {selectedEmployees.length === 0 ? (
                <p className="text-xs text-gray-500">Assign a project manager to see team members here.</p>
              ) : (
                <div className="space-y-3">
                  {selectedEmployees.map((manager) => (
                    <div key={manager._id} className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white flex items-center justify-center text-xs font-semibold">
                        {(manager?.name?.name || manager?.name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{manager?.name?.name || manager?.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">Project Manager</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Draft Status</h4>
              <p className="text-xs text-gray-600">{draftStatus || 'No draft saved yet'}</p>
            </section>
          </aside>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-8 py-5 border-t border-gray-200 flex justify-between items-center sticky bottom-0">
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
              disabled={isSaving || !isFormReady || !projectUrlValid}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-lg shadow-blue-500/30"
            >
              {isSaving ? (
                <>
                  <Loader size={20} className="animate-spin" />
                  Creating Project...
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
      </motion.div>
    </AnimatePresence>
  )
})

AddProjectModal.displayName = 'AddProjectModal'

export default AddProjectModal