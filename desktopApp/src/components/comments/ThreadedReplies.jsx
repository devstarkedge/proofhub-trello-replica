import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader } from 'lucide-react';
import Database from '../../services/database';

/**
 * ThreadedReplies - Collapsible nested replies for a comment
 */
const ThreadedReplies = ({
  parentCommentId,
  currentUser,
  users = [],
  permissions = {},
  theme = 'light',
  onReaction,
  entityType,
  entityId,
}) => {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const isDark = theme === 'dark';

  // Fetch replies
  const fetchReplies = useCallback(async (pageNum = 1) => {
    try {
      if (pageNum === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const result = await Database.getReplies(parentCommentId, pageNum, 10);
      
      if (pageNum === 1) {
        setReplies(result.replies || []);
      } else {
        setReplies(prev => [...prev, ...(result.replies || [])]);
      }
      
      setHasMore(result.pagination?.hasMore || false);
      setPage(pageNum);
    } catch (error) {
      console.error('Error fetching replies:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [parentCommentId]);

  useEffect(() => {
    fetchReplies(1);
  }, [fetchReplies]);

  // Listen for new replies via socket
  useEffect(() => {
    const handleReplyAdded = (event) => {
      const { parentCommentId: eventParentId, reply } = event.detail;
      if (eventParentId === parentCommentId) {
        setReplies(prev => {
          const exists = prev.some(r => r._id === reply._id);
          if (exists) return prev;
          return [reply, ...prev];
        });
      }
    };

    window.addEventListener('socket-comment-reply-added', handleReplyAdded);
    return () => window.removeEventListener('socket-comment-reply-added', handleReplyAdded);
  }, [parentCommentId]);

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

  // Get user initials
  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mt-3 ml-6 pl-4 border-l-2 border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center gap-2 py-2 text-gray-400">
          <Loader size={14} className="animate-spin" />
          <span className="text-sm">Loading replies...</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={`mt-3 ml-6 pl-4 border-l-2 ${
        isDark ? 'border-gray-700' : 'border-gray-200'
      }`}
    >
      <AnimatePresence>
        {replies.map(reply => (
          <motion.div
            key={reply._id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className={`py-3 ${
              isDark ? 'border-b border-gray-700/50' : 'border-b border-gray-100'
            } last:border-b-0`}
          >
            <div className="flex items-start gap-2">
              {/* Avatar */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                isDark ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'
              }`}>
                {reply.user?.avatar ? (
                  <img 
                    src={reply.user.avatar} 
                    alt={reply.user.name} 
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  getInitials(reply.user?.name)
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    {reply.user?.name || 'Unknown'}
                  </span>
                  <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {formatDate(reply.createdAt)}
                  </span>
                </div>
                
                <div 
                  className={`mt-1 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                  dangerouslySetInnerHTML={{ __html: reply.htmlContent || reply.text }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Load More Button */}
      {hasMore && (
        <button
          onClick={() => fetchReplies(page + 1)}
          disabled={loadingMore}
          className={`mt-2 text-sm flex items-center gap-1 ${
            isDark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-700'
          }`}
        >
          {loadingMore ? (
            <>
              <Loader size={12} className="animate-spin" />
              Loading...
            </>
          ) : (
            'Load more replies'
          )}
        </button>
      )}

      {/* Empty state */}
      {!loading && replies.length === 0 && (
        <div className={`py-2 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          No replies yet
        </div>
      )}
    </motion.div>
  );
};

export default ThreadedReplies;
