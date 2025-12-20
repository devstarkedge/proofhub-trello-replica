import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Cloud, ChevronDown, Loader2, Plus, HardDrive } from 'lucide-react';
import useGoogleDrivePicker from '../hooks/useGoogleDrivePicker';

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

/**
 * AttachmentSourcePicker Component
 * Provides a unified UI for selecting attachment source:
 * - Upload from Device
 * - Add from Google Drive
 * 
 * Props:
 * @param {Function} onDeviceUpload - Callback when device files are selected
 * @param {Function} onGoogleDriveSelect - Callback when Google Drive files are selected
 * @param {boolean} compact - Use compact button layout
 * @param {boolean} disabled - Disable all interactions
 * @param {string} accept - Accepted file types for device upload
 * @param {boolean} multiple - Allow multiple file selection
 * @param {string} className - Additional CSS classes
 * @param {string} variant - 'dropdown' | 'buttons' | 'inline'
 */
const AttachmentSourcePicker = ({
  onDeviceUpload,
  onGoogleDriveSelect,
  compact = false,
  disabled = false,
  accept = '*/*',
  multiple = true,
  className = '',
  variant = 'dropdown'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const { 
    openPicker, 
    isLoading: isPickerLoading, 
    isAvailable: isDriveAvailable,
    error: driveError 
  } = useGoogleDrivePicker();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Handle device file selection
  const handleDeviceClick = useCallback(() => {
    setIsOpen(false);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onDeviceUpload?.(files);
    }
    // Reset input for same file selection
    e.target.value = '';
  }, [onDeviceUpload]);

  // Handle Google Drive selection
  const handleGoogleDriveClick = useCallback(() => {
    setIsOpen(false);
    setIsUploading(true);
    
    openPicker({
      onSelect: ({ files, accessToken }) => {
        setIsUploading(false);
        onGoogleDriveSelect?.({ files, accessToken });
      },
      onCancel: () => {
        setIsUploading(false);
      },
      onError: (error) => {
        setIsUploading(false);
        console.error('Google Drive picker error:', error);
      }
    });
  }, [openPicker, onGoogleDriveSelect]);

  const isLoading = isPickerLoading || isUploading;

  // Hidden file input (always rendered)
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple={multiple}
      accept={accept}
      onChange={handleFileChange}
      className="hidden"
      disabled={disabled}
    />
  );

  // Compact inline buttons variant
  if (variant === 'inline' || compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {fileInput}
        
        {/* Device Upload Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleDeviceClick}
          disabled={disabled || isLoading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 
                     rounded-lg text-gray-700 text-sm font-medium transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <HardDrive size={16} />
          <span>Device</span>
        </motion.button>

        {/* Google Drive Button */}
        {isDriveAvailable && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGoogleDriveClick}
            disabled={disabled || isLoading}
            className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 
                       rounded-lg text-blue-700 text-sm font-medium transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <GoogleDriveIcon size={16} />
            )}
            <span>Google Drive</span>
          </motion.button>
        )}
      </div>
    );
  }

  // Buttons variant (side by side)
  if (variant === 'buttons') {
    return (
      <div className={`flex flex-col sm:flex-row gap-3 ${className}`}>
        {fileInput}
        
        {/* Device Upload Button */}
        <motion.button
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleDeviceClick}
          disabled={disabled || isLoading}
          className="flex-1 flex items-center justify-center gap-3 px-4 py-3 
                     bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150
                     border-2 border-gray-200 hover:border-gray-300 rounded-xl 
                     text-gray-700 font-medium transition-all shadow-sm hover:shadow
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="p-2 bg-white rounded-lg shadow-sm">
            <HardDrive size={20} className="text-gray-600" />
          </div>
          <div className="text-left">
            <div className="font-semibold">Upload from Device</div>
            <div className="text-xs text-gray-500">Select files from your computer</div>
          </div>
        </motion.button>

        {/* Google Drive Button */}
        {isDriveAvailable && (
          <motion.button
            whileHover={{ scale: 1.01, y: -1 }}
            whileTap={{ scale: 0.99 }}
            onClick={handleGoogleDriveClick}
            disabled={disabled || isLoading}
            className="flex-1 flex items-center justify-center gap-3 px-4 py-3 
                       bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100
                       border-2 border-blue-200 hover:border-blue-300 rounded-xl 
                       text-blue-700 font-medium transition-all shadow-sm hover:shadow
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Loader2 size={20} className="animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <GoogleDriveIcon size={20} />
              </div>
            )}
            <div className="text-left">
              <div className="font-semibold">Add from Google Drive</div>
              <div className="text-xs text-blue-500">Pick files from your Drive</div>
            </div>
          </motion.button>
        )}
      </div>
    );
  }

  // Default: Dropdown variant
  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {fileInput}
      
      {/* Trigger Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 
                   hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-medium 
                   shadow-md hover:shadow-lg transition-all
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Plus size={18} />
        )}
        <span>Add Attachment</span>
        <ChevronDown 
          size={16} 
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </motion.button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-xl 
                       border border-gray-100 overflow-hidden z-50"
          >
            {/* Device Upload Option */}
            <motion.button
              whileHover={{ backgroundColor: 'rgb(249 250 251)' }}
              onClick={handleDeviceClick}
              className="w-full flex items-center gap-3 px-4 py-3 text-left 
                         text-gray-700 transition-colors"
            >
              <div className="p-2 bg-gray-100 rounded-lg">
                <HardDrive size={18} className="text-gray-600" />
              </div>
              <div>
                <div className="font-medium">Upload from Device</div>
                <div className="text-xs text-gray-500">Select files from your computer</div>
              </div>
            </motion.button>

            {/* Divider */}
            {isDriveAvailable && (
              <div className="border-t border-gray-100" />
            )}

            {/* Google Drive Option */}
            {isDriveAvailable && (
              <motion.button
                whileHover={{ backgroundColor: 'rgb(239 246 255)' }}
                onClick={handleGoogleDriveClick}
                className="w-full flex items-center gap-3 px-4 py-3 text-left 
                           text-gray-700 transition-colors"
              >
                <div className="p-2 bg-blue-50 rounded-lg">
                  <GoogleDriveIcon size={18} />
                </div>
                <div>
                  <div className="font-medium text-blue-700">Add from Google Drive</div>
                  <div className="text-xs text-blue-500">Pick files from your Drive</div>
                </div>
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AttachmentSourcePicker;
