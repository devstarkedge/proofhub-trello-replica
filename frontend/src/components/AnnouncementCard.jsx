import React from 'react';
import { Pin, Clock, Users, MessageCircle, Paperclip, X } from 'lucide-react';
import { formatDistanceToNow, formatDate } from 'date-fns';

const AnnouncementCard = ({
  announcement,
  onOpen,
  onPin,
  onArchive,
  onDelete,
  userRole,
  userId,
  isUserAdmin
}) => {
  const handleReactionClick = (emoji) => {
    onOpen?.(announcement._id);
  };

  const uniqueReactions = React.useMemo(() => {
    if (!announcement.reactions || announcement.reactions.length === 0) return [];
    
    // Deduplicate reactions to prevent duplicate key errors
    const reactionMap = {};
    
    announcement.reactions.forEach(reaction => {
      if (!reactionMap[reaction.emoji]) {
        reactionMap[reaction.emoji] = { ...reaction };
      } else {
        // Validation: Merge counts
        reactionMap[reaction.emoji].count += reaction.count;
        
        // Merge users for tooltip
        if (reaction.users) {
          const existingIds = new Set((reactionMap[reaction.emoji].users || []).map(u => (u._id || u).toString()));
          const newUsers = reaction.users.filter(u => !existingIds.has((u._id || u).toString()));
          reactionMap[reaction.emoji].users = [...(reactionMap[reaction.emoji].users || []), ...newUsers];
        }
      }
    });

    return Object.values(reactionMap);
  }, [announcement.reactions]);

  const canEdit = isUserAdmin || announcement.createdBy?._id === userId;

  return (
    <div
      className={`bg-white border-2 rounded-lg p-4 cursor-pointer transition-all hover:shadow-lg ${
        announcement.isPinned
          ? 'border-blue-400 bg-blue-50 shadow-md'
          : 'border-gray-200 hover:border-gray-300'
      }`}
      onClick={() => onOpen?.(announcement._id)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          {announcement.isPinned && (
            <Pin className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" fill="currentColor" />
          )}
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-1">{announcement.title}</h3>
            <div className="flex flex-wrap gap-2 items-center mb-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
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
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(announcement.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        {canEdit && (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {onArchive && (
              <button
                onClick={() => onArchive(announcement._id)}
                className="p-2 hover:bg-gray-100 rounded-md transition"
                title="Archive"
              >
                <Clock className="w-4 h-4 text-gray-600" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(announcement._id)}
                className="p-2 hover:bg-red-100 rounded-md transition"
                title="Delete"
              >
                <X className="w-4 h-4 text-red-600" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      <p className="text-gray-700 text-sm mb-3 line-clamp-2">
        {announcement.description}
      </p>

      {/* Attachments Preview */}
      {announcement.attachments && announcement.attachments.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
          <Paperclip className="w-4 h-4" />
          <span>{announcement.attachments.length} attachment{announcement.attachments.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
        {/* Reactions */}
        <div className="flex gap-2 items-center">
          {uniqueReactions.length > 0 ? (
            uniqueReactions.map((reaction) => (
              <button
                key={reaction.emoji}
                onClick={(e) => {
                  e.stopPropagation();
                  handleReactionClick(reaction.emoji);
                }}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm transition flex items-center gap-1"
                title={reaction.users?.map(u => u.name).join(', ')}
              >
                <span>{reaction.emoji}</span>
                <span className="text-xs text-gray-600">{reaction.count}</span>
              </button>
            ))
          ) : (
            <span className="text-xs text-gray-500">No reactions</span>
          )}
        </div>

        {/* Comments and Pin */}
        <div className="flex items-center gap-3">
          {announcement.commentsCount > 0 && (
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <MessageCircle className="w-4 h-4" />
              <span>{announcement.commentsCount}</span>
            </div>
          )}
          {announcement.subscribers?.users?.length > 0 && (
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <Users className="w-4 h-4" />
              <span>{announcement.subscribers.users.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expiry Info */}
      <div className="mt-2 text-xs text-gray-500">
        Expires: {formatDate(new Date(announcement.expiresAt), 'MMM d, yyyy')}
      </div>
    </div>
  );
};

export default AnnouncementCard;
