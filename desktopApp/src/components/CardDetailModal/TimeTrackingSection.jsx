import { useState, useContext, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Timer, Target, PlayCircle, AlertCircle, Pencil, Trash2, User, Clock, X, DollarSign, Calendar, Lock, Info, Plus } from "lucide-react";
import AuthContext from "../../context/AuthContext";
import MilestoneApprovalPanel from "./MilestoneApprovalPanel";

const TimeTrackingSection = ({
  estimationEntries = [],
  loggedTime = [],
  billedTime = [],
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
  editEstimationDate,
  editLoggedHours,
  editLoggedMinutes,
  editLoggedDescription,
  editLoggedDate,
  editBilledHours,
  editBilledMinutes,
  editBilledDescription,
  editBilledDate,
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
  onEditEstimationDateChange,
  onEditLoggedHoursChange,
  onEditLoggedMinutesChange,
  onEditLoggedDescriptionChange,
  onEditLoggedDateChange,
  onEditBilledHoursChange,
  onEditBilledMinutesChange,
  onEditBilledDescriptionChange,
  onEditBilledDateChange,
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
  estimationValidationError,
  loggedValidationError,
  billedValidationError,
  canAccessBilledTime = true,
  billedTimeLoading = false,
  billedTimeError = null,
  onRetryBilledTime,
  billedTimeHiddenReason = null,
  project,
  billingSource,
}) => {
  const { user } = useContext(AuthContext);
  const isMilestoneProject = String(project?.billingCycle || "").toLowerCase() === "milestone";
  const isEmployee = String(user?.role || "").toLowerCase() === "employee";

  const todayDate = useMemo(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  }, []);

  const getUserDisplayName = useCallback((entry) => {
    if (entry?.user && typeof entry.user === "object" && entry.user.name) {
      return entry.user.name;
    }
    if (entry?.userName) {
      return entry.userName;
    }
    if (entry?.user && user) {
      const entryUserId = typeof entry.user === "object" ? entry.user._id : entry.user;
      if (entryUserId === user._id || entryUserId === user.id) {
        return user.name || user.email || "You";
      }
    }
    return "Unknown";
  }, [user]);

  const userOwnsEntry = useCallback((entry) => {
    if (!entry || !user) return false;
    let entryUserId = null;
    if (entry.user) {
      if (typeof entry.user === "object" && entry.user._id) {
        entryUserId = entry.user._id.toString();
      } else if (typeof entry.user === "string") {
        entryUserId = entry.user;
      } else if (entry.user.id) {
        entryUserId = entry.user.id.toString();
      }
    }
    const currentUserId = (user._id || user.id || "").toString();
    return entryUserId === currentUserId;
  }, [user]);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const normalizeTime = (hours, minutes) => {
    const totalMinutes = parseInt(hours || 0, 10) * 60 + parseInt(minutes || 0, 10);
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
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Helper to extract timestamp for descending sorting (latest at top, oldest at bottom)
  const getEntryTime = (entry) => {
    if (!entry) return 0;
    if (entry.date) {
      const t = new Date(entry.date).getTime();
      if (!isNaN(t)) return t;
    }
    if (entry.createdAt) {
      const t = new Date(entry.createdAt).getTime();
      if (!isNaN(t)) return t;
    }
    const id = entry._id || entry.id;
    if (id && typeof id === "string" && id.length === 24) {
      const t = parseInt(id.substring(0, 8), 16) * 1000;
      if (!isNaN(t)) return t;
    }
    return 0;
  };

  // Sort helper: strictly puts latest entries at top and oldest at the bottom
  const sortLatestFirst = useCallback((entries) => {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry, index) => ({ entry, originalIndex: index }))
      .sort((a, b) => {
        const timeA = getEntryTime(a.entry);
        const timeB = getEntryTime(b.entry);
        if (timeB !== timeA) return timeB - timeA;
        return b.originalIndex - a.originalIndex;
      })
      .map((item) => item.entry);
  }, []);

  const sortedEstimationEntries = useMemo(
    () => sortLatestFirst(estimationEntries),
    [estimationEntries, sortLatestFirst]
  );
  const sortedLoggedTime = useMemo(
    () => sortLatestFirst(loggedTime),
    [loggedTime, sortLatestFirst]
  );
  const sortedBilledTime = useMemo(
    () => sortLatestFirst(billedTime),
    [billedTime, sortLatestFirst]
  );

  const calculateTotalEstimation = () => {
    const total = (estimationEntries || []).reduce((acc, entry) => {
      return acc + (parseInt(entry.hours, 10) || 0) * 60 + (parseInt(entry.minutes, 10) || 0);
    }, 0);
    return normalizeTime(Math.floor(total / 60), total % 60);
  };

  const calculateTotalLoggedTime = () => {
    const total = (loggedTime || []).reduce((acc, entry) => {
      return acc + (parseInt(entry.hours, 10) || 0) * 60 + (parseInt(entry.minutes, 10) || 0);
    }, 0);
    return normalizeTime(Math.floor(total / 60), total % 60);
  };

  const calculateTotalBilledTime = () => {
    const total = (billedTime || []).reduce((acc, entry) => {
      return acc + (parseInt(entry.hours, 10) || 0) * 60 + (parseInt(entry.minutes, 10) || 0);
    }, 0);
    return normalizeTime(Math.floor(total / 60), total % 60);
  };

  const getTimeProgress = () => {
    const totalLogged = (loggedTime || []).reduce(
      (acc, entry) => acc + (parseInt(entry.hours, 10) || 0) * 60 + (parseInt(entry.minutes, 10) || 0),
      0
    );
    const totalEstimated = (estimationEntries || []).reduce(
      (acc, entry) => acc + (parseInt(entry.hours, 10) || 0) * 60 + (parseInt(entry.minutes, 10) || 0),
      0
    );

    if (totalEstimated === 0) return 0;
    return Math.round((totalLogged / totalEstimated) * 100);
  };

  const totalEstimation = calculateTotalEstimation();
  const totalLogged = calculateTotalLoggedTime();
  const totalBilled = calculateTotalBilledTime();
  const timeProgress = getTimeProgress();
  const isOvertime = timeProgress > 100;

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-4 transition-all">
      {/* Compact View outside modal */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0">
            <Timer size={18} />
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Time Tracking</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {formatTime(totalLogged.hours, totalLogged.minutes)}
              </span>{" "}
              logged
              {estimationEntries.length > 0 && (
                <>
                  {" "}·{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {formatTime(totalEstimation.hours, totalEstimation.minutes)}
                  </span>{" "}
                  estimated
                </>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-xs hover:shadow transition-all duration-150 cursor-pointer shrink-0"
          style={{ color: '#ffffff' }}
        >
          <Plus size={14} className="text-white shrink-0" />
          <span>Add Time</span>
        </button>
      </div>

      {/* Progress Bar in Compact View */}
      {estimationEntries.length > 0 && (
        <div className="mt-3.5 pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-gray-500 dark:text-gray-400 font-medium">Progress</span>
            <div className="flex items-center gap-1.5 font-mono">
              <span className={`font-semibold ${isOvertime ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400"}`}>
                {timeProgress}%
              </span>
              {isOvertime && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900 font-sans font-medium">
                  Overtime
                </span>
              )}
            </div>
          </div>
          <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              style={{ width: `${Math.min(timeProgress, 100)}%` }}
              className={`h-full rounded-full transition-all duration-300 ${
                isOvertime ? "bg-rose-500" : "bg-blue-600"
              }`}
            />
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
            className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 md:p-6"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.97, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0, y: 10 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-gray-900 dark:text-gray-100 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                    <Clock size={18} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                      Time Management
                    </h3>
                    {card?.title && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs sm:max-w-md">
                        {card.title}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Main Content Grid */}
              <div className="flex-grow overflow-y-auto p-4 sm:p-5">
                <div
                  className={`grid grid-cols-1 gap-4 sm:gap-5 ${
                    isMilestoneProject && isEmployee ? "lg:grid-cols-2" : "lg:grid-cols-3"
                  }`}
                >
                  {/* COLUMN 1: ESTIMATED TIME */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-850/30 p-4 flex flex-col">
                    <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-gray-200/80 dark:border-gray-800">
                      <div className="flex items-center gap-2">
                        <Target size={16} className="text-indigo-600 dark:text-indigo-400" />
                        <h4 className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                          Estimated Time
                        </h4>
                      </div>
                      {sortedEstimationEntries.length > 0 && (
                        <span className="text-[11px] font-mono font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/40">
                          {formatTime(totalEstimation.hours, totalEstimation.minutes)}
                        </span>
                      )}
                    </div>

                    {/* Add Estimation Inputs */}
                    <div className="space-y-2 mb-3">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            value={newEstimationHours}
                            onChange={(e) => onEstimationHoursChange(e.target.value)}
                            placeholder="0"
                            className={`w-full px-2.5 py-1.5 pr-6 text-xs sm:text-sm rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none transition-colors ${
                              estimationValidationError
                                ? "border-rose-300 dark:border-rose-700 focus:ring-1 focus:ring-rose-500"
                                : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            }`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium pointer-events-none">
                            h
                          </span>
                        </div>
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            value={newEstimationMinutes}
                            onChange={(e) => onEstimationMinutesChange(e.target.value)}
                            placeholder="0"
                            className={`w-full px-2.5 py-1.5 pr-6 text-xs sm:text-sm rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none transition-colors ${
                              estimationValidationError
                                ? "border-rose-300 dark:border-rose-700 focus:ring-1 focus:ring-rose-500"
                                : "border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            }`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium pointer-events-none">
                            m
                          </span>
                        </div>
                      </div>

                      <div className="relative flex items-center">
                        <Calendar size={13} className="absolute left-2.5 text-gray-400 pointer-events-none" />
                        <input
                          type="date"
                          value={newEstimationDate || todayDate}
                          onChange={(e) => onEstimationDateChange(e.target.value)}
                          max={todayDate}
                          className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <textarea
                        value={newEstimationReason}
                        onChange={(e) => onEstimationReasonChange(e.target.value)}
                        placeholder="Reason for estimation (mandatory)"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                        rows="2"
                      />

                      {estimationValidationError && (
                        <div className="flex items-center gap-1.5 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-lg text-rose-600 dark:text-rose-400 text-xs">
                          <AlertCircle size={14} className="shrink-0" />
                          <span>{estimationValidationError}</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={onAddEstimation}
                        disabled={!!estimationValidationError}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-medium shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                          estimationValidationError
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-gray-200 dark:border-gray-700"
                            : "bg-indigo-600 hover:bg-indigo-700 text-white"
                        }`}
                      >
                        Add Estimate
                      </button>
                    </div>

                    {/* Estimation Entries List (Latest on top) */}
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-1.5">
                        <span>History (Latest first)</span>
                        <span>{sortedEstimationEntries.length} {sortedEstimationEntries.length === 1 ? "entry" : "entries"}</span>
                      </div>

                      <div className="space-y-2 max-h-56 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
                        <AnimatePresence initial={false}>
                          {sortedEstimationEntries.map((entry, index) => {
                            const safeKey = entry._id || entry.id || `estimation-${index}`;
                            return (
                              <motion.div
                                key={safeKey}
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-800/90 shadow-2xs text-xs space-y-1.5"
                              >
                                {editingEstimation === entry.id ? (
                                  <div className="space-y-2">
                                    <div className="flex gap-2">
                                      <div className="relative flex-1">
                                        <input
                                          type="number"
                                          min="0"
                                          value={editEstimationHours}
                                          onChange={(e) => onEditEstimationHoursChange(e.target.value)}
                                          placeholder="0"
                                          className="w-full p-1 pr-5 border border-indigo-300 dark:border-indigo-700 rounded text-xs bg-white dark:bg-gray-800"
                                        />
                                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">h</span>
                                      </div>
                                      <div className="relative flex-1">
                                        <input
                                          type="number"
                                          min="0"
                                          value={editEstimationMinutes}
                                          onChange={(e) => onEditEstimationMinutesChange(e.target.value)}
                                          placeholder="0"
                                          className="w-full p-1 pr-5 border border-indigo-300 dark:border-indigo-700 rounded text-xs bg-white dark:bg-gray-800"
                                        />
                                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">m</span>
                                      </div>
                                    </div>
                                    <input
                                      type="date"
                                      value={editEstimationDate || todayDate}
                                      onChange={(e) => onEditEstimationDateChange(e.target.value)}
                                      max={todayDate}
                                      className="w-full p-1 border border-indigo-300 dark:border-indigo-700 rounded text-xs bg-white dark:bg-gray-800"
                                    />
                                    <textarea
                                      value={editEstimationReason}
                                      onChange={(e) => onEditEstimationReasonChange(e.target.value)}
                                      placeholder="Reason for estimation"
                                      className="w-full p-1 border border-indigo-300 dark:border-indigo-700 rounded text-xs bg-white dark:bg-gray-800"
                                      rows="2"
                                    />
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => onSaveEstimationEdit(entry.id)}
                                        className="px-2.5 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 cursor-pointer"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={onCancelEstimationEdit}
                                        className="px-2.5 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-indigo-600 dark:text-indigo-400 text-xs px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/50 font-mono">
                                          {formatTime(entry.hours, entry.minutes)}
                                        </span>
                                        {!userOwnsEntry(entry) && (
                                          <span className="flex items-center text-gray-400" title="You can only view this entry">
                                            <Lock size={11} />
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {userOwnsEntry(entry) ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => onStartEditingEstimation(entry)}
                                              className="p-1 rounded text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                                              title="Edit estimation"
                                            >
                                              <Pencil size={13} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => onConfirmDeleteEstimation(entry.id)}
                                              className="p-1 rounded text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                                              title="Delete estimation"
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          </>
                                        ) : (
                                          <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">View only</span>
                                        )}
                                      </div>
                                    </div>
                                    <p className="text-xs text-gray-700 dark:text-gray-300 break-words leading-relaxed bg-gray-50 dark:bg-gray-850 p-2 rounded border border-gray-100 dark:border-gray-800">
                                      {entry.reason}
                                    </p>
                                    <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 pt-0.5">
                                      <div className="flex items-center gap-1.5 truncate max-w-[60%]">
                                        <User size={12} className="shrink-0 text-gray-400" />
                                        <span className="truncate">{getUserDisplayName(entry)}</span>
                                      </div>
                                      <span className="shrink-0 text-gray-400 dark:text-gray-500">{formatDate(entry.date)}</span>
                                    </div>
                                  </>
                                )}
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                        {sortedEstimationEntries.length === 0 && (
                          <div className="py-6 text-center text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                            No estimates added yet
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Total Estimate Footer */}
                    <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-600 dark:text-gray-400">Total Estimate:</span>
                      <span className="font-bold text-sm font-mono text-indigo-600 dark:text-indigo-400">
                        {formatTime(totalEstimation.hours, totalEstimation.minutes)}
                      </span>
                    </div>
                  </div>

                  {/* COLUMN 2: LOGGED TIME */}
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-850/30 p-4 flex flex-col">
                    <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-gray-200/80 dark:border-gray-800">
                      <div className="flex items-center gap-2">
                        <PlayCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
                        <h4 className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                          Logged Time
                        </h4>
                      </div>
                      {sortedLoggedTime.length > 0 && (
                        <span className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded border ${
                          isOvertime
                            ? "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-900/50"
                            : "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-100 dark:border-emerald-900/40"
                        }`}>
                          {formatTime(totalLogged.hours, totalLogged.minutes)}
                        </span>
                      )}
                    </div>

                    {/* Add Logged Time Inputs */}
                    <div className="space-y-2 mb-3">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            value={newLoggedHours}
                            onChange={(e) => onLoggedHoursChange(e.target.value)}
                            placeholder="0"
                            className={`w-full px-2.5 py-1.5 pr-6 text-xs sm:text-sm rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none transition-colors ${
                              loggedValidationError
                                ? "border-rose-300 dark:border-rose-700 focus:ring-1 focus:ring-rose-500"
                                : "border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            }`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium pointer-events-none">
                            h
                          </span>
                        </div>
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            value={newLoggedMinutes}
                            onChange={(e) => onLoggedMinutesChange(e.target.value)}
                            placeholder="0"
                            className={`w-full px-2.5 py-1.5 pr-6 text-xs sm:text-sm rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none transition-colors ${
                              loggedValidationError
                                ? "border-rose-300 dark:border-rose-700 focus:ring-1 focus:ring-rose-500"
                                : "border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            }`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium pointer-events-none">
                            m
                          </span>
                        </div>
                      </div>

                      <div className="relative flex items-center">
                        <Calendar size={13} className="absolute left-2.5 text-gray-400 pointer-events-none" />
                        <input
                          type="date"
                          value={newLoggedDate || todayDate}
                          onChange={(e) => onLoggedDateChange(e.target.value)}
                          max={todayDate}
                          className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      <textarea
                        value={newLoggedDescription}
                        onChange={(e) => onLoggedDescriptionChange(e.target.value)}
                        placeholder="Description of work (mandatory)"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
                        rows="2"
                      />

                      {loggedValidationError && (
                        <div className="flex items-center gap-1.5 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-lg text-rose-600 dark:text-rose-400 text-xs">
                          <AlertCircle size={14} className="shrink-0" />
                          <span>{loggedValidationError}</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={onAddLoggedTime}
                        disabled={!!loggedValidationError}
                        className={`w-full py-2 px-3 rounded-lg text-xs font-medium shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                          loggedValidationError
                            ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-gray-200 dark:border-gray-700"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white"
                        }`}
                      >
                        Log Time
                      </button>
                    </div>

                    {/* Logged Time Entries List (Latest on top) */}
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-1.5">
                        <span>History (Latest first)</span>
                        <span>{sortedLoggedTime.length} {sortedLoggedTime.length === 1 ? "entry" : "entries"}</span>
                      </div>

                      <div className="space-y-2 max-h-56 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
                        <AnimatePresence initial={false}>
                          {sortedLoggedTime.map((entry, index) => {
                            const safeKey = entry._id || entry.id || `logged-${index}`;
                            return (
                              <motion.div
                                key={safeKey}
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-800/90 shadow-2xs text-xs space-y-1.5"
                              >
                                {editingLogged === entry.id ? (
                                  <div className="space-y-2">
                                    <div className="flex gap-2">
                                      <div className="relative flex-1">
                                        <input
                                          type="number"
                                          min="0"
                                          value={editLoggedHours}
                                          onChange={(e) => onEditLoggedHoursChange(e.target.value)}
                                          placeholder="0"
                                          className="w-full p-1 pr-5 border border-emerald-300 dark:border-emerald-700 rounded text-xs bg-white dark:bg-gray-800"
                                        />
                                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">h</span>
                                      </div>
                                      <div className="relative flex-1">
                                        <input
                                          type="number"
                                          min="0"
                                          value={editLoggedMinutes}
                                          onChange={(e) => onEditLoggedMinutesChange(e.target.value)}
                                          placeholder="0"
                                          className="w-full p-1 pr-5 border border-emerald-300 dark:border-emerald-700 rounded text-xs bg-white dark:bg-gray-800"
                                        />
                                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">m</span>
                                      </div>
                                    </div>
                                    <input
                                      type="date"
                                      value={editLoggedDate || todayDate}
                                      onChange={(e) => onEditLoggedDateChange(e.target.value)}
                                      max={todayDate}
                                      className="w-full p-1 border border-emerald-300 dark:border-emerald-700 rounded text-xs bg-white dark:bg-gray-800"
                                    />
                                    <textarea
                                      value={editLoggedDescription}
                                      onChange={(e) => onEditLoggedDescriptionChange(e.target.value)}
                                      placeholder="Description of work"
                                      className="w-full p-1 border border-emerald-300 dark:border-emerald-700 rounded text-xs bg-white dark:bg-gray-800"
                                      rows="2"
                                    />
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => onSaveLoggedEdit(entry.id)}
                                        className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 cursor-pointer"
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={onCancelLoggedEdit}
                                        className="px-2.5 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900/50 font-mono">
                                          {formatTime(entry.hours, entry.minutes)}
                                        </span>
                                        {!userOwnsEntry(entry) && (
                                          <span className="flex items-center text-gray-400" title="You can only view this entry">
                                            <Lock size={11} />
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        {userOwnsEntry(entry) ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => onStartEditingLogged(entry)}
                                              className="p-1 rounded text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                                              title="Edit logged time"
                                            >
                                              <Pencil size={13} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => onConfirmDeleteLoggedTime(entry.id)}
                                              className="p-1 rounded text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                                              title="Delete logged time"
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          </>
                                        ) : (
                                          <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">View only</span>
                                        )}
                                      </div>
                                    </div>
                                    <p className="text-xs text-gray-700 dark:text-gray-300 break-words leading-relaxed bg-gray-50 dark:bg-gray-850 p-2 rounded border border-gray-100 dark:border-gray-800">
                                      {entry.description}
                                    </p>
                                    <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 pt-0.5">
                                      <div className="flex items-center gap-1.5 truncate max-w-[60%]">
                                        <User size={12} className="shrink-0 text-gray-400" />
                                        <span className="truncate">{getUserDisplayName(entry)}</span>
                                      </div>
                                      <span className="shrink-0 text-gray-400 dark:text-gray-500">{formatDate(entry.date)}</span>
                                    </div>
                                  </>
                                )}
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                        {sortedLoggedTime.length === 0 && (
                          <div className="py-6 text-center text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                            No time logged yet
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Total Logged Footer */}
                    <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-600 dark:text-gray-400">Total Logged:</span>
                      <span className={`font-bold text-sm font-mono ${isOvertime ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {formatTime(totalLogged.hours, totalLogged.minutes)}
                      </span>
                    </div>
                  </div>

                  {/* COLUMN 3: BILLED TIME OR MILESTONE APPROVAL */}
                  {!billedTimeLoading && !billedTimeError && !isEmployee && isMilestoneProject ? (
                    <MilestoneApprovalPanel project={project} source={billingSource} />
                  ) : !isMilestoneProject || billedTimeLoading || billedTimeError ? (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-850/30 p-4 flex flex-col">
                      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-gray-200/80 dark:border-gray-800">
                        <div className="flex items-center gap-2">
                          <DollarSign size={16} className="text-amber-600 dark:text-amber-400" />
                          <h4 className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                            Billed Time
                          </h4>
                        </div>
                        {canAccessBilledTime && sortedBilledTime.length > 0 && (
                          <span className="text-[11px] font-mono font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-100 dark:border-amber-900/40">
                            {formatTime(totalBilled.hours, totalBilled.minutes)}
                          </span>
                        )}
                      </div>

                      {billedTimeLoading || billedTimeError ? (
                        <div role={billedTimeError ? 'alert' : 'status'} className="my-auto rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                          <p>{billedTimeError ? 'Unable to load billing settings.' : 'Loading billing settings…'}</p>
                          {billedTimeError && <button type="button" onClick={onRetryBilledTime} className="mt-2 font-semibold underline">Retry billing settings</button>}
                        </div>
                      ) : !canAccessBilledTime ? (
                        <div className="my-auto p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30 text-xs space-y-2">
                          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-semibold text-sm">
                            <Info size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>Billed Time Unavailable</span>
                          </div>
                          <p className="text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                            {billedTimeHiddenReason || "You do not have permission to view billed time for this task."}
                          </p>
                          <p className="text-[11px] text-amber-600 dark:text-amber-400">
                            Billing metrics remain managed by authorized workspace managers.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Add Billed Time Inputs */}
                          <div className="space-y-2 mb-3">
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  min="0"
                                  value={newBilledHours}
                                  onChange={(e) => onBilledHoursChange(e.target.value)}
                                  placeholder="0"
                                  className={`w-full px-2.5 py-1.5 pr-6 text-xs sm:text-sm rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none transition-colors ${
                                    billedValidationError
                                      ? "border-rose-300 dark:border-rose-700 focus:ring-1 focus:ring-rose-500"
                                      : "border-gray-200 dark:border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                                  }`}
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium pointer-events-none">
                                  h
                                </span>
                              </div>
                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  min="0"
                                  value={newBilledMinutes}
                                  onChange={(e) => onBilledMinutesChange(e.target.value)}
                                  placeholder="0"
                                  className={`w-full px-2.5 py-1.5 pr-6 text-xs sm:text-sm rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none transition-colors ${
                                    billedValidationError
                                      ? "border-rose-300 dark:border-rose-700 focus:ring-1 focus:ring-rose-500"
                                      : "border-gray-200 dark:border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                                  }`}
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-medium pointer-events-none">
                                  m
                                </span>
                              </div>
                            </div>

                            <div className="relative flex items-center">
                              <Calendar size={13} className="absolute left-2.5 text-gray-400 pointer-events-none" />
                              <input
                                type="date"
                                value={newBilledDate || todayDate}
                                onChange={(e) => onBilledDateChange(e.target.value)}
                                max={todayDate}
                                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                              />
                            </div>

                            <textarea
                              value={newBilledDescription}
                              onChange={(e) => onBilledDescriptionChange(e.target.value)}
                              placeholder="Description of billable work (mandatory)"
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none"
                              rows="2"
                            />

                            {billedValidationError && (
                              <div className="flex items-center gap-1.5 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-lg text-rose-600 dark:text-rose-400 text-xs">
                                <AlertCircle size={14} className="shrink-0" />
                                <span>{billedValidationError}</span>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={onAddBilledTime}
                              disabled={!!billedValidationError}
                              className={`w-full py-2 px-3 rounded-lg text-xs font-medium shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                                billedValidationError
                                  ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-gray-200 dark:border-gray-700"
                                  : "bg-amber-600 hover:bg-amber-700 text-white"
                              }`}
                            >
                              Add Billed Time
                            </button>
                          </div>

                          {/* Billed Time Entries List (Latest on top) */}
                          <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex items-center justify-between text-[11px] font-medium text-gray-400 dark:text-gray-500 mb-1.5">
                              <span>History (Latest first)</span>
                              <span>{sortedBilledTime.length} {sortedBilledTime.length === 1 ? "entry" : "entries"}</span>
                            </div>

                            <div className="space-y-2 max-h-56 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
                              <AnimatePresence initial={false}>
                                {sortedBilledTime.map((entry, index) => {
                                  const safeKey = entry._id || entry.id || `billed-${index}`;
                                  return (
                                    <motion.div
                                      key={safeKey}
                                      initial={{ opacity: 0, y: -6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95 }}
                                      className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-800/90 shadow-2xs text-xs space-y-1.5"
                                    >
                                      {editingBilled === entry.id ? (
                                        <div className="space-y-2">
                                          <div className="flex gap-2">
                                            <div className="relative flex-1">
                                              <input
                                                type="number"
                                                min="0"
                                                value={editBilledHours}
                                                onChange={(e) => onEditBilledHoursChange(e.target.value)}
                                                placeholder="0"
                                                className="w-full p-1 pr-5 border border-amber-300 dark:border-amber-700 rounded text-xs bg-white dark:bg-gray-800"
                                              />
                                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">h</span>
                                            </div>
                                            <div className="relative flex-1">
                                              <input
                                                type="number"
                                                min="0"
                                                value={editBilledMinutes}
                                                onChange={(e) => onEditBilledMinutesChange(e.target.value)}
                                                placeholder="0"
                                                className="w-full p-1 pr-5 border border-amber-300 dark:border-amber-700 rounded text-xs bg-white dark:bg-gray-800"
                                              />
                                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">m</span>
                                            </div>
                                          </div>
                                          <input
                                            type="date"
                                            value={editBilledDate || todayDate}
                                            onChange={(e) => onEditBilledDateChange(e.target.value)}
                                            max={todayDate}
                                            className="w-full p-1 border border-amber-300 dark:border-amber-700 rounded text-xs bg-white dark:bg-gray-800"
                                          />
                                          <textarea
                                            value={editBilledDescription}
                                            onChange={(e) => onEditBilledDescriptionChange(e.target.value)}
                                            placeholder="Description of billable work"
                                            className="w-full p-1 border border-amber-300 dark:border-amber-700 rounded text-xs bg-white dark:bg-gray-800"
                                            rows="2"
                                          />
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => onSaveBilledEdit(entry.id)}
                                              className="px-2.5 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 cursor-pointer"
                                            >
                                              Save
                                            </button>
                                            <button
                                              type="button"
                                              onClick={onCancelBilledEdit}
                                              className="px-2.5 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-semibold text-amber-600 dark:text-amber-400 text-xs px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900/50 font-mono">
                                                {formatTime(entry.hours, entry.minutes)}
                                              </span>
                                              {!userOwnsEntry(entry) && (
                                                <span className="flex items-center text-gray-400" title="You can only view this entry">
                                                  <Lock size={11} />
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-1">
                                              {userOwnsEntry(entry) ? (
                                                <>
                                                  <button
                                                    type="button"
                                                    onClick={() => onStartEditingBilled(entry)}
                                                    className="p-1 rounded text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                                                    title="Edit billed time"
                                                  >
                                                    <Pencil size={13} />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => onConfirmDeleteBilledTime(entry.id)}
                                                    className="p-1 rounded text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                                                    title="Delete billed time"
                                                  >
                                                    <Trash2 size={13} />
                                                  </button>
                                                </>
                                              ) : (
                                                <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">View only</span>
                                              )}
                                            </div>
                                          </div>
                                          <p className="text-xs text-gray-700 dark:text-gray-300 break-words leading-relaxed bg-gray-50 dark:bg-gray-850 p-2 rounded border border-gray-100 dark:border-gray-800">
                                            {entry.description}
                                          </p>
                                          <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 pt-0.5">
                                            <div className="flex items-center gap-1.5 truncate max-w-[60%]">
                                              <User size={12} className="shrink-0 text-gray-400" />
                                              <span className="truncate">{getUserDisplayName(entry)}</span>
                                            </div>
                                            <span className="shrink-0 text-gray-400 dark:text-gray-500">{formatDate(entry.date)}</span>
                                          </div>
                                        </>
                                      )}
                                    </motion.div>
                                  );
                                })}
                              </AnimatePresence>
                              {sortedBilledTime.length === 0 && (
                                <div className="py-6 text-center text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                                  No billed time added yet
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Total Billed Footer */}
                          <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between text-xs">
                            <span className="font-medium text-gray-600 dark:text-gray-400">Total Billed:</span>
                            <span className="font-bold text-sm font-mono text-amber-600 dark:text-amber-400">
                              {formatTime(totalBilled.hours, totalBilled.minutes)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Modal Footer: Overall Progress */}
              <div className="px-5 py-3.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-850/60 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Overall Progress
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 font-mono">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {formatTime(totalLogged.hours, totalLogged.minutes)}
                      </span>{" "}
                      logged of{" "}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {formatTime(totalEstimation.hours, totalEstimation.minutes)}
                      </span>{" "}
                      estimated
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block w-36 md:w-48 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.min(timeProgress, 100)}%` }}
                        className={`h-full rounded-full transition-all duration-300 ${
                          isOvertime ? "bg-rose-500" : "bg-blue-600"
                        }`}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-base sm:text-lg font-bold font-mono ${
                          isOvertime ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {timeProgress}%
                      </span>
                      {isOvertime && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900 font-medium">
                          Over estimate
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.35);
          border-radius: 9999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.6);
        }
      `}</style>
    </div>
  );
};

export default TimeTrackingSection;
