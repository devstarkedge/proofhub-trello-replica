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
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  const { uploadMultiple, uploadFromPaste } = useAttachmentStore();

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
                // Determine if this is a comment/description upload or just a general card attachment
                // For direct clipboard paste in the uploader area, we treat it as a generic card attachment unless specified
                const pasteContextType = contextType || 'card';
                const pasteContextRef = contextRef || cardId;
                
                await uploadFromPaste(e.target.result, cardId, { contextType: pasteContextType, contextRef: pasteContextRef });
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
        uploadMultiple(validFiles, cardId, { contextType, contextRef });
        
        // Notify parent immediately that uploads started
        onUploadComplete?.();
      } catch (error) {
        console.error("Upload start error", error);
      }
    }
  }, [validateFile, cardId, contextType, contextRef, uploadMultiple, onUploadComplete]);

  // Compact mode - just a button
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={Object.keys(ACCEPTED_FILE_TYPES).join(',')}
          className="hidden"
          onChange={handleFileSelect}
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
        >
          <Plus size={16} />
          <span className="text-sm">Attach</span>
        </motion.button>
        {allowPaste && (
          <span className="text-xs text-gray-400 flex items-center gap-1 cursor-help" title="Click anywhere or press Ctrl+V to paste">
            <Clipboard size={12} />
            Paste supported
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
          transition-all duration-200 ease-in-out group
          ${isDragging 
            ? 'border-blue-500 bg-blue-50 scale-[1.01]' 
            : 'border-gray-300 hover:border-blue-400 bg-gray-50 hover:bg-gray-100'
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
            size={32} 
            className={`mx-auto mb-3 transition-colors ${
              isDragging ? 'text-blue-500' : 'text-gray-400 group-hover:text-blue-500'
            }`} 
          />
        </motion.div>

        <p className="text-gray-700 font-medium text-sm mb-1">
          {isDragging ? 'Drop files to upload instantly' : 'Click or drag files here'}
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
