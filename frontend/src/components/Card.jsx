import React, { memo, useRef, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Trash2,
  Calendar,
  MessageSquare,
  Paperclip,
  CheckSquare,
  Clock,
  RefreshCw,
  MoreHorizontal,
  RotateCcw
} from "lucide-react";

import DeletePopup from "./ui/DeletePopup";
import Avatar from "./Avatar";

// Helper to get text color based on background
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

const Card = memo(({ card, onClick, onDelete, onRestore, isDragging, isArchivedView = false }) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [showDeletePopup, setShowDeletePopup] = React.useState(false);
  const [restoreLoading, setRestoreLoading] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  
  // Check if card is optimistic/temporary (not yet saved to database)
  const isOptimistic = card.isOptimistic || (card._id && card._id.toString().startsWith('temp-'));
  
  // Memoize computed values
  const allLabels = useMemo(() => {
    const cardLabels = (card.labels || [])
      .map(label => {
        if (typeof label === 'object' && label !== null && label.name) {
          return {
            text: label.name,
            color: label.color || '#3B82F6',
            type: 'regular'
          };
        }
        if (typeof label === 'string' && label.trim() && !/^[a-f\d]{24}$/i.test(label)) {
          return {
            text: label,
            color: '#3B82F6',
            type: 'regular'
          };
        }
        return null;
      })
      .filter(Boolean);
    
    if (card.hasRecurrence) {
      cardLabels.push({ text: 'Recurring', type: 'recurring', color: null });
    }
    
    return cardLabels;
  }, [card.labels, card.hasRecurrence]);

  const stats = useMemo(() => {
    const subs = card.subtaskStats || (card.subtasks ? {
      total: card.subtasks.length,
      completed: card.subtasks.filter(s => s.completed).length
    } : null);

    const attCount = typeof card.attachmentsCount === 'number' ? card.attachmentsCount : (card.attachments?.length || 0);

    return {
      subtasks: subs,
      comments: card.comments?.length || 0,
      attachments: attCount,
      hasDetails: (subs?.total > 0) || attCount > 0 || (card.comments?.length > 0)
    };
  }, [card.subtaskStats, card.subtasks, card.attachmentsCount, card.attachments, card.comments]);

  const isOverdue = useMemo(() =>
    card.dueDate &&
    new Date(card.dueDate) < new Date() &&
    card.status !== "Done",
    [card.dueDate, card.status]
  );

  const autoDeleteCountdown = useMemo(() => {
    if (!isArchivedView || !card.autoDeleteAt) return null;
    const autoDeleteDate = new Date(card.autoDeleteAt);
    if (Number.isNaN(autoDeleteDate.getTime())) return null;
    const ms = autoDeleteDate.getTime() - Date.now();
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Deleting soon';
    if (days === 1) return 'Auto-deletes in 1 day';
    return `Auto-deletes in ${days} days`;
  }, [card.autoDeleteAt, isArchivedView]);

  const coverImageUrl = useMemo(() => {
    if (card.coverImage) {
      if (typeof card.coverImage === 'object') {
        return card.coverImage.secureUrl || card.coverImage.url || null;
      }
    }
    if (card.cover && card.cover.type !== "color") {
      return card.cover.value;
    }
    return null;
  }, [card.coverImage, card.cover]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    setShowDeletePopup(true);
  }, []);

  const handleRestore = useCallback(async (e) => {
    e.stopPropagation();
    if (!onRestore || restoreLoading) return;
    setRestoreLoading(true);
    try {
      await onRestore(card._id);
    } finally {
      setRestoreLoading(false);
    }
  }, [card._id, onRestore, restoreLoading]);

  const renderLabels = (isOverlay = false) => {
    // Determine how many labels to show
    // If overlay and NOT hovered: limit to 2
    // Otherwise (hovered or not overlay): show all
    const visibleLabels = allLabels.slice(0, isOverlay && !isHovered ? 2 : allLabels.length);
    const hiddenCount = allLabels.length - 2;
    const showCount = isOverlay && !isHovered && hiddenCount > 0;

    return (
      <div className={`flex flex-wrap gap-1.5 ${isOverlay ? 'absolute top-2 left-2 right-2 z-10' : 'mb-2.5'}`}>
        {visibleLabels.map((label, idx) => (
          <span
            key={`${label.type}-${idx}`}
            className={`
              px-2 py-0.5 text-[10px] font-bold rounded-md flex items-center gap-1 shadow-sm backdrop-blur-md transition-transform
              ${label.type === 'recurring' ? 'bg-gradient-to-r from-orange-500 to-yellow-500 text-white' : ''}
            `}
            style={label.type !== 'recurring' ? {
              backgroundColor: isOverlay ? 'rgba(255, 255, 255, 0.95)' : (label.color + '20'),
              color: isOverlay ? label.color : label.color,
              border: `1px solid ${isOverlay ? 'transparent' : label.color + '30'}`
            } : undefined}
          >
            {label.type === 'recurring' && <RefreshCw size={8} className="animate-spin-slow" />}
            <span className="truncate max-w-[80px]">{label.text}</span>
          </span>
        ))}
        
        {/* +N Badge */}
        {showCount && (
           <span
            className="w-5 h-5 text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm backdrop-blur-md bg-orange-200 text-orange-800"
          >
            +{hiddenCount}
          </span>
        )}
      </div>
    );
  };

  return (
    <motion.div
      layoutId={card._id}
      whileHover={{ y: isOptimistic ? 0 : -2 }}
      onMouseEnter={() => !isOptimistic && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={isOptimistic ? undefined : onClick}
      className={`
        relative bg-white rounded-xl overflow-hidden group/card border border-gray-100/50
        bg-gradient-to-br from-white to-gray-50/50
        ${isOptimistic ? 'cursor-wait opacity-60 animate-pulse' : 'cursor-pointer'}
        transition-all duration-200
        ${isDragging ? 'shadow-2xl ring-2 ring-purple-500/20 rotate-2 !opacity-90' : 'shadow-sm hover:shadow-md hover:border-gray-200'}
      `}
    >
      {/* Loading overlay for optimistic cards */}
      {isOptimistic && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center">
          <div className="flex items-center gap-2 text-gray-600">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-xs font-medium">Creating...</span>
          </div>
        </div>
      )}

      {/* Cover Image */}
      {coverImageUrl && (
        <div className="relative h-32 w-full overflow-hidden">
          <div className={`absolute inset-0 transition-transform duration-500 ${isHovered ? 'scale-105 blur-[2px]' : 'scale-100 blur-0'}`}>
            <img src={coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300" />
          {allLabels.length > 0 && renderLabels(true)}
        </div>
      )}

      {/* Content */}
      <div className={`p-3.5 relative ${coverImageUrl ? 'pt-2' : ''}`}>
        
        {/* Floating Actions on Hover */}
        <div className={`absolute top-2 right-2 flex gap-1 z-20 transition-all duration-200 ${isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
           {/* Date moves here on hover (only show in active view) */}
           {!isArchivedView && card.dueDate && (
             <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-1 rounded-md shadow-sm border backdrop-blur-md transition-colors ${isOverdue ? "bg-red-50 text-red-600 border-red-100" : "bg-white/90 text-gray-500 border-gray-200"}`}>
               <Clock size={11} strokeWidth={2.5} />
               <span>{new Date(card.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
             </div>
           )}
           
           {/* Archive-specific buttons */}
           {isArchivedView && (
             <>
               <button 
                 onClick={handleRestore} 
                 disabled={restoreLoading}
                 className="p-1.5 bg-white/90 hover:bg-green-50 text-gray-400 hover:text-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm border border-gray-200 backdrop-blur-sm transition-colors"
                 title="Restore task"
               >
                 <RotateCcw size={13} />
               </button>
               <button 
                 onClick={handleDelete}
                 className="p-1.5 bg-white/90 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg shadow-sm border border-gray-200 backdrop-blur-sm transition-colors"
                 title="Delete task"
               >
                 <Trash2 size={13} />
               </button>
             </>
           )}
           
           {/* Regular delete button for active view */}
           {!isArchivedView && (
             <button 
               onClick={handleDelete} 
               className="p-1.5 bg-white/90 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg shadow-sm border border-gray-200 backdrop-blur-sm transition-colors"
             >
               <Trash2 size={13} />
             </button>
           )}
        </div>

        {/* Labels (if no cover) */}
        {!coverImageUrl && allLabels.length > 0 && renderLabels(false)}

        {/* Title */}
        <h4 className={`text-[14px] leading-snug font-medium text-gray-800 line-clamp-2 mb-3 group-hover/card:text-purple-700 transition-colors ${!coverImageUrl && allLabels.length === 0 ? 'mt-1' : ''}`}>
          {card.title}
        </h4>

        {/* Archive countdown (read-only) */}
        {autoDeleteCountdown && (
          <div className="mb-3 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-100 rounded-md">
            <Clock size={12} />
            <span>{autoDeleteCountdown}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 mt-auto border-t border-gray-100/60">
          
          {/* Members */}
          <div className="flex items-center gap-1">
            {card.assignees?.length === 1 ? (
              // Single Assignee - Show Name
              <>
                <Avatar
                  src={card.assignees[0].avatar}
                  name={card.assignees[0].name}
                  size="xs"
                  showBadge={false}
                  className=""
                />
                <span className="text-[11px] text-gray-600 font-medium truncate max-w-[100px]">{card.assignees[0].name}</span>
              </>
            ) : (
              // Multiple Assignees - Show Stack + Count
              <>
                <div className="flex -space-x-2">
                  {card.assignees?.slice(0, 3).map((assignee) => (
                    <Avatar
                      key={assignee._id}
                      src={assignee.avatar}
                      name={assignee.name}
                      size="xs"
                      showBadge={false}
                      className=""
                    />
                  ))}
                  {card.assignees?.length > 3 && (
                    <div className="w-6 h-6 rounded-full ring-2 ring-white bg-gray-50 flex items-center justify-center text-[9px] font-bold text-gray-500 shadow-sm">
                      +{card.assignees.length - 3}
                    </div>
                  )}
                </div>
                {card.assignees?.length > 0 && (
                  <span className="text-[10px] text-gray-500 font-medium whitespace-nowrap">{card.assignees.length} members</span>
                )}
              </>
            )}
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1 text-gray-500 flex-shrink-0">
            {/* Date - Hidden on Hover */}
            {card.dueDate && (
               <div className={`flex items-center gap-1 text-[11px] font-medium px-1 py-0.5 rounded-md group-hover/card:hidden ${isOverdue ? "text-red-600 bg-red-50" : "bg-gray-50 text-gray-500"}`}>
                 <Clock size={12} strokeWidth={2.5} />
                 <span>{new Date(card.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
               </div>
            )}
            
            {/* Logged Time - Shown on Hover */}
             <div className="hidden group-hover/card:flex items-center gap-1 text-[11px] font-bold px-1 py-0.5 rounded-md bg-green-50 text-green-600 border border-green-100">
               <Clock size={12} strokeWidth={2.5} />
               <span>{(() => {
                 const totalMinutes = card.loggedTime?.reduce((acc, log) => acc + (log.hours * 60) + log.minutes, 0) || 0;
                 const h = Math.floor(totalMinutes / 60);
                 const m = totalMinutes % 60;
                 return `${h}h${m > 0 ? ` ${m}m` : ''}`;
               })()}</span>
             </div>
            
            {stats.subtasks?.total > 0 && (
              <div className="flex items-center gap-1 text-[11px] font-medium" title="Subtasks">
                <CheckSquare size={14} className={stats.subtasks.completed === stats.subtasks.total ? 'text-green-500' : 'text-gray-400'} />
                <span>{stats.subtasks.completed}/{stats.subtasks.total}</span>
              </div>
            )}

            {(stats.attachments > 0 || stats.comments > 0) && (
              <div className="flex items-center gap-1">
                 {stats.attachments > 0 && (
                   <div className="flex items-center gap-0.5">
                     <Paperclip size={12} />
                     <span className="text-[11px] font-medium">{stats.attachments}</span>
                   </div>
                 )}
                 {stats.comments > 0 && (
                    <div className="flex items-center gap-0.5">
                      <MessageSquare size={12} />
                      <span className="text-[11px] font-medium">{stats.comments}</span>
                    </div>
                 )}
              </div>
            )}
          </div>
        </div>
      </div>
      <DeletePopup
        isOpen={showDeletePopup}
        onCancel={(e) => {
           if (e && e.stopPropagation) e.stopPropagation();
           setShowDeletePopup(false);
        }}
        onConfirm={() => {
          onDelete(card._id, { skipConfirm: true });
          setShowDeletePopup(false);
        }}
        itemType="card"
        // isLoading={isDeleting} // We don't have isDeleting state here, assume optimistic or parent handles
        preventCloseOnOverlay={true}
      />
    </motion.div>
  );
});

export default Card;
