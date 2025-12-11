import { useCallback, useState, useRef } from 'react';
import useAttachmentStore from '../store/attachmentStore';
import attachmentService from '../services/attachmentService';

/**
 * Custom hook for handling rich text editor attachments
 * Handles Cloudinary upload, inline preview insertion, and dual-display in main attachments list
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.cardId - The card ID this editor belongs to
 * @param {string} options.contextType - 'description' or 'comment'
 * @param {string} options.contextRef - The reference ID (cardId for description, commentId for comment)
 * @param {Function} options.onInsertImage - Callback to insert image into editor
 * @param {Function} options.onInsertFile - Callback to insert file preview into editor
 * @param {boolean} options.enableAutoCover - Whether to auto-set first description image as cover
 */
const useEditorAttachment = ({
  cardId,
  contextType = 'description',
  contextRef,
  onInsertImage,
  onInsertFile,
  enableAutoCover = true
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const uploadQueueRef = useRef([]);
  const isFirstDescriptionImageRef = useRef(true);

  // Get store methods
  // Get store methods
  const { addAttachment, uploadFile: storeUploadFile } = useAttachmentStore();
  const attachments = useAttachmentStore(state => state.attachments[cardId] || []);

  // Determine if this is the first image in description (for auto-cover)
  const shouldSetAsCover = useCallback(() => {
    if (!enableAutoCover || contextType !== 'description') return false;
    
    // Check if there's already a cover image
    const hasCover = attachments.some(att => att.isCover);
    if (hasCover) return false;
    
    // Check if there are any description images already
    const hasDescriptionImages = attachments.some(
      att => att.contextType === 'description' && att.fileType === 'image'
    );
    
    return !hasDescriptionImages && isFirstDescriptionImageRef.current;
  }, [enableAutoCover, contextType, attachments]);

  // Clear states after success/error
  const clearStates = useCallback((delay = 3000) => {
    setTimeout(() => {
      setError(null);
      setSuccess(false);
    }, delay);
  }, []);

  // Get file type category from mime type
  const getFileTypeFromMime = useCallback((mimeType) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'spreadsheet';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'presentation';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('text/')) return 'text';
    return 'other';
  }, []);

  // Get file extension from filename
  const getFileExtension = useCallback((filename) => {
    return filename.split('.').pop()?.toLowerCase() || '';
  }, []);

  // Generate thumbnail URL for Cloudinary images
  const getThumbnailUrl = useCallback((url, width = 60, height = 60) => {
    if (!url || !url.includes('cloudinary.com')) return url;
    
    // Insert transformation into Cloudinary URL
    const transformStr = `c_thumb,w_${width},h_${height},g_face`;
    return url.replace('/upload/', `/upload/${transformStr}/`);
  }, []);

  // Create inline preview html
  const createInlinePreview = useCallback((attachment) => {
    const { fileType, url, secureUrl, originalName, thumbnailUrl } = attachment;
    const displayUrl = secureUrl || url;
    const previewUrl = thumbnailUrl || getThumbnailUrl(displayUrl);

    if (fileType === 'image') {
      return {
        type: 'image',
        src: displayUrl,
        thumbnailSrc: previewUrl,
        alt: originalName
      };
    }

    const iconMap = {
      pdf: '📄',
      document: '📝',
      spreadsheet: '📊',
      presentation: '📽️',
      video: '🎬',
      text: '📃',
      other: '📎'
    };

    return {
      type: 'file',
      html: `<span class="inline-attachment" data-type="${fileType}" data-url="${displayUrl}" contenteditable="false">
        <span class="inline-attachment-icon">${iconMap[fileType] || iconMap.other}</span>
        <span class="inline-attachment-name">${originalName}</span>
      </span>`,
      url: displayUrl,
      fileName: originalName
    };
  }, [getThumbnailUrl]);

  // Upload file via store
  const uploadFile = useCallback(async (file) => {
    if (!cardId) {
      setError('Card ID is required for upload');
      clearStates();
      return null;
    }

    // Validate size
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File must be less than 10MB');
      clearStates();
      return null;
    }

    setUploading(true);
    setError(null);
    setSuccess(false);
    setUploadProgress(0);

    try {
      const setCover = shouldSetAsCover() && file.type.startsWith('image/');

      // Use store action to upload - this will handle progress updates in the store
      // which will reflect in the AttachmentList
      const attachment = await storeUploadFile(file, cardId, {
        contextType,
        contextRef: contextRef || cardId,
        setCover
      });

      // Mark that we've processed the first image
      if (file.type.startsWith('image/') && contextType === 'description') {
        isFirstDescriptionImageRef.current = false;
      }

      // Create inline preview for the editor
      const preview = createInlinePreview(attachment);
      
      if (preview.type === 'image' && onInsertImage) {
        onInsertImage(preview.src);
      } else if (preview.type === 'file' && onInsertFile) {
        onInsertFile(preview.html, attachment);
      }

      setUploadProgress(100);
      setSuccess(true);
      clearStates(2000);

      return attachment;
    } catch (err) {
      console.error('Editor attachment upload failed:', err);
      setError(err.message || 'Upload failed');
      clearStates();
      return null;
    } finally {
      setUploading(false);
    }
  }, [cardId, contextType, contextRef, shouldSetAsCover, storeUploadFile, createInlinePreview, onInsertImage, onInsertFile, clearStates]);

  // Upload multiple files
  const uploadFiles = useCallback(async (files) => {
    // Return immediately to allow UI to update
    const result = await useAttachmentStore.getState().uploadMultiple(files, cardId, {
      contextType,
      contextRef: contextRef || cardId
    });
    return result;
  }, [cardId, contextType, contextRef]);

  // Handle clipboard paste (image data URL)
  const uploadFromPaste = useCallback(async (imageDataUrl) => {
    if (!cardId) {
      setError('Card ID is required for upload');
      clearStates();
      return null;
    }

    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      // Determine if this should be set as cover
      const setCover = shouldSetAsCover();
      
      const attachment = await attachmentService.uploadFromPaste(imageDataUrl, cardId, {
        contextType,
        contextRef: contextRef || cardId,
        setCover
      });

      // Add to main attachments store
      addAttachment(cardId, attachment);

      // Mark that we've processed the first image
      if (contextType === 'description') {
        isFirstDescriptionImageRef.current = false;
      }

      // Insert into editor
      if (onInsertImage) {
        onInsertImage(attachment.secureUrl || attachment.url);
      }

      setSuccess(true);
      clearStates(2000);

      return attachment;
    } catch (err) {
      console.error('Paste upload failed:', err);
      setError(err.message || 'Paste upload failed');
      clearStates();
      return null;
    } finally {
      setUploading(false);
    }
  }, [cardId, contextType, contextRef, shouldSetAsCover, addAttachment, onInsertImage, clearStates]);

  // Validate file type before upload
  const validateFile = useCallback((file) => {
    const allowedMimeTypes = [
      // Images
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // Spreadsheets
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // Presentations
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Text
      'text/plain', 'text/csv', 'text/markdown',
      // Archives
      'application/zip', 'application/x-rar-compressed'
    ];

    if (!allowedMimeTypes.includes(file.type)) {
      return { valid: false, error: `File type ${file.type} is not supported` };
    }

    if (file.size > 10 * 1024 * 1024) {
      return { valid: false, error: 'File must be less than 10MB' };
    }

    return { valid: true };
  }, []);

  // Get accepted file types for input
  const getAcceptedFileTypes = useCallback(() => {
    return [
      'image/*',
      '.pdf',
      '.doc', '.docx',
      '.xls', '.xlsx',
      '.ppt', '.pptx',
      '.txt', '.csv', '.md',
      '.zip', '.rar'
    ].join(',');
  }, []);

  return {
    uploading,
    uploadProgress,
    error,
    success,
    uploadFile,
    uploadFiles,
    uploadFromPaste,
    validateFile,
    getAcceptedFileTypes,
    getFileTypeFromMime,
    getThumbnailUrl
  };
};

export default useEditorAttachment;
