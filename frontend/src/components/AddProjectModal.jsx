"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Plus, AlertCircle, Loader } from "lucide-react"
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
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchEmployees()
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
    if (!formData.dueDate) newErrors.dueDate = "Due date is required"
    if (new Date(formData.startDate) >= new Date(formData.dueDate)) {
      newErrors.dueDate = "Due date must be after start date"
    }
    if (formData.assignees.length === 0) newErrors.assignees = "At least one assignee is required"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) {
      toast.error("Please fix the errors in the form")
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
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Add New Project</h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-semibold text-gray-700">Visibility:</label>
                  <select
                    name="visibility"
                    value={formData.visibility}
                    onChange={handleInputChange}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                >
                  <X className="h-6 w-6" />
                </motion.button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Title */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Title *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    errors.title ? "border-red-500 bg-red-50" : "border-gray-300 focus:border-transparent"
                  }`}
                  placeholder="Enter project title"
                />
                {errors.title && (
                  <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                    <AlertCircle size={14} /> {errors.title}
                  </p>
                )}
              </motion.div>

              {/* Description */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                  placeholder="Enter project description"
                />
              </motion.div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date *</label>
                  <input
                    type="date"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                      errors.startDate ? "border-red-500 bg-red-50" : "border-gray-300 focus:border-transparent"
                    }`}
                  />
                  {errors.startDate && <p className="text-red-600 text-sm mt-1">{errors.startDate}</p>}
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Due Date *</label>
                  <input
                    type="date"
                    name="dueDate"
                    value={formData.dueDate}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                      errors.dueDate ? "border-red-500 bg-red-50" : "border-gray-300 focus:border-transparent"
                    }`}
                  />
                  {errors.dueDate && <p className="text-red-600 text-sm mt-1">{errors.dueDate}</p>}
                </motion.div>
              </div>

              {/* Assignees */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Assignees *</label>
                <div className="space-y-3">
                  <Select onValueChange={handleAssigneeChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select assignees..." />
                    </SelectTrigger>
                    <SelectContent>
                      {employees
                        .filter(employee => !formData.assignees.includes(employee._id))
                        .map((employee) => (
                          <SelectItem key={employee._id} value={employee._id}>
                            {employee.name?.name || employee.name || "Unknown"} ({employee.email?.email || employee.email || "No email"})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {formData.assignees.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.assignees.map((assigneeId) => {
                        const employee = employees.find(emp => emp._id === assigneeId)
                        return (
                          <Badge key={assigneeId} variant="secondary" className="flex items-center gap-1">
                            {employee?.name?.name || employee?.name || "Unknown"}
                            <button
                              type="button"
                              onClick={() => handleAssigneeChange(assigneeId)}
                              className="ml-1 text-gray-500 hover:text-gray-700"
                            >
                              ×
                            </button>
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </div>
                {errors.assignees && (
                  <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                    <AlertCircle size={14} /> {errors.assignees}
                  </p>
                )}
              </motion.div>

              {/* Estimated Time */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Estimated Time</label>
                <input
                  type="text"
                  name="estimatedTime"
                  value={formData.estimatedTime}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="e.g., 3 days, 8h"
                />
              </motion.div>

              {/* Project URL */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Project URL</label>
                <input
                  type="text"
                  name="projectUrl"
                  value={formData.projectUrl}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter project URL"
                />
              </motion.div>

              {/* Project Source */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Project Source</label>
                  <select
                    name="projectSource"
                    value={formData.projectSource}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="Direct">Direct</option>
                    <option value="Upwork">Upwork</option>
                    <option value="Contra">Contra</option>
                  </select>
                </motion.div>
                {formData.projectSource === "Upwork" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45 }}
                  >
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Upwork ID</label>
                    <input
                      type="text"
                      name="upworkId"
                      value={formData.upworkId}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Enter Upwork ID"
                    />
                  </motion.div>
                )}
              </div>

              {/* Billing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Billing Cycle</label>
                  <select
                    name="billingCycle"
                    value={formData.billingCycle}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="hr">Hourly</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </motion.div>
                {formData.billingCycle === "fixed" ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 }}
                  >
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Fixed Price</label>
                    <input
                      type="number"
                      name="fixedPrice"
                      value={formData.fixedPrice}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Enter fixed price"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 }}
                  >
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Hourly Price</label>
                    <input
                      type="number"
                      name="hourlyPrice"
                      value={formData.hourlyPrice}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Enter hourly price"
                    />
                  </motion.div>
                )}
              </div>

              {/* Client Details */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Client Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    name="clientName"
                    value={formData.clientName}
                    onChange={handleInputChange}
                    placeholder="Client Name"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <input
                    type="email"
                    name="clientEmail"
                    value={formData.clientEmail}
                    onChange={handleInputChange}
                    placeholder="Client Email"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <input
                    type="text"
                    name="clientWhatsappNumber"
                    value={formData.clientWhatsappNumber}
                    onChange={handleInputChange}
                    placeholder="Client WhatsApp Number"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </motion.div>

              {/* Project Category */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Project Category</label>
                <input
                  type="text"
                  name="projectCategory"
                  value={formData.projectCategory}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter project category"
                />
              </motion.div>

              {/* Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="flex justify-between items-center pt-6 border-t border-gray-200"
              >
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors shadow-sm"
                >
                  {isSaving ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus size={18} />
                      Add Project
                    </>
                  )}
                </motion.button>
              </motion.div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default AddProjectModal
