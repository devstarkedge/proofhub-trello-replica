import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SmilePlus } from 'lucide-react';
import Avatar from '../Avatar';

const AVAILABLE_EMOJIS = ['👍', '❤️', '😂', '🚀', '😮', '😢'];

/**
 * ReactionBar - Enhanced emoji reactions with "who reacted" popover
 * Features: Hover popover showing reactors, smooth animations, mobile-friendly
 */
const ReactionBar = ({
  reactions = [],
  currentUserId,
  onReaction,
  theme = 'light',
  compact = false,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [hoveredEmoji, setHoveredEmoji] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const isDark = theme === 'dark';

  // Check if current user has reacted with an emoji
  const hasUserReacted = (emoji) => {
    const reaction = reactions.find(r => r.emoji === emoji);
    if (!reaction) return false;
    return reaction.users?.some(u => 
      (u._id || u).toString() === currentUserId?.toString()
    );
  };

  // Handle emoji click
  const handleEmojiClick = (emoji) => {
    const hasReacted = hasUserReacted(emoji);
    onReaction(emoji, hasReacted);
    setShowPicker(false);
  };

  // Get reaction data for an emoji
  const getReactionData = (emoji) => {
    return reactions.find(r => r.emoji === emoji);
  };

  // Deduplicate reactions to prevent duplicate key errors
  const displayedReactions = React.useMemo(() => {
    if (!reactions || reactions.length === 0) return [];
    
    const reactionMap = {};
    
    reactions.forEach(reaction => {
      // Skip potentially invalid reactions
      if (!reaction || !reaction.emoji) return;

      if (!reactionMap[reaction.emoji]) {
        reactionMap[reaction.emoji] = { ...reaction };
      } else {
        // Merge counts
        reactionMap[reaction.emoji].count += (reaction.count || 0);
        
        // Merge users for tooltip
        if (reaction.users) {
          const existingIds = new Set((reactionMap[reaction.emoji].users || []).map(u => (u._id || u).toString()));
          const newUsers = reaction.users.filter(u => !existingIds.has((u._id || u).toString()));
          reactionMap[reaction.emoji].users = [...(reactionMap[reaction.emoji].users || []), ...newUsers];
        }
      }
    });

    return Object.values(reactionMap).filter(r => r.count > 0);
  }, [reactions]);

  // Handle hover enter
  const handleHoverEnter = (emoji) => {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredEmoji(emoji);
    }, 300);
  };

  // Handle hover leave
  const handleHoverLeave = () => {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredEmoji(null);
    }, 150);
  };

  // Get user display names for reaction popover
  const getReactorNames = (reaction) => {
    if (!reaction?.users || reaction.users.length === 0) return [];
    
    return reaction.users.map(user => {
      if (typeof user === 'string') return { id: user, name: 'User' };
      return {
        id: user._id || user.id,
        name: user.name || 'Unknown',
        avatar: user.avatar
      };
    });
  };

  return (
    <div className="reaction-bar flex items-center gap-1 mt-2 flex-wrap">
      {/* Displayed Reactions */}
      {displayedReactions.map(reaction => {
        const userReacted = hasUserReacted(reaction.emoji);
        const reactors = getReactorNames(reaction);
        const isHovered = hoveredEmoji === reaction.emoji;
        
        return (
          <div
            key={reaction.emoji}
            className="relative"
            onMouseEnter={() => handleHoverEnter(reaction.emoji)}
            onMouseLeave={handleHoverLeave}
          >
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleEmojiClick(reaction.emoji)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors ${
                userReacted
                  ? isDark
                    ? 'bg-indigo-900/50 border border-indigo-500 text-indigo-300'
                    : 'bg-indigo-100 border border-indigo-300 text-indigo-700'
                  : isDark
                    ? 'bg-gray-700/50 hover:bg-gray-700 text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            >
              <span className="text-base">{reaction.emoji}</span>
              <span className="text-xs font-semibold">{reaction.count}</span>
            </motion.button>

            {/* Who Reacted Popover */}
            <AnimatePresence>
              {isHovered && reactors.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 rounded-lg shadow-xl z-50 whitespace-nowrap ${
                    isDark 
                      ? 'bg-gray-800 border border-gray-700' 
                      : 'bg-white border border-gray-200'
                  }`}
                  onMouseEnter={() => {
                    clearTimeout(hoverTimeoutRef.current);
                  }}
                  onMouseLeave={handleHoverLeave}
                >
                  {/* Arrow */}
                  <div className={`absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 
                    border-l-[6px] border-l-transparent 
                    border-r-[6px] border-r-transparent 
                    border-t-[6px] ${isDark ? 'border-t-gray-800' : 'border-t-white'}`} 
                  />
                  
                  <div className="text-xs font-medium mb-1.5 text-center opacity-60">
                    {reaction.emoji} Reactions
                  </div>
                  
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {reactors.slice(0, 10).map((reactor, idx) => (
                      <div 
                        key={reactor.id || idx}
                        className="flex items-center gap-2 py-0.5"
                      >
                        <Avatar 
                          src={reactor.avatar} 
                          name={reactor.name} 
                          size="xs"
                          showBadge={false}
                        />
                        <span className={`text-xs font-medium ${
                          isDark ? 'text-gray-200' : 'text-gray-700'
                        }`}>
                          {reactor.id === currentUserId ? 'You' : reactor.name}
                        </span>
                      </div>
                    ))}
                    {reactors.length > 10 && (
                      <div className={`text-xs text-center py-1 ${
                        isDark ? 'text-gray-500' : 'text-gray-400'
                      }`}>
                        +{reactors.length - 10} more
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Add Reaction Button */}
      <div className="relative">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowPicker(!showPicker)}
          className={`p-1.5 rounded-full transition-colors ${
            isDark
              ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
              : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
          }`}
          title="Add reaction"
        >
          <SmilePlus size={16} />
        </motion.button>

        {/* Emoji Picker */}
        <AnimatePresence>
          {showPicker && (
            <>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowPicker(false)} 
              />
              
              {/* Picker */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 5 }}
                className={`absolute bottom-full left-0 mb-2 p-2 rounded-xl shadow-lg z-50 flex gap-1 ${
                  isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                }`}
              >
                {AVAILABLE_EMOJIS.map(emoji => {
                  const userReacted = hasUserReacted(emoji);
                  const existingReaction = getReactionData(emoji);
                  return (
                    <motion.button
                      key={emoji}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleEmojiClick(emoji)}
                      className={`relative p-2 text-xl rounded-lg transition-colors ${
                        userReacted
                          ? isDark
                            ? 'bg-indigo-900/50 ring-1 ring-indigo-500'
                            : 'bg-indigo-100 ring-1 ring-indigo-300'
                          : isDark
                            ? 'hover:bg-gray-700'
                            : 'hover:bg-gray-100'
                      }`}
                    >
                      {emoji}
                      {/* Count badge */}
                      {existingReaction?.count > 0 && (
                        <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold rounded-full ${
                          isDark 
                            ? 'bg-gray-600 text-gray-200' 
                            : 'bg-gray-300 text-gray-700'
                        }`}>
                          {existingReaction.count}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ReactionBar;
