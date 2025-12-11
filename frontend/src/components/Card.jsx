import React, { memo, useRef, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Trash2,
  Calendar,
  Tag,
  MessageSquare,
  Paperclip,
  User,
  AlertCircle,
  CheckSquare,
  Clock,
  Eye,
  RefreshCw,
} from "lucide-react";

// Move static values outside component
const MAX_VISIBLE_LABELS = 6;

// Helper function to get text color based on background
const getTextColor = (bgColor) => {
  if (!bgColor || typeof bgColor !== 'string') return '#FFFFFF';
  const hex = bgColor.replace('#', '');
  if (hex.length !== 6 && hex.length !== 3) return '#FFFFFF';
  const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.substr(0, 2), 16);
  const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.substr(2, 2), 16);
  const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
};

const Card = memo(({ card, onClick, onDelete, compact = false }) => {
  const labelsContainerRef = useRef(null);
  
  // Helper to check if a string looks like a MongoDB ObjectId (24 hex characters)
  const isObjectIdString = (str) => {
    return typeof str === 'string' && /^[a-f\d]{24}$/i.test(str);
  };
  
  // Memoize computed values to prevent recalculation on every render
  // Now labels can be objects with name and color, or just strings
  const allLabels = useMemo(() => {
    const cardLabels = (card.labels || [])
      .map(label => {
        // Handle populated label objects (new system)
        if (typeof label === 'object' && label !== null && label.name) {
          return {
            text: label.name,
            color: label.color || '#3B82F6',
            type: 'regular'
          };
        }
        // Skip ObjectId strings (unpopulated references)
        if (isObjectIdString(label)) {
          return null;
        }
        // Legacy string label (actual text labels)
        if (typeof label === 'string' && label.trim()) {
          return {
            text: label,
            color: '#3B82F6',
            type: 'regular'
          };
        }
        return null;
      })
      .filter(Boolean); // Remove null entries
    
    // Add recurring label if applicable
    if (card.hasRecurrence) {
      cardLabels.push({ text: 'Recurring', type: 'recurring', color: null });
    }
    
    return cardLabels;
  }, [card.labels, card.hasRecurrence]);

  const visibleLabelsCount = useMemo(() => 
    Math.min(allLabels.length, MAX_VISIBLE_LABELS), 
    [allLabels.length]
  );

  const subtaskStats = useMemo(() => 
    card.subtaskStats
      ? card.subtaskStats
      : card.subtasks
        ? {
            total: card.subtasks.length,
            completed: card.subtasks.filter((s) => s.completed).length
          }
        : null,
    [card.subtaskStats, card.subtasks]
  );

  // Compute attachments count (support backend-provided attachmentsCount)
  const attachmentsCount = useMemo(() => {
    if (typeof card.attachmentsCount === 'number') return card.attachmentsCount;
    if (Array.isArray(card.attachments)) return card.attachments.length;
    return 0;
  }, [card.attachmentsCount, card.attachments]);

  const hasDetails = useMemo(() =>
    (subtaskStats?.total > 0) ||
    attachmentsCount > 0 ||
    (card.comments && card.comments.length > 0),
    [subtaskStats, attachmentsCount, card.comments]
  );

  const isOverdue = useMemo(() =>
    card.dueDate &&
    new Date(card.dueDate) < new Date() &&
    card.status !== "Done",
    [card.dueDate, card.status]
  );

  // Memoize cover image URL
  const coverImageUrl = useMemo(() => {
    // Check for new coverImage attachment reference
    if (card.coverImage) {
      if (typeof card.coverImage === 'object') {
        // Try secureUrl first, then url, then fallback to other properties
        return card.coverImage.secureUrl || card.coverImage.url || null;
      } else if (typeof card.coverImage === 'string') {
        // If it's just an ID, it might need to be fetched separately
        // For now, we can't display without the full object
        return null;
      }
    }
    // Fallback to legacy cover property
    if (card.cover) {
      return card.cover.type === "color" ? null : card.cover.value;
    }
    return null;
  }, [card.coverImage, card.cover]);

  // Memoize delete handler
  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    onDelete(card._id);
  }, [onDelete, card._id]);

  const [isHovered, setIsHovered] = React.useState(false);

  // Memoize formatter due date
  const formattedDueDate = useMemo(() => 
    card.dueDate ? new Date(card.dueDate).toLocaleDateString() : null,
    [card.dueDate]
  );

  const labelsLimit = isHovered ? allLabels.length : 2;
  const visibleLabels = allLabels.slice(0, labelsLimit);
  const hiddenLabelsCount = allLabels.length - labelsLimit;

  // Reusable labels renderer
  const renderLabels = (isOverlay = false) => (
    <div 
      ref={labelsContainerRef} 
      className={`flex flex-wrap gap-1.5 items-start transition-all duration-300 ${
        isOverlay 
          ? 'absolute top-3 left-3 right-3 z-20' 
          : 'mb-3'
      }`}
    >
      {visibleLabels.map((label, idx) => (
        <motion.span
          key={`${label.type}-${idx}`}
          layout // Animate position changes
          initial={false}
          className={`
            px-1.5 py-[1px] text-[9px] uppercase tracking-wider font-bold rounded-full flex items-center gap-1 shadow-sm backdrop-blur-md border border-white/20 select-none
            ${isOverlay ? 'shadow-sm' : ''}
            ${label.type === 'recurring' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white' : ''}
          `}
          style={label.type !== 'recurring' && label.color ? {
            // High visibility pastel style:
            // Use a solid white background with a heavy tint of the label color
            backgroundColor: isOverlay ? '#ffffff' : (label.color + '15'), 
            color: label.color,
            // Add a subtle border matching the color
            border: `1px solid ${label.color}30`,
            // If overlay, add a colored shadow/glow for pop
            boxShadow: isOverlay ? `0 2px 4px rgba(0,0,0,0.1)` : 'none',
            // Ensure background is distinct
            opacity: 1
          } : undefined}
        >
          {label.type === 'recurring' && <RefreshCw size={8} className={isHovered ? "animate-spin" : ""} />}
          <span className="truncate max-w-[100px]">{label.text}</span>
        </motion.span>
      ))}
      
      {hiddenLabelsCount > 0 && (
        <motion.span 
          layout
          className={`
            px-1.5 py-[1px] text-[9px] font-bold rounded-full shadow-sm border
            ${isOverlay ? 'bg-white text-gray-600 border-gray-200' : 'bg-gray-100 text-gray-600 border-gray-200'}
          `}
        >
          +{hiddenLabelsCount}
        </motion.span>
      )}
    </div>
  );

  if (compact) {
    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all cursor-pointer"
        onClick={onClick}
      >
        <p className="text-sm font-medium text-gray-900">{card.title}</p>
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
          {card.assignees && card.assignees.length > 0 && (
            <div className="flex items-center gap-1">
              <User size={12} />
              <span className="truncate">
                {card.assignees.length === 1
                  ? card.assignees[0].name
                  : `${card.assignees.length} members`}
              </span>
            </div>
          )}
          {card.dueDate && (
            <div className="flex items-center gap-1">
              <Calendar size={12} />
              <span>{new Date(card.dueDate).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: "0 12px 20px -8px rgba(0, 0, 0, 0.15)" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-all duration-300 group ring-1 ring-gray-200 border-0 overflow-hidden min-h-[100px]"
      key={card._id}
    >
      {/* Cover Image - Background Layer */}
      {coverImageUrl && (
        <div className="relative w-full h-[140px] overflow-hidden">
          <div className={`absolute inset-0 transition-all duration-500 ease-out transform ${isHovered ? 'scale-110 blur-[2px] brightness-75' : 'scale-100'}`}>
            <img
              src={coverImageUrl}
              alt="Card cover"
              className="w-full h-full object-cover"
            />
          </div>
          {/* Gradient Overlay - Only visible on hover for text contrast */}
          <div className={`absolute inset-0 bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-300 ${isHovered ? 'opacity-60' : 'opacity-0'}`} />
          
          {/* Overylay Labels */}
          {allLabels.length > 0 && renderLabels(true)}
        </div>
      )}

      {/* Card Content */}
      <div className="relative p-3.5 flex flex-col gap-2">
        {/* Hover Actions - Positioned absolutely relative to card */}
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 z-30 transform translate-x-2 group-hover:translate-x-0">
          {card.dueDate && (
            <div
              className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full shadow-sm backdrop-blur-md ${
                isOverdue
                  ? "text-red-600 bg-red-50 border border-red-100"
                  : "text-gray-700 bg-white/90 border border-gray-200"
              }`}
            >
              <Calendar size={10} />
              <span>{new Date(card.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>
          )}
          <button
            onClick={handleDelete}
            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full bg-white/90 shadow-sm border border-gray-200 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>

        {/* Labels (If no cover) */}
        {!coverImageUrl && allLabels.length > 0 && renderLabels(false)}

        {/* Card Title */}
        <h4 className="text-[14px] leading-snug font-semibold text-gray-800 line-clamp-2 group-hover:text-blue-600 transition-colors">
          {card.title}
        </h4>

        {/* Footer Info: Assignees & Badges */}
        <div className="flex items-center justify-between mt-1 pt-2 border-t border-gray-100">
          {/* Assignees */}
          <div className="flex -space-x-1.5">
            {card.assignees?.slice(0, 3).map((assignee) => {
              // Single uniform gradient as requested
              const colorClass = 'bg-gradient-to-br from-blue-500 to-indigo-600';

              return (
                <div
                  key={assignee._id}
                  className={`w-6 h-6 rounded-full ring-2 ring-white flex items-center justify-center overflow-hidden ${
                    assignee.avatar ? 'bg-gray-100' : colorClass
                  }`}
                  title={assignee.name}
                >
                  {assignee.avatar ? (
                     <img src={assignee.avatar} alt={assignee.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-bold text-white shadow-sm">
                      {assignee.name?.[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
              );
            })}
            {card.assignees?.length > 3 && (
              <div className="w-6 h-6 rounded-full ring-2 ring-white bg-gray-50 flex items-center justify-center">
                <span className="text-[9px] font-bold text-gray-500">+{card.assignees.length - 3}</span>
              </div>
            )}
          </div>

          {/* Indicators */}
          {(hasDetails || card.dueDate) && (
            <div className="flex items-center gap-3 text-gray-400">
               {/* Show separate date if not in hover menu (fallback) or if compact view needed */}
               {!isHovered && card.dueDate && (
                  <div className={`flex items-center gap-1 text-[10px] font-medium ${isOverdue ? "text-red-500" : ""}`}>
                    <Clock size={12} strokeWidth={2.5} />
                    <span>{new Date(card.dueDate).getDate()} {new Date(card.dueDate).toLocaleDateString(undefined, { month: 'short' })}</span>
                  </div>
               )}

               {subtaskStats?.total > 0 && (
                <div className={`flex items-center gap-1 text-[10px] font-medium ${
                   subtaskStats.completed === subtaskStats.total ? "text-green-600" : ""
                }`}>
                  <CheckSquare size={12} strokeWidth={2.5} />
                  <span>{subtaskStats.completed}/{subtaskStats.total}</span>
                </div>
              )}
              
              {attachmentsCount > 0 && (
                <div className="flex items-center gap-0.5">
                  <Paperclip size={12} strokeWidth={2.5} />
                  <span className="text-[10px] font-medium">{attachmentsCount}</span>
                </div>
              )}

              {card.comments?.length > 0 && (
                 <div className="flex items-center gap-0.5">
                 <MessageSquare size={12} strokeWidth={2.5} />
                 <span className="text-[10px] font-medium">{card.comments.length}</span>
               </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

);

export default Card;
