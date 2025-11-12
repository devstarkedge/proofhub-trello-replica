import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Edit2, CheckCircle, AlertCircle, Loader,
  Building2, Users, Shield
} from 'lucide-react';
import ManagerSelector from './ManagerSelector';

const EditDepartmentModal = ({
  isOpen,
  onClose,
  department,
  onDepartmentUpdated,
  managers,
  isLoading
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    managers: []
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen && department) {
      setFormData({
        name: department.name || '',
        description: department.description || '',
        managers: department.managers || []
      });
      setErrors({});
    }
  }, [isOpen, department]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleManagerChange = (selectedManagers) => {
    setFormData(prev => ({ ...prev, managers: selectedManagers }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Department name is required';
    }
    if (formData.name.trim().length < 2) {
      newErrors.name = 'Department name must be at least 2 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    onDepartmentUpdated(formData);
  };

  if (!isOpen || !department) return null;

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
  };

  const fieldVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: (i) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: i * 0.05,
        duration: 0.3,
        ease: "easeOut"
      }
    })
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-60 p-4"
        onClick={() => !isLoading && onClose()}
      >
        <motion.div
          variants={modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6 text-white">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ rotate: -180, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="bg-white/20 backdrop-blur-sm p-3 rounded-xl"
                >
                  <Edit2 className="h-6 w-6" />
                </motion.div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold">Edit Department</h2>
                  <p className="text-indigo-100 text-sm mt-0.5">Update department details and managers</p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => !isLoading && onClose()}
                disabled={isLoading}
                className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-colors disabled:opacity-50"
              >
                <X className="h-6 w-6" />
              </motion.button>
            </div>
          </div>

          {/* Form Content */}
          <div className="overflow-y-auto max-h-[calc(95vh-200px)] px-8 py-6">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Department Info Section */}
              <motion.div
                custom={0}
                variants={fieldVariants}
                initial="hidden"
                animate="visible"
                className="bg-gradient-to-br from-gray-50 to-indigo-50 p-6 rounded-2xl border border-gray-200"
              >
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
                  <Building2 className="h-5 w-5 text-indigo-600" />
                  Department Information
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      <Building2 className="h-4 w-4 text-indigo-600" />
                      Department Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                        errors.name ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-transparent hover:border-indigo-300'
                      }`}
                      placeholder="Enter department name"
                      disabled={isLoading}
                    />
                    <AnimatePresence>
                      {errors.name && (
                        <motion.p
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="text-red-600 text-sm mt-2 flex items-center gap-1"
                        >
                          <AlertCircle size={14} /> {errors.name}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      <Users className="h-4 w-4 text-indigo-600" />
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all hover:border-indigo-300"
                      placeholder="Brief description of the department's role and responsibilities"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </motion.div>

              {/* Manager Selection Section */}
              <motion.div
                custom={1}
                variants={fieldVariants}
                initial="hidden"
                animate="visible"
                className="bg-gradient-to-br from-gray-50 to-purple-50 p-6 rounded-2xl border border-gray-200"
              >
                <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
                  <Shield className="h-5 w-5 text-purple-600" />
                  Department Managers
                </h3>

                <ManagerSelector
                  managers={managers}
                  selectedManagers={formData.managers}
                  onChange={handleManagerChange}
                  disabled={isLoading}
                  currentDepartment={department}
                />
              </motion.div>
            </form>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-5 border-t border-gray-200 flex justify-between items-center">
            <motion.button
              whileHover={{ scale: 1.02, x: -4 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => !isLoading && onClose()}
              disabled={isLoading}
              className="px-6 py-3 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 font-semibold transition-all shadow-sm disabled:opacity-50"
            >
              Cancel
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02, x: 4 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-lg shadow-indigo-500/30"
            >
              {isLoading ? (
                <>
                  <Loader size={20} className="animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle size={20} />
                  Update Department
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EditDepartmentModal;
