import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  X, 
  File, 
  FileText, 
  FileImage, 
  FileSpreadsheet,
  Film,
  Loader,
  CheckCircle,
  AlertCircle,
  Plus,
  Clipboard,
  HardDrive,
  ChevronDown
} from 'lucide-react';
import useAttachmentStore from '../store/attachmentStore';
import useGoogleDrivePicker from '../hooks/useGoogleDrivePicker';
import { toast } from 'react-toastify';

// Google Drive SVG Icon component - Official Google Drive Logo
const GoogleDriveIcon = ({ size = 16, className = '' }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 87.3 78" 
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path 
      d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" 
      fill="#0066DA"
    />
    <path 
      d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 52.35c-.8 1.4-1.2 2.95-1.2 4.5h27.5L43.65 25z" 
      fill="#00AC47"
    />
    <path 
      d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85L73.55 76.8z" 
      fill="#EA4335"
    />
    <path 
      d="M43.65 25L57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2H34.15c-1.55 0-3.1.45-4.5 1.2L43.65 25z" 
      fill="#00832D"
    />
    <path 
      d="M59.85 53H27.5l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.55 0 3.1-.45 4.5-1.2L59.85 53z" 
      fill="#2684FC"
    />
    <path 
      d="M73.4 26.5L60.75 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.2 28h27.45c0-1.55-.4-3.1-1.2-4.5l-12.7-22z" 
      fill="#FFBA00"
    />
  </svg>
);


// Build a comprehensive accept string that includes both MIME types and explicit extensions
// This ensures .jpeg files are accepted on all browsers/OS (image/* alone can miss .jpeg on some systems)
const ACCEPTED_FILE_TYPES_STRING = [
  'image/*',
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  'application/pdf', '.pdf',
  'application/msword', '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx',
  'application/vnd.ms-excel', '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx',
  'application/vnd.ms-powerpoint', '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx',
  'text/plain', '.txt',
  'text/csv', '.csv'
].join(',');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;

