import React, { useState, useContext, useMemo, useCallback } from "react";
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
  X,
  DollarSign,
  Calendar,
  Lock,
  Info,
} from "lucide-react";
import AuthContext from "../../context/AuthContext";

const TimeTrackingSection = ({
  estimationEntries,
  loggedTime,
  billedTime,
  newEstimationHours,
  newEstimationMinutes,
  newEstimationReason,
  newEstimationDate,
  newLoggedHours,
  newLoggedMinutes,
  newLoggedDescription,
  newLoggedDate,
  newBilledHours,
  newBilledMinutes,
  newBilledDescription,
  newBilledDate,
  editingEstimation,
  editingLogged,
  editingBilled,
  editEstimationHours,
  editEstimationMinutes,
  editEstimationReason,
  editLoggedHours,
  editLoggedMinutes,
  editLoggedDescription,
  editBilledHours,
  editBilledMinutes,
  editBilledDescription,
  onEstimationHoursChange,
  onEstimationMinutesChange,
  onEstimationReasonChange,
  onEstimationDateChange,
  onLoggedHoursChange,
  onLoggedMinutesChange,
  onLoggedDescriptionChange,
  onLoggedDateChange,
  onBilledHoursChange,
  onBilledMinutesChange,
  onBilledDescriptionChange,
  onBilledDateChange,
  onEditEstimationHoursChange,
  onEditEstimationMinutesChange,
  onEditEstimationReasonChange,
  onEditLoggedHoursChange,
  onEditLoggedMinutesChange,
  onEditLoggedDescriptionChange,
  onEditBilledHoursChange,
  onEditBilledMinutesChange,
  onEditBilledDescriptionChange,
  onAddEstimation,
  onAddLoggedTime,
  onAddBilledTime,
  onStartEditingEstimation,
  onStartEditingLogged,
  onStartEditingBilled,
  onSaveEstimationEdit,
  onSaveLoggedEdit,
  onSaveBilledEdit,
  onCancelEstimationEdit,
  onCancelLoggedEdit,
  onCancelBilledEdit,
  onConfirmDeleteEstimation,
  onConfirmDeleteLoggedTime,
  onConfirmDeleteBilledTime,
  card,
  // Validation props
  estimationValidationError,
  loggedValidationError,
  billedValidationError,
  // Billed Time visibility props
  canAccessBilledTime = true, // Default to true for backward compatibility
  billedTimeHiddenReason = null,
}) => {
  const { user } = useContext(AuthContext);

  // Get today's date in YYYY-MM-DD format for max date restriction
  const todayDate = useMemo(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }, []);

  // Helper function to get user display name from time entry
  // Handles both populated user objects and unpopulated user IDs
  const getUserDisplayName = (entry) => {
    // If entry.user is a populated object with name
    if (entry.user && typeof entry.user === 'object' && entry.user.name) {
      return entry.user.name;
    }
    // If entry.userName was explicitly stored
    if (entry.userName) {
      return entry.userName;
    }
    // If entry.user is just an ID, check if it matches current user
    if (entry.user && user) {
      const entryUserId = typeof entry.user === 'object' ? entry.user._id : entry.user;
      if (entryUserId === user._id || entryUserId === user.id) {
        return user.name || user.email || 'You';
      }
    }
    // Fallback
    return 'Unknown';
  };

  /**
   * Check if the current user owns a time entry
   * Only owners can edit or delete their own entries
   * @param {Object} entry - The time entry to check
   * @returns {boolean} - True if current user owns the entry
   */
  const userOwnsEntry = useCallback((entry) => {
    if (!entry || !user) return false;
    
    // Get the entry's user ID
    let entryUserId = null;
    if (entry.user) {
      if (typeof entry.user === 'object' && entry.user._id) {
        entryUserId = entry.user._id.toString();
      } else if (typeof entry.user === 'string') {
        entryUserId = entry.user;
      } else if (entry.user.id) {
        entryUserId = entry.user.id.toString();
      }
    }
    
    // Get current user ID
    const currentUserId = (user._id || user.id || '').toString();
    
    return entryUserId === currentUserId;
  }, [user]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState("estimate");

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

  const calculateTotalBilledTime = () => {
    const total = billedTime.reduce((acc, entry) => {
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

  const openModal = (tab) => {
    setActiveModalTab(tab);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-xl p-4 border-2 border-indigo-200 shadow-lg">
      {/* Compact View */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: 360 }}
            transition={{ duration: 2, ease: "linear" }}
            className="p-2 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg shadow-md"
          >
            <Timer size={20} className="text-white" />
          </motion.div>
          <div>
            <h4 className="font-bold text-gray-800 text-lg">Time Tracking</h4>
            <p className="text-xs text-gray-600">
              {formatTime(totalLogged.hours, totalLogged.minutes)} logged /{" "}
              {formatTime(totalEstimation.hours, totalEstimation.minutes)} est.
            </p>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => openModal("log")}
          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 shadow-md text-sm font-semibold"
        >
          Add Time
        </motion.button>
      </div>

      {/* Progress Bar */}
      {estimationEntries.length > 0 && (
        <div className="mt-4">
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
          <div className="flex justify-between text-xs mt-1">
            <span className="font-semibold text-gray-600">
              {timeProgress}%
            </span>
            {isOvertime && (
              <span className="font-semibold text-red-600">Overtime!</span>
            )}
          </div>
        </div>
      )}

      {/* Time Tracking Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: -20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: -20 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-800">
                  Time Management
                </h3>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={closeModal}
                  className="p-2 rounded-full hover:bg-gray-100"
                >
                  <X size={20} className="text-gray-600" />
                </motion.button>
              </div>

              <div className="flex-grow overflow-y-auto p-2">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                            className={`w-full p-2 pr-7 border-2 rounded-lg focus:outline-none focus:ring-2 text-sm ${
                              estimationValidationError
                                ? 'border-red-400 focus:ring-red-500 bg-red-50'
                                : 'border-indigo-200 focus:ring-indigo-500'
                            }`}
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
                            className={`w-full p-2 pr-7 border-2 rounded-lg focus:outline-none focus:ring-2 text-sm ${
                              estimationValidationError
                                ? 'border-red-400 focus:ring-red-500 bg-red-50'
                                : 'border-indigo-200 focus:ring-indigo-500'
                            }`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                            m
                          </span>
                        </div>
                      </div>
                      {/* Date Picker for Estimation */}
                      <div className="relative">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-indigo-500" />
                          <input
                            type="date"
                            value={newEstimationDate || todayDate}
                            onChange={(e) => onEstimationDateChange(e.target.value)}
                            max={todayDate}
                            className="flex-1 p-2 border-2 border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          />
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
                      {/* Validation Error Message */}
                      {estimationValidationError && (
                        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                          <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                          <span className="text-red-600 text-xs font-medium">
                            {estimationValidationError}
                          </span>
                        </div>
                      )}
                      <motion.button
                        whileHover={!estimationValidationError ? { scale: 1.05 } : {}}
                        whileTap={!estimationValidationError ? { scale: 0.95 } : {}}
                        onClick={onAddEstimation}
                        disabled={!!estimationValidationError}
                        className={`px-3 py-2 rounded-lg shadow-md text-sm font-semibold transition-all ${
                          estimationValidationError
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700'
                        }`}
                      >
                        Add Estimate
                      </motion.button>
                    </div>
                    {/* Estimation Entries */}
                    {estimationEntries.length > 0 && (
                      <div className="space-y-2 max-h-40 overflow-y-auto mb-2 pr-2 custom-scrollbar">
                        <AnimatePresence>
                          {estimationEntries.map((entry, index) => {
                            const safeKey =
                              String(entry.id || `estimation-${index}`).trim() ||
                              `estimation-${index}`;
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
                                        onEditEstimationReasonChange(
                                          e.target.value
                                        )
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
                                          {formatTime(entry.hours, entry.minutes)}
                                        </span>
                                        {/* Show lock icon for other users' entries */}
                                        {!userOwnsEntry(entry) && (
                                          <span className="flex items-center gap-1 text-gray-400" title="You can only view this entry">
                                            <Lock size={12} />
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {userOwnsEntry(entry) ? (
                                          <>
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
                                          </>
                                        ) : (
                                          <span className="text-xs text-gray-400 italic px-2">View only</span>
                                        )}
                                      </div>
                                    </div>
                                    <p className="text-gray-700 mb-1 p-1 bg-indigo-100 rounded">
                                      Reason: {entry.reason}
                                    </p>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1 text-gray-500">
                                        <User size={12} />
                                        <span>
                                          {getUserDisplayName(entry)}
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
                            className={`w-full p-2 pr-7 border-2 rounded-lg focus:outline-none focus:ring-2 text-sm ${
                              loggedValidationError
                                ? 'border-red-400 focus:ring-red-500 bg-red-50'
                                : 'border-green-200 focus:ring-green-500'
                            }`}
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
                            className={`w-full p-2 pr-7 border-2 rounded-lg focus:outline-none focus:ring-2 text-sm ${
                              loggedValidationError
                                ? 'border-red-400 focus:ring-red-500 bg-red-50'
                                : 'border-green-200 focus:ring-green-500'
                            }`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                            m
                          </span>
                        </div>
                      </div>
                      {/* Date Picker for Logged Time */}
                      <div className="relative">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-green-500" />
                          <input
                            type="date"
                            value={newLoggedDate || todayDate}
                            onChange={(e) => onLoggedDateChange(e.target.value)}
                            max={todayDate}
                            className="flex-1 p-2 border-2 border-green-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                          />
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
                      {/* Validation Error Message */}
                      {loggedValidationError && (
                        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                          <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                          <span className="text-red-600 text-xs font-medium">
                            {loggedValidationError}
                          </span>
                        </div>
                      )}
                      <motion.button
                        whileHover={!loggedValidationError ? { scale: 1.05 } : {}}
                        whileTap={!loggedValidationError ? { scale: 0.95 } : {}}
                        onClick={onAddLoggedTime}
                        disabled={!!loggedValidationError}
                        className={`px-3 py-2 rounded-lg shadow-md text-sm font-semibold transition-all ${
                          loggedValidationError
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'
                        }`}
                      >
                        Log Time
                      </motion.button>
                    </div>
                    {/* Logged Time Entries */}
                    {loggedTime.length > 0 && (
                      <div className="space-y-2 max-h-40 overflow-y-auto mb-2 pr-2 custom-scrollbar">
                        <AnimatePresence>
                          {loggedTime.map((entry, index) => {
                            const safeKey =
                              String(entry.id || `logged-${index}`).trim() ||
                              `logged-${index}`;
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
                                            onEditLoggedHoursChange(
                                              e.target.value
                                            )
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
                                            onEditLoggedMinutesChange(
                                              e.target.value
                                            )
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
                                        onEditLoggedDescriptionChange(
                                          e.target.value
                                        )
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
                                        {/* Show lock icon for other users' entries */}
                                        {!userOwnsEntry(entry) && (
                                          <span className="flex items-center gap-1 text-gray-400" title="You can only view this entry">
                                            <Lock size={12} />
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {userOwnsEntry(entry) ? (
                                          <>
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
                                                onConfirmDeleteLoggedTime(
                                                  entry.id
                                                )
                                              }
                                              className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-all duration-200 border border-red-200 hover:border-red-300"
                                              title="Delete logged time"
                                            >
                                              <Trash2 size={14} />
                                            </motion.button>
                                          </>
                                        ) : (
                                          <span className="text-xs text-gray-400 italic px-2">View only</span>
                                        )}
                                      </div>
                                    </div>
                                    <p className="text-gray-700 mb-1 p-1 bg-green-100 rounded">
                                      Desc: {entry.description}
                                    </p>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1 text-gray-500">
                                        <User size={12} />
                                        <span>
                                          {getUserDisplayName(entry)}
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

                  {/* Billed Time - Conditionally rendered based on access */}
                  <div className="bg-white rounded-lg p-4 shadow-sm border border-yellow-100">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign size={16} className="text-yellow-600" />
                      <h5 className="font-semibold text-gray-800">
                        Billed Time
                      </h5>
                    </div>
                    
                    {/* Show hidden reason message if user cannot access billed time */}
                    {!canAccessBilledTime ? (
                      <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
                        <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                          <Info size={18} className="text-amber-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-amber-800">Billed Time Unavailable</p>
                          <p className="text-xs text-amber-600 mt-1">{billedTimeHiddenReason}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Add Billed Time Input */}
                        <div className="flex flex-col gap-2 mb-3">
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                min="0"
                                value={newBilledHours}
                                onChange={(e) =>
                                  onBilledHoursChange(e.target.value)
                                }
                                placeholder="0"
                                className={`w-full p-2 pr-7 border-2 rounded-lg focus:outline-none focus:ring-2 text-sm ${
                                  billedValidationError
                                    ? 'border-red-400 focus:ring-red-500 bg-red-50'
                                    : 'border-yellow-200 focus:ring-yellow-500'
                                }`}
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                h
                              </span>
                            </div>
                            <div className="relative flex-1">
                              <input
                                type="number"
                                min="0"
                                value={newBilledMinutes}
                                onChange={(e) =>
                                  onBilledMinutesChange(e.target.value)
                                }
                                placeholder="0"
                                className={`w-full p-2 pr-7 border-2 rounded-lg focus:outline-none focus:ring-2 text-sm ${
                                  billedValidationError
                                    ? 'border-red-400 focus:ring-red-500 bg-red-50'
                                    : 'border-yellow-200 focus:ring-yellow-500'
                                }`}
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                m
                              </span>
                            </div>
                          </div>
                          {/* Date Picker for Billed Time */}
                          <div className="relative">
                            <div className="flex items-center gap-2">
                              <Calendar size={14} className="text-yellow-500" />
                              <input
                                type="date"
                                value={newBilledDate || todayDate}
                                onChange={(e) => onBilledDateChange(e.target.value)}
                                max={todayDate}
                                className="flex-1 p-2 border-2 border-yellow-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
                              />
                            </div>
                          </div>
                          <textarea
                            value={newBilledDescription}
                            onChange={(e) =>
                              onBilledDescriptionChange(e.target.value)
                            }
                            placeholder="Description of billable work (mandatory)"
                            className="w-full p-2 border-2 border-yellow-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm"
                            rows="2"
                          />
                          {/* Validation Error Message */}
                          {billedValidationError && (
                            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                              <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                              <span className="text-red-600 text-xs font-medium">
                                {billedValidationError}
                              </span>
                            </div>
                          )}
                          <motion.button
                            whileHover={!billedValidationError ? { scale: 1.05 } : {}}
                            whileTap={!billedValidationError ? { scale: 0.95 } : {}}
                            onClick={onAddBilledTime}
                            disabled={!!billedValidationError}
                            className={`px-3 py-2 rounded-lg shadow-md text-sm font-semibold transition-all ${
                              billedValidationError
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-600 hover:to-orange-600'
                            }`}
                          >
                            Add Billed Time
                          </motion.button>
                        </div>
                        {/* Billed Time Entries */}
                        {billedTime.length > 0 && (
                          <div className="space-y-2 max-h-40 overflow-y-auto mb-2 pr-2 custom-scrollbar">
                            <AnimatePresence>
                              {billedTime.map((entry, index) => {
                                const safeKey =
                                  String(entry.id || `billed-${index}`).trim() ||
                                  `billed-${index}`;
                                return (
                                  <motion.div
                                    key={safeKey}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="group relative bg-yellow-50 rounded-lg p-3 border border-yellow-200 hover:border-yellow-300 transition-all text-xs"
                                  >
                                    {editingBilled === entry.id ? (
                                      <div className="space-y-2">
                                        <div className="flex gap-2">
                                          <div className="relative flex-1">
                                            <input
                                              type="number"
                                              min="0"
                                              value={editBilledHours}
                                              onChange={(e) =>
                                                onEditBilledHoursChange(
                                                  e.target.value
                                                )
                                              }
                                              placeholder="0"
                                              className="w-full p-1 pr-5 border border-yellow-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-yellow-500"
                                            />
                                            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                              h
                                            </span>
                                          </div>
                                          <div className="relative flex-1">
                                            <input
                                              type="number"
                                              min="0"
                                              value={editBilledMinutes}
                                              onChange={(e) =>
                                                onEditBilledMinutesChange(
                                                  e.target.value
                                                )
                                              }
                                              placeholder="0"
                                              className="w-full p-1 pr-5 border border-yellow-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-yellow-500"
                                            />
                                            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                                              m
                                            </span>
                                          </div>
                                        </div>
                                        <textarea
                                          value={editBilledDescription}
                                          onChange={(e) =>
                                            onEditBilledDescriptionChange(
                                              e.target.value
                                            )
                                          }
                                          placeholder="Description of billable work"
                                          className="w-full p-1 border border-yellow-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-yellow-500"
                                          rows="2"
                                        />
                                        <div className="flex gap-1">
                                          <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() =>
                                              onSaveBilledEdit(entry.id)
                                            }
                                            className="px-2 py-1 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700 transition-colors"
                                          >
                                            Save
                                          </motion.button>
                                          <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={onCancelBilledEdit}
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
                                            <DollarSign
                                              size={12}
                                              className="text-yellow-600"
                                            />
                                            <span className="font-bold text-yellow-700 text-base">
                                              {formatTime(
                                                entry.hours,
                                                entry.minutes
                                              )}
                                            </span>
                                            {/* Show lock icon for other users' entries */}
                                            {!userOwnsEntry(entry) && (
                                              <span className="flex items-center gap-1 text-gray-400" title="You can only view this entry">
                                                <Lock size={12} />
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1">
                                            {userOwnsEntry(entry) ? (
                                              <>
                                                <motion.button
                                                  whileHover={{ scale: 1.1 }}
                                                  whileTap={{ scale: 0.9 }}
                                                  onClick={() =>
                                                    onStartEditingBilled(entry)
                                                  }
                                                  className="p-1.5 text-yellow-600 hover:bg-yellow-100 rounded-md transition-all duration-200 border border-yellow-200 hover:border-yellow-300"
                                                  title="Edit billed time"
                                                >
                                                  <Pencil size={14} />
                                                </motion.button>
                                                <motion.button
                                                  whileHover={{ scale: 1.1 }}
                                                  whileTap={{ scale: 0.9 }}
                                                  onClick={() =>
                                                    onConfirmDeleteBilledTime(
                                                      entry.id
                                                    )
                                                  }
                                                  className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-all duration-200 border border-red-200 hover:border-red-300"
                                                  title="Delete billed time"
                                                >
                                                  <Trash2 size={14} />
                                                </motion.button>
                                              </>
                                            ) : (
                                              <span className="text-xs text-gray-400 italic px-2">View only</span>
                                            )}
                                          </div>
                                        </div>
                                        <p className="text-gray-700 mb-1 p-1 bg-yellow-100 rounded">
                                          {entry.description}
                                        </p>
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1 text-gray-500">
                                            <User size={12} />
                                            <span>
                                              {getUserDisplayName(entry)}
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
                        {/* Total Billed Time */}
                        {billedTime.length > 0 && (
                          <div className="pt-2 border-t-2 border-yellow-200">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-gray-700">
                                Total Billed:
                              </span>
                              <span className="text-lg font-bold text-yellow-600">
                                {formatTime(
                                  calculateTotalBilledTime().hours,
                                  calculateTotalBilledTime().minutes
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-semibold text-gray-800 text-sm">
                      Overall Progress
                    </h5>
                    <p className="text-xs text-gray-600">
                      {formatTime(totalLogged.hours, totalLogged.minutes)} of{" "}
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
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

