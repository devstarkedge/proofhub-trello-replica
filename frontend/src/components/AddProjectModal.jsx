"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  X, Plus, AlertCircle, Loader, Calendar, Users, DollarSign, 
  Link2, FileText, Briefcase, Clock, Globe, Mail, Phone, Tag,
  CheckCircle2, ChevronDown
} from "lucide-react"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select"
import { Badge } from "../components/ui/badge"
import { toast } from "react-toastify"
import Database from "../services/database"

const AddProjectModal = ({ isOpen, onClose, departmentId, onProjectAdded }) => {
  const [formData, setFormData] = useState({
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
    clientWhatsappNumber: "",
    projectCategory: "",
    assignees: [],
    estimatedTime: "",
    visibility: "public",
  })
  const [employees, setEmployees] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryDescription, setNewCategoryDescription] = useState("")

  useEffect(() => {
    if (isOpen) {
      fetchEmployees()
      fetchCategories()
    }
  }, [isOpen, departmentId])

  const fetchEmployees = async () => {
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
  }

  const fetchCategories = async () => {
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
  }

  const handleCategoryChange = (value) => {
    if (value === "add-new") {
      setShowAddCategory(true)
    } else {
      setFormData((prev) => ({ ...prev, projectCategory: value }))
    }
  }

  const handleCreateCategory = async () => {
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
  }

  const fetchDepartmentTeams = async () => {
    try {
      const response = await Database.getTeams()
      const deptTeams = response.data.filter((team) => team.department && team.department._id === departmentId)
      return deptTeams
    } catch (error) {
      console.error("Error fetching teams:", error)
      return []
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }))
    }
  }

  const handleAssigneeChange = (employeeId) => {
    setFormData((prev) => ({
      ...prev,
      assignees: prev.assignees.includes(employeeId)
        ? prev.assignees.filter((id) => id !== employeeId)
        : [...prev.assignees, employeeId],
    }))
    if (errors.assignees) {
      setErrors((prev) => ({ ...prev, assignees: "" }))
    }
  }

  const validateForm = () => {
    const newErrors = {}
    if (!formData.title.trim()) newErrors.title = "Title is required"
    if (formData.title.length < 3) newErrors.title = "Title must be at least 3 characters"
    if (!formData.startDate) newErrors.startDate = "Start date is required"
    if (formData.dueDate && new Date(formData.startDate) >= new Date(formData.dueDate)) {
      newErrors.dueDate = "Due date must be after start date"
    }
    if (formData.assignees.length === 0) newErrors.assignees = "At least one assignee is required"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) {
      toast.error("Please fill all required details in the form")
      return
    }

    setIsSaving(true)
    try {
      const deptTeams = await fetchDepartmentTeams()
      const defaultTeam = deptTeams.length > 0 ? deptTeams[0]._id : null

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
          clientWhatsappNumber: formData.clientWhatsappNumber
        },
        projectCategory: formData.projectCategory,
        estimatedTime: formData.estimatedTime
      }

      const response = await Database.createProject(projectData)

      if (response.success) {
        onProjectAdded(response.data)
        onClose()
        setFormData({
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
          clientWhatsappNumber: "",
          projectCategory: "",
          assignees: [],
          estimatedTime: "",
          visibility: "public",
        })
        toast.success("Project created successfully!")
      } else {
        throw new Error(response.message || "Failed to create project")
      }
    } catch (error) {
      console.error("Error creating project:", error)
      toast.error(error.message || "Failed to create project")
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

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
  }

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
  }

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
                    <SelectTrigger className="w-full h-12 rounded-xl border-gray-300 hover:border-blue-300 transition-colors">
                      <SelectValue placeholder="Select team members..." />
                    </SelectTrigger>
                    <SelectContent>
                      {employees
                        .filter(employee => !formData.assignees.includes(employee._id))
                        .map((employee) => (
                          <SelectItem key={employee._id} value={employee._id}>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                                {(employee.name?.name || employee.name || "U").charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium">{employee.name?.name || employee.name || "Unknown"}</div>
                                <div className="text-xs text-gray-500">{employee.email?.email || employee.email || "No email"}</div>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <AnimatePresence>
                    {formData.assignees.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex flex-wrap gap-2"
                      >
                        {formData.assignees.map((assigneeId, index) => {
                          const employee = employees.find(emp => emp._id === assigneeId)
                          return (
                            <motion.div
                              key={assigneeId}
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
                                  onClick={() => handleAssigneeChange(assigneeId)}
                                  className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                                >
                                  <X size={14} />
                                </motion.button>
                              </Badge>
                            </motion.div>
                          )
                        })}
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
                      <SelectTrigger className="w-full h-12 rounded-xl border-gray-300 hover:border-blue-300 transition-colors">
                        <SelectValue placeholder="Select or add a category..." />
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
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
                  <Mail className="h-5 w-5 text-blue-600" />
                  Client Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    name="clientName"
                    value={formData.clientName}
                    onChange={handleInputChange}
                    placeholder="Client Name"
                    className="w-full px-4 py-3 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                  />
                  <input
                    type="email"
                    name="clientEmail"
                    value={formData.clientEmail}
                    onChange={handleInputChange}
                    placeholder="client@email.com"
                    className="w-full px-4 py-3 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                  />
                  <input
                    type="text"
                    name="clientWhatsappNumber"
                    value={formData.clientWhatsappNumber}
                    onChange={handleInputChange}
                    placeholder="+1 234 567 8900"
                    className="w-full px-4 py-3 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                  />
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
}

export default AddProjectModal