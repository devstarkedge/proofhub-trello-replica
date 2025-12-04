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

const Card = memo(({ card, onClick, onDelete, compact = false }) => {
  const labelsContainerRef = useRef(null);
  
  // Memoize computed values to prevent recalculation on every render
  const allLabels = useMemo(() => [
    ...(card.labels || []).map(label => ({ text: label, type: 'regular' })),
    ...(card.hasRecurrence ? [{ text: 'Recurring', type: 'recurring' }] : [])
  ], [card.labels, card.hasRecurrence]);

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

  const hasDetails = useMemo(() =>
    (subtaskStats?.total > 0) ||
    card.attachments?.length > 0 ||
    card.comments?.length > 0,
    [subtaskStats, card.attachments, card.comments]
  );

  const isOverdue = useMemo(() =>
    card.dueDate &&
    new Date(card.dueDate) < new Date() &&
    card.status !== "Done",
    [card.dueDate, card.status]
  );

  // Memoize logged time calculation
  const loggedTimeDisplay = useMemo(() => {
    if (!card.loggedTime?.length) return null;
    const hours = card.loggedTime.reduce((total, log) => total + log.hours, 0);
    const minutes = card.loggedTime.reduce((total, log) => total + log.minutes, 0);
    return { hours, minutes };
  }, [card.loggedTime]);

  // Memoize delete handler
  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    onDelete(card._id);
  }, [onDelete, card._id]);

  // Memoize formatted due date
  const formattedDueDate = useMemo(() => 
    card.dueDate ? new Date(card.dueDate).toLocaleDateString() : null,
    [card.dueDate]
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
      whileHover={{ y: -2, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
      onClick={onClick}
      className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md cursor-pointer transition-all group border border-gray-100 relative"
      key={card._id}
    >
      {/* Hover Actions - Positioned top right */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
        {card.dueDate && (
          <motion.div
            key="due-date"
            whileHover={{ scale: 1.05 }}
            className={`flex items-center gap-1 text-xs ${
              isOverdue
                ? "text-red-600 bg-red-50 px-2 py-1 rounded-md font-medium"
                : "text-gray-600 bg-white px-2 py-1 rounded-md shadow-sm border border-gray-100"
            }`}
          >
            <Calendar size={12} />
            <span>{new Date(card.dueDate).toLocaleDateString()}</span>
          </motion.div>
        )}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleDelete}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded bg-white shadow-sm border border-gray-100"
        >
          <Trash2 size={14} />
        </motion.button>
      </div>

      {/* Labels Row */}
      {allLabels.length > 0 && (
        <div ref={labelsContainerRef} className="flex flex-wrap gap-1 items-center mb-3">
          {allLabels.slice(0, visibleLabelsCount).map((label, idx) => (
            <motion.span
              key={`${label.type}-${idx}`}
              whileHover={{ scale: 1.05 }}
              className={`px-2 py-1 text-xs text-white rounded-md font-medium flex items-center gap-1 ${
                label.type === 'recurring' 
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500' 
                  : 'bg-gradient-to-r from-blue-500 to-blue-600'
              }`}
            >
              {label.type === 'recurring' && <RefreshCw size={10} />}
              {label.text}
            </motion.span>
          ))}
          {allLabels.length > visibleLabelsCount && (
            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md font-medium">
              +{allLabels.length - visibleLabelsCount}
            </span>
          )}
        </div>
      )}

      {/* Cover Image - Mid Area */}
      {card.cover && (
        <div className="mb-4 mx-0">
          <div
            className="h-32 sm:h-28 rounded-lg w-full"
            style={{
              background:
                card.cover.type === "color"
                  ? card.cover.value
                  : `url(${card.cover.value})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        </div>
      )}

      {/* Card Title - Slightly Lower */}
      <h4 className="text-sm font-semibold text-gray-900 mb-3 line-clamp-2 leading-relaxed">
        {card.title}
      </h4>

      {/* Assignees */}
      {card.assignees && card.assignees.length > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-lg">
          <div className="flex -space-x-2">
            {card.assignees.slice(0, 3).map((assignee, idx) => (
              <div
                key={assignee._id}
                className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center border-2 border-white"
                title={assignee.name}
              >
                <span className="text-white text-xs font-bold">
                  {assignee.name?.[0]?.toUpperCase()}
                </span>
              </div>
            ))}
            {card.assignees.length > 3 && (
              <div className="w-6 h-6 bg-gray-400 rounded-full flex items-center justify-center border-2 border-white">
                <span className="text-white text-xs font-bold">
                  +{card.assignees.length - 3}
                </span>
              </div>
            )}
          </div>
          <span className="text-xs text-gray-700 font-medium truncate">
            {card.assignees.length === 1
              ? card.assignees[0].name
              : `${card.assignees.length} members`}
          </span>
        </div>
      )}

      {/* Card Badges - Without Status/Priority/Nano */}
      {hasDetails && (
        <div className="flex items-center flex-wrap gap-3 pt-3 border-t border-gray-100">
          {subtaskStats?.total > 0 && (
            <motion.div
              key="subtasks"
              whileHover={{ scale: 1.05 }}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md ${
                subtaskStats.completed === subtaskStats.total
                  ? "bg-green-50 text-green-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              <CheckSquare size={12} />
              <span>
                {subtaskStats.completed}/{subtaskStats.total}
              </span>
            </motion.div>
          )}

          {card.attachments && card.attachments.length > 0 && (
            <motion.div
              key="attachments"
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-1 text-xs text-gray-600"
            >
              <Paperclip size={12} />
              <span>{card.attachments.length}</span>
            </motion.div>
          )}

          {card.comments && card.comments.length > 0 && (
            <motion.div
              key="comments"
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md font-medium"
            >
              <MessageSquare size={12} />
              <span>{card.comments.length}</span>
            </motion.div>
          )}

          {card.loggedTime && card.loggedTime.length > 0 && (
            <motion.div
              key="logged-time"
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-md font-medium "
            >
              <Clock size={12} />
              <span>
                {card.loggedTime.reduce((total, log) => total + log.hours, 0)}h{' '}
                {card.loggedTime.reduce((total, log) => total + log.minutes, 0)}m
              </span>
            </motion.div>
          )}
        </div>
      )}


    </motion.div>
  );
}

);

export default Card;
