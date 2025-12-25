import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MoreHorizontal, Edit2, Trash2, Pin, PinOff, Reply, 
  ChevronDown, ChevronUp, History, Clock
} from 'lucide-react';
import Database from '../../services/database';
import CommentEditor from './CommentEditor';
import ReactionBar from './ReactionBar';
import ThreadedReplies from './ThreadedReplies';
import EditHistoryViewer from './EditHistoryViewer';

/**
 * CommentItem - Single comment bubble with reactions, replies, and actions
 */
const CommentItem = ({
  comment,
  currentUser,
  onEdit,
  onDelete,
  onReaction,
  onPinToggle,
  onReply,
  permissions = {},
  users = [],
  theme = 'light',
  isHighlighted = false,
  entityType,
  entityId,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.htmlContent || '');
  const [showActions, setShowActions] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const isDark = theme === 'dark';
  const isOwner = currentUser?._id === comment.user?._id || currentUser?.id === comment.user?._id;
  const canEdit = permissions.canEdit && isOwner;
  const canDelete = permissions.canDelete && (isOwner || currentUser?.role === 'admin');
  const canPin = permissions.canPin;
  const canReact = permissions.canReact !== false;

  // Format date
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
    return d.toLocaleDateString();
  };

  // Handle save edit
  const handleSaveEdit = async () => {
    if (!editContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onEdit(comment._id, editContent);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving edit:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle reply submit
  const handleSubmitReply = async () => {
    if (!replyContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onReply(comment._id, replyContent);
      setReplyContent('');
      setIsReplying(false);
      setShowReplies(true);
    } catch (error) {
      console.error('Error posting reply:', error);
    } finally {
      setSubmitting(false);
    }
  };

  // Get user initials for avatar fallback
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <motion.div
      id={`comment-${comment._id}`}
      className={`comment-item relative rounded-xl p-4 transition-all duration-300 ${
        isDark 
          ? 'bg-gray-800/50 hover:bg-gray-800' 
          : 'bg-gray-50 hover:bg-gray-100'
      } ${
        isHighlighted 
          ? 'ring-2 ring-indigo-500 animate-pulse' 
          : ''
      } ${
        comment.isPinned 
          ? isDark 
            ? 'border-l-4 border-amber-500 bg-amber-900/20' 
            : 'border-l-4 border-amber-500 bg-amber-50'
          : ''
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Pinned Badge */}
      {comment.isPinned && (
        <div className={`flex items-center gap-1 text-xs mb-2 ${
          isDark ? 'text-amber-400' : 'text-amber-600'
        }`}>
          <Pin size={12} />
          <span>Pinned{comment.pinnedBy?.name ? ` by ${comment.pinnedBy.name}` : ''}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${
          isDark ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'
        }`}>
          {comment.user?.avatar ? (
            <img 
              src={comment.user.avatar} 
              alt={comment.user.name} 
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            getInitials(comment.user?.name)
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name & Time */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              {comment.user?.name || 'Unknown User'}
            </span>
            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {formatDate(comment.createdAt)}
            </span>
            {comment.isEdited && (
              <button
                onClick={() => setShowHistory(true)}
                className={`text-xs italic flex items-center gap-1 transition-colors ${
                  isDark 
                    ? 'text-gray-500 hover:text-indigo-400' 
                    : 'text-gray-400 hover:text-indigo-600'
                }`}
                title="View edit history"
              >
                <History size={10} />
                Edited
              </button>
            )}
          </div>

          {/* Comment Content */}
          {isEditing ? (
            <div className="mt-2">
              <CommentEditor
                value={editContent}
                onChange={setEditContent}
                onSubmit={handleSaveEdit}
                onCancel={() => setIsEditing(false)}
                isSubmitting={submitting}
                users={users}
                theme={theme}
                isEditing={true}
                placeholder="Edit your comment..."
              />
            </div>
          ) : (
            <div 
              className={`mt-1 prose prose-sm max-w-none ${
                isDark ? 'prose-invert' : ''
              }`}
              dangerouslySetInnerHTML={{ __html: comment.htmlContent || comment.text }}
            />
          )}

          {/* Reactions */}
          {canReact && !isEditing && (
            <ReactionBar
              reactions={comment.reactions || []}
              currentUserId={currentUser?._id || currentUser?.id}
              onReaction={(emoji, hasReacted) => onReaction(comment._id, emoji, hasReacted)}
              theme={theme}
            />
          )}

          {/* Reply Section */}
          {comment.replyCount > 0 && (
            <button
              onClick={() => setShowReplies(!showReplies)}
              className={`flex items-center gap-1 text-xs mt-2 ${
                isDark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-700'
              }`}
            >
              {showReplies ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}

          {/* Threaded Replies */}
          <AnimatePresence>
            {showReplies && (
              <ThreadedReplies
                parentCommentId={comment._id}
                currentUser={currentUser}
                users={users}
                permissions={permissions}
                theme={theme}
                onReaction={onReaction}
                entityType={entityType}
                entityId={entityId}
              />
            )}
          </AnimatePresence>

          {/* Reply Editor */}
          {isReplying && (
            <div className="mt-3">
              <CommentEditor
                value={replyContent}
                onChange={setReplyContent}
                onSubmit={handleSubmitReply}
                onCancel={() => setIsReplying(false)}
                isSubmitting={submitting}
                users={users}
                theme={theme}
                placeholder="Write a reply..."
                compact
              />
            </div>
          )}
        </div>

        {/* Actions Menu */}
        <AnimatePresence>
          {(showActions || isEditing) && !comment.parentComment && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1"
            >
              {/* Reply Button */}
              {!isEditing && permissions.canComment && (
                <button
                  onClick={() => setIsReplying(!isReplying)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDark 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                      : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
                  }`}
                  title="Reply"
                >
                  <Reply size={16} />
                </button>
              )}

              {/* Pin/Unpin Button */}
              {canPin && !isEditing && (
                <button
                  onClick={() => onPinToggle(comment._id, comment.isPinned)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    comment.isPinned
                      ? isDark 
                        ? 'bg-amber-900/50 text-amber-400 hover:bg-amber-900' 
                        : 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                      : isDark 
                        ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                        : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
                  }`}
                  title={comment.isPinned ? 'Unpin' : 'Pin'}
                >
                  {comment.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                </button>
              )}

              {/* Edit Button */}
              {canEdit && !isEditing && (
                <button
                  onClick={() => {
                    setEditContent(comment.htmlContent || '');
                    setIsEditing(true);
                  }}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDark 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200' 
                      : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
                  }`}
                  title="Edit"
                >
                  <Edit2 size={16} />
                </button>
              )}

              {/* Delete Button */}
              {canDelete && !isEditing && (
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to delete this comment?')) {
                      onDelete(comment._id);
                    }
                  }}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDark 
                      ? 'hover:bg-red-900/50 text-gray-400 hover:text-red-400' 
                      : 'hover:bg-red-100 text-gray-500 hover:text-red-600'
                  }`}
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Edit History Modal */}
      <EditHistoryViewer
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        commentId={comment._id}
        theme={theme}
      />
    </motion.div>
  );
};

export default CommentItem;
