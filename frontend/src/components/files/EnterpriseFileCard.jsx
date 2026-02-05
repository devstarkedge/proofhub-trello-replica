"use client";

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  FileSpreadsheet,
  File,
  FileArchive,
  FileType2,
  X,
  Download,
  Eye,
  Trash2,
  RotateCcw,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Loader,
  ExternalLink,
  MoreVertical
} from 'lucide-react';

// File type configuration with icons and colors
const FILE_TYPE_CONFIG = {
  image: { 
    icon: ImageIcon, 
    color: 'from-pink-500 to-rose-500',
    bgColor: 'bg-pink-100',
    textColor: 'text-pink-600',
    borderColor: 'border-pink-200',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
  },
  video: { 
    icon: Video, 
    color: 'from-purple-500 to-violet-500',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-600',
    borderColor: 'border-purple-200',
    extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv']
  },
  audio: { 
    icon: Music, 
    color: 'from-indigo-500 to-blue-500',
    bgColor: 'bg-indigo-100',
    textColor: 'text-indigo-600',
    borderColor: 'border-indigo-200',
    extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
  },
  spreadsheet: { 
    icon: FileSpreadsheet, 
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-100',
    textColor: 'text-green-600',
    borderColor: 'border-green-200',
    extensions: ['xlsx', 'xls', 'csv', 'ods', 'numbers']
  },
  pdf: { 
    icon: FileText, 
    color: 'from-red-500 to-orange-500',
    bgColor: 'bg-red-100',
    textColor: 'text-red-600',
    borderColor: 'border-red-200',
    extensions: ['pdf']
  },
  document: { 
    icon: FileType2, 
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-600',
    borderColor: 'border-blue-200',
    extensions: ['doc', 'docx', 'odt', 'rtf', 'txt', 'pages']
  },
  presentation: { 
    icon: FileText, 
    color: 'from-orange-500 to-amber-500',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-600',
    borderColor: 'border-orange-200',
    extensions: ['ppt', 'pptx', 'odp', 'key']
  },
  archive: { 
    icon: FileArchive, 
    color: 'from-yellow-500 to-lime-500',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-600',
    borderColor: 'border-yellow-200',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz']
  },
  other: { 
    icon: File, 
    color: 'from-gray-500 to-slate-500',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
    borderColor: 'border-gray-200',
    extensions: []
  }
};

// Utility functions
const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '—';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
};

const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getFileExtension = (filename) => {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

const inferFileCategory = (file) => {
  const type = file?.type || file?.mimeType || file?.fileType || '';
  const ext = getFileExtension(file?.name || file?.fileName || file?.originalName || '');
  
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf') return 'pdf';
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) return 'spreadsheet';
  if (type.includes('presentation') || type.includes('powerpoint')) return 'presentation';
  if (type.includes('word') || type.includes('document') || type === 'text/plain') return 'document';
  if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return 'archive';
  
  for (const [category, config] of Object.entries(FILE_TYPE_CONFIG)) {
    if (config.extensions.includes(ext)) return category;
  }
  
  return 'other';
};

const getFileConfig = (file) => {
  const category = inferFileCategory(file);
  return FILE_TYPE_CONFIG[category] || FILE_TYPE_CONFIG.other;
};

