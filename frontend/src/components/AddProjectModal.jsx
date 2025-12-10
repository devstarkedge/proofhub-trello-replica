"use client"

import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X, Plus, AlertCircle, Loader, Calendar, Users, DollarSign,
  Link2, FileText, Briefcase, Clock, Globe, Mail, Phone, Tag,
  CheckCircle2, ChevronDown, Shield, User, Crown, Search
} from "lucide-react"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select"
import { Badge } from "../components/ui/badge"
import { toast } from "react-toastify"
import Database from "../services/database"
import ReactCountryFlag from "react-country-flag"

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

const AddProjectModal = memo(({ isOpen, onClose, departmentId, onProjectAdded }) => {
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
  const [employees, setEmployees] = useState([])
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
  const [countrySearchQuery, setCountrySearchQuery] = useState("")
  const countryDropdownRef = useRef(null)
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
      fetchEmployees()
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
    }
  }, [isOpen, initialFormData])

  const fetchEmployees = useCallback(async () => {
    if (!departmentId) return;
    try {
      const response = await Database.getUsers(departmentId);
      if (response.success) {
        setEmployees(response.data)
      } else {
        throw new Error(response.message || "Failed to load employees")
      }
    } catch (error) {
      console.error("Error fetching employees:", error)
      toast.error("Failed to load employees")
    }
  }, [departmentId])

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
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }))
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
        // Replace optimistic project with real data
        onProjectAdded(response.data, optimisticProject._id)
        setFormData(initialFormData)
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
  }, [formData, validateForm, fetchDepartmentTeams, departmentId, onProjectAdded, onClose, initialFormData])

  // Memoize available employees (those not already assigned)
  const availableEmployees = useMemo(() => 
    employees.filter(employee => !formData.assignees.includes(employee._id)),
    [employees, formData.assignees]
  )

  // Memoize selected employees for badges
  const selectedEmployees = useMemo(() => 
    formData.assignees.map(assigneeId => employees.find(emp => emp._id === assigneeId)).filter(Boolean),
    [formData.assignees, employees]
  )

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
          className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
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
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-xl">
                  <Globe className="h-4 w-4" />
                  <select
                    name="visibility"
                    value={formData.visibility}
                    onChange={handleInputChange}
                    className="bg-transparent text-white text-sm font-medium focus:outline-none cursor-pointer"
                  >
                    <option value="private" className="text-gray-900">Private</option>
                    <option value="public" className="text-gray-900">Public</option>
                  </select>
                  <ChevronDown className="h-4 w-4" />
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

          {/* Form Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-200px)] px-8 py-6">
            <form onSubmit={handleSubmit} className="space-y-6 pb-8">
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

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Calendar className="h-4 w-4 text-green-600" />
                    Start Date *
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                      errors.startDate ? "border-red-500 bg-red-50" : "border-gray-300 focus:border-transparent hover:border-blue-300"
                    }`}
                  />
                  {errors.startDate && <p className="text-red-600 text-sm mt-2">{errors.startDate}</p>}
                </motion.div>
                <motion.div custom={3} variants={fieldVariants} initial="hidden" animate="visible">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <Calendar className="h-4 w-4 text-red-600" />
                    Due Date
                  </label>
                  <input
                    type="date"
                    name="dueDate"
                    value={formData.dueDate}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                      errors.dueDate ? "border-red-500 bg-red-50" : "border-gray-300 focus:border-transparent hover:border-blue-300"
                    }`}
                  />
                  {errors.dueDate && <p className="text-red-600 text-sm mt-2">{errors.dueDate}</p>}
                </motion.div>
              </div>

              {/* Assignees */}
              <motion.div custom={4} variants={fieldVariants} initial="hidden" animate="visible">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Users className="h-4 w-4 text-purple-600" />
                  Team Members *
                </label>
                <div className="space-y-3">
                  <Select onValueChange={handleAssigneeChange}>
                    <SelectTrigger className="w-full h-12 rounded-xl border-gray-300 hover:border-blue-300 transition-colors cursor-pointer">
                      <SelectValue placeholder="Click to select team members..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 max-w-xs overflow-y-auto">
                      {availableEmployees.map((employee) => {
                          const getRoleIcon = (role) => {
                            switch (role) {
                              case 'admin':
                                return <Crown size={14} className="text-yellow-500" />;
                              case 'manager':
                                return <Shield size={14} className="text-blue-500" />;
                              default:
                                return <User size={14} className="text-gray-500" />;
                            }
                          };

                          const getRoleLabel = (role) => {
                            switch (role) {
                              case 'admin':
                                return 'Admin';
                              case 'manager':
                                return 'Manager';
                              default:
                                return 'Member';
                            }
                          };

                          return (
                            <SelectItem key={employee._id} value={employee._id} className="py-3">
                              <div className="flex items-center gap-3 w-full">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                                  {(employee.name?.name || employee.name || "U").charAt(0).toUpperCase()}
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900 truncate text-sm">{employee.name?.name || employee.name || "Unknown"}</span>
                                    {getRoleIcon(employee.role)}
                                  </div>
                                  <span className="text-xs text-gray-500 truncate">{employee.email?.email || employee.email || "No email"}</span>
                                  <span className="text-xs text-blue-600 font-medium">{getRoleLabel(employee.role)}</span>
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
                        {selectedEmployees.map((employee, index) => (
                            <motion.div
                              key={employee._id}
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              transition={{ delay: index * 0.05 }}
                            >
                              <Badge className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-2 text-sm flex items-center gap-2 hover:from-blue-600 hover:to-purple-600 transition-all">
                                <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold">
                                  {(employee?.name?.name || employee?.name || "U").charAt(0).toUpperCase()}
                                </div>
                                {employee?.name?.name || employee?.name || "Unknown"}
                                <motion.button
                                  whileHover={{ scale: 1.2 }}
                                  whileTap={{ scale: 0.8 }}
                                  type="button"
                                  onClick={() => handleAssigneeChange(employee._id)}
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
                  <input
                    type="text"
                    name="projectUrl"
                    value={formData.projectUrl}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                    placeholder="https://example.com"
                  />
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
              disabled={isSaving}
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
})

AddProjectModal.displayName = 'AddProjectModal'

export default AddProjectModal