import React, { useEffect, useCallback, lazy, Suspense, memo } from "react";
import { Paperclip, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import useAttachmentStore from "../../store/attachmentStore";

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
  readOnly = false
}) => {
  const store = useAttachmentStore();
  
  // Extract card-specific values from the keyed store objects
  const attachments = store.attachments[cardId] || [];
  const loading = store.loading[cardId] || false;
  const error = store.error[cardId] || null;
  const pagination = store.pagination[cardId] || {};
  const totalCount = pagination.totalCount || attachments.length;
  
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
      fetchAttachments(cardId);
    }
  }, [cardId, fetchAttachments]);

  // Handle delete
  const handleDelete = useCallback(async (attachmentId) => {
    try {
      await deleteAttachment(cardId, attachmentId);
      if (onDeleteAttachment) {
        onDeleteAttachment(attachmentId);
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }, [cardId, deleteAttachment, onDeleteAttachment]);

  // Handle set as cover
  const handleSetCover = useCallback(async (attachmentId) => {
    if (!cardId) return;
    
    try {
      const result = await setAsCover(cardId, attachmentId);
      if (onCoverChange) {
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
    </motion.div>
  );
});

AttachmentsSection.displayName = 'AttachmentsSection';

export default AttachmentsSection;
