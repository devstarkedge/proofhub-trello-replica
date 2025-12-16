import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, Calendar, Clock, Users, Pin, Sparkles, Send, FileText, Image, File, AlertCircle, CheckCircle, RefreshCw, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { toast } from 'react-toastify';

// File type constants
const ALLOWED_TYPES = {
  images: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;

const CreateAnnouncementModal = ({ isOpen, onClose, onSubmit, isLoading }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'General',
    customCategory: '',
    subscribers: {
      type: 'all',
      departments: [],
      users: [],
      roles: []
    },
    lastFor: {
      value: 7,
      unit: 'days'
    },
    scheduledFor: null,
    allowComments: true,
    isPinned: false
  });

  const [files, setFiles] = useState([]);
  const [fileStates, setFileStates] = useState({}); // Track upload state per file
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = useRef(null);
  const fileInputRef = useRef(null);

  // Target audience states
  const [departments, setDepartments] = useState([]);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [targetUsers, setTargetUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Upload progress tracking
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Validate file
  const validateFile = (file) => {
    const allAllowedTypes = [...ALLOWED_TYPES.images, ...ALLOWED_TYPES.documents];
    
    if (!allAllowedTypes.includes(file.type)) {
      return { valid: false, error: `Invalid file type: ${file.name}. Allowed: JPG, PNG, WEBP, PDF, DOC, DOCX` };
    }
    
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `File too large: ${file.name}. Max size: 10MB` };
    }
    
    return { valid: true };
  };

  // Check for duplicate files
  const isDuplicate = (newFile) => {
    return files.some(f => f.name === newFile.name && f.size === newFile.size);
  };

  // Process files for adding
  const processFiles = (newFiles) => {
    const validFiles = [];
    const errors = [];

    Array.from(newFiles).forEach(file => {
      if (files.length + validFiles.length >= MAX_FILES) {
        errors.push(`Maximum ${MAX_FILES} files allowed`);
        return;
      }

      if (isDuplicate(file)) {
        errors.push(`Duplicate file: ${file.name}`);
        return;
      }

      const validation = validateFile(file);
      if (!validation.valid) {
        errors.push(validation.error);
        return;
      }

      validFiles.push(file);
    });

    if (errors.length > 0) {
      errors.forEach(err => toast.error(err));
    }

    if (validFiles.length > 0) {
      const newFileStates = {};
      validFiles.forEach(file => {
        newFileStates[file.name] = {
          status: 'pending', // pending, uploading, success, error
          progress: 0,
          preview: ALLOWED_TYPES.images.includes(file.type) ? URL.createObjectURL(file) : null
        };
      });

      setFiles(prev => [...prev, ...validFiles]);
      setFileStates(prev => ({ ...prev, ...newFileStates }));
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      processFiles(droppedFiles);
    }
  }, [files]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(fileStates).forEach(state => {
        if (state.preview) {
          URL.revokeObjectURL(state.preview);
        }
      });
    };
  }, []);

  // Fetch departments on mount
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await fetch('/api/departments', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        const data = await response.json();
        if (data.success) {
          setDepartments(data.data);
        }
      } catch (error) {
        console.error('Error fetching departments:', error);
      }
    };

    if (isOpen) {
      fetchDepartments();
    }
  }, [isOpen]);

  // Fetch users based on audience type
  useEffect(() => {
    const fetchUsers = async () => {
      if (!isOpen) return;

      setLoadingUsers(true);
      try {
        let endpoint = '';
        let params = '';

        switch (formData.subscribers.type) {
          case 'all':
            endpoint = '/api/users/verified';
            break;
          case 'departments':
            if (selectedDepartments.length > 0) {
              endpoint = '/api/users/by-departments';
              params = `?departments=${selectedDepartments.join(',')}`;
            }
            break;
          case 'managers':
            endpoint = '/api/users/managers';
            break;
          default:
            setTargetUsers([]);
            setLoadingUsers(false);
            return;
        }

        if (endpoint) {
          const response = await fetch(`${endpoint}${params}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          const data = await response.json();
          if (data.success) {
            setTargetUsers(data.data);
          }
        }
      } catch (error) {
        console.error('Error fetching users:', error);
        setTargetUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [formData.subscribers.type, selectedDepartments, isOpen]);

  if (!isOpen) return null;

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubscriberChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      subscribers: {
        ...prev.subscribers,
        [field]: value
      }
    }));
  };

  const handleDurationChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      lastFor: {
        ...prev.lastFor,
        [field]: field === 'value' ? parseInt(value) : value
      }
    }));
  };

  const handleFileChange = (e) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      processFiles(selectedFiles);
    }
  };

  const removeFile = (fileName) => {
    // Clean up object URL if exists
    if (fileStates[fileName]?.preview) {
      URL.revokeObjectURL(fileStates[fileName].preview);
    }

    setFiles(prev => prev.filter(f => f.name !== fileName));
    setFileStates(prev => {
      const newStates = { ...prev };
      delete newStates[fileName];
      return newStates;
    });
  };

  const retryFile = (fileName) => {
    setFileStates(prev => ({
      ...prev,
      [fileName]: { ...prev[fileName], status: 'pending', progress: 0, error: null }
    }));
  };

  // Check if all files are ready for submission
  const allFilesReady = () => {
    if (files.length === 0) return true;
    return Object.values(fileStates).every(state => 
      state.status === 'pending' || state.status === 'success'
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!formData.description.trim()) {
      toast.error('Description is required');
      return;
    }

    if (formData.subscribers.type === 'departments' && selectedDepartments.length === 0) {
      toast.error('Please select at least one department');
      return;
    }

    if (!allFilesReady()) {
      toast.error('Please wait for all uploads to complete or remove failed files');
      return;
    }

    try {
      setIsUploading(true);
      
      // Update subscribers based on selected departments
      const updatedFormData = {
        ...formData,
        subscribers: {
          ...formData.subscribers,
          departments: formData.subscribers.type === 'departments' ? selectedDepartments : []
        }
      };

      // Mark all files as uploading
      const uploadingStates = {};
      files.forEach(file => {
        uploadingStates[file.name] = { ...fileStates[file.name], status: 'uploading' };
      });
      setFileStates(uploadingStates);

      await onSubmit(updatedFormData, files, (progress) => {
        setUploadProgress(progress);
      });

      // Reset form on success
      resetForm();
      onClose();
    } catch (error) {
      console.error('Error creating announcement:', error);
      
      // Mark files as error
      const errorStates = {};
      files.forEach(file => {
        errorStates[file.name] = { 
          ...fileStates[file.name], 
          status: 'error',
          error: 'Upload failed' 
        };
      });
      setFileStates(errorStates);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const resetForm = () => {
    // Clean up object URLs
    Object.values(fileStates).forEach(state => {
      if (state.preview) {
        URL.revokeObjectURL(state.preview);
      }
    });

    setFormData({
      title: '',
      description: '',
      category: 'General',
      customCategory: '',
      subscribers: {
        type: 'all',
        departments: [],
        users: [],
        roles: []
      },
      lastFor: {
        value: 7,
        unit: 'days'
      },
      scheduledFor: null,
      allowComments: true,
      isPinned: false
    });
    setFiles([]);
    setFileStates({});
    setSelectedDepartments([]);
    setTargetUsers([]);
    setUploadProgress(0);
  };

  // Get file icon based on type
  const getFileIcon = (file) => {
    if (ALLOWED_TYPES.images.includes(file.type)) {
      return <Image className="w-6 h-6 text-blue-500" />;
    }
    if (file.type === 'application/pdf') {
      return <FileText className="w-6 h-6 text-red-500" />;
    }
    return <File className="w-6 h-6 text-gray-500" />;
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'uploading':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 p-6 text-white">
              <div className="absolute inset-0 bg-black/10 backdrop-blur-sm"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    className="p-2 bg-white/20 rounded-xl backdrop-blur-sm"
                  >
                    <Sparkles className="w-6 h-6" />
                  </motion.div>
                  <div>
                    <h2 className="text-2xl font-bold">Create Announcement</h2>
                    <p className="text-blue-100 text-sm">Share important updates with your team</p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-xl transition-all duration-300 backdrop-blur-sm"
                >
                  <X className="w-6 h-6" />
                </motion.button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                  {/* Title */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-2"
                  >
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <FileText className="w-4 h-4 text-blue-600" />
                      Title *
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      placeholder="Enter announcement title"
                      maxLength={200}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 backdrop-blur-sm transition-all duration-300"
                    />
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-gray-500">{formData.title.length}/200 characters</p>
                      {formData.title.length > 180 && (
                        <span className="text-xs text-orange-500 font-medium">Approaching limit</span>
                      )}
                    </div>
                  </motion.div>

                  {/* Description */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-2"
                  >
                    <label className="block text-sm font-semibold text-gray-700">
                      Description *
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Enter detailed announcement description"
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 backdrop-blur-sm transition-all duration-300 resize-none"
                    />
                  </motion.div>

                  {/* Category */}
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="space-y-2"
                  >
                    <label className="block text-sm font-semibold text-gray-700">
                      Category *
                    </label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 backdrop-blur-sm transition-all duration-300"
                    >
                      <option value="General">📢 General</option>
                      <option value="HR">👥 HR</option>
                      <option value="Urgent">🚨 Urgent</option>
                      <option value="System Update">🔧 System Update</option>
                      <option value="Events">🎉 Events</option>
                      <option value="Custom">✨ Custom</option>
                    </select>
                  </motion.div>

                  {/* Custom Category */}
                  <AnimatePresence>
                    {formData.category === 'Custom' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-2"
                      >
                        <label className="block text-sm font-semibold text-gray-700">
                          Custom Category
                        </label>
                        <input
                          type="text"
                          name="customCategory"
                          value={formData.customCategory}
                          onChange={handleInputChange}
                          placeholder="Enter custom category"
                          maxLength={50}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 backdrop-blur-sm transition-all duration-300"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Additional Options - Half Width, Aligned with Left */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="bg-gray-50/50 backdrop-blur-sm rounded-2xl p-4 border border-gray-100"
                  >
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Additional Options</h3>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          name="allowComments"
                          checked={formData.allowComments}
                          onChange={handleInputChange}
                          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-2"
                        />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">Allow comments on this announcement</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          name="isPinned"
                          checked={formData.isPinned}
                          onChange={handleInputChange}
                          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-2"
                        />
                        <Pin className="w-4 h-4 text-blue-600" />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">Pin to top (max 3 pinned announcements)</span>
                      </label>
                    </div>
                  </motion.div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Subscriber Type */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="space-y-2"
                  >
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <Users className="w-4 h-4 text-purple-600" />
                      Target Audience
                    </label>
                    <select
                      value={formData.subscribers.type}
                      onChange={(e) => {
                        handleSubscriberChange('type', e.target.value);
                        setSelectedDepartments([]);
                        setTargetUsers([]);
                      }}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 backdrop-blur-sm transition-all duration-300"
                    >
                      <option value="all">🌍 All verified users</option>
                      <option value="departments">🏢 Specific departments</option>
                      <option value="managers">👔 Only managers</option>
                    </select>
                  </motion.div>

                  {/* Department Selection with Checkboxes */}
                  <AnimatePresence>
                    {formData.subscribers.type === 'departments' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-3"
                      >
                        <label className="block text-sm font-semibold text-gray-700">
                          Select Departments
                        </label>
                        <div className="bg-gray-50/50 backdrop-blur-sm rounded-xl p-4 border border-gray-100 max-h-64 overflow-y-auto">
                          <div className="space-y-3">
                            {departments.map((dept, index) => (
                              <motion.label
                                key={dept._id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                                  selectedDepartments.includes(dept._id)
                                    ? 'bg-blue-50 border-2 border-blue-200'
                                    : 'bg-white border-2 border-gray-100 hover:border-blue-200 hover:bg-blue-50/50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedDepartments.includes(dept._id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedDepartments(prev => [...prev, dept._id]);
                                    } else {
                                      setSelectedDepartments(prev => prev.filter(id => id !== dept._id));
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 bg-white border-2 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-gray-900">{dept.name}</span>
                                    <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                      {dept.members?.length || 0} members
                                    </span>
                                  </div>
                                  {dept.description && (
                                    <p className="text-sm text-gray-600 mt-1">{dept.description}</p>
                                  )}
                                </div>
                              </motion.label>
                            ))}
                          </div>
                        </div>
                        {selectedDepartments.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 text-sm text-blue-600 font-medium"
                          >
                            <span>{selectedDepartments.length} department{selectedDepartments.length > 1 ? 's' : ''} selected</span>
                          </motion.div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Target Users Display */}
                  <AnimatePresence>
                    {(formData.subscribers.type === 'all' || formData.subscribers.type === 'departments' || formData.subscribers.type === 'managers') && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-semibold text-gray-700">
                            Recipients ({targetUsers.length})
                          </label>
                          {loadingUsers && (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"
                              />
                              Loading...
                            </div>
                          )}
                        </div>

                        {targetUsers.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-gray-50/50 backdrop-blur-sm rounded-xl p-4 border border-gray-100"
                          >
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                              {targetUsers.slice(0, 20).map((user, index) => (
                                <motion.div
                                  key={user._id}
                                  initial={{ scale: 0.8, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{ delay: index * 0.05 }}
                                  className="flex items-center gap-2 bg-white rounded-full px-3 py-1 border border-gray-200 shadow-sm"
                                >
{user.avatar ? (
                                    <img
                                      src={user.avatar}
                                      alt={user.name}
                                      className="w-6 h-6 rounded-full object-cover border border-gray-200"
                                    />
                                  ) : (
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm border border-white/20 ${
                                      (() => {
                                        const colors = [
                                          'bg-gradient-to-br from-red-500 to-red-600',
                                          'bg-gradient-to-br from-orange-500 to-orange-600',
                                          'bg-gradient-to-br from-amber-500 to-amber-600',
                                          'bg-gradient-to-br from-green-500 to-green-600',
                                          'bg-gradient-to-br from-emerald-500 to-emerald-600',
                                          'bg-gradient-to-br from-teal-500 to-teal-600',
                                          'bg-gradient-to-br from-cyan-500 to-cyan-600',
                                          'bg-gradient-to-br from-blue-500 to-blue-600',
                                          'bg-gradient-to-br from-indigo-500 to-indigo-600',
                                          'bg-gradient-to-br from-violet-500 to-violet-600',
                                          'bg-gradient-to-br from-purple-500 to-purple-600',
                                          'bg-gradient-to-br from-fuchsia-500 to-fuchsia-600',
                                          'bg-gradient-to-br from-pink-500 to-pink-600',
                                          'bg-gradient-to-br from-rose-500 to-rose-600'
                                        ];
                                        let hash = 0;
                                        for (let i = 0; i < user.name.length; i++) {
                                          hash = user.name.charCodeAt(i) + ((hash << 5) - hash);
                                        }
                                        return colors[Math.abs(hash) % colors.length];
                                      })()
                                    }`}>
                                      {user.name
                                        .split(' ')
                                        .map(n => n[0])
                                        .join('')
                                        .toUpperCase()
                                        .slice(0, 2)}
                                    </div>
                                  )}
                                  <span className="text-sm text-gray-700 font-medium">{user.name}</span>
                                </motion.div>
                              ))}
                              {targetUsers.length > 20 && (
                                <motion.div
                                  initial={{ scale: 0.8, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full px-3 py-1 shadow-sm"
                                >
                                  <span className="text-sm font-medium">+{targetUsers.length - 20} more</span>
                                </motion.div>
                              )}
                            </div>
                          </motion.div>
                        )}

                        {targetUsers.length === 0 && !loadingUsers && formData.subscribers.type === 'departments' && selectedDepartments.length === 0 && (
                          <div className="text-center py-4 text-gray-500 text-sm">
                            Select departments above to see recipients
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Duration */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="space-y-2"
                  >
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <Clock className="w-4 h-4 text-green-600" />
                      Duration *
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="number"
                        value={formData.lastFor.value}
                        onChange={(e) => handleDurationChange('value', e.target.value)}
                        min={1}
                        placeholder="Value"
                        className="px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 backdrop-blur-sm transition-all duration-300"
                      />
                      <select
                        value={formData.lastFor.unit}
                        onChange={(e) => handleDurationChange('unit', e.target.value)}
                        className="px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 backdrop-blur-sm transition-all duration-300"
                      >
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                      </select>
                    </div>
                  </motion.div>

                  {/* Schedule */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                    className="space-y-2"
                  >
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <Calendar className="w-4 h-4 text-orange-600" />
                      Schedule for later (Optional)
                    </label>
                    <div className="relative">
                      <DatePicker
                        selected={formData.scheduledFor}
                        onChange={(date) => setFormData(prev => ({ ...prev, scheduledFor: date }))}
                        showTimeSelect
                        timeFormat="HH:mm"
                        timeIntervals={15}
                        timeCaption="Time"
                        dateFormat="MMMM d, yyyy h:mm aa"
                        minDate={new Date()}
                        placeholderText="Select date and time"
                        shouldCloseOnSelect={true}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 backdrop-blur-sm transition-all duration-300"
                        wrapperClassName="w-full"
                        popperClassName="react-datepicker-custom"
                        calendarClassName="shadow-2xl border-0 rounded-2xl overflow-hidden"
                      />
                      <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                    </div>
                    <p className="text-xs text-gray-500">Leave empty for immediate broadcast</p>
                  </motion.div>

                  {/* Attachments with Drag & Drop */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 }}
                    className="space-y-3"
                  >
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <Upload className="w-4 h-4 text-indigo-600" />
                      Attachments (Optional)
                      <span className="text-xs text-gray-400 font-normal">
                        Max {MAX_FILES} files, 10MB each
                      </span>
                    </label>
                    
                    {/* Drag & Drop Zone */}
                    <div
                      ref={dropZoneRef}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-300 ${
                        isDragging 
                          ? 'border-blue-500 bg-blue-50/50 scale-[1.02]' 
                          : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30 bg-gray-50/50'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFileChange}
                        accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
                        className="hidden"
                      />
                      
                      <motion.div
                        animate={isDragging ? { scale: 1.02 } : { scale: 1 }}
                        className="flex items-center justify-center gap-3"
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isDragging ? 'bg-blue-100' : 'bg-gray-100'
                        }`}>
                          <Upload className={`w-4 h-4 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
                        </div>
                        <div className="text-left">
                          <p className={`text-sm font-medium ${isDragging ? 'text-blue-600' : 'text-gray-600'}`}>
                            {isDragging ? 'Drop files' : 'Click to browse'}
                          </p>
                          <p className="text-[10px] text-gray-400">
                             Supports: JPG, PNG, WEBP, PDF...
                          </p>
                        </div>
                      </motion.div>
                    </div>

                    {/* Upload Progress Bar (during submission) */}
                    <AnimatePresence>
                      {isUploading && uploadProgress > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-1"
                        >
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Uploading attachments...</span>
                            <span>{uploadProgress}%</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${uploadProgress}%` }}
                              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* File List */}
                    <AnimatePresence>
                      {files.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-2"
                        >
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600 font-medium">
                              {files.length} file{files.length > 1 ? 's' : ''} selected
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                Object.values(fileStates).forEach(state => {
                                  if (state.preview) URL.revokeObjectURL(state.preview);
                                });
                                setFiles([]);
                                setFileStates({});
                              }}
                              className="text-red-500 hover:text-red-600 text-xs font-medium"
                            >
                              Clear all
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto p-1">
                            {files.map((file, idx) => {
                              const state = fileStates[file.name] || { status: 'pending', progress: 0 };
                              const isImage = ALLOWED_TYPES.images.includes(file.type);
                              
                              return (
                                <motion.div
                                  key={file.name}
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                                  className={`relative group rounded-xl overflow-hidden border-2 transition-all duration-300 ${
                                    state.status === 'error' 
                                      ? 'border-red-300 bg-red-50' 
                                      : state.status === 'success'
                                      ? 'border-green-300 bg-green-50'
                                      : 'border-gray-200 bg-white hover:border-blue-300'
                                  }`}
                                >
                                  {/* Preview */}
                                  <div className="aspect-square relative">
                                    {isImage && state.preview ? (
                                      <img
                                        src={state.preview}
                                        alt={file.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-3">
                                        {getFileIcon(file)}
                                        <p className="text-xs text-gray-600 font-medium text-center truncate w-full mt-2">
                                          {file.name.length > 15 ? file.name.slice(0, 12) + '...' : file.name}
                                        </p>
                                      </div>
                                    )}
                                    
                                    {/* Overlay for uploading state */}
                                    {state.status === 'uploading' && (
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <div className="text-center">
                                          <RefreshCw className="w-6 h-6 text-white animate-spin mx-auto" />
                                          <span className="text-white text-xs mt-1">{state.progress}%</span>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Status Badge */}
                                    <div className="absolute top-1 left-1">
                                      {getStatusIcon(state.status)}
                                    </div>
                                    
                                    {/* Action Buttons */}
                                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {state.status === 'error' && (
                                        <button
                                          type="button"
                                          onClick={() => retryFile(file.name)}
                                          className="p-1 bg-blue-500 text-white rounded-full hover:bg-blue-600 shadow-lg"
                                          title="Retry"
                                        >
                                          <RefreshCw className="w-3 h-3" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => removeFile(file.name)}
                                        className="p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                                        title="Remove"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                  
                                  {/* File Info */}
                                  <div className="p-2 bg-white/80 backdrop-blur-sm border-t border-gray-100">
                                    <p className="text-xs text-gray-700 font-medium truncate" title={file.name}>
                                      {file.name}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                      {(file.size / 1024).toFixed(1)} KB
                                    </p>
                                    {state.status === 'error' && state.error && (
                                      <p className="text-xs text-red-500 truncate" title={state.error}>
                                        {state.error}
                                      </p>
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
              </div>

              {/* Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200"
              >
                <motion.button
                  whileHover={{ scale: 1.02, backgroundColor: "#f3f4f6" }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={onClose}
                  disabled={isLoading || isUploading}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-all duration-300 bg-white/50 backdrop-blur-sm disabled:opacity-50"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: "0 10px 25px rgba(59, 130, 246, 0.3)" }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isLoading || isUploading || !allFilesReady()}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
                >
                  {isLoading || isUploading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                      />
                      {isUploading ? `Uploading ${uploadProgress}%...` : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Create Announcement
                    </>
                  )}
                </motion.button>
              </motion.div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CreateAnnouncementModal;

// Custom styles for react-datepicker
const styles = `
  .react-datepicker-custom .react-datepicker {
    font-family: inherit;
    border-radius: 1rem;
    border: none;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(20px);
    background: rgba(255, 255, 255, 0.95);
  }

  .react-datepicker-custom .react-datepicker__header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-bottom: none;
    border-radius: 1rem 1rem 0 0;
    padding: 1rem;
  }

  .react-datepicker-custom .react-datepicker__current-month,
  .react-datepicker-custom .react-datepicker-time__header {
    color: white;
    font-weight: 600;
    font-size: 1.1rem;
  }

  .react-datepicker-custom .react-datepicker__day-name {
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  }

  .react-datepicker-custom .react-datepicker__day {
    border-radius: 0.5rem;
    margin: 0.1rem;
    transition: all 0.2s ease;
  }

  .react-datepicker-custom .react-datepicker__day:hover {
    background-color: rgba(255, 255, 255, 0.2) !important;
    color: white !important;
  }

  .react-datepicker-custom .react-datepicker__day--selected {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
    color: white !important;
  }

  .react-datepicker-custom .react-datepicker__day--today {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-weight: 600;
  }

  .react-datepicker-custom .react-datepicker__navigation {
    background: none;
    border: none;
    top: 1rem;
  }

  .react-datepicker-custom .react-datepicker__navigation-icon::before {
    border-color: white;
    border-width: 2px 2px 0 0;
  }

  .react-datepicker-custom .react-datepicker-time__header {
    color: white;
  }

  .react-datepicker-custom .react-datepicker-time__caption {
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  }

  .react-datepicker-custom .react-datepicker-time__input {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    color: white;
  }

  .react-datepicker-custom .react-datepicker-time__input input {
    color: white;
  }

  .react-datepicker-custom .react-datepicker-time__input input::placeholder {
    color: rgba(255, 255, 255, 0.6);
  }

  .react-datepicker-custom .react-datepicker-time__selector {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .react-datepicker-custom .react-datepicker-time__selector-item {
    color: white;
    transition: background-color 0.2s ease;
  }

  .react-datepicker-custom .react-datepicker-time__selector-item:hover {
    background: rgba(255, 255, 255, 0.1) !important;
  }

  .react-datepicker-custom .react-datepicker-time__selector-item--selected {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%) !important;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.type = 'text/css';
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);
}
