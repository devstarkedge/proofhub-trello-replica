import React, { useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Timer,
  Target,
  PlayCircle,
  AlertCircle,
  Pencil,
  Trash2,
  User,
  Clock,
} from "lucide-react";
import AuthContext from "../../context/AuthContext";

const TimeTrackingSection = ({
  estimationEntries,
  loggedTime,
  newEstimationHours,
  newEstimationMinutes,
  newEstimationReason,
  newLoggedHours,
  newLoggedMinutes,
  newLoggedDescription,
  editingEstimation,
  editingLogged,
  editEstimationHours,
  editEstimationMinutes,
  editEstimationReason,
  editLoggedHours,
  editLoggedMinutes,
  editLoggedDescription,
  onEstimationHoursChange,
  onEstimationMinutesChange,
  onEstimationReasonChange,
  onLoggedHoursChange,
  onLoggedMinutesChange,
  onLoggedDescriptionChange,
  onEditEstimationHoursChange,
  onEditEstimationMinutesChange,
  onEditEstimationReasonChange,
  onEditLoggedHoursChange,
  onEditLoggedMinutesChange,
  onEditLoggedDescriptionChange,
  onAddEstimation,
  onAddLoggedTime,
  onStartEditingEstimation,
  onStartEditingLogged,
  onSaveEstimationEdit,
  onSaveLoggedEdit,
  onCancelEstimationEdit,
  onCancelLoggedEdit,
  onConfirmDeleteEstimation,
  onConfirmDeleteLoggedTime,
  card,
}) => {
  const { user } = useContext(AuthContext);

  const normalizeTime = (hours, minutes) => {
    const totalMinutes = parseInt(hours || 0) * 60 + parseInt(minutes || 0);
    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
    };
  };

  const formatTime = (hours, minutes) => {
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    return parts.length > 0 ? parts.join(" ") : "0m";
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const calculateTotalEstimation = () => {
    const total = estimationEntries.reduce((acc, entry) => {
      return acc + entry.hours * 60 + entry.minutes;
    }, 0);
    return normalizeTime(Math.floor(total / 60), total % 60);
  };

  const calculateTotalLoggedTime = () => {
    const total = loggedTime.reduce((acc, entry) => {
      return acc + entry.hours * 60 + entry.minutes;
    }, 0);
    return normalizeTime(Math.floor(total / 60), total % 60);
  };

  const getTimeProgress = () => {
    const totalLogged = loggedTime.reduce(
      (acc, entry) => acc + entry.hours * 60 + entry.minutes,
      0
    );
    const totalEstimated = estimationEntries.reduce(
      (acc, entry) => acc + entry.hours * 60 + entry.minutes,
      0
    );

    if (totalEstimated === 0) return 0;
    return Math.round((totalLogged / totalEstimated) * 100);
  };

  const totalEstimation = calculateTotalEstimation();
  const totalLogged = calculateTotalLoggedTime();
  const timeProgress = getTimeProgress();
  const isOvertime = timeProgress > 100;

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-xl p-4 border-2 border-indigo-200 shadow-lg">
      <div className="flex items-center gap-3 mb-4">
        <motion.div
          whileHover={{ rotate: 360 }}
          transition={{ duration: 2, ease: "linear" }}
          className="p-2 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg shadow-md"
        >
          <Timer size={20} className="text-white" />
        </motion.div>

        <div>
          <h4 className="font-bold text-gray-800 text-lg">
            Time Tracking
          </h4>
          <p className="text-xs text-gray-600">
            Manage estimates and log your work time
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Estimation Time */}
        <div className="bg-white rounded-lg p-4 shadow-sm border border-indigo-100">
          <div className="flex items-center gap-2 mb-3">
            <Target size={16} className="text-indigo-600" />
            <h5 className="font-semibold text-gray-800">
              Estimated Time
            </h5>
          </div>

          {/* Add Estimation Input */}
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="0"
                  value={newEstimationHours}
                  onChange={(e) =>
                    onEstimationHoursChange(e.target.value)
                  }
                  placeholder="0"
                  className="w-full p-2 pr-7 border-2 border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                  h
                </span>
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  min="0"
                  value={newEstimationMinutes}
                  onChange={(e) =>
                    onEstimationMinutesChange(e.target.value)
                  }
                  placeholder="0"
                  className="w-full p-2 pr-7 border-2 border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                  m
                </span>
              </div>
            </div>
            <textarea
              value={newEstimationReason}
              onChange={(e) =>
                onEstimationReasonChange(e.target.value)
              }
              placeholder="Reason for estimation (mandatory)"
              className="w-full p-2 border-2 border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              rows="2"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onAddEstimation}
              className="px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 shadow-md text-sm font-semibold"
            >
              Add Estimate
            </motion.button>
          </div>

          {/* Estimation Entries */}
          {estimationEntries.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto mb-2 pr-2 custom-scrollbar">
              <AnimatePresence>
                {estimationEntries.map((entry, index) => {
                  const safeKey = String(entry.id || `estimation-${index}`).trim() || `estimation-${index}`;
                  return (
                    <motion.div
                      key={safeKey}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="group relative bg-indigo-50 rounded-lg p-3 border border-indigo-200 hover:border-indigo-300 transition-all text-xs"
                    >
                      {editingEstimation === entry.id ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                min="0"
                                value={editEstimationHours}
                                onChange={(e) =>
                                  onEditEstimationHoursChange(
                                    e.target.value
                                  )
                                }
                                placeholder="0"
                                className="w-full p-1 pr-5 border border-indigo-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                h
                              </span>
                            </div>
                            <div className="relative flex-1">
                              <input
                                type="number"
                                min="0"
                                value={editEstimationMinutes}
                                onChange={(e) =>
                                  onEditEstimationMinutesChange(
                                    e.target.value
                                  )
                                }
                                placeholder="0"
                                className="w-full p-1 pr-5 border border-indigo-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                m
                              </span>
                            </div>
                          </div>
                          <textarea
                            value={editEstimationReason}
                            onChange={(e) =>
                              onEditEstimationReasonChange(e.target.value)
                            }
                            placeholder="Reason for estimation"
                            className="w-full p-1 border border-indigo-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            rows="2"
                          />
                          <div className="flex gap-1">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() =>
                                onSaveEstimationEdit(entry.id)
                              }
                              className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 transition-colors"
                            >
                              Save
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={onCancelEstimationEdit}
                              className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600 transition-colors"
                            >
                              Cancel
                            </motion.button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-indigo-700 text-base">
                                {formatTime(
                                  entry.hours,
                                  entry.minutes
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() =>
                                  onStartEditingEstimation(entry)
                                }
                                className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-md transition-all duration-200 border border-indigo-200 hover:border-indigo-300"
                                title="Edit estimation"
                              >
                                <Pencil size={14} />
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() =>
                                  onConfirmDeleteEstimation(entry.id)
                                }
                                className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-all duration-200 border border-red-200 hover:border-red-300"
                                title="Delete estimation"
                              >
                                <Trash2 size={14} />
                              </motion.button>
                            </div>
                          </div>
                          <p className="text-gray-700 mb-1 p-1 bg-indigo-100 rounded">
                            Reason: {entry.reason}
                          </p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-gray-500">
                              <User size={12} />
                              <span>
                                {card.createdBy?.name || "Unknown"}
                              </span>
                            </div>
                            <span className="text-gray-600">
                              {formatDate(entry.date)}
                            </span>
                          </div>
                        </>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Total Estimation */}
          {estimationEntries.length > 0 && (
            <div className="pt-2 border-t-2 border-indigo-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">
                  Total Estimate:
                </span>
                <span className="text-lg font-bold text-indigo-600">
                  {formatTime(
                    totalEstimation.hours,
                    totalEstimation.minutes
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Logged Time */}
        <div className="bg-white rounded-lg p-4 shadow-sm border border-green-100">
          <div className="flex items-center gap-2 mb-3">
            <PlayCircle size={16} className="text-green-600" />
            <h5 className="font-semibold text-gray-800">
              Logged Time
            </h5>
          </div>

          {/* Add Logged Time Input */}
          <div className="flex flex-col gap-2 mb-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="0"
                  value={newLoggedHours}
                  onChange={(e) =>
                    onLoggedHoursChange(e.target.value)
                  }
                  placeholder="0"
                  className="w-full p-2 pr-7 border-2 border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                  h
                </span>
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  min="0"
                  value={newLoggedMinutes}
                  onChange={(e) =>
                    onLoggedMinutesChange(e.target.value)
                  }
                  placeholder="0"
                  className="w-full p-2 pr-7 border-2 border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                  m
                </span>
              </div>
            </div>
            <textarea
              value={newLoggedDescription}
              onChange={(e) =>
                onLoggedDescriptionChange(e.target.value)
              }
              placeholder="Description of work (mandatory)"
              className="w-full p-2 border-2 border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              rows="2"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onAddLoggedTime}
              className="px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 shadow-md text-sm font-semibold"
            >
              Log Time
            </motion.button>
          </div>

          {/* Logged Time Entries */}
          {loggedTime.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto mb-2 pr-2 custom-scrollbar">
              <AnimatePresence>
                {loggedTime.map((entry, index) => {
                  const safeKey = String(entry.id || `logged-${index}`).trim() || `logged-${index}`;
                  return (
                    <motion.div
                      key={safeKey}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="group relative bg-green-50 rounded-lg p-3 border border-green-200 hover:border-green-300 transition-all text-xs"
                    >
                      {editingLogged === entry.id ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                min="0"
                                value={editLoggedHours}
                                onChange={(e) =>
                                  onEditLoggedHoursChange(e.target.value)
                                }
                                placeholder="0"
                                className="w-full p-1 pr-5 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                              />
                              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                h
                              </span>
                            </div>
                            <div className="relative flex-1">
                              <input
                                type="number"
                                min="0"
                                value={editLoggedMinutes}
                                onChange={(e) =>
                                  onEditLoggedMinutesChange(e.target.value)
                                }
                                placeholder="0"
                                className="w-full p-1 pr-5 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                              />
                              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                m
                              </span>
                            </div>
                          </div>
                          <textarea
                            value={editLoggedDescription}
                            onChange={(e) =>
                              onEditLoggedDescriptionChange(e.target.value)
                            }
                            placeholder="Description of work"
                            className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                            rows="2"
                          />
                          <div className="flex gap-1">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => onSaveLoggedEdit(entry.id)}
                              className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                            >
                              Save
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={onCancelLoggedEdit}
                              className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600 transition-colors"
                            >
                              Cancel
                            </motion.button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Clock
                                size={12}
                                className="text-green-600"
                              />
                              <span className="font-bold text-green-700 text-base">
                                {formatTime(
                                  entry.hours,
                                  entry.minutes
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() =>
                                  onStartEditingLogged(entry)
                                }
                                className="p-1.5 text-green-600 hover:bg-green-100 rounded-md transition-all duration-200 border border-green-200 hover:border-green-300"
                                title="Edit logged time"
                              >
                                <Pencil size={14} />
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() =>
                                  onConfirmDeleteLoggedTime(entry.id)
                                }
                                className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-all duration-200 border border-red-200 hover:border-red-300"
                                title="Delete logged time"
                              >
                                <Trash2 size={14} />
                              </motion.button>
                            </div>
                          </div>
                          <p className="text-gray-700 mb-1 p-1 bg-green-100 rounded">
                            Desc: {entry.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-gray-500">
                              <User size={12} />
                              <span>
                                {card.createdBy?.name || "Unknown"}
                              </span>
                            </div>
                            <span className="text-gray-600">
                              {formatDate(entry.date)}
                            </span>
                          </div>
                        </>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Total Logged Time */}
          {loggedTime.length > 0 && (
            <div className="pt-2 border-t-2 border-green-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">
                  Total Logged:
                </span>
                <span
                  className={`text-lg font-bold ${
                    isOvertime ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {formatTime(
                    totalLogged.hours,
                    totalLogged.minutes
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {estimationEntries.length > 0 && loggedTime.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 bg-white rounded-lg p-4 shadow-sm border border-gray-200"
        >
          <div className="flex items-center justify-between mb-2">
            <div>
              <h5 className="font-semibold text-gray-800 text-xs mb-1">
                Overall Progress
              </h5>
              <p className="text-xs text-gray-600">
                {formatTime(totalLogged.hours, totalLogged.minutes)}{" "}
                of{" "}
                {formatTime(
                  totalEstimation.hours,
                  totalEstimation.minutes
                )}
              </p>
            </div>
            <div className="text-right">
              <span
                className={`text-xl font-bold ${
                  isOvertime ? "text-red-600" : "text-blue-600"
                }`}
              >
                {timeProgress}%
              </span>
              {isOvertime && (
                <p className="text-xs text-red-600 font-medium">
                  Over estimate!
                </p>
              )}
            </div>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(timeProgress, 100)}%` }}
              className={`h-full ${
                isOvertime
                  ? "bg-gradient-to-r from-red-500 via-orange-500 to-red-600"
                  : "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600"
              } shadow-md`}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          {isOvertime && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200"
            >
              <AlertCircle size={14} />
              <span className="font-medium">
                Exceeded estimate by{" "}
                {formatTime(
                  Math.floor(
                    (totalLogged.hours * 60 +
                      totalLogged.minutes -
                      totalEstimation.hours * 60 -
                      totalEstimation.minutes) /
                      60
                  ),
                  (totalLogged.hours * 60 +
                    totalLogged.minutes -
                    totalEstimation.hours * 60 -
                    totalEstimation.minutes) %
                    60
                )}
              </span>
            </motion.div>
          )}
        </motion.div>
      )}

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
    </div>
  );
};

export default TimeTrackingSection;
