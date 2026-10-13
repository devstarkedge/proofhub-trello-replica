import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, Image, Video, Music, FileSpreadsheet, File, X, AlertCircle,
  Download, Eye, Trash2, RotateCcw, Clock, User, CheckCircle2, ExternalLink,
  FileArchive, FileType2, Loader, Sparkles
} from 'lucide-react';
import EnterpriseFileCard from './files/EnterpriseFileCard';
import FilePreviewModal from './files/FilePreviewModal';

// Extended file type icons mapping
const FILE_TYPE_CONFIG = {
  image: { 
    icon: Image, 
    color: 'bg-pink-100 text-pink-600',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
  },
  video: { 
    icon: Video, 
    color: 'bg-purple-100 text-purple-600',
    extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv']
  },
  audio: { 
    icon: Music, 
    color: 'bg-indigo-100 text-indigo-600',
    extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
  },
  spreadsheet: { 
    icon: FileSpreadsheet, 
    color: 'bg-green-100 text-green-600',
    extensions: ['xlsx', 'xls', 'csv', 'ods', 'numbers']
  },
  pdf: { 
    icon: FileText, 
    color: 'bg-red-100 text-red-600',
    extensions: ['pdf']
  },
  document: { 
    icon: FileType2, 
    color: 'bg-blue-100 text-blue-600',
    extensions: ['doc', 'docx', 'odt', 'rtf', 'txt', 'pages']
  },
  presentation: { 
    icon: FileText, 
    color: 'bg-orange-100 text-orange-600',
    extensions: ['ppt', 'pptx', 'odp', 'key']
  },
  archive: { 
    icon: FileArchive, 
    color: 'bg-yellow-100 text-yellow-600',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz']
  },
  other: { 
    icon: File, 
    color: 'bg-gray-100 text-gray-600',
    extensions: []
  }
};

// Comprehensive accept config for all enterprise file types
const ACCEPT_CONFIG = {
  'image/*': [],
  'video/*': [],
  'audio/*': [],
  'application/pdf': [],
  'text/plain': [],
  'text/csv': [],
  'application/msword': [],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
  'application/vnd.ms-powerpoint': [],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [],
  'application/vnd.ms-excel': [],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [],
  'application/vnd.google-apps.document': [],
  'application/vnd.google-apps.spreadsheet': [],
  'application/vnd.google-apps.presentation': [],
  'application/vnd.oasis.opendocument.text': [],
  'application/vnd.oasis.opendocument.spreadsheet': [],
  'application/vnd.oasis.opendocument.presentation': [],
  'application/zip': [],
  'application/x-rar-compressed': [],
  'application/x-7z-compressed': [],
  'application/vnd.ms-works': []
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
  const type = file?.type || file?.mimeType || '';
  const ext = getFileExtension(file?.name || file?.fileName || file?.originalName || '');
  
  // Check by MIME type first
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf') return 'pdf';
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) return 'spreadsheet';
  if (type.includes('presentation') || type.includes('powerpoint')) return 'presentation';
  if (type.includes('word') || type.includes('document')) return 'document';
  if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return 'archive';
  
  // Check by extension
  for (const [category, config] of Object.entries(FILE_TYPE_CONFIG)) {
    if (config.extensions.includes(ext)) return category;
  }
  
  return 'other';
};

const getFileConfig = (file) => {
  const category = inferFileCategory(file);
  return FILE_TYPE_CONFIG[category] || FILE_TYPE_CONFIG.other;
};

// File Item Component
const FileItem = ({
  file,
  index,
  onRemove,
  onPreview,
  onDownload,
  isUploading,
  uploadProgress,
  showVersionInfo,
  isExisting
}) => {
  const config = getFileConfig(file);
  const Icon = config.icon;
  const fileName = file.displayName || file.fileName || file.originalName || file.name || 'Untitled';
  const fileSize = file.fileSize || file.size;
  const uploadedAt = file.uploadedAt || file.createdAt;
  const uploadedBy = file.uploadedBy?.name || file.uploadedBy;
  const versionLabel = file.versionLabel;
  const hasPreview = ['image', 'pdf'].includes(inferFileCategory(file));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.05 }}
      onClick={onPreview ? () => onPreview(file, index) : undefined}
      className={`group flex items-center gap-4 p-4 border rounded-xl transition-all ${
        isUploading 
          ? 'border-blue-200 bg-blue-50/50' 
          : isExisting 
            ? 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'
            : 'border-green-200 bg-green-50/50'
      } ${onPreview ? 'cursor-pointer' : ''}`}
    >
      {/* File Icon */}
      <div className={`p-3 rounded-xl ${config.color} flex-shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 truncate max-w-[200px]" title={fileName}>
            {fileName}
          </p>
          {versionLabel && (
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
              {versionLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span>{formatBytes(fileSize)}</span>
          {uploadedAt && (
            <>
              <span className="text-gray-300">•</span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatDate(uploadedAt)}
              </span>
            </>
          )}
          {uploadedBy && (
            <>
              <span className="text-gray-300">•</span>
              <span className="flex items-center gap-1">
                <User size={12} />
                {typeof uploadedBy === 'string' ? uploadedBy : uploadedBy}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Progress Bar or Actions */}
      <div className="flex items-center gap-2">
        {isUploading ? (
          <div className="w-32 flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress}%` }}
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
              />
            </div>
            <span className="text-xs font-medium text-blue-600 w-10 text-right">{uploadProgress}%</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {hasPreview && onPreview && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview(file, index);
                }}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Preview"
              >
                <Eye size={16} />
              </motion.button>
            )}
            {file.url && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(file.url || file.secureUrl, '_blank');
                }}
                className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Download"
              >
                <Download size={16} />
              </motion.button>
            )}
            {onRemove && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(file, index);
                }}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Remove"
              >
                <Trash2 size={16} />
              </motion.button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Version History Panel
