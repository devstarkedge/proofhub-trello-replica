import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Pin, ChevronDown, ChevronUp, Loader } from 'lucide-react';
import { toast } from 'react-toastify';
import AuthContext from '../../context/AuthContext';
import Database from '../../services/database';
import commentService from '../../services/commentService';
import CommentItem from './CommentItem';
import CommentEditor from './CommentEditor';
import CommentSkeleton from './CommentSkeleton';

/**
 * CommentSystem - Enterprise-level comment component
 * Supports threading, reactions, pinning, mentions (@User, @Role, @Team), and real-time updates
 */
const CommentSystem = ({
  entityType = 'card', // 'card' | 'subtask' | 'nano' | 'announcement'
  entityId,
  projectName = '',
  contextRef = null,
  users = [],
  roles = [], // Available roles for @Role mentions
  teams = [], // Available teams for @Team mentions
  theme = 'light',
  permissions = {},
  onCommentCountChange = () => {},
  highlightCommentId = null, // Deep link: highlight specific comment
}) => {
  const { user } = useContext(AuthContext);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [showPinned, setShowPinned] = useState(true);
  const [highlightedCommentId, setHighlightedCommentId] = useState(highlightCommentId);
  const containerRef = useRef(null);
  
  // Enhanced users object with roles and teams for mention system
  const mentionData = React.useMemo(() => {
    const userData = Array.isArray(users) ? users : [];
    userData.roles = Array.isArray(roles) ? roles : [];
    userData.teams = Array.isArray(teams) ? teams : [];
    return userData;
  }, [users, roles, teams]);
  
  // Default permissions
  const defaultPermissions = {
    canComment: true,
    canEdit: true,
    canDelete: true,
    canPin: user?.role === 'admin' || user?.role === 'manager',
    canReact: true,
    canMention: true,
    ...permissions,
  };

  // Fetch comments
  const fetchComments = useCallback(async () => {
    if (!entityId) return;
    
    try {
      setLoading(true);
      const data = await commentService.fetchComments(entityType, entityId, true);
      setComments(data || []);
      onCommentCountChange(data?.length || 0);
    } catch (error) {
      console.error('Error fetching comments:', error);
      toast.error('Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, onCommentCountChange]);

  // Load comments on mount
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Subscribe to comment service updates
  useEffect(() => {
    if (!entityId) return;

    const unsubscribe = commentService.onCommentsUpdated(entityType, entityId, (updatedComments, error) => {
      if (error) {
        console.error('Comment update error:', error);
      } else {
        setComments(updatedComments || []);
        onCommentCountChange(updatedComments?.length || 0);
      }
    });

    return unsubscribe;
  }, [entityType, entityId, onCommentCountChange]);

  // Subscribe to real-time socket events
  useEffect(() => {
    const handleCommentAdded = (event) => {
      const { contextRef: eventContextRef, comment } = event.detail;
      if (eventContextRef === entityId || event.detail.cardId === entityId) {
        setComments(prev => {
          // Check if comment already exists
          const exists = prev.some(c => c._id === comment._id);
          if (exists) return prev;
          return [comment, ...prev];
        });
      }
    };

    const handleCommentUpdated = (event) => {
      const { commentId, updates } = event.detail;
      setComments(prev => 
        prev.map(c => c._id === commentId ? { ...c, ...updates } : c)
      );
    };

    const handleCommentDeleted = (event) => {
      const { commentId } = event.detail;
      setComments(prev => prev.filter(c => c._id !== commentId));
    };

    const handleReactionAdded = (event) => {
      const { commentId, reactions } = event.detail;
      setComments(prev =>
        prev.map(c => c._id === commentId ? { ...c, reactions } : c)
      );
    };

    const handleReactionRemoved = (event) => {
      const { commentId, reactions } = event.detail;
      setComments(prev =>
        prev.map(c => c._id === commentId ? { ...c, reactions } : c)
      );
    };

    const handleCommentPinned = (event) => {
      const { commentId, pinnedBy, pinnedAt } = event.detail;
      setComments(prev =>
        prev.map(c => c._id === commentId 
          ? { ...c, isPinned: true, pinnedBy, pinnedAt } 
          : c
        )
      );
    };

    const handleCommentUnpinned = (event) => {
      const { commentId } = event.detail;
      setComments(prev =>
        prev.map(c => c._id === commentId 
          ? { ...c, isPinned: false, pinnedBy: null, pinnedAt: null } 
          : c
        )
      );
    };

    const handleReplyAdded = (event) => {
      const { parentCommentId, reply } = event.detail;
      setComments(prev =>
        prev.map(c => c._id === parentCommentId 
          ? { ...c, replyCount: (c.replyCount || 0) + 1 } 
          : c
        )
      );
    };

    window.addEventListener('socket-comment-added', handleCommentAdded);
    window.addEventListener('socket-comment-updated', handleCommentUpdated);
    window.addEventListener('socket-comment-deleted', handleCommentDeleted);
    window.addEventListener('socket-comment-reaction-added', handleReactionAdded);
    window.addEventListener('socket-comment-reaction-removed', handleReactionRemoved);
    window.addEventListener('socket-comment-pinned', handleCommentPinned);
    window.addEventListener('socket-comment-unpinned', handleCommentUnpinned);
    window.addEventListener('socket-comment-reply-added', handleReplyAdded);

    return () => {
      window.removeEventListener('socket-comment-added', handleCommentAdded);
      window.removeEventListener('socket-comment-updated', handleCommentUpdated);
      window.removeEventListener('socket-comment-deleted', handleCommentDeleted);
      window.removeEventListener('socket-comment-reaction-added', handleReactionAdded);
      window.removeEventListener('socket-comment-reaction-removed', handleReactionRemoved);
      window.removeEventListener('socket-comment-pinned', handleCommentPinned);
      window.removeEventListener('socket-comment-unpinned', handleCommentUnpinned);
      window.removeEventListener('socket-comment-reply-added', handleReplyAdded);
    };
  }, [entityId]);

  // Handle posting new comment
  const handlePostComment = async () => {
    if (!newComment.trim() || posting) return;

    const plainText = newComment.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!plainText) {
      toast.error('Comment cannot be empty');
      return;
    }

    setPosting(true);
    
    try {
      // Optimistic update
      const { tempComment, promise } = await commentService.addCommentOptimistic({
        type: entityType,
        entityId,
        htmlContent: newComment,
        user: {
          _id: user._id || user.id,
          name: user.name,
        }
      });

      setNewComment('');
      
      // Wait for server confirmation
      await promise;
      toast.success('Comment posted');
    } catch (error) {
      console.error('Error posting comment:', error);
      toast.error('Failed to post comment');
    } finally {
      setPosting(false);
    }
  };

  // Handle edit comment
  const handleEditComment = async (commentId, newContent) => {
    try {
      await commentService.updateComment(commentId, newContent, entityType, entityId);
      toast.success('Comment updated');
    } catch (error) {
      console.error('Error updating comment:', error);
      toast.error(error.message || 'Failed to update comment');
    }
  };

  // Handle delete comment
  const handleDeleteComment = async (commentId) => {
    try {
      await commentService.deleteComment(commentId, entityType, entityId);
      toast.success('Comment deleted');
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error(error.message || 'Failed to delete comment');
    }
  };

  // Handle reaction
  const handleReaction = async (commentId, emoji, hasReacted) => {
    try {
      if (hasReacted) {
        await Database.removeReaction(commentId, emoji);
      } else {
        await Database.addReaction(commentId, emoji);
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
      toast.error('Failed to update reaction');
    }
  };

  // Handle pin/unpin
  const handlePinToggle = async (commentId, isPinned) => {
    try {
      if (isPinned) {
        await Database.unpinComment(commentId);
        toast.success('Comment unpinned');
      } else {
        await Database.pinComment(commentId);
        toast.success('Comment pinned');
      }
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast.error(error.message || 'Failed to update pin status');
    }
  };

  // Handle reply
  const handleReply = async (parentCommentId, htmlContent) => {
    try {
      await Database.createReply(parentCommentId, htmlContent);
      toast.success('Reply posted');
    } catch (error) {
      console.error('Error posting reply:', error);
      toast.error('Failed to post reply');
    }
  };

  // Deep link to comment
  const scrollToComment = useCallback((commentId) => {
    setHighlightedCommentId(commentId);
    setTimeout(() => {
      const element = document.getElementById(`comment-${commentId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    
    // Remove highlight after 3 seconds
    setTimeout(() => {
      setHighlightedCommentId(null);
    }, 3000);
  }, []);

  // Handle deep link navigation when prop changes or comments load
  useEffect(() => {
    if (highlightCommentId && !loading && comments.length > 0) {
      scrollToComment(highlightCommentId);
    }
  }, [highlightCommentId, loading, comments.length, scrollToComment]);

  // Separate pinned and regular comments
  const pinnedComments = comments.filter(c => c.isPinned && !c.parentComment);
  const regularComments = comments.filter(c => !c.isPinned && !c.parentComment);

  const isDark = theme === 'dark';

  return (
    <div 
      ref={containerRef}
      className={`comment-system ${isDark ? 'dark' : ''}`}
    >
      {/* Header */}
      <div className={`flex items-center gap-2 mb-4 pb-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <MessageSquare size={18} className={isDark ? 'text-gray-400' : 'text-gray-600'} />
        <h3 className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
          Comments
        </h3>
        <span className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          ({comments.length})
        </span>
      </div>

      {/* Comment Editor */}
      {defaultPermissions.canComment && (
        <div className="mb-6">
          <CommentEditor
            value={newComment}
            onChange={setNewComment}
            onSubmit={handlePostComment}
            isSubmitting={posting}
            users={mentionData}
            placeholder="Write a comment..."
            theme={theme}
          />
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          <CommentSkeleton />
          <CommentSkeleton />
        </div>
      )}

      {/* Comments List */}
      {!loading && (
        <div className="space-y-4">
          {/* Pinned Comments Section */}
          {pinnedComments.length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setShowPinned(!showPinned)}
                className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                  isDark ? 'text-amber-400 hover:text-amber-300' : 'text-amber-600 hover:text-amber-700'
                }`}
              >
                <Pin size={14} />
                Pinned Comments ({pinnedComments.length})
                {showPinned ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              
              <AnimatePresence>
                {showPinned && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3"
                  >
                    {pinnedComments.map(comment => (
                      <CommentItem
                        key={comment._id}
                        comment={comment}
                        currentUser={user}
                        onEdit={handleEditComment}
                        onDelete={handleDeleteComment}
                        onReaction={handleReaction}
                        onPinToggle={handlePinToggle}
                        onReply={handleReply}
                        permissions={defaultPermissions}
                        users={mentionData}
                        theme={theme}
                        isHighlighted={highlightedCommentId === comment._id}
                        entityType={entityType}
                        entityId={entityId}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Regular Comments */}
          <AnimatePresence>
            {regularComments.map(comment => (
              <motion.div
                key={comment._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <CommentItem
                  comment={comment}
                  currentUser={user}
                  onEdit={handleEditComment}
                  onDelete={handleDeleteComment}
                  onReaction={handleReaction}
                  onPinToggle={handlePinToggle}
                  onReply={handleReply}
                  permissions={defaultPermissions}
                  users={mentionData}
                  theme={theme}
                  isHighlighted={highlightedCommentId === comment._id}
                  entityType={entityType}
                  entityId={entityId}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Empty State */}
          {!loading && comments.length === 0 && (
            <div className={`text-center py-8 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
              <p>No comments yet</p>
              <p className="text-sm">Be the first to comment!</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CommentSystem;
