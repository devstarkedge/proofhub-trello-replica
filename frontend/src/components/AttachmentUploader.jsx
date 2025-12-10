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
  Clipboard
} from 'lucide-react';
import useAttachmentStore from '../store/attachmentStore';
import { toast } from 'react-toastify';

const ACCEPTED_FILE_TYPES = {
  'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv']
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;

const AttachmentUploader = ({ 
  cardId, 
  onUploadComplete, 
  contextType = 'card',
  contextRef,
  compact = false,
  allowPaste = true 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  const { uploadFile, uploadMultiple, uploadFromPaste, uploadProgress } = useAttachmentStore();

  // Handle paste events for clipboard images
  useEffect(() => {
    if (!allowPaste) return;

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
                setIsUploading(true);
                await uploadFromPaste(e.target.result, cardId, { contextType, contextRef });
                toast.success('Image pasted and uploaded successfully!');
                onUploadComplete?.();
              } catch (error) {
                toast.error('Failed to upload pasted image');
              } finally {
                setIsUploading(false);
              }
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [allowPaste, cardId, contextType, contextRef, uploadFromPaste, onUploadComplete]);

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
    processFiles(files);
  }, []);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    processFiles(files);
    e.target.value = ''; // Reset input
  }, []);

  const processFiles = useCallback((files) => {
    if (files.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} files allowed at once`);
      files = files.slice(0, MAX_FILES);
    }

    const validFiles = [];
    const errors = [];

    files.forEach(file => {
      const validation = validateFile(file);
      if (validation.valid) {
        validFiles.push({
          file,
          id: `${Date.now()}-${file.name}`,
          status: 'pending',
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
        });
      } else {
        errors.push(validation.error);
      }
    });

    if (errors.length > 0) {
      errors.forEach(error => toast.error(error));
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  }, [validateFile]);

  const removeFile = useCallback((fileId) => {
    setSelectedFiles(prev => {
      const file = prev.find(f => f.id === fileId);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== fileId);
    });
  }, []);

  const uploadFiles = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);

    try {
      if (selectedFiles.length === 1) {
        // Single file upload
        const fileData = selectedFiles[0];
        setSelectedFiles(prev => prev.map(f => 
          f.id === fileData.id ? { ...f, status: 'uploading' } : f
        ));

        await uploadFile(fileData.file, cardId, { contextType, contextRef });

        setSelectedFiles(prev => prev.map(f => 
          f.id === fileData.id ? { ...f, status: 'completed' } : f
        ));
      } else {
        // Batch upload
        setSelectedFiles(prev => prev.map(f => ({ ...f, status: 'uploading' })));
        
        const files = selectedFiles.map(f => f.file);
        const result = await uploadMultiple(files, cardId, { contextType, contextRef });

        setSelectedFiles(prev => prev.map(f => ({ ...f, status: 'completed' })));

        if (result.failed?.length > 0) {
          toast.warning(`${result.failed.length} file(s) failed to upload`);
        }
      }

      // Clear files after successful upload
      setTimeout(() => {
        setSelectedFiles([]);
        onUploadComplete?.();
      }, 1000);

      toast.success('Files uploaded successfully!');
    } catch (error) {
      toast.error('Upload failed: ' + error.message);
      setSelectedFiles(prev => prev.map(f => ({ ...f, status: 'error' })));
    } finally {
      setIsUploading(false);
    }
  }, [selectedFiles, cardId, contextType, contextRef, uploadFile, uploadMultiple, onUploadComplete]);

  const getFileIcon = (file) => {
    const type = file.type;
    if (type.startsWith('image/')) return <FileImage size={20} className="text-blue-500" />;
    if (type === 'application/pdf') return <FileText size={20} className="text-red-500" />;
    if (type.includes('spreadsheet') || type.includes('excel')) return <FileSpreadsheet size={20} className="text-green-500" />;
    if (type.includes('word') || type.includes('document')) return <FileText size={20} className="text-blue-600" />;
    if (type.startsWith('video/')) return <Film size={20} className="text-purple-500" />;
    return <File size={20} className="text-gray-500" />;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Compact mode - just a button
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={Object.keys(ACCEPTED_FILE_TYPES).join(',')}
          onChange={handleFileSelect}
          className="hidden"
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors disabled:opacity-50"
        >
          {isUploading ? (
            <Loader size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          <span className="text-sm">Attach</span>
        </motion.button>
        {allowPaste && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Clipboard size={12} />
            or paste
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
          transition-all duration-200 ease-in-out
          ${isDragging 
            ? 'border-blue-500 bg-blue-50 scale-[1.02]' 
            : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={Object.keys(ACCEPTED_FILE_TYPES).join(',')}
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <motion.div
          animate={{ y: isDragging ? -5 : 0 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <Upload 
            size={40} 
            className={`mx-auto mb-3 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} 
          />
        </motion.div>

        <p className="text-gray-600 font-medium mb-1">
          {isDragging ? 'Drop files here' : 'Drag & drop files here'}
        </p>
        <p className="text-gray-400 text-sm">
          or click to browse
        </p>
        <p className="text-gray-400 text-xs mt-2">
          Images, PDFs, Documents, Spreadsheets • Max {MAX_FILES} files • 10MB each
        </p>
        
        {allowPaste && (
          <p className="text-blue-500 text-xs mt-2 flex items-center justify-center gap-1">
            <Clipboard size={12} />
            You can also paste images from clipboard
          </p>
        )}
      </div>

      {/* Selected Files List */}
      <AnimatePresence>
        {selectedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => setSelectedFiles([])}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear all
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {selectedFiles.map((fileData) => (
                <motion.div
                  key={fileData.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 shadow-sm"
                >
                  {/* Preview/Icon */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
                    {fileData.preview ? (
                      <img src={fileData.preview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      getFileIcon(fileData.file)
                    )}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {fileData.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(fileData.file.size)}
                    </p>
                  </div>

                  {/* Status */}
                  <div className="flex-shrink-0">
                    {fileData.status === 'pending' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(fileData.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                    {fileData.status === 'uploading' && (
                      <Loader size={16} className="text-blue-500 animate-spin" />
                    )}
                    {fileData.status === 'completed' && (
                      <CheckCircle size={16} className="text-green-500" />
                    )}
                    {fileData.status === 'error' && (
                      <AlertCircle size={16} className="text-red-500" />
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Upload button */}
            {selectedFiles.some(f => f.status === 'pending') && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={uploadFiles}
                disabled={isUploading}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 hover:shadow-lg transition-all disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader size={18} className="animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={18} />
                    Upload {selectedFiles.filter(f => f.status === 'pending').length} file{selectedFiles.filter(f => f.status === 'pending').length > 1 ? 's' : ''}
                  </>
                )}
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Progress */}
      <AnimatePresence>
        {Object.entries(uploadProgress).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2"
          >
            {Object.entries(uploadProgress).map(([id, progress]) => (
              <div key={id} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700 truncate">{progress.fileName}</span>
                  <span className="text-xs text-gray-500">{progress.progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.progress}%` }}
                    className={`h-full rounded-full transition-all ${
                      progress.status === 'error' ? 'bg-red-500' :
                      progress.status === 'completed' ? 'bg-green-500' :
                      'bg-blue-500'
                    }`}
                  />
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AttachmentUploader;