const VersionHistoryPanel = ({ versions, currentFileName, onRestore }) => {
  if (!versions || versions.length === 0) return null;

  return (
    <div className="mt-4 border-t border-gray-200 pt-4">
      <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <RotateCcw size={14} />
        Version History
      </h5>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {versions.map((version, index) => {
          const config = getFileConfig(version);
          const Icon = config.icon;
          return (
            <div
              key={version._id || index}
              className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm"
            >
              <div className={`p-1.5 rounded-lg ${config.color}`}>
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-700 truncate">{version.fileName || version.originalName}</p>
                <p className="text-xs text-gray-400">{formatDate(version.uploadedAt)}</p>
              </div>
              {onRestore && (
                <button
                  type="button"
                  onClick={() => onRestore(version)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Restore
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Main Enterprise File Uploader Component
const EnterpriseFileUploader = ({
  title = 'Attachments',
  description = 'Drag & drop files here, or click to browse',
  helperText = 'Supported: PDF, CSV, DOC/DOCX, Google Docs, WPS, TXT, PPT/PPTX, Images, Videos, Audio (Max 25MB)',
  pendingFiles = [],
  existingFiles = [],
  onFilesAdded,
  onRemovePending,
  onRemoveExisting,
  onRetryUpload,
  onRestoreVersion,
  disabled = false,
  isCompact = false,
  maxFiles = 20,
  maxSize = 25 * 1024 * 1024, // 25MB
  errors = [],
  showVersionHistory = false,
  showPreview = true,
  showDropzone = true
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewMode, setPreviewMode] = useState(null); // 'pending' | 'existing'

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop: (acceptedFiles, rejectedFiles) => {
      if (disabled || !onFilesAdded) return;
      
      // Handle rejected files
      if (rejectedFiles.length > 0) {
        const errorMessages = rejectedFiles.map(({ file, errors: fileErrors }) => {
          const errorMsg = fileErrors.map(e => e.message).join(', ');
          return `${file.name}: ${errorMsg}`;
        });
        console.warn('Rejected files:', errorMessages);
      }
      
      onFilesAdded(acceptedFiles);
    },
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    accept: ACCEPT_CONFIG,
    disabled,
    maxSize,
    noClick: false,
    noKeyboard: false
  });

  // Group existing files by version group for display
  const groupedExistingFiles = useMemo(() => {
    if (!showVersionHistory) return existingFiles;
    
    // Group by versionGroup
    const groups = {};
    existingFiles.forEach(file => {
      const group = file.versionGroup || file.fileName || 'other';
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(file);
    });
    
    // Return only the latest version of each group, with version history attached
    return Object.values(groups).map(files => {
      const sorted = [...files].sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
      const latest = sorted[0];
      return {
        ...latest,
        previousVersions: sorted.slice(1)
      };
    });
  }, [existingFiles, showVersionHistory]);

  const totalFiles = pendingFiles.length + existingFiles.length;
  const hasActiveUploads = useMemo(
    () => pendingFiles.some((item) => item.status === 'uploading' || item.status === 'ready'),
    [pendingFiles]
  );

  // Preview handlers
  const handlePreviewPendingFile = useCallback((file, index) => {
    if (!showPreview) return;
    setPreviewFile(file);
    setPreviewIndex(index);
    setPreviewMode('pending');
  }, [showPreview]);

  const handlePreviewExistingFile = useCallback((file, index) => {
    if (!showPreview) return;
    setPreviewFile(file);
    setPreviewIndex(index);
    setPreviewMode('existing');
  }, [showPreview]);

  const handleClosePreview = useCallback(() => {
    setPreviewFile(null);
    setPreviewMode(null);
  }, []);

  // Get all files for preview navigation
  const allPreviewableFiles = useMemo(() => {
    if (previewMode === 'pending') {
      return pendingFiles.filter(f => f.status !== 'error');
    }
    return groupedExistingFiles;
  }, [previewMode, pendingFiles, groupedExistingFiles]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20">
            <Upload className="h-5 w-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-900">{title}</h4>
            <p className="text-xs text-gray-500 mt-0.5">{helperText}</p>
          </div>
        </div>
        {totalFiles > 0 && (
          <span className="px-3 py-1.5 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-200">
            {totalFiles} file{totalFiles !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Drop Zone */}
      {showDropzone && (
        <div
          {...getRootProps()}
          className={`relative border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
            isDragActive
              ? 'border-indigo-500 bg-indigo-50 scale-[1.02]'
              : disabled
                ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                : 'border-gray-300 hover:border-indigo-400 bg-white hover:bg-indigo-50/30'
          } ${isCompact ? 'p-4' : 'p-8'}`}
        >
          <input {...getInputProps()} />
          
          <div className="flex flex-col items-center text-center gap-3">
            <motion.div
              animate={{
                scale: isDragActive ? 1.1 : 1,
                rotate: isDragActive ? 5 : 0
              }}
              className={`p-4 rounded-2xl ${
                isDragActive
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                  : 'bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600'
              }`}
            >
              <Upload className={isCompact ? 'h-5 w-5' : 'h-7 w-7'} />
            </motion.div>
            
            <div>
              <p className={`font-semibold ${isDragActive ? 'text-indigo-600' : 'text-gray-800'} ${isCompact ? 'text-sm' : 'text-base'}`}>
                {isDragActive ? 'Drop files here!' : description}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Maximum {formatBytes(maxSize)} per file
              </p>
            </div>

            {!isCompact && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); open(); }}
                className="mt-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 hover:border-indigo-400 transition-all"
              >
                Browse Files
              </button>
            )}
          </div>

          {/* Drag overlay */}
          <AnimatePresence>
            {isDragActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-indigo-500/10 backdrop-blur-sm rounded-2xl flex items-center justify-center"
              >
                <div className="p-4 bg-white rounded-xl shadow-xl">
                  <p className="text-indigo-600 font-semibold">Release to upload</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Error Messages */}
      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {errors.map((err, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
              >
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{err}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending Files (Being Uploaded) */}
      {pendingFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {hasActiveUploads ? 'Uploading' : 'Ready to Upload'} ({pendingFiles.length})
              </h5>
              {pendingFiles.some(item => item.status === 'ready') && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                  <CheckCircle2 size={12} />
                  Files staged
                </span>
              )}
            </div>
          </div>
          
          {pendingFiles.some(item => item.status === 'ready') && (
            <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
              <Sparkles size={12} className="inline mr-1" />
              Files ready! They will be uploaded when you save the project.
            </p>
          )}
          
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {pendingFiles.map((item, index) => (
                <EnterpriseFileCard
                  key={item.id || index}
                  file={item.file || item}
                  index={index}
                  status={item.status || 'queued'}
                  progress={item.progress || 0}
                  error={item.error}
                  isPending={true}
                  isExisting={false}
                  showActions={true}
                  showStatus={true}
                  showProgress={item.status === 'uploading' || item.status === 'ready'}
                  showMetadata={false}
                  onPreview={(file) => handlePreviewPendingFile(item, index)}
                  onDelete={onRemovePending ? () => onRemovePending(item, index) : undefined}
                  onRetry={onRetryUpload ? () => onRetryUpload(item, index) : undefined}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Existing Files */}
      {groupedExistingFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Project Files ({existingFiles.length})
            </h5>
            <span className="text-xs text-gray-400">
              Click any file to preview
            </span>
          </div>
          
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {groupedExistingFiles.map((file, index) => (
                <div key={file._id || index}>
                  <EnterpriseFileCard
                    file={file}
                    index={index}
                    status="done"
                    isExisting={true}
                    isPending={false}
                    showActions={true}
                    showStatus={false}
                    showProgress={false}
                    showMetadata={true}
                    onPreview={() => handlePreviewExistingFile(file, index)}
                    onDelete={onRemoveExisting ? () => onRemoveExisting(file, index) : undefined}
                  />
                  {showVersionHistory && file.previousVersions && (
                    <VersionHistoryPanel
                      versions={file.previousVersions}
                      currentFileName={file.fileName}
                      onRestore={onRestoreVersion}
                    />
                  )}
                </div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Empty State */}
      {pendingFiles.length === 0 && existingFiles.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
          <File size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No files attached yet</p>
          <p className="text-xs text-gray-300 mt-1">Drag & drop files above to get started</p>
        </div>
      )}

      {/* File Preview Modal */}
      {showPreview && (
        <FilePreviewModal
          isOpen={!!previewFile}
          onClose={handleClosePreview}
          file={previewFile}
          files={allPreviewableFiles}
          initialIndex={previewIndex}
          onNavigate={(file, idx) => {
            setPreviewFile(file);
            setPreviewIndex(idx);
          }}
        />
      )}
    </div>
  );
};

export default EnterpriseFileUploader;