// Status Badge Component
const StatusBadge = ({ status }) => {
  const statusConfig = {
    uploading: { 
      color: 'bg-blue-100 text-blue-700 border-blue-200', 
      label: 'Uploading...',
      icon: Loader,
      animate: true
    },
    ready: { 
      color: 'bg-emerald-100 text-emerald-700 border-emerald-200', 
      label: 'Ready',
      icon: CheckCircle2,
      animate: false
    },
    done: { 
      color: 'bg-green-100 text-green-700 border-green-200', 
      label: 'Uploaded',
      icon: CheckCircle2,
      animate: false
    },
    error: { 
      color: 'bg-red-100 text-red-700 border-red-200', 
      label: 'Failed',
      icon: AlertCircle,
      animate: false
    },
    queued: { 
      color: 'bg-gray-100 text-gray-600 border-gray-200', 
      label: 'Queued',
      icon: Clock,
      animate: false
    }
  };

  const config = statusConfig[status] || statusConfig.queued;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${config.color}`}>
      <Icon size={12} className={config.animate ? 'animate-spin' : ''} />
      {config.label}
    </span>
  );
};

// Progress Bar Component
const ProgressBar = ({ progress, status }) => {
  const getProgressColor = () => {
    if (status === 'error') return 'from-red-500 to-red-600';
    if (status === 'done' || progress === 100) return 'from-green-500 to-emerald-500';
    if (status === 'ready' || progress >= 90) return 'from-emerald-500 to-teal-500';
    return 'from-blue-500 to-indigo-500';
  };

  return (
    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={`h-full bg-gradient-to-r ${getProgressColor()}`}
      />
    </div>
  );
};

// Main Enterprise File Card Component
const EnterpriseFileCard = ({
  file,
  index = 0,
  status = 'done', // 'uploading', 'ready', 'done', 'error', 'queued'
  progress = 0,
  error = null,
  isExisting = false,
  isPending = false,
  showActions = true,
  showStatus = true,
  showProgress = true,
  showMetadata = true,
  onPreview,
  onDownload,
  onDelete,
  onRetry,
  className = ''
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get file info
  const actualFile = file?.file || file;
  const config = getFileConfig(actualFile);
  const Icon = config.icon;
  
  const fileName = file?.displayName || file?.fileName || file?.originalName || actualFile?.name || 'Untitled';
  const fileSize = file?.fileSize || file?.size || actualFile?.size;
  const uploadedAt = file?.uploadedAt || file?.createdAt;
  const uploadedBy = file?.uploadedBy?.name || file?.uploadedBy;
  const fileUrl = file?.secureUrl || file?.url;
  const extension = getFileExtension(fileName).toUpperCase();

  // Determine if file supports preview
  const category = inferFileCategory(actualFile);
  const supportsPreview = ['image', 'pdf', 'video', 'audio', 'document', 'spreadsheet', 'presentation'].includes(category);

  // Handle preview click
  const handlePreview = useCallback((e) => {
    e.stopPropagation();
    if (supportsPreview && onPreview) {
      onPreview(file, index);
    }
  }, [file, index, supportsPreview, onPreview]);

  // Handle download
  const handleDownload = useCallback(async (e) => {
    e.stopPropagation();
    
    if (onDownload) {
      onDownload(file);
      return;
    }

    // Default download behavior
    const url = fileUrl || (actualFile instanceof File ? URL.createObjectURL(actualFile) : null);
    if (!url) return;

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      
      if (actualFile instanceof File) {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Download failed:', err);
      if (url.startsWith('http')) {
        window.open(url, '_blank');
      }
    }
  }, [file, fileUrl, actualFile, fileName, onDownload]);

  // Handle delete
  const handleDelete = useCallback(async (e) => {
    e.stopPropagation();
    if (onDelete) {
      setIsDeleting(true);
      try {
        await onDelete(file, index);
      } catch (err) {
        console.error('Delete failed:', err);
      } finally {
        setIsDeleting(false);
      }
    }
  }, [file, index, onDelete]);

  // Handle retry
  const handleRetry = useCallback((e) => {
    e.stopPropagation();
    if (onRetry) {
      onRetry(file, index);
    }
  }, [file, index, onRetry]);

  // Card click handler
  const handleCardClick = useCallback(() => {
    if (supportsPreview && onPreview && !['uploading', 'error'].includes(status)) {
      onPreview(file, index);
    }
  }, [file, index, status, supportsPreview, onPreview]);

  const isClickable = supportsPreview && onPreview && !['uploading', 'error'].includes(status);
  const isUploading = status === 'uploading' || status === 'ready';
  const isError = status === 'error';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
      transition={{ delay: index * 0.03 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setShowMenu(false); }}
      onClick={handleCardClick}
      className={`
        group relative flex items-center gap-4 p-4 
        border rounded-xl transition-all duration-200
        ${isClickable ? 'cursor-pointer' : ''}
        ${isError 
          ? 'border-red-200 bg-red-50/50 hover:border-red-300' 
          : isUploading 
            ? 'border-blue-200 bg-blue-50/30 hover:border-blue-300' 
            : isPending
              ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300'
              : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-100/50'
        }
        ${isDeleting ? 'opacity-50 pointer-events-none' : ''}
        ${className}
      `}
    >
      {/* File Icon with Preview Thumbnail */}
      <div className="relative flex-shrink-0">
        <div 
          className={`
            relative w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden
            ${config.bgColor} transition-all duration-200
            ${isClickable && isHovered ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}
          `}
        >
          {/* Show image thumbnail for images */}
          {category === 'image' && fileUrl && !isPending ? (
            <img 
              src={fileUrl} 
              alt={fileName}
              className="w-full h-full object-cover"
            />
          ) : (
            <Icon className={`h-7 w-7 ${config.textColor}`} />
          )}

          {/* Preview overlay on hover */}
          {isClickable && isHovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-black/40 flex items-center justify-center"
            >
              <Eye size={20} className="text-white" />
            </motion.div>
          )}
        </div>

        {/* Extension badge */}
        {extension && (
          <div className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold rounded ${config.bgColor} ${config.textColor} border border-white shadow-sm`}>
            {extension}
          </div>
        )}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p 
            className="text-sm font-semibold text-gray-900 truncate max-w-[200px]" 
            title={fileName}
          >
            {fileName}
          </p>
          {showStatus && status && status !== 'done' && !isExisting && (
            <StatusBadge status={status} />
          )}
        </div>

        {/* Progress bar for uploading files */}
        {showProgress && isUploading && (
          <div className="mt-2 space-y-1">
            <ProgressBar progress={progress} status={status} />
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{formatBytes(fileSize)}</span>
              <span className={`font-medium ${status === 'ready' ? 'text-emerald-600' : 'text-blue-600'}`}>
                {progress}%
              </span>
            </div>
          </div>
        )}

        {/* Error message */}
        {isError && error && (
          <div className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertCircle size={12} />
            <span className="truncate">{error}</span>
          </div>
        )}

        {/* Metadata for existing files */}
        {showMetadata && !isUploading && !isError && (
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span>{formatBytes(fileSize)}</span>
            {uploadedAt && (
              <>
                <span className="text-gray-300">•</span>
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {formatDate(uploadedAt)}
                </span>
              </>
            )}
            {uploadedBy && (
              <>
                <span className="text-gray-300">•</span>
                <span className="flex items-center gap-1">
                  <User size={11} />
                  {uploadedBy}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {showActions && (
        <div className="flex items-center gap-1">
          {/* Show different actions based on status */}
          {isError && onRetry && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleRetry}
              className="p-2 text-orange-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
              title="Retry Upload"
            >
              <RotateCcw size={18} />
            </motion.button>
          )}

          {/* Actions visible on hover */}
          <AnimatePresence>
            {(isHovered || showMenu) && !isUploading && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-1"
              >
                {/* Preview button */}
                {supportsPreview && onPreview && !isError && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handlePreview}
                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Preview"
                  >
                    <Eye size={18} />
                  </motion.button>
                )}

                {/* Download button */}
                {(fileUrl || actualFile instanceof File) && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleDownload}
                    className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="Download"
                  >
                    <Download size={18} />
                  </motion.button>
                )}

                {/* Open in new tab */}
                {fileUrl && isExisting && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); window.open(fileUrl, '_blank'); }}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Open in New Tab"
                  >
                    <ExternalLink size={18} />
                  </motion.button>
                )}

                {/* Delete button */}
                {onDelete && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {isDeleting ? (
                      <Loader size={18} className="animate-spin" />
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </motion.button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Always visible delete for pending files */}
          {isPending && onDelete && (
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleDelete}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Remove"
            >
              <X size={18} />
            </motion.button>
          )}
        </div>
      )}

      {/* Loading overlay for deleting */}
      {isDeleting && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <Loader className="w-6 h-6 animate-spin text-red-500" />
        </div>
      )}
    </motion.div>
  );
};

export default EnterpriseFileCard;
