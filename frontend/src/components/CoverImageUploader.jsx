import React, { useState, useCallback, useContext } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Image, X, Loader2, CloudOff, 
  HardDrive, Check, AlertCircle, History,
  Trash2, RefreshCw
} from 'lucide-react';
import useGoogleDrivePicker from '../hooks/useGoogleDrivePicker';
import useCoverImage from '../hooks/useCoverImage';
import AuthContext from '../context/AuthContext';

/**
 * Reusable cover image uploader component for Add/Edit Project modals
 * Supports drag & drop, Google Drive picker, preview, and version history
 */
const CoverImageUploader = ({
  projectId,
  currentCover,
  coverHistory = [],
  onCoverChange,
  disabled = false,
  className = ''
}) => {
  const { user } = useContext(AuthContext);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [uploadSource, setUploadSource] = useState(null); // 'device' | 'drive'

  // Check role permissions
  const canModifyCover = user && (user.role === 'admin' || user.role === 'manager');

  // Cover image hook (only for existing projects)
  const {
    uploadCoverImage,
    removeCoverImage,
    restoreFromHistory,
    isUploading,
    isRemoving,
    isRestoring,
    uploadProgress,
    error: coverError
  } = useCoverImage(projectId);

  // Google Drive picker
  const { openPicker, isLoading: isDriveLoading, isAvailable: isDriveAvailable } = useGoogleDrivePicker();

  // Handle file drop/selection
  const onDrop = useCallback((acceptedFiles) => {
    if (!canModifyCover || disabled) return;
    
    const file = acceptedFiles[0];
    if (!file) return;

    // Create preview URL
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    setSelectedFile(file);
    setUploadSource('device');

    // If this is for a new project (no projectId), just update parent
    if (!projectId) {
      onCoverChange?.({ file, previewUrl: preview });
    }
  }, [canModifyCover, disabled, projectId, onCoverChange]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true, // We handle click manually for better control
    noKeyboard: true,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/gif': ['.gif']
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false,
    disabled: !canModifyCover || disabled || isUploading
  });

  // Handle Google Drive selection
  const handleGoogleDriveClick = useCallback(() => {
    if (!canModifyCover || disabled) return;

    openPicker({
      onSelect: async ({ files }) => {
        if (files && files.length > 0) {
          const driveFile = files[0];
          // For now, show the drive file icon/name as preview
          // The actual file will be downloaded and uploaded in the backend
          setPreviewUrl(driveFile.iconUrl || driveFile.thumbnailUrl);
          setSelectedFile(driveFile);
          setUploadSource('drive');

          if (!projectId) {
            onCoverChange?.({ driveFile, previewUrl: driveFile.thumbnailUrl });
          }
        }
      },
      onError: (error) => {
        console.error('Google Drive picker error:', error);
      }
    });
  }, [canModifyCover, disabled, openPicker, projectId, onCoverChange]);

  // Upload the selected file (for existing projects)
  const handleUpload = useCallback(async () => {
    if (!projectId || !selectedFile) return;

    if (uploadSource === 'device') {
      const result = await uploadCoverImage(selectedFile);
      if (result.success) {
        setPreviewUrl(null);
        setSelectedFile(null);
        onCoverChange?.(result.data);
      }
    }
    // Note: Google Drive uploads would need backend handling
  }, [projectId, selectedFile, uploadSource, uploadCoverImage, onCoverChange]);

  // Remove cover
  const handleRemove = useCallback(async () => {
    if (projectId) {
      const result = await removeCoverImage();
      if (result.success) {
        onCoverChange?.(null);
      }
    } else {
      setPreviewUrl(null);
      setSelectedFile(null);
      onCoverChange?.(null);
    }
  }, [projectId, removeCoverImage, onCoverChange]);

  // Cancel selection (before upload)
  const handleCancel = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    setUploadSource(null);
  }, [previewUrl]);

  // Restore from history
  const handleRestore = useCallback(async (index) => {
    const result = await restoreFromHistory(index);
    if (result.success) {
      setShowHistory(false);
      onCoverChange?.(result.data);
    }
  }, [restoreFromHistory, onCoverChange]);

  const displayUrl = previewUrl || currentCover?.url;
  const thumbnailUrl = currentCover?.thumbnailUrl;
  const isLoading = isUploading || isRemoving || isRestoring || isDriveLoading;

  if (!canModifyCover) {
    // Read-only view
    return displayUrl ? (
      <div className={`relative rounded-lg overflow-hidden ${className}`}>
        <img 
          src={displayUrl} 
          alt="Project cover" 
          className="w-full h-40 object-cover"
        />
      </div>
    ) : null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Hidden input for file selection - always rendered */}
      <input {...getInputProps()} id="cover-file-input" className="hidden" />

      {/* Current Cover / Preview */}
      <AnimatePresence mode="wait">
        {displayUrl ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative rounded-xl overflow-hidden border border-gray-200 group"
          >
            {/* Blur placeholder for progressive loading */}
            {thumbnailUrl && (
              <img
                src={thumbnailUrl}
                alt=""
                className="absolute inset-0 w-full h-40 object-cover filter blur-lg scale-110"
              />
            )}
            <img 
              src={displayUrl} 
              alt="Cover preview" 
              className="relative w-full h-40 object-cover"
            />
            
            {/* Overlay actions */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              {selectedFile && !projectId && (
                <>
                  <span className="text-white text-sm font-medium">
                    Ready to upload with project
                  </span>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={open}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium shadow-lg hover:bg-blue-600"
                  >
                    <RefreshCw size={16} />
                    <span>Change</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRemove}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg font-medium shadow-lg hover:bg-red-600"
                  >
                    <Trash2 size={16} />
                    <span>Remove</span>
                  </motion.button>
                </>
              )}
              {selectedFile && projectId && (
                <>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleUpload}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg font-medium shadow-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Check size={16} />
                    )}
                    <span>Upload</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCancel}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg font-medium shadow-lg hover:bg-gray-700"
                  >
                    <X size={16} />
                    <span>Cancel</span>
                  </motion.button>
                </>
              )}
              {!selectedFile && currentCover && (
                <>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={open}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium shadow-lg hover:bg-blue-600"
                  >
                    <RefreshCw size={16} />
                    <span>Change</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleRemove}
                    disabled={isRemoving}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg font-medium shadow-lg hover:bg-red-600 disabled:opacity-50"
                  >
                    {isRemoving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    <span>Remove</span>
                  </motion.button>
                </>
              )}
            </div>

            {/* Upload progress */}
            {isUploading && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  className="h-full bg-blue-500"
                />
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Dropzone */}
            <div
              {...getRootProps()}
              onClick={open}
              className={`
                relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
                transition-all duration-200
                ${isDragActive 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
                }
                ${isLoading ? 'pointer-events-none opacity-60' : ''}
              `}
            >
              {/* Input moved to top level */}
              
              <div className="flex flex-col items-center gap-3">
                {isLoading ? (
                  <Loader2 size={32} className="text-blue-500 animate-spin" />
                ) : (
                  <div className="p-3 bg-white rounded-full shadow-sm">
                    <Image size={24} className="text-gray-400" />
                  </div>
                )}
                
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {isDragActive ? 'Drop image here...' : 'Drag & drop cover image'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    or click to browse • JPG, PNG, WebP, GIF • Max 5MB
                  </p>
                </div>
              </div>
            </div>

            {/* Alternative options */}
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={open}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <HardDrive size={16} />
                <span>From Device</span>
              </button>
              
              {isDriveAvailable && (
                <button
                  type="button"
                  onClick={handleGoogleDriveClick}
                  disabled={isDriveLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {isDriveLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CloudOff size={16} />
                  )}
                  <span>Google Drive</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Version History */}
      {coverHistory && coverHistory.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            <History size={14} />
            <span>Version History ({coverHistory.length})</span>
          </button>
          
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mt-2"
              >
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {coverHistory.map((item, index) => {
                    const imgSrc = typeof item === 'string' ? item : (item?.url || item?.thumbnailUrl);
                    
                    return (
                      <motion.button
                        type="button"
                        key={index}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleRestore(index)}
                        disabled={isRestoring}
                        className="relative flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-500 transition-colors group bg-gray-100"
                        title={typeof item === 'string' ? item : (item?.uploadedBy ? `Uploaded by ${item.uploadedBy}` : 'Previous version')}
                      >
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={`Version ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.nextSibling.style.display = 'flex'; // Show fallback
                            }}
                          />
                        ) : null}
                        
                        {/* Fallback if no image or error hidden */}
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-100" style={{ display: imgSrc ? 'none' : 'flex', zIndex: -1 }}>
                          <Image size={20} className="text-gray-400" />
                        </div>

                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                          {isRestoring ? (
                            <Loader2 size={14} className="text-white animate-spin" />
                          ) : (
                            <RefreshCw size={14} className="text-white" />
                          )}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Error display */}
      {coverError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg"
        >
          <AlertCircle size={16} />
          <span>{coverError}</span>
        </motion.div>
      )}
    </div>
  );
};

export default CoverImageUploader;