const AttachmentUploader = ({ 
  entityType = 'card',  // 'card' | 'subtask' | 'nanoSubtask'
  entityId,
  onUploadComplete, 
  contextType,
  contextRef,
  compact = false,
  allowPaste = true,
  showSourcePicker = true // New prop to enable/disable source picker
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const dropdownRef = useRef(null);

  const { uploadMultiple, uploadFromPaste, uploadMultipleFromGoogleDrive } = useAttachmentStore();
  const { openPicker, isLoading: isPickerLoading, isAvailable: isDriveAvailable } = useGoogleDrivePicker();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Handle paste events for clipboard images
  useEffect(() => {
    if (!allowPaste || !entityId) return;

    const handlePaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = async (e) => {
              try {
                const pasteContextType = contextType || entityType;
                const pasteContextRef = contextRef || entityId;
                
                await uploadFromPaste(e.target.result, entityType, entityId, { contextType: pasteContextType, contextRef: pasteContextRef });
                onUploadComplete?.();
              } catch (error) {
                toast.error('Failed to upload pasted image');
              }
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };

    const component = dropZoneRef.current;
    if (component) {
        component.addEventListener('paste', handlePaste);
    } else {
        document.addEventListener('paste', handlePaste);
    }
    
    return () => {
        if (component) {
            component.removeEventListener('paste', handlePaste);
        } else {
            document.removeEventListener('paste', handlePaste);
        }
    };
  }, [allowPaste, entityType, entityId, contextType, contextRef, uploadFromPaste, onUploadComplete]);

  const validateFile = useCallback((file) => {
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: `File "${file.name}" exceeds 10MB limit` };
    }
    return { valid: true };
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dropZoneRef.current?.contains(e.relatedTarget)) {
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

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
    e.target.value = ''; // Reset input
  }, []);

  const handleFiles = useCallback(async (files) => {
    if (files.length === 0) return;

    if (files.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} files allowed at once`);
      files = files.slice(0, MAX_FILES);
    }

    const validFiles = [];
    const errors = [];

    files.forEach(file => {
      const validation = validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        errors.push(validation.error);
      }
    });

    if (errors.length > 0) {
      errors.forEach(error => toast.error(error));
    }

    if (validFiles.length > 0) {
      try {
        // Immediate upload - optimistic UI handled by store/AttachmentList
        uploadMultiple(validFiles, entityType, entityId, { contextType, contextRef });
        
        // Notify parent immediately that uploads started
        onUploadComplete?.();
      } catch (error) {
        console.error("Upload start error", error);
      }
    }
  }, [validateFile, entityType, entityId, contextType, contextRef, uploadMultiple, onUploadComplete]);

  // Handle Google Drive file selection
  const handleGoogleDriveClick = useCallback(() => {
    setShowDropdown(false);
    
    openPicker({
      onSelect: ({ files, accessToken }) => {
        if (files && files.length > 0) {
          // Validate file sizes
          const validFiles = [];
          const errors = [];
          
          files.forEach(file => {
            if (file.size > MAX_FILE_SIZE) {
              errors.push(`File "${file.name}" exceeds 10MB limit`);
            } else {
              validFiles.push(file);
            }
          });

          if (errors.length > 0) {
            errors.forEach(error => toast.error(error));
          }

          if (validFiles.length > 0) {
            // Upload files from Google Drive
            uploadMultipleFromGoogleDrive(validFiles, entityType, entityId, {
              contextType,
              contextRef,
              accessToken
            });
            onUploadComplete?.();
            toast.success(`Uploading ${validFiles.length} file(s) from Google Drive`);
          }
        }
      },
      onCancel: () => {
        // User cancelled, no action needed
      },
      onError: (error) => {
        toast.error(`Google Drive error: ${error}`);
      }
    });
  }, [openPicker, entityType, entityId, contextType, contextRef, uploadMultipleFromGoogleDrive, onUploadComplete]);

  const handleDeviceClick = useCallback(() => {
    setShowDropdown(false);
    fileInputRef.current?.click();
  }, []);

  // Compact mode - source picker buttons
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES_STRING}
          className="hidden"
          onChange={handleFileSelect}
        />
        
        {showSourcePicker && isDriveAvailable ? (
          // Show dropdown when Google Drive is available
          <div ref={dropdownRef} className="relative">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
            >
              <Plus size={16} />
              <span className="text-sm">Attach</span>
              <ChevronDown size={14} className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </motion.button>
            
            <AnimatePresence>
              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50"
                >
                  <motion.button
                    whileHover={{ backgroundColor: 'rgb(249 250 251)' }}
                    onClick={handleDeviceClick}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700"
                  >
                    <HardDrive size={18} className="text-gray-500" />
                    <span className="text-sm font-medium">Upload from Device</span>
                  </motion.button>
                  <div className="border-t border-gray-100" />
                  <motion.button
                    whileHover={{ backgroundColor: 'rgb(239 246 255)' }}
                    onClick={handleGoogleDriveClick}
                    disabled={isPickerLoading}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-blue-700 disabled:opacity-50"
                  >
                    {isPickerLoading ? (
                      <Loader size={18} className="animate-spin" />
                    ) : (
                      <GoogleDriveIcon size={18} />
                    )}
                    <span className="text-sm font-medium">Add from Google Drive</span>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          // Simple device upload button when Google Drive is not available
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
          >
            <Plus size={16} />
            <span className="text-sm">Attach</span>
          </motion.button>
        )}
        
        {allowPaste && (
          <span className="text-xs text-gray-400 flex items-center gap-1 cursor-help" title="Click anywhere or press Ctrl+V to paste">
            <Clipboard size={12} />
            Paste supported
          </span>
        )}
      </div>
    );
  }

  // Full mode - drop zone with source picker
  return (
    <div className="space-y-4">
      {/* Source Picker Buttons (when Google Drive is available) */}
      {showSourcePicker && isDriveAvailable && (
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES_STRING}
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {/* Device Upload Button */}
          <motion.button
            whileHover={{ scale: 1.01, y: -1 }}
            whileTap={{ scale: 0.99 }}
            onClick={handleDeviceClick}
            className="flex-1 flex items-center justify-center gap-3 px-4 py-3.5
                       bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150
                       border-2 border-gray-200 hover:border-gray-300 rounded-xl 
                       text-gray-700 font-medium transition-all shadow-sm hover:shadow"
          >
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <HardDrive size={20} className="text-gray-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-sm">Upload from Device</div>
              <div className="text-xs text-gray-500">Select files from your computer</div>
            </div>
          </motion.button>

          {/* Google Drive Button */}
          <motion.button
            whileHover={{ scale: 1.01, y: -1 }}
            whileTap={{ scale: 0.99 }}
            onClick={handleGoogleDriveClick}
            disabled={isPickerLoading}
            className="flex-1 flex items-center justify-center gap-3 px-4 py-3.5
                       bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100
                       border-2 border-blue-200 hover:border-blue-300 rounded-xl 
                       text-blue-700 font-medium transition-all shadow-sm hover:shadow
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="p-2 bg-white rounded-lg shadow-sm">
              {isPickerLoading ? (
                <Loader size={20} className="animate-spin text-blue-600" />
              ) : (
                <GoogleDriveIcon size={20} />
              )}
            </div>
            <div className="text-left">
              <div className="font-semibold text-sm">Add from Google Drive</div>
              <div className="text-xs text-blue-500">Pick files from your Drive</div>
            </div>
          </motion.button>
        </div>
      )}

      {/* Drop Zone (for drag & drop) */}
      <div
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={!showSourcePicker || !isDriveAvailable ? () => fileInputRef.current?.click() : undefined}
        className={`
          relative border-2 border-dashed rounded-xl p-6 text-center 
          transition-all duration-200 ease-in-out group
          ${!showSourcePicker || !isDriveAvailable ? 'cursor-pointer' : ''}
          ${isDragging 
            ? 'border-blue-500 bg-blue-50 scale-[1.01]' 
            : 'border-gray-300 hover:border-blue-400 bg-gray-50 hover:bg-gray-100'
          }
        `}
      >
        {/* Hidden file input for non-source-picker mode */}
        {(!showSourcePicker || !isDriveAvailable) && (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES_STRING}
            onChange={handleFileSelect}
            className="hidden"
          />
        )}
        
        <motion.div
          animate={{ y: isDragging ? -5 : 0 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <Upload 
            size={32} 
            className={`mx-auto mb-3 transition-colors ${
              isDragging ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-500'
            }`} 
          />
        </motion.div>

        <p className="text-gray-700 font-medium text-sm mb-1">
          {isDragging ? 'Drop files to upload instantly' : 'Drag & drop files here'}
        </p>
        <p className="text-gray-500 text-xs">
          Up to {MAX_FILES} files • 10MB each
        </p>
        
        {allowPaste && (
          <div className="absolute bottom-2 right-2 opacity-50 text-[10px] text-gray-400 flex items-center gap-1">
            <Clipboard size={10} />
            Paste supported
          </div>
        )}
      </div>
    </div>
  );
};

export default AttachmentUploader;
