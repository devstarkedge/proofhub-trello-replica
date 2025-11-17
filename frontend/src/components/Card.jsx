import React, { memo } from "react";
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
} from "lucide-react";

const Card = memo(({ card, onClick, onDelete, compact = false }) => {
  const hasDetails =
    card.labels?.length > 0 ||
    card.dueDate ||
    card.subtasks?.length > 0 ||
    card.attachments?.length > 0 ||
    card.comments?.length > 0;

  const getPriorityConfig = (priority) => {
    switch (priority) {
      case "High":
        return {
          bg: "bg-red-50",
          text: "text-red-700",
          border: "border-red-200",
          icon: "text-red-500",
        };
      case "Medium":
        return {
          bg: "bg-yellow-50",
          text: "text-yellow-700",
          border: "border-yellow-200",
          icon: "text-yellow-500",
        };
      case "Low":
        return {
          bg: "bg-green-50",
          text: "text-green-700",
          border: "border-green-200",
          icon: "text-green-500",
        };
      default:
        return {
          bg: "bg-gray-50",
          text: "text-gray-700",
          border: "border-gray-200",
          icon: "text-gray-500",
        };
    }
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case "done":
        return {
          bg: "bg-green-100",
          text: "text-green-800",
          icon: CheckSquare,
        };
      case "in-progress":
        return { bg: "bg-blue-100", text: "text-blue-800", icon: Clock };
      case "review":
        return { bg: "bg-purple-100", text: "text-purple-800", icon: Eye };
      case "todo":
        return { bg: "bg-gray-100", text: "text-gray-800", icon: AlertCircle };
      default:
        // For custom statuses, use a neutral style and capitalize the status
        return {
          bg: "bg-indigo-100",
          text: "text-indigo-800",
          icon: Tag,
          displayText: status.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        };
    }
  };

  const isOverdue =
    card.dueDate &&
    new Date(card.dueDate) < new Date() &&
    card.status !== "Done";

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
          {card.priority && (
            <span
              className={`px-2 py-0.5 rounded-full ${
                getPriorityConfig(card.priority).bg
              } ${getPriorityConfig(card.priority).text}`}
            >
              {card.priority}
            </span>
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

  const priorityConfig = card.priority
    ? getPriorityConfig(card.priority)
    : null;
  const statusConfig = card.status ? getStatusConfig(card.status) : null;
  const StatusIcon = statusConfig?.icon;

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
      onClick={onClick}
      className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md cursor-pointer transition-all group border border-gray-100"
      key={card._id}
    >
      {/* Card Cover */}
      {card.cover && (
        <div
          className="h-24 rounded-lg mx-4 -mt-4 mb-4"
          style={{
            background:
              card.cover.type === "color"
                ? card.cover.value
                : `url(${card.cover.value})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}

      {/* Labels */}
      {card.labels && card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {card.labels.slice(0, 3).map((label, idx) => (
            <motion.span
              key={idx}
              whileHover={{ scale: 1.05 }}
              className="px-2 py-1 text-xs bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-md font-medium"
            >
              {label}
            </motion.span>
          ))}
          {card.labels.length > 3 && (
            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md font-medium">
              +{card.labels.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Card Title */}
      <div className="flex justify-between items-start gap-2 mb-3">
        <h4 className="text-sm font-semibold text-gray-900 flex-1 line-clamp-2 leading-relaxed">
          {card.title}
        </h4>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(card._id);
          }}
          className="transition-opacity p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
        >
          <Trash2 size={14} />
        </motion.button>
      </div>

      {/* Status & Priority */}
      <div className="flex items-center gap-2 mb-3">
        {statusConfig && (
          <span
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md font-medium ${statusConfig.bg} ${statusConfig.text}`}
          >
            {StatusIcon && <StatusIcon size={12} />}
            {statusConfig.displayText || card.status}
          </span>
        )}
        {priorityConfig && (
          <span
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border font-medium ${priorityConfig.bg} ${priorityConfig.text} ${priorityConfig.border}`}
          >
            <AlertCircle size={12} className={priorityConfig.icon} />
            {card.priority}
          </span>
        )}
      </div>

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

      {/* Card Badges */}
      {hasDetails && (
        <div className="flex items-center flex-wrap gap-3 pt-3 border-t border-gray-100">
          {card.dueDate && (
            <motion.div
              key="due-date"
              whileHover={{ scale: 1.05 }}
              className={`flex items-center gap-1 text-xs ${
                isOverdue
                  ? "text-red-600 bg-red-50 px-2 py-1 rounded-md font-medium"
                  : "text-gray-600"
              }`}
            >
              <Calendar size={12} />
              <span>{new Date(card.dueDate).toLocaleDateString()}</span>
            </motion.div>
          )}

          {card.subtasks && card.subtasks.length > 0 && (
            <motion.div
              key="subtasks"
              whileHover={{ scale: 1.05 }}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md ${
                card.subtasks.every((s) => s.completed)
                  ? "bg-green-50 text-green-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              <CheckSquare size={12} />
              <span>
                {card.subtasks.filter((s) => s.completed).length}/
                {card.subtasks.length}
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
              className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-md font-medium"
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
