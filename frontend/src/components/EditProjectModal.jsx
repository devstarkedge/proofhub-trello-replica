import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import Database from '../services/database';

const EditProjectModal = ({ isOpen, onClose, project, onProjectUpdated }) => {
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
    priority: 'medium'
  });
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen && project) {
      setFormData({
        title: project.name || '',
        description: project.description || '',
        projectUrl: project.projectUrl || '',
        startDate: project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : '',
        projectSource: project.projectSource || 'Direct',
        upworkId: project.upworkId || '',
        billingCycle: project.billingCycle || 'hr',
        fixedPrice: project.fixedPrice || '',
        hourlyPrice: project.hourlyPrice || '',
        dueDate: project.dueDate ? new Date(project.dueDate).toISOString().split('T')[0] : '',
        clientName: project.clientName || '',
        clientEmail: project.clientEmail || '',
        clientWhatsappNumber: project.clientWhatsappNumber || '',
        projectCategory: project.projectCategory || '',
        assignees: project.members?.map(m => typeof m === 'string' ? m : m._id) || [],
        estimatedTime: project.estimatedTime || '',
        status: project.status || 'planning',
        priority: project.priority || 'medium'
      });
      fetchEmployees();
    }
  }, [isOpen, project]);

  const fetchEmployees = async () => {
    try {
      const response = await Database.getUsers();
      const deptEmployees = response.data.filter(user =>
        user.department && user.department._id === project.department?._id && user.role === 'employee' && user.isVerified
      );
      setEmployees(deptEmployees);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
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
        clientName: formData.clientName,
        clientEmail: formData.clientEmail,
        clientWhatsappNumber: formData.clientWhatsappNumber,
        projectCategory: formData.projectCategory,
        members: formData.assignees,
        estimatedTime: formData.estimatedTime,
        status: formData.status,
        priority: formData.priority
      };

      const response = await Database.updateProject(project._id, updates);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Edit Project</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.title ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter project title"
              />
              {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter project description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.startDate ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.startDate && <p className="text-red-500 text-sm mt-1">{errors.startDate}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date *
                </label>
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.dueDate ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.dueDate && <p className="text-red-500 text-sm mt-1">{errors.dueDate}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="planning">Planning</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="on-hold">On Hold</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project URL
              </label>
              <input
                type="text"
                name="projectUrl"
                value={formData.projectUrl}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter project URL"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Source
                </label>
                <select
                  name="projectSource"
                  value={formData.projectSource}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Direct">Direct</option>
                  <option value="Upwork">Upwork</option>
                  <option value="Contra">Contra</option>
                </select>
              </div>
              {formData.projectSource === 'Upwork' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Upwork ID
                  </label>
                  <input
                    type="text"
                    name="upworkId"
                    value={formData.upworkId}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter Upwork ID"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Billing Cycle
                </label>
                <select
                  name="billingCycle"
                  value={formData.billingCycle}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="hr">Hourly</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>
              {formData.billingCycle === 'fixed' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fixed Price
                  </label>
                  <input
                    type="number"
                    name="fixedPrice"
                    value={formData.fixedPrice}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter fixed price"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hourly Price
                  </label>
                  <input
                    type="number"
                    name="hourlyPrice"
                    value={formData.hourlyPrice}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter hourly price"
                  />
                </div>
              )}
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Client Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="text"
                  name="clientName"
                  value={formData.clientName}
                  onChange={handleInputChange}
                  placeholder="Client Name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="email"
                  name="clientEmail"
                  value={formData.clientEmail}
                  onChange={handleInputChange}
                  placeholder="Client Email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  name="clientWhatsappNumber"
                  value={formData.clientWhatsappNumber}
                  onChange={handleInputChange}
                  placeholder="Client WhatsApp Number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project Category
              </label>
              <input
                type="text"
                name="projectCategory"
                value={formData.projectCategory}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter project category"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assignees *
              </label>
              <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-md p-2">
                {employees.map(employee => (
                  <label key={employee._id} className="flex items-center space-x-2 py-1">
                    <input
                      type="checkbox"
                      checked={formData.assignees.includes(employee._id)}
                      onChange={() => handleAssigneeChange(employee._id)}
                      className="rounded"
                    />
                    <span className="text-sm">{employee.name}</span>
                  </label>
                ))}
              </div>
              {errors.assignees && <p className="text-red-500 text-sm mt-1">{errors.assignees}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estimated Time
              </label>
              <input
                type="text"
                name="estimatedTime"
                value={formData.estimatedTime}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 3 days, 8h"
              />
            </div>

            <div className="flex justify-between items-center pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default EditProjectModal;
