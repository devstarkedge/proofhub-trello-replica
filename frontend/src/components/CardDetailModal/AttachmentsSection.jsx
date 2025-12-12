import React, { useEffect, useCallback, lazy, Suspense, memo, useRef } from "react";
import { Paperclip, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import useAttachmentStore from "../../store/attachmentStore";
import DeletePopup from "../ui/DeletePopup";

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
  cardId, 
  boardId,
  onDeleteAttachment, // Legacy prop for backwards compatibility
  onAttachmentAdded,
  onCoverChange,
  readOnly = false,
  currentCoverImageId // Pass the current cover image ID to avoid redundant updates
}) => {
  const store = useAttachmentStore();
  
  // Extract card-specific values from the keyed store objects
  const attachments = store.attachments[cardId] || [];
  const loading = store.loading[cardId] || false;
  const error = store.error[cardId] || null;
  const pagination = store.pagination[cardId] || {};
  const totalCount = pagination.totalCount || attachments.length;
  
  // Track if we've notified parent of cover to prevent infinite loops
  const coverNotifiedRef = useRef(false);
  const [deletePopup, setDeletePopup] = React.useState({ isOpen: false, attachmentId: null });
  
  // Store actions
  const {
    fetchAttachments,
    deleteAttachment,
    setAsCover,
    setError
  } = store;

  // Clear error for this card
  const clearError = useCallback(() => {
    setError(cardId, null);
  }, [cardId, setError]);

  // Fetch attachments on mount and when cardId changes
  useEffect(() => {
    if (cardId) {
      // Reset cover notification flag when card changes
      coverNotifiedRef.current = false;
      fetchAttachments(cardId);
    }
  }, [cardId, fetchAttachments]);

  // Handle delete
  const handleDelete = useCallback((attachmentId) => {
    setDeletePopup({ isOpen: true, attachmentId });
  }, []);

  const handleConfirmDelete = async () => {
    const { attachmentId } = deletePopup;
    if (!attachmentId) return;
    
    try {
      await deleteAttachment(cardId, attachmentId);
      if (onDeleteAttachment) {
        onDeleteAttachment(attachmentId);
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
    setDeletePopup({ isOpen: false, attachmentId: null });
  };

  // Handle set as cover
  const handleSetCover = useCallback(async (attachmentOrId) => {
    if (!cardId) return;
    
    // Support both attachment object and ID
    const attachmentId = typeof attachmentOrId === 'object' ? attachmentOrId._id : attachmentOrId;
    
    try {
      const result = await setAsCover(cardId, attachmentId);
      if (onCoverChange) {
        // Pass the full result back to parent
        onCoverChange(result);
      }
    } catch (error) {
      console.error('Set cover failed:', error);
    }
  }, [cardId, setAsCover, onCoverChange]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    if (cardId) {
      fetchAttachments(cardId);
    }
  }, [cardId, fetchAttachments]);

  // Notify parent when cover image is first detected after upload
  // Only notify once per card to prevent infinite loops
  useEffect(() => {
    if (!cardId || !onCoverChange || loading || !attachments.length) return;
    
    // Only notify if we haven't already notified for this card AND there's a cover
    if (!coverNotifiedRef.current) {
      const coverAttachment = attachments.find(att => att.isCover);
      if (coverAttachment) {
        // Only notify if this is a NEW cover (not already set in parent)
        // Check if the current cover image ID is different from what we found
        if (coverAttachment._id !== currentCoverImageId) {
          coverNotifiedRef.current = true;
          onCoverChange(coverAttachment);
        } else {
          // Cover is already set in parent, just mark as notified to prevent re-notification
          coverNotifiedRef.current = true;
        }
      }
    }
  }, [cardId, loading, currentCoverImageId]); // Added currentCoverImageId to dependency

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
              cardId={cardId}
              onUploadComplete={() => {
                fetchAttachments(cardId);
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
            onSetCover={readOnly ? undefined : handleSetCover}
            cardId={cardId}
          />
        </Suspense>
      </div>
      
      <DeletePopup
        isOpen={deletePopup.isOpen}
        onCancel={() => setDeletePopup({ isOpen: false, attachmentId: null })}
        onConfirm={handleConfirmDelete}
        itemType="attachment"
      />
    </motion.div>
  );
});

AttachmentsSection.displayName = 'AttachmentsSection';

export default AttachmentsSection;
