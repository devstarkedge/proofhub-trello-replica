import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Plus } from 'lucide-react';
import Database from '../services/database';

const AddProjectModal = ({ isOpen, onClose, departmentId, onProjectAdded }) => {
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
    estimatedTime: ''
  });
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});


  useEffect(() => {
    if (isOpen) {
      fetchEmployees();
    }
  }, [isOpen, departmentId]);

  const fetchEmployees = async () => {
    try {
      const response = await Database.getUsers();
      const deptEmployees = response.data.filter(user =>
        user.department && user.department._id === departmentId && user.role === 'employee' && user.isVerified
      );
      setEmployees(deptEmployees);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchDepartmentTeams = async () => {
    try {
      const response = await Database.getTeams();
      const deptTeams = response.data.filter(team =>
        team.department && team.department._id === departmentId
      );
      return deptTeams;
    } catch (error) {
      console.error('Error fetching teams:', error);
      return [];
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
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
      // Fetch department teams to get the first team as default
      const deptTeams = await fetchDepartmentTeams();
      const defaultTeam = deptTeams.length > 0 ? deptTeams[0]._id : null;

      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.title);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('team', defaultTeam || '');
      formDataToSend.append('department', departmentId);
      formData.assignees.forEach(id => {
        formDataToSend.append('members', id);
      });
      formDataToSend.append('background', '#6366f1');
      formDataToSend.append('startDate', formData.startDate);
      formDataToSend.append('dueDate', formData.dueDate);


      const response = await Database.createProject(formDataToSend);

      if (response.success) {
        onProjectAdded(response.data);
        onClose();
        setFormData({
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
          estimatedTime: ''
        });
        alert('Project created successfully!');
      } else {
        throw new Error(response.message || 'Failed to create project');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      alert(error.message || 'Failed to create project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
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
            <h2 className="text-xl font-semibold text-gray-900">Add Project</h2>
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



            <div className="flex justify-between items-center pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <div className="flex items-center space-x-2">

                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  {loading ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AddProjectModal;
