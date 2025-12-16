import React, { useEffect, useCallback, lazy, Suspense, memo } from "react";
import { Paperclip, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import useAttachmentStore, { getEntityKey } from "../../store/attachmentStore";
import DeletePopup from "../ui/DeletePopup";
import { toast } from "react-toastify";

// Lazy load heavy components
const AttachmentUploader = lazy(() => import("../AttachmentUploader"));
const AttachmentList = lazy(() => import("../AttachmentList"));

// Loading fallback
const LoadingFallback = () => (
  <div className="flex items-center justify-center p-8">
    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
  </div>
);

const AttachmentsSection = memo(({ 
  entityType = 'card',  // 'card' | 'subtask' | 'nanoSubtask'
  entityId,
  boardId,
  onDeleteAttachment, // Legacy prop for backwards compatibility
  onAttachmentAdded,
  onCoverChange,
  readOnly = false,
  currentCoverImageId // Pass the current cover image ID to avoid redundant updates
}) => {
  const store = useAttachmentStore();
  const entityKey = getEntityKey(entityType, entityId);
  
  // Extract entity-specific values from the keyed store objects
  const attachments = store.attachments[entityKey] || [];
  const loading = store.loading[entityKey] || false;
  const error = store.error[entityKey] || null;
  const pagination = store.pagination[entityKey] || {};
  
  
  const totalCount = pagination.totalCount || attachments.length;
  
  const [deletePopup, setDeletePopup] = React.useState({ isOpen: false, attachmentId: null, attachmentIds: null });
  const [isDeleting, setIsDeleting] = React.useState(false);
  
  // Store actions
  const {
    fetchAttachments,
    deleteAttachment,
    deleteSelected,
    setAsCover,
    setError,
    clearEntityData
  } = store;

  // Clear error for this entity
  const clearError = useCallback(() => {
    setError(entityKey, null);
  }, [entityKey, setError]);

  // Fetch attachments on mount and when entity changes
  useEffect(() => {
    if (entityId) {
      // Wrap in async function to handle errors gracefully
      const loadAttachments = async () => {
        try {
          await fetchAttachments(entityType, entityId, { forceRefresh: true });
        } catch (error) {
          // Error is already handled in the store, just log for debugging
          console.warn(`Failed to load attachments for ${entityType} ${entityId}:`, error);
        }
      };
      
      loadAttachments();
    }
    
    // Cleanup on unmount - clear entity data to prevent stale state
    return () => {
      if (entityId) {
        clearEntityData(entityType, entityId);
      }
    };
  }, [entityType, entityId, fetchAttachments, clearEntityData]);

  // Handle delete
  const handleDelete = useCallback((attachmentId) => {
    setDeletePopup({ isOpen: true, attachmentId });
  }, []);

  // Handle bulk delete
  const handleBulkDelete = useCallback((ids) => {
    setDeletePopup({ isOpen: true, attachmentIds: ids });
  }, []);

  const handleConfirmDelete = async () => {
    const { attachmentId, attachmentIds } = deletePopup;
    if (!attachmentId && (!attachmentIds || attachmentIds.length === 0)) return;
    
    setIsDeleting(true);
    try {
      if (attachmentIds && attachmentIds.length > 0) {
        await deleteSelected(entityType, entityId);
        toast.success(`${attachmentIds.length} attachments deleted`);
      } else {
        await deleteAttachment(entityType, entityId, attachmentId);
        toast.success('Attachment deleted');
      }
      
      // Notify parent if needed (bulk notifications might need array support in parent handler, 
      // but for now we basically verify sync)
      if (onDeleteAttachment && attachmentId) {
        onDeleteAttachment(attachmentId);
      }
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Failed to delete attachment(s)');
    } finally {
      setIsDeleting(false);
      setDeletePopup({ isOpen: false, attachmentId: null, attachmentIds: null });
    }
  };

  // Handle set as cover - supports all entity types
  // Note: onCoverChange is only called for cards to update CardDetailModal
  // Subtask and NanoSubtask covers are managed within their own scope
  const handleSetCover = useCallback(async (attachmentOrId) => {
    if (!entityId) return;
    
    // Support both attachment object and ID
    const attachmentId = typeof attachmentOrId === 'object' ? attachmentOrId._id : attachmentOrId;
    
    try {
      const result = await setAsCover(entityType, entityId, attachmentId);
      // Only notify parent for cards - subtask/nano covers don't affect parent modals
      if (onCoverChange && entityType === 'card') {
        onCoverChange(result);
      }
    } catch (error) {
      console.error('Set cover failed:', error);
    }
  }, [entityType, entityId, setAsCover, onCoverChange]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    if (entityId) {
      try {
        await fetchAttachments(entityType, entityId, { forceRefresh: true });
      } catch (error) {
        // Error is already handled in the store
        console.warn('Refresh attachments failed:', error);
      }
    }
  }, [entityType, entityId, fetchAttachments]);

  // REMOVED: Auto-cover detection useEffect
  // Cover images are ONLY set via explicit user action (handleSetCover)
  // This prevents any auto-propagation of covers between entities

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Paperclip size={20} className="text-gray-600" />
          <h4 className="font-semibold text-gray-800 text-lg">
            Attachments
          </h4>
          {totalCount > 0 && (
            <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full font-medium">
              {totalCount}
            </span>
          )}
        </div>
        
        {/* Refresh Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleRefresh}
          disabled={loading}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-all disabled:opacity-50"
          title="Refresh attachments"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </motion.button>
      </div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="ml-8"
          >
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle size={16} />
              <span className="flex-1">{error}</span>
              <button
                onClick={clearError}
                className="text-red-500 hover:text-red-700 font-medium"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ml-8 space-y-4">
        {/* Uploader */}
        {!readOnly && (
          <Suspense fallback={<LoadingFallback />}>
            <AttachmentUploader
              entityType={entityType}
              entityId={entityId}
              onUploadComplete={() => {
                fetchAttachments(entityType, entityId, { forceRefresh: true });
                if (onAttachmentAdded) onAttachmentAdded([]);
              }}
              compact={attachments.length > 0}
            />
          </Suspense>
        )}

        {/* Attachment List */}
        <Suspense fallback={<LoadingFallback />}>
          <AttachmentList
            attachments={attachments}
            onDelete={readOnly ? undefined : handleDelete}
            onDeleteMultiple={readOnly ? undefined : handleBulkDelete}
            onSetCover={readOnly || entityType !== 'card' ? undefined : handleSetCover}
            entityType={entityType}
            entityId={entityId}
          />
        </Suspense>
      </div>
      
      <DeletePopup
        isOpen={deletePopup.isOpen}
        onCancel={() => !isDeleting && setDeletePopup({ isOpen: false, attachmentId: null, attachmentIds: null })}
        onConfirm={handleConfirmDelete}
        itemType="attachment"
        title={deletePopup.attachmentIds ? `Delete ${deletePopup.attachmentIds.length} Attachments?` : undefined}
        description={deletePopup.attachmentIds ? "Are you sure you want to delete these selected attachments?" : undefined}
        isLoading={isDeleting}
      />
    </motion.div>
  );
});

AttachmentsSection.displayName = 'AttachmentsSection';

export default AttachmentsSection;
