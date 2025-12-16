import React, { useMemo, useCallback, useState, memo, lazy, Suspense } from 'react';
import { X, Loader2, File, FileText, FileImage, FileSpreadsheet, Film, RefreshCw, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAttachmentStore, { getEntityKey } from '../store/attachmentStore';
import DeletePopup from './ui/DeletePopup';
import { toast } from 'react-toastify';

// Lazy load DocumentViewerModal for preview functionality
const DocumentViewerModal = lazy(() => import('./DocumentViewerModal'));

/**
 * InlineAttachmentManager - Displays inline attachment previews within the RichTextEditor
 * with delete functionality that syncs with the main attachment store.
 * 
 * Features:
 * - Shows compact image/file previews with delete (X) icon
 * - Click to open full preview with download/share options (same as AttachmentsSection)
 * - Uses the same DeletePopup as AttachmentsSection for consistency
 * - Real-time sync: deleting here updates AttachmentsSection instantly
 * - Handles upload progress display
 */

const getFileIcon = (fileType) => {
  switch (fileType) {
    case 'image': return <FileImage size={16} className="text-blue-500" />;
    case 'pdf': return <FileText size={16} className="text-red-500" />;
    case 'spreadsheet': return <FileSpreadsheet size={16} className="text-green-500" />;
    case 'video': return <Film size={16} className="text-purple-500" />;
    default: return <File size={16} className="text-gray-500" />;
  }
};

// Individual attachment preview item with delete capability and click-to-preview
const AttachmentPreviewItem = memo(({ 
  attachment, 
  onDelete, 
  onClick,
  isDeleting,
  showDeleteButton = true 
}) => {
  const isImage = attachment.fileType === 'image' || 
                  attachment.mimeType?.startsWith('image/') ||
                  attachment.url?.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
  
  const thumbnailUrl = attachment.thumbnailUrl || attachment.secureUrl || attachment.url;
  const displayName = attachment.originalName || attachment.fileName || 'File';
  
  // For pending uploads
  const isPending = attachment.isPending || attachment.status === 'uploading';
  const hasError = attachment.status === 'error';
  const progress = attachment.progress || 0;

  // Handle click for preview (don't allow preview for pending/error uploads)
  const handleClick = useCallback((e) => {
    if (isPending || hasError) return;
    onClick?.(attachment);
  }, [attachment, isPending, hasError, onClick]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
      layout
      className="relative group flex-shrink-0"
      title={isPending ? `Uploading: ${displayName}` : `Click to preview: ${displayName}`}
    >
      <div 
        onClick={handleClick}
        className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all duration-200
          ${hasError ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-blue-400 bg-gray-50'}
          ${isPending ? 'opacity-70 cursor-wait' : 'cursor-pointer hover:shadow-md'}
        `}
      >
        {/* Image Preview */}
        {isImage && thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          /* File Icon Preview */
          <div className="w-full h-full flex flex-col items-center justify-center p-1">
            {getFileIcon(attachment.fileType)}
            <span className="text-[8px] text-gray-500 mt-1 text-center truncate w-full px-1 leading-tight">
              {displayName.length > 10 ? `${displayName.substring(0, 8)}...` : displayName}
            </span>
          </div>
        )}

        {/* Upload Progress Overlay */}
        {isPending && !hasError && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="relative w-8 h-8">
              <svg className="w-full h-full rotate-[-90deg]" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeOpacity="0.3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  strokeDasharray={`${progress}, 100`}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {hasError && (
          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
            <AlertCircle size={20} className="text-red-500" />
          </div>
        )}
      </div>

      {/* Delete Button - Moved outside to prevent clipping */}
      {showDeleteButton && !isPending && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete(attachment);
          }}
          disabled={isDeleting}
          className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center
            transition-all duration-200 shadow-md z-10
            ${isDeleting 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-red-500 hover:bg-red-600 opacity-0 group-hover:opacity-100 cursor-pointer'
            }`}
          title="Remove attachment"
        >
          {isDeleting ? (
            <Loader2 size={10} className="text-white animate-spin" />
          ) : (
            <X size={10} className="text-white" strokeWidth={3} />
          )}
        </button>
      )}
    </motion.div>
  );
});

AttachmentPreviewItem.displayName = 'AttachmentPreviewItem';

/**
 * Main InlineAttachmentManager Component
 */
