import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Loader,
  Edit2,
  CheckCircle,
  Trash2,
  Tag,
  Users,
  Clock,
  AlertCircle,
  ArrowRight,
  PlusCircle,
  MinusCircle,
  Flag,
  Calendar,
  Link as LinkIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const ActivitySection = ({ activities, loading, teamMembers = [] }) => {
  const [expandedActivities, setExpandedActivities] = useState({});

  const toggleExpanded = (activityId) => {
    setExpandedActivities((prev) => ({
      ...prev,
      [activityId]: !prev[activityId],
    }));
  };

  const getActivityIcon = (activityType, metadata) => {
    const iconProps = "w-5 h-5";
    const colorClasses = "text-blue-600";

    const iconMap = {
      card_created: <PlusCircle className={`${iconProps} ${colorClasses}`} />,
      card_updated: <Edit2 className={`${iconProps} ${colorClasses}`} />,
      card_moved: <ArrowRight className={`${iconProps} text-purple-600`} />,
      card_deleted: <Trash2 className={`${iconProps} text-red-600`} />,
      card_archived: <FileText className={`${iconProps} text-gray-600`} />,
      comment_added: <FileText className={`${iconProps} text-green-600`} />,
      member_added: <PlusCircle className={`${iconProps} text-green-600`} />,
      member_removed: <MinusCircle className={`${iconProps} text-red-600`} />,
      attachment_added: <LinkIcon className={`${iconProps} text-blue-600`} />,
      due_date_changed: <Calendar className={`${iconProps} text-orange-600`} />,
      priority_changed: <Flag className={`${iconProps} text-red-600`} />,
      status_changed: <CheckCircle className={`${iconProps} text-green-600`} />,
      subtask_created: <PlusCircle className={`${iconProps} text-blue-600`} />,
      subtask_completed: <CheckCircle className={`${iconProps} text-green-600`} />,
      subtask_deleted: <Trash2 className={`${iconProps} text-red-600`} />,
      estimation_updated: <Clock className={`${iconProps} text-indigo-600`} />,
      time_logged: <Clock className={`${iconProps} text-emerald-600`} />,
      title_changed: <Edit2 className={`${iconProps} text-blue-600`} />,
      description_changed: <Edit2 className={`${iconProps} text-blue-600`} />,
    };

    return iconMap[activityType] || <FileText className={`${iconProps} ${colorClasses}`} />;
  };

  const getActivityColor = (activityType) => {
    const colorMap = {
      card_created: "bg-blue-50 border-blue-200",
      card_updated: "bg-blue-50 border-blue-200",
      card_moved: "bg-purple-50 border-purple-200",
      card_deleted: "bg-red-50 border-red-200",
      card_archived: "bg-gray-50 border-gray-200",
      comment_added: "bg-green-50 border-green-200",
      member_added: "bg-green-50 border-green-200",
      member_removed: "bg-red-50 border-red-200",
      attachment_added: "bg-blue-50 border-blue-200",
      due_date_changed: "bg-orange-50 border-orange-200",
      priority_changed: "bg-red-50 border-red-200",
      status_changed: "bg-green-50 border-green-200",
      subtask_created: "bg-blue-50 border-blue-200",
      subtask_completed: "bg-green-50 border-green-200",
      subtask_deleted: "bg-red-50 border-red-200",
      estimation_updated: "bg-indigo-50 border-indigo-200",
      time_logged: "bg-emerald-50 border-emerald-200",
      title_changed: "bg-blue-50 border-blue-200",
      description_changed: "bg-blue-50 border-blue-200",
    };

    return colorMap[activityType] || "bg-gray-50 border-gray-200";
  };

  const getActivityDescription = (activity) => {
    const { type, description, metadata, user } = activity;
    const userName = user?.name || "User";

    // Custom descriptions for different activity types
    const descriptions = {
      card_created: `${userName} created this task`,
      card_updated: `${userName} updated this task`,
      card_moved: `${userName} moved this task from ${metadata?.fromList} to ${metadata?.toList}`,
      card_deleted: `${userName} deleted this task`,
      card_archived: `${userName} archived this task`,
      comment_added: `${userName} added a comment`,
      member_added: `${userName} added ${metadata?.memberName} as assignee`,
      member_removed: `${userName} removed ${metadata?.memberName} from assignees`,
      attachment_added: `${userName} added an attachment: ${metadata?.fileName || "File"}`,
      due_date_changed: `${userName} changed due date to ${metadata?.newDate}`,
      priority_changed: `${userName} changed priority from ${metadata?.oldPriority} to ${metadata?.newPriority}`,
      status_changed: `${userName} changed status from ${metadata?.oldStatus} to ${metadata?.newStatus}`,
      subtask_created: `${userName} created subtask: ${metadata?.subtaskTitle}`,
      subtask_completed: `${userName} completed subtask: ${metadata?.subtaskTitle}`,
      subtask_deleted: `${userName} deleted subtask: ${metadata?.subtaskTitle}`,
      estimation_updated: `${userName} updated estimation to ${metadata?.hours}h ${metadata?.minutes}m`,
      time_logged: `${userName} logged ${metadata?.hours}h ${metadata?.minutes}m of work`,
      title_changed: `${userName} changed title to "${metadata?.newTitle}"`,
      description_changed: `${userName} updated the description`,
    };

    return descriptions[type] || description || `${userName} performed an action`;
  };

  const renderChanges = (changes) => {
    if (!changes || typeof changes !== 'object') return null;

    const changeItems = [];

    Object.entries(changes).forEach(([key, value]) => {
      // Skip fields that are null or empty arrays (unchanged fields)
      if (value === null || (Array.isArray(value) && value.length === 0)) {
        return;
      }

      let displayValue = '';

      if (Array.isArray(value)) {
        switch (key) {
          case 'assignees':
            displayValue = value.map(assigneeId => {
              const member = teamMembers.find(m => m._id === assigneeId);
              return member ? member.name : assigneeId;
            }).join(', ');
            break;
          case 'attachments':
            displayValue = value.map(att => att.originalName || att.filename).join(', ');
            break;
          case 'subtasks':
            displayValue = value.map(sub => sub.title).join(', ');
            break;
          case 'labels':
            displayValue = value.join(', ');
            break;
          case 'estimationTime':
          case 'loggedTime':
            displayValue = `${value.length} entries`;
            break;
          default:
            displayValue = value.join(', ');
        }
      } else if (typeof value === 'string') {
        if (key === 'description') {
          displayValue = 'updated';
        } else {
          displayValue = `"${value}"`;
        }
      } else {
        displayValue = String(value);
      }

      const fieldName = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

      changeItems.push(
        <div key={key} className="flex gap-2 text-xs">
          <span className="font-medium">{fieldName}:</span>
          <span className="break-words">{displayValue}</span>
        </div>
      );
    });

    return changeItems.length > 0 ? <div className="space-y-1">{changeItems}</div> : null;
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 300, damping: 30 },
    },
    exit: { opacity: 0, y: -10 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="w-full"
    >
      <div className="mb-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader size={24} className="text-blue-600 animate-spin" />
            <span className="ml-2 text-sm text-gray-600">Loading activity...</span>
          </div>
        ) : activities.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8 text-gray-400"
          >
            <AlertCircle size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No activity yet. Activity will appear here.</p>
          </motion.div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="max-h-96 overflow-y-auto pr-2 custom-scrollbar space-y-3"
          >
            <AnimatePresence mode="popLayout">
              {activities.map((activity, index) => (
                <motion.div
                  key={`${activity._id || index}`}
                  variants={itemVariants}
                  exit="exit"
                  className={`border rounded-lg p-4 transition-all hover:shadow-md ${getActivityColor(
                    activity.type
                  )}`}
                >
                  <div className="flex gap-3">
                    {/* Icon */}
                    <div className="flex-shrink-0 mt-1">
                      {getActivityIcon(activity.type, activity.metadata)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">
                            {getActivityDescription(activity)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDistanceToNow(new Date(activity.createdAt), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>

                        {/* Expand button for details */}
                        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                          <button
                            onClick={() => toggleExpanded(activity._id)}
                            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <ChevronIcon
                              expanded={expandedActivities[activity._id]}
                            />
                          </button>
                        )}
                      </div>

                      {/* Expanded metadata details */}
                      <AnimatePresence>
                        {expandedActivities[activity._id] && activity.metadata && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="mt-3 pt-3 border-t border-current border-opacity-20"
                          >
                            <div className="text-xs text-gray-600 space-y-1 bg-white bg-opacity-50 p-2 rounded">
                              {Object.entries(activity.metadata).map(([key, value]) => {
                                if (key === "memberName" || key === "fileName") return null;
                                if (key === "changes") {
                                  return (
                                    <div key={key}>
                                      <div className="font-medium mb-1">Changes:</div>
                                      {renderChanges(value)}
                                    </div>
                                  );
                                }
                                return (
                                  <div key={key} className="flex gap-2">
                                    <span className="font-medium capitalize">
                                      {key.replace(/([A-Z])/g, " $1").toLowerCase()}:
                                    </span>
                                    <span className="break-words">
                                      {typeof value === "object"
                                        ? JSON.stringify(value)
                                        : String(value)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
    </motion.div>
  );
};

// Helper component for expand/collapse chevron
const ChevronIcon = ({ expanded }) => (
  <svg
    className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 14l-7 7m0 0l-7-7m7 7V3"
    />
  </svg>
);

export default ActivitySection;
