import React, { useContext, useState, useRef, useEffect, useCallback, lazy, Suspense, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MessageSquare, 
  Loader, 
  ChevronRight, 
  History, 
  Edit3, 
  Trash2, 
  MoreHorizontal, 
  X,
  Loader2
} from "lucide-react";
import RichTextEditor from "../RichTextEditor";
import AuthContext from "../../context/AuthContext";
import versionService from "../../services/versionService";
import DeletePopup from "../ui/DeletePopup";

// Lazy load VersionHistoryModal
const VersionHistoryModal = lazy(() => import("../VersionHistoryModal"));

// Memoized Comment Component for better performance
const CommentItem = memo(({ 
  comment, 
  index, 
  currentUserId, 
  onEdit, 
  onDelete, 
  onShowHistory 
}) => {
  const [showActions, setShowActions] = useState(false);
  const [versionCount, setVersionCount] = useState(0);
  const actionsRef = useRef(null);
  
  const commentId = comment._id || comment.id;
  const isOwner = currentUserId === comment.user?._id || currentUserId === comment.user?.id;
  
  // Fetch version count
  useEffect(() => {
    const fetchVersionCount = async () => {
      // Don't fetch version count for temporary IDs (optimistic updates)
      if (commentId && !String(commentId).startsWith('temp-')) {
        try {
          const count = await versionService.getVersionCount('comment', commentId);
          setVersionCount(count);
        } catch (error) {
          // Silent fail - version count is optional
        }
      }
    };
    fetchVersionCount();
  }, [commentId]);

  // Close actions on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target)) {
        setShowActions(false);
      }
    };
    if (showActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showActions]);

  const safeKey = String(commentId || `comment-${index}`).trim() || `comment-${index}`;
  
  return (
    <motion.div
      key={safeKey}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex gap-3 mb-4 group"
    >
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-semibold shadow-md flex-shrink-0">
        {comment.user?.name?.[0]?.toUpperCase() || "U"}
      </div>
      <div className="flex-1">
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-gray-900">
                {comment.user?.name || "User"}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(comment.createdAt).toLocaleString()}
              </span>
              {comment.isEdited && (
                <span className="text-xs text-gray-400 italic">(edited)</span>
              )}
              {versionCount > 0 && (
                <button
                  onClick={() => onShowHistory(comment)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
                  title="View edit history"
                >
                  <History size={12} />
                  <span>{versionCount}</span>
                </button>
              )}
            </div>
            
            {/* Actions Menu */}
            {isOwner && (
              <div className="relative" ref={actionsRef}>
                <button
                  onClick={() => setShowActions(!showActions)}
                  className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-all rounded"
                >
                  <MoreHorizontal size={16} />
                </button>
                
                <AnimatePresence>
                  {showActions && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 min-w-[120px]"
                    >
                      <button
                        onClick={() => {
                          onEdit(comment);
                          setShowActions(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <Edit3 size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          onDelete(comment);
                          setShowActions(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
          <div 
            className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none comment-content" 
            dangerouslySetInnerHTML={{ __html: comment.htmlContent || comment.text }} 
          />
        </div>
      </div>
    </motion.div>
  );
});

CommentItem.displayName = 'CommentItem';

const CommentsSection = memo(({
  comments,
  newComment,
  teamMembers,
  onCommentChange,
  onAddComment,
  onImageUpload,
  modalContainerRef,
  onEditComment,
  onDeleteComment,
  cardId, // Legacy Card ID
  entityType = 'card', // Entity Type
  entityId, // Entity Context ID
  enableCloudinaryAttachments = true, // Enable new attachment system
}) => {
  const { user } = useContext(AuthContext);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const [editingComment, setEditingComment] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedCommentForHistory, setSelectedCommentForHistory] = useState(null);
  const [deletePopup, setDeletePopup] = useState({ isOpen: false, comment: null });
  const editorContainerRef = useRef(null);

  // Handle clicking outside to collapse editor (scoped to modal)
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't collapse if clicking inside the editor container
      if (editorContainerRef.current && editorContainerRef.current.contains(event.target)) {
        return;
      }
      
      // If modal container is provided, only collapse if click is within the modal
      if (modalContainerRef?.current) {
        if (modalContainerRef.current.contains(event.target)) {
          setIsEditorExpanded(false);
        }
      }
    };

    if (isEditorExpanded) {
      // Use a small delay to prevent immediate collapse
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditorExpanded, modalContainerRef]);

  const handleSubmit = async () => {
    // Allow submit if there's text content or HTML content (like images)
    const hasTextContent = newComment?.trim();
    const hasHtmlContent = newComment && /<img|<a|<div/.test(newComment);
    if (!hasTextContent && !hasHtmlContent) return;
    setIsSubmitting(true);
    try {
      await onAddComment();
      setIsEditorExpanded(false); // Collapse after successful submit
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit submission
  const handleEditSubmit = useCallback(async () => {
    // Allow submit if there's text content or HTML content (like images)
    const hasTextContent = editContent?.trim();
    const hasHtmlContent = editContent && /<img|<a|<div/.test(editContent);
    if ((!hasTextContent && !hasHtmlContent) || !editingComment) return;
    setIsSubmitting(true);
    try {
      if (onEditComment) {
        await onEditComment(editingComment._id || editingComment.id, editContent);
      }
      setEditingComment(null);
      setEditContent('');
    } finally {
      setIsSubmitting(false);
    }
  }, [editContent, editingComment, onEditComment]);

  // Handle delete
  const handleDelete = useCallback((comment) => {
    setDeletePopup({ isOpen: true, comment });
  }, []);

  const handleConfirmDelete = async () => {
    const { comment } = deletePopup;
    if (comment && onDeleteComment) {
      await onDeleteComment(comment._id || comment.id);
    }
    setDeletePopup({ isOpen: false, comment: null });
  };

  // Handle edit start
  const handleEditStart = useCallback((comment) => {
    setEditingComment(comment);
    setEditContent(comment.htmlContent || comment.text || '');
  }, []);

  // Handle show history
  const handleShowHistory = useCallback((comment) => {
    setSelectedCommentForHistory(comment);
    setShowVersionHistory(true);
  }, []);

  // Handle version rollback for comment
  const handleVersionRollback = useCallback(async (version) => {
    if (selectedCommentForHistory && onEditComment) {
      await onEditComment(
        selectedCommentForHistory._id || selectedCommentForHistory.id, 
        version.htmlContent || version.content
      );
    }
    setShowVersionHistory(false);
    setSelectedCommentForHistory(null);
  }, [selectedCommentForHistory, onEditComment]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <MessageSquare size={20} className="text-gray-600" />
        <h4 className="font-semibold text-gray-800 text-lg">
          Activity
        </h4>
        {comments.length > 0 && (
          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full font-medium">
            {comments.length}
          </span>
        )}
      </div>

      <div className="ml-8 space-y-4">
        {/* Add Comment */}
        <motion.div
          ref={editorContainerRef}
          className="flex gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold shadow-md flex-shrink-0">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1">
            <AnimatePresence mode="wait">
              {isEditorExpanded ? (
                <motion.div
                  key="expanded"
                  initial={{ opacity: 0, height: "auto" }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 50 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <div className="border border-gray-300 rounded-lg overflow-hidden hover:border-gray-400 transition-colors shadow-sm hover:shadow-md">
                    <RichTextEditor
                      content={newComment}
                      onChange={onCommentChange}
                      placeholder="Write a comment..."
                      users={teamMembers}
                      isComment={true}
                      allowMentions={true}
                      startExpanded={true}
                      className="min-h-[80px]"
                      onImageUpload={onImageUpload}
                      mentionContainer={document.querySelector('.fixed.inset-0.bg-black.bg-opacity-50.flex.items-start.justify-center.z-60')}
                      // New Cloudinary attachment props
                      cardId={cardId}
                      entityType={entityType}
                      entityId={entityId}
                      contextType="comment"
                      enableAttachments={enableCloudinaryAttachments && !!(entityId || cardId)}
                      enableAutoCover={false}
                    />
                  </div>
                  <div className="flex justify-end mt-2 gap-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setIsEditorExpanded(false)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 rounded-lg transition-colors font-medium"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSubmit}
                      disabled={isSubmitting || (!newComment?.trim() && !/<img|<a|<div/.test(newComment || ''))}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:shadow-lg transition-all font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting && <Loader size={16} className="animate-spin" />}
                      {isSubmitting ? "Posting..." : "Comment"}
                    </motion.button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="collapsed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setIsEditorExpanded(true)}
                  className="p-3 bg-white rounded-lg cursor-pointer hover:bg-gray-50 border border-gray-200 hover:border-gray-300 transition-all shadow-sm flex items-center gap-2"
                >
                  <ChevronRight size={16} className="text-gray-400" />
                  <span className="text-gray-500 text-sm">Write a comment...</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Comments List with Scrollbar */}
        <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar">
          <AnimatePresence>
            {comments.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8 text-gray-400"
              >
                <MessageSquare size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No comments yet. Be the first to comment!</p>
              </motion.div>
            ) : (
              comments.map((comment, index) => {
                const commentId = comment._id || comment.id;
                const isEditing = editingComment && (editingComment._id === commentId || editingComment.id === commentId);
                
                if (isEditing) {
                  return (
                    <motion.div
                      key={commentId || `comment-${index}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex gap-3 mb-4"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-semibold shadow-md flex-shrink-0">
                        {comment.user?.name?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div className="flex-1">
                        <div className="border border-blue-300 rounded-lg overflow-hidden shadow-md">
                          <RichTextEditor
                            content={editContent}
                            onChange={setEditContent}
                            placeholder="Edit your comment..."
                            users={teamMembers}
                            isComment={true}
                            allowMentions={true}
                            startExpanded={true}
                            className="min-h-[80px]"
                            onImageUpload={onImageUpload}
                            // New Cloudinary attachment props
                            cardId={cardId}
                            entityType={entityType}
                            entityId={entityId}
                            contextType="comment"
                            contextRef={comment._id || comment.id}
                            enableAttachments={enableCloudinaryAttachments && !!(entityId || cardId)}
                            enableAutoCover={false}
                          />
                        </div>
                        <div className="flex justify-end mt-2 gap-2">
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              setEditingComment(null);
                              setEditContent('');
                            }}
                            className="px-4 py-2 text-gray-600 hover:text-gray-800 rounded-lg transition-colors font-medium flex items-center gap-1"
                          >
                            <X size={16} />
                            Cancel
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleEditSubmit}
                            disabled={isSubmitting || (!editContent?.trim() && !/<img|<a|<div/.test(editContent || ''))}
                            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:shadow-lg transition-all font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSubmitting && <Loader size={16} className="animate-spin" />}
                            Save
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  );
                }
                
                return (
                  <CommentItem
                    key={commentId || `comment-${index}`}
                    comment={comment}
                    index={index}
                    currentUserId={user?._id || user?.id}
                    onEdit={handleEditStart}
                    onDelete={handleDelete}
                    onShowHistory={handleShowHistory}
                  />
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Version History Modal */}
      {showVersionHistory && selectedCommentForHistory && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        }>
          <VersionHistoryModal
            entityType="comment"
            entityId={selectedCommentForHistory._id || selectedCommentForHistory.id}
            isOpen={showVersionHistory}
            onClose={() => {
              setShowVersionHistory(false);
              setSelectedCommentForHistory(null);
            }}
            onRollback={handleVersionRollback}
            title="Comment History"
          />
        </Suspense>
      )}

      <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        .comment-content img {
          max-width: 200px;
          max-height: 200px;
          width: auto;
          height: auto;
          border-radius: 6px;
          display: inline-block;
          margin: 4px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          object-fit: cover;
          transition: all 0.2s ease;
        }
        .comment-content img:hover {
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
          transform: scale(1.05);
        }
      `}</style>
      <DeletePopup
        isOpen={deletePopup.isOpen}
        onCancel={() => setDeletePopup({ isOpen: false, comment: null })}
        onConfirm={handleConfirmDelete}
        itemType="comment"
      />
    </motion.div>
  );
});

CommentsSection.displayName = 'CommentsSection';

export default CommentsSection;
