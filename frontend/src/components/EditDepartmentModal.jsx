import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Edit2,
  CheckCircle,
  AlertCircle,
  Loader,
  Building2,
  Users,
  Shield,
} from "lucide-react";
import ManagerSelector from "./ManagerSelector";
import useDepartmentStore from "../store/departmentStore";

const EditDepartmentModal = ({
  isOpen,
  onClose,
  department,
  onDepartmentUpdated,
  managers,
  isLoading,
}) => {
  const { departments } = useDepartmentStore();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    managers: [],
  });
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignData, setReassignData] = useState(null);

  // Helper function to normalize manager IDs (handles both object and string formats)
  const normalizeManagerIds = (managers) => {
    if (!managers || !Array.isArray(managers)) return [];
    return managers.map(m => {
      if (typeof m === 'object' && m !== null) {
        return m._id?.toString() || m._id;
      }
      return m?.toString() || m;
    }).filter(Boolean);
  };

  useEffect(() => {
    if (isOpen && department) {
      setFormData({
        name: department.name || "",
        description: department.description || "",
        // Normalize manager IDs to ensure consistent string format
        managers: normalizeManagerIds(department.managers),
      });
      setErrors({});
    }
  }, [isOpen, department]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // Helper to normalize a single ID
  const normalizeId = (item) => {
    if (!item) return null;
    if (typeof item === 'object' && item !== null) {
      return item._id?.toString() || item.toString();
    }
    return item?.toString();
  };

  const handleManagerChange = (selectedManagers) => {
    // Normalize all IDs for proper comparison
    const normalizedSelected = selectedManagers.map(id => normalizeId(id)).filter(Boolean);
    const normalizedFormManagers = formData.managers.map(id => normalizeId(id)).filter(Boolean);
    const currentDeptId = normalizeId(department._id);
    
    // Check if any newly selected managers are already assigned to other departments
    const newManagers = normalizedSelected.filter(
      (id) => !normalizedFormManagers.includes(id)
    );
    const managersToCheck = managers.filter((manager) =>
      newManagers.includes(normalizeId(manager._id))
    );

    const managersWithOtherAssignments = managersToCheck.filter(
      (manager) =>
        manager.department &&
        manager.department.length > 0 &&
        !manager.department.some(
          (dept) => normalizeId(dept) === currentDeptId
        )
    );

    if (managersWithOtherAssignments.length > 0) {
      // Show reassign confirmation modal
      const manager = managersWithOtherAssignments[0];
      const otherDepartments = manager.department.filter(
        (dept) => normalizeId(dept) !== currentDeptId
      );
      const otherDeptNames = departments
        .filter((dept) =>
          otherDepartments.some(
            (otherDept) => normalizeId(otherDept) === normalizeId(dept._id)
          )
        )
        .map((dept) => dept.name)
        .join(", ");

      setReassignData({
        manager,
        otherDeptNames,
        selectedDepartment: department.name,
        selectedManagers: normalizedSelected,
        currentDepartment: department,
      });
      setShowReassignModal(true);
      return;
    }

    // No conflicts, proceed with selection
    setFormData((prev) => ({ ...prev, managers: normalizedSelected }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = "Department name is required";
    }
    if (formData.name.trim().length < 2) {
      newErrors.name = "Department name must be at least 2 characters";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      await onDepartmentUpdated(formData);
      showToast("Department updated successfully!", "success");
    } catch (error) {
      showToast("Failed to update department", "error");
    }
  };

  const showToast = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleReassignConfirm = () => {
    if (!reassignData) return;

    setShowReassignModal(false);
    setFormData((prev) => ({
      ...prev,
      managers: reassignData.selectedManagers,
    }));
    setReassignData(null);
  };

  const handleReassignCancel = () => {
    setShowReassignModal(false);
    setReassignData(null);
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
        ease: [0.4, 0, 0.2, 1],
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: 20,
      transition: { duration: 0.2 },
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
        ease: "easeOut",
      },
    }),
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
                  <h2 className="text-2xl sm:text-3xl font-bold">
                    Edit Department{" "}
                    <span className="text-orange-500">{department?.name}</span>
                  </h2>

                  <p className="text-indigo-100 text-sm mt-0.5">
                    Update{" "}
                    <span className="text-orange-400">{department?.name}</span>{" "}
                    department details and managers
                  </p>
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
          <div className="overflow-y-auto max-h-[calc(95vh-180px)] px-8 py-6">
            <form onSubmit={handleSubmit} className="space-y-8">
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
                  departments={departments}
                />
              </motion.div>
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
                        errors.name
                          ? "border-red-500 bg-red-50"
                          : "border-gray-300 focus:border-transparent hover:border-indigo-300"
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

          {/* Reassign Confirmation Modal */}
          <AnimatePresence>
            {showReassignModal && reassignData && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
                onClick={() => !isLoading && handleReassignCancel()}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
                >
                  <div className="p-6">
                    <div className="flex items-center gap-4 mb-6">
                      <motion.div
                        animate={{
                          scale: [1, 1.1, 1],
                          rotate: [0, -10, 10, -10, 0],
                        }}
                        transition={{
                          duration: 0.5,
                          repeat: Infinity,
                          repeatDelay: 2,
                        }}
                        className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center flex-shrink-0"
                      >
                        <AlertCircle size={32} className="text-orange-600" />
                      </motion.div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 mb-1">
                          Reassign Manager?
                        </h3>
                        <p className="text-sm text-gray-600">
                          This manager is already assigned to other departments
                        </p>
                      </div>
                    </div>

                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
                      <p className="text-gray-700 text-sm leading-relaxed mb-3">
                        <span className="font-bold text-orange-700">
                          {reassignData.manager.name}
                        </span>{" "}
                        is already assigned in{" "}
                        <span className="font-bold text-orange-700">
                          {reassignData.otherDeptNames}
                        </span>
                        .
                      </p>
                      <p className="text-gray-700 text-sm leading-relaxed">
                        Do you want to re-assign{" "}
                        <span className="font-bold text-orange-700">
                          {reassignData.manager.name}
                        </span>{" "}
                        to{" "}
                        <span className="font-bold text-orange-700">
                          {reassignData.selectedDepartment}
                        </span>
                        ?
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={handleReassignCancel}
                        disabled={isLoading}
                        className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleReassignConfirm}
                        disabled={isLoading}
                        className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isLoading ? (
                          <>
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                              className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                            />
                            Reassigning...
                          </>
                        ) : (
                          <>
                            <CheckCircle size={20} />
                            Confirm Reassign
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toast Notifications */}
          <div className="fixed top-4 right-4 z-[100] space-y-2">
            <AnimatePresence>
              {toast && (
                <motion.div
                  initial={{ opacity: 0, y: -50, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.9 }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm ${
                    toast.type === "success"
                      ? "bg-green-50 border-green-200 text-green-800"
                      : toast.type === "error"
                      ? "bg-red-50 border-red-200 text-red-800"
                      : "bg-blue-50 border-blue-200 text-blue-800"
                  }`}
                >
                  {toast.type === "success" ? (
                    <CheckCircle className="text-green-500" size={20} />
                  ) : toast.type === "error" ? (
                    <AlertCircle className="text-red-500" size={20} />
                  ) : (
                    <AlertCircle className="text-blue-500" size={20} />
                  )}
                  <p className="font-medium flex-1">{toast.message}</p>
                  <button
                    onClick={() => setToast(null)}
                    className="hover:opacity-70 transition-opacity"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EditDepartmentModal;
