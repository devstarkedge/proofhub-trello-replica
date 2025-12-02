import React, { useState, useContext } from 'react';
import { X, MessageCircle, Send, Trash2, Clock, Calendar, Share2 } from 'lucide-react';
import { formatDistanceToNow, formatDate } from 'date-fns';
import { toast } from 'react-toastify';
import AuthContext from '../context/AuthContext';

const REACTIONS = ['👍', '❤️', '🎉', '🔥', '👀'];

const AnnouncementDetailModal = ({
  isOpen,
  announcement,
  onClose,
  onAddComment,
  onDeleteComment,
  onAddReaction,
  onRemoveReaction,
  isLoading
}) => {
  const { user } = useContext(AuthContext);
  const [commentText, setCommentText] = useState('');
  const [hoveredReaction, setHoveredReaction] = useState(null);

  if (!isOpen || !announcement) return null;

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) {
      toast.error('Comment cannot be empty');
      return;
    }
    await onAddComment(announcement._id, commentText);
    setCommentText('');
  };

  const handleReactionClick = async (emoji) => {
    const userReacted = announcement.reactions
      ?.find(r => r.emoji === emoji)
      ?.users?.some(u => u._id === user._id || u === user._id);

    if (userReacted) {
      await onRemoveReaction(announcement._id, emoji);
    } else {
      await onAddReaction(announcement._id, emoji);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex">
        {/* Left Section - Announcement Content */}
        <div className="flex-1 overflow-y-auto p-6 border-r border-gray-200">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{announcement.title}</h2>
              <div className="flex flex-wrap gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  announcement.category === 'HR'
                    ? 'bg-purple-100 text-purple-700'
                    : announcement.category === 'Urgent'
                    ? 'bg-red-100 text-red-700'
                    : announcement.category === 'System Update'
                    ? 'bg-blue-100 text-blue-700'
                    : announcement.category === 'Events'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {announcement.category}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <X className="w-6 h-6 text-gray-600" />
            </button>
          </div>

          {/* Author and Dates */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
            <div className="flex items-center gap-2">
              <img
                src={announcement.createdBy?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'}
                alt={announcement.createdBy?.name}
                className="w-10 h-10 rounded-full"
              />
              <div>
                <p className="font-semibold text-gray-900">{announcement.createdBy?.name}</p>
                <p className="text-xs text-gray-600">{announcement.createdBy?.title}</p>
              </div>
            </div>
            <div className="text-xs text-gray-600 space-y-1 ml-12">
              <p>
                <Calendar className="w-3 h-3 inline mr-1" />
                Created: {formatDate(new Date(announcement.createdAt), 'PPp')}
              </p>
              <p>
                <Clock className="w-3 h-3 inline mr-1" />
                Expires: {formatDate(new Date(announcement.expiresAt), 'PPp')}
              </p>
              {announcement.scheduledFor && (
                <p>
                  <Clock className="w-3 h-3 inline mr-1" />
                  Scheduled: {formatDate(new Date(announcement.scheduledFor), 'PPp')}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <p className="text-gray-700 whitespace-pre-wrap">{announcement.description}</p>
          </div>

          {/* Attachments */}
          {announcement.attachments && announcement.attachments.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Attachments</h3>
              <div className="grid grid-cols-2 gap-4">
                {announcement.attachments.map((attachment, idx) => (
                  <a
                    key={idx}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  >
                    {attachment.mimetype.startsWith('image/') ? (
                      <img
                        src={attachment.url}
                        alt={attachment.originalName}
                        className="max-w-full max-h-32 rounded"
                      />
                    ) : (
                      <div className="text-center">
                        <p className="text-sm font-medium text-gray-700">{attachment.originalName}</p>
                        <p className="text-xs text-gray-500">{(attachment.size / 1024).toFixed(2)} KB</p>
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Reactions */}
          <div className="mb-6 border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Reactions</h3>
            <div className="flex flex-wrap gap-2">
              {REACTIONS.map(emoji => {
                const reaction = announcement.reactions?.find(r => r.emoji === emoji);
                const userReacted = reaction?.users?.some(u => u._id === user._id || u === user._id);

                return (
                  <button
                    key={emoji}
                    onClick={() => handleReactionClick(emoji)}
                    onMouseEnter={() => setHoveredReaction(emoji)}
                    onMouseLeave={() => setHoveredReaction(null)}
                    className={`px-3 py-1 rounded-lg transition ${
                      userReacted
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-gray-100 border-2 border-transparent hover:bg-gray-200'
                    }`}
                    title={reaction?.users?.map(u => u.name).join(', ')}
                  >
                    <span className="mr-1">{emoji}</span>
                    <span className="text-sm font-medium">{reaction?.count || 0}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Section - Comments */}
        <div className="w-96 flex flex-col bg-gray-50 border-l border-gray-200">
          {/* Comments Header */}
          <div className="flex items-center gap-2 p-4 border-b border-gray-200 bg-white">
            <MessageCircle className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">Comments</h3>
            {announcement.commentsCount > 0 && (
              <span className="ml-auto bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                {announcement.commentsCount}
              </span>
            )}
          </div>

          {/* Comments List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {announcement.comments && announcement.comments.length > 0 ? (
              announcement.comments.map((comment) => (
                <div key={comment._id} className="bg-white rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <img
                        src={comment.author?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'}
                        alt={comment.author?.name}
                        className="w-8 h-8 rounded-full"
                      />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{comment.author?.name}</p>
                        <p className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    {(user._id === comment.author?._id || user.role === 'admin') && (
                      <button
                        onClick={() => onDeleteComment(announcement._id, comment._id)}
                        className="p-1 hover:bg-red-100 rounded text-red-600 transition"
                        title="Delete comment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{comment.text}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No comments yet</p>
              </div>
            )}
          </div>

          {/* Comment Input */}
          {announcement.allowComments && (
            <form onSubmit={handleAddComment} className="p-4 border-t border-gray-200 bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={isLoading || !commentText.trim()}
                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnnouncementDetailModal;