const InlineAttachmentManager = memo(({
  entityType = 'card',
  entityId,
  contextType = 'description', // 'description' or 'comment'
  contextRef,
  isExpanded = true, // Only show when editor is expanded
  onAttachmentDeleted, // Optional callback when attachment is deleted
}) => {
  const [deletePopup, setDeletePopup] = useState({ isOpen: false, attachment: null });
  const [deletingId, setDeletingId] = useState(null);
  // Preview/viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Get attachments from store
  const entityKey = getEntityKey(entityType, entityId);
  const attachments = useAttachmentStore(state => state.attachments[entityKey] || []);
  const uploadProgress = useAttachmentStore(state => state.uploadProgress);
  const deleteAttachment = useAttachmentStore(state => state.deleteAttachment);

  // Filter attachments to show inline previews
  // STRICT SEPARATION: Description and Comment attachments are fully independent
  // Each section only shows attachments uploaded to that specific context
  const contextAttachments = useMemo(() => {
    // If no entity, return empty
    if (!entityId) return [];

    // Get pending uploads for this context ONLY
    const pendingUploads = Object.entries(uploadProgress)
      .filter(([_, data]) => 
        data.entityType === entityType && 
        data.entityId === entityId &&
        data.contextType === contextType &&
        // For comment context, also match contextRef
        (contextType !== 'comment' || data.contextRef === contextRef) &&
        data.status !== 'completed'
      )
      .map(([id, data]) => ({
        _id: `pending-${id}`,
        isPending: true,
        originalName: data.fileName,
        fileType: data.fileType,
        thumbnailUrl: data.preview,
        progress: data.progress,
        status: data.status,
        error: data.error
      }));

    // STRICT CONTEXT FILTERING - No duplicate previews between sections
    const realAttachments = attachments.filter(att => {
      // Only show image-type attachments in inline preview
      const isImage = att.fileType === 'image' || 
                      att.mimeType?.startsWith('image/') ||
                      att.resourceType === 'image';
      
      if (!isImage) return false;
      
      // Get attachment's stored context type (backend stores it directly as contextType, not context.type)
      const attContextType = att.contextType || att.context?.type;
      const attContextRef = att.contextRef || att.context?.ref;
      
      // For comment context: only show attachments uploaded to THIS specific comment
      if (contextType === 'comment') {
        return attContextType === 'comment' && 
               contextRef && 
               String(attContextRef) === String(contextRef);
      }
      
      // For description context: only show attachments uploaded to description
      // This includes: contextType === 'description' OR contextType === entityType (e.g., 'card', 'subtask', 'nanoSubtask')
      // but EXCLUDE any attachments uploaded to comments
      if (contextType === 'description') {
        // Exclude comment attachments - they belong to Comments section only
        if (attContextType === 'comment') return false;
        
        // Include attachments with contextType matching description or the entity type
        return attContextType === 'description' || 
               attContextType === entityType ||
               !attContextType; // Legacy attachments without contextType
      }
      
      return false;
    });

    return [...pendingUploads, ...realAttachments];
  }, [entityId, entityType, attachments, uploadProgress, contextType, contextRef]);

  // Get only completed (non-pending) attachments for the viewer navigation
  const viewableAttachments = useMemo(() => {
    return contextAttachments.filter(att => !att.isPending && att.status !== 'uploading');
  }, [contextAttachments]);

  // Handle preview click - open DocumentViewerModal
  const handlePreviewClick = useCallback((attachment) => {
    const index = viewableAttachments.findIndex(att => att._id === attachment._id);
    setSelectedAttachment(attachment);
    setSelectedIndex(index >= 0 ? index : 0);
    setViewerOpen(true);
  }, [viewableAttachments]);

  // Handle viewer close
  const handleViewerClose = useCallback(() => {
    setViewerOpen(false);
    setSelectedAttachment(null);
    setSelectedIndex(0);
  }, []);

  // Handle viewer navigation
  const handleViewerNavigate = useCallback((attachment) => {
    setSelectedAttachment(attachment);
    const newIndex = viewableAttachments.findIndex(att => att._id === attachment._id);
    if (newIndex >= 0) setSelectedIndex(newIndex);
  }, [viewableAttachments]);

  // Handle delete button click - show confirmation popup
  const handleDeleteClick = useCallback((attachment) => {
    setDeletePopup({ isOpen: true, attachment });
  }, []);

  // Handle confirm delete
  const handleConfirmDelete = useCallback(async () => {
    const { attachment } = deletePopup;
    if (!attachment || attachment.isPending) return;

    setDeletingId(attachment._id);
    try {
      // Delete from backend via store
      await deleteAttachment(entityType, entityId, attachment._id);
      toast.success('Attachment removed');
      
      // Notify parent if callback provided
      if (onAttachmentDeleted) {
        onAttachmentDeleted(attachment._id);
      }
    } catch (error) {
      console.error('Failed to delete attachment:', error);
      toast.error('Failed to remove attachment');
    } finally {
      setDeletingId(null);
      setDeletePopup({ isOpen: false, attachment: null });
    }
  }, [deletePopup, entityType, entityId, deleteAttachment, onAttachmentDeleted]);

  // Cancel delete
  const handleCancelDelete = useCallback(() => {
    if (deletingId) return; // Don't cancel while deleting
    setDeletePopup({ isOpen: false, attachment: null });
  }, [deletingId]);

  // Don't render if not expanded or no attachments
  if (!isExpanded || contextAttachments.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mt-2 mb-2 px-1">
        <div className="flex flex-wrap gap-2 items-center">
          <AnimatePresence mode="popLayout">
            {contextAttachments.map((attachment) => (
              <AttachmentPreviewItem
                key={attachment._id}
                attachment={attachment}
                onDelete={handleDeleteClick}
                onClick={handlePreviewClick}
                isDeleting={deletingId === attachment._id}
                showDeleteButton={!attachment.isPending}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Delete Confirmation Popup - Same as AttachmentsSection */}
      <DeletePopup
        isOpen={deletePopup.isOpen}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
        itemType="attachment"
        title="Remove Attachment?"
        description={`Are you sure you want to remove "${deletePopup.attachment?.originalName || 'this file'}"? This will also remove it from the Attachments section.`}
        isLoading={!!deletingId}
      />

      {/* Full Preview Modal - Same as AttachmentsSection */}
      {viewerOpen && selectedAttachment && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        }>
          <DocumentViewerModal
            attachment={selectedAttachment}
            attachments={viewableAttachments}
            initialIndex={selectedIndex}
            onClose={handleViewerClose}
            onNavigate={handleViewerNavigate}
          />
        </Suspense>
      )}
    </>
  );
});

InlineAttachmentManager.displayName = 'InlineAttachmentManager';

export default InlineAttachmentManager;
