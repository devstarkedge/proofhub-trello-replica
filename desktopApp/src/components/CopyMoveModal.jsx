import React, { memo, useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import {
  HiOutlineDocumentDuplicate,
  HiOutlineArrowsRightLeft,
  HiOutlineArrowUpCircle,
  HiOutlineBuildingOffice2,
  HiOutlineFolder,
  HiOutlineQueueList,
  HiOutlineClock,
  HiOutlineXMark,
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
} from "react-icons/hi2";
import Database from "../services/database";
import useCopyMoveDestinations from "../hooks/useCopyMoveDestinations";

/* ────────────────────────────────────────────────────────────
   CopyMoveModal — Enterprise-grade Copy / Move / Promote modal
   Portal-based, framer-motion animated, cascading dropdowns
   ──────────────────────────────────────────────────────────── */

const MODES = { COPY: "copy", MOVE: "move", PROMOTE: "promote" };

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } };
const panelVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", duration: 0.35, bounce: 0.18 } },
  exit: { opacity: 0, scale: 0.95, y: 16, transition: { duration: 0.2 } },
};

/* ── Small select dropdown ──────────────────────────────── */
const CascadeSelect = memo(({ label, icon: Icon, value, onChange, options, loading, placeholder, disabled }) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
    </label>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
        className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 pr-8 text-sm text-gray-800 shadow-sm 
                   transition-all duration-150 hover:border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">{loading ? "Loading…" : placeholder || `Select ${label}`}</option>
        {options.map((opt) => (
          <option key={opt._id} value={opt._id}>
            {opt.title || opt.name}
          </option>
        ))}
      </select>
      {/* Custom caret */}
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  </div>
));
CascadeSelect.displayName = "CascadeSelect";

/* ── Copy options checkbox ──────────────────────────────── */
const CopyOption = memo(({ label, checked, onChange, disabled }) => (
  <label
    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors cursor-pointer select-none
                ${checked ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}
                ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/30"
    />
    <span className="text-sm font-medium">{label}</span>
  </label>
));
CopyOption.displayName = "CopyOption";

/* ── Recent destination chip ────────────────────────────── */
const RecentChip = memo(({ dest, onClick, isActive }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all duration-150
                ${isActive
                  ? "bg-blue-100 text-blue-700 border-blue-300 ring-2 ring-blue-500/20"
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                }`}
  >
    <HiOutlineClock className="w-3.5 h-3.5 shrink-0" />
    <span className="truncate max-w-[180px]">
      {dest.departmentName} / {dest.projectName} / {dest.listName}
    </span>
  </button>
));
RecentChip.displayName = "RecentChip";

/* ═══════════════════════ MAIN MODAL ══════════════════════ */
const CopyMoveModal = memo(({
  isOpen,
  onClose,
  mode = MODES.COPY,         // 'copy' | 'move' | 'promote'
  entityType = "task",        // 'task' | 'subtask'
  entityData = {},            // card or subtask data
  currentDepartmentId,
  currentProjectId,
  currentListId,
}) => {
  // Destination cascading hook
  const dest = useCopyMoveDestinations({
    currentDepartmentId,
    currentProjectId,
    currentListId,
  });

  // Local UI state
  const [submitting, setSubmitting] = useState(false);
  const [activeMode, setActiveMode] = useState(mode);

  // Copy options (only relevant for copy & promote)
  const [copyOptions, setCopyOptions] = useState({
    copyComments: true,
    copyAttachments: true,
    copyChecklist: true,
    copyAssignees: true,
    copyDueDates: true,
  });

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setActiveMode(mode);
      setSubmitting(false);
      setCopyOptions({ copyComments: true, copyAttachments: true, copyChecklist: true, copyAssignees: true, copyDueDates: true });
    }
  }, [isOpen, mode]);

  // Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (isOpen && !submitting && e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, submitting, onClose]);

  // Toggle copy option
  const toggleOption = useCallback((key) => (val) => {
    setCopyOptions((prev) => ({ ...prev, [key]: val }));
  }, []);

  // Computed
  const entityTitle = entityData?.title || "Untitled";
  const entityId = entityData?._id || entityData?.id;

  const isSameList = dest.selectedListId === currentListId && dest.selectedProjectId === currentProjectId;
  const canSubmit = dest.isDestinationComplete && !submitting && !dest.loading;

  const submitDisabledReason = useMemo(() => {
    if (!dest.selectedDepartmentId) return "Select a department";
    if (!dest.selectedProjectId) return "Select a project";
    if (!dest.selectedListId) return "Select a list";
    if (activeMode === "move" && isSameList) return "Cannot move to the same list";
    return null;
  }, [dest.selectedDepartmentId, dest.selectedProjectId, dest.selectedListId, activeMode, isSameList]);

  // Header config per mode
  const modeConfig = useMemo(() => ({
    copy: {
      icon: HiOutlineDocumentDuplicate,
      title: "Copy Task",
      actionLabel: "Copy",
      color: "blue",
      bgClass: "from-blue-600 to-blue-700",
      hoverClass: "hover:from-blue-700 hover:to-blue-800",
    },
    move: {
      icon: HiOutlineArrowsRightLeft,
      title: "Move Task",
      actionLabel: "Move",
      color: "amber",
      bgClass: "from-amber-500 to-amber-600",
      hoverClass: "hover:from-amber-600 hover:to-amber-700",
    },
    promote: {
      icon: HiOutlineArrowUpCircle,
      title: "Promote to Task",
      actionLabel: "Promote",
      color: "emerald",
      bgClass: "from-emerald-600 to-emerald-700",
      hoverClass: "hover:from-emerald-700 hover:to-emerald-800",
    },
  }), []);

  const cfg = modeConfig[activeMode] || modeConfig.copy;
  const ModeIcon = cfg.icon;

  /* ── Submit handler ───────────────────────────────────── */
  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitDisabledReason) return;
    setSubmitting(true);

    try {
      if (activeMode === "copy") {
        await Database.copyCard(entityId, {
          destinationListId: dest.selectedListId,
          destinationBoardId: dest.selectedProjectId,
          ...copyOptions,
        });
        toast.success(`Task copied successfully`, { autoClose: 3000 });
        onClose();
      } else if (activeMode === "move") {
        const res = await Database.crossMoveCard(entityId, {
          destinationListId: dest.selectedListId,
          destinationBoardId: dest.selectedProjectId,
        });
        const undoToken = res?.undoToken;
        onClose();
        // Toast with undo button
        if (undoToken) {
          toast.info(
            ({ closeToast }) => (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">Task moved successfully</span>
                <button
                  onClick={async () => {
                    try {
                      await Database.undoMoveCard(entityId, undoToken);
                      toast.success("Move undone", { autoClose: 2000 });
                    } catch {
                      toast.error("Undo expired or failed");
                    }
                    closeToast();
                  }}
                  className="shrink-0 rounded-md bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider hover:bg-white/30 transition-colors"
                >
                  Undo
                </button>
              </div>
            ),
            { autoClose: 8000, closeOnClick: false }
          );
        } else {
          toast.success("Task moved successfully", { autoClose: 3000 });
        }
      } else if (activeMode === "promote") {
        await Database.promoteSubtask(entityId, {
          destinationListId: dest.selectedListId,
          destinationBoardId: dest.selectedProjectId,
          ...copyOptions,
        });
        toast.success("Subtask promoted to task!", { autoClose: 3000 });
        onClose();
      }
    } catch (err) {
      console.error(`${activeMode} failed:`, err);
      toast.error(err?.message || `Failed to ${activeMode} task`);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitDisabledReason, activeMode, entityId, dest.selectedListId, dest.selectedProjectId, copyOptions, onClose]);

  /* ── Recent destination match check ───────────────────── */
  const isRecentActive = useCallback(
    (recent) =>
      recent.departmentId === dest.selectedDepartmentId &&
      recent.projectId === dest.selectedProjectId &&
      recent.listId === dest.selectedListId,
    [dest.selectedDepartmentId, dest.selectedProjectId, dest.selectedListId]
  );

  /* ── Render ───────────────────────────────────────────── */
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center isolate">
          {/* Backdrop */}
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => { e.stopPropagation(); if (!submitting) onClose(); }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Panel */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5"
            role="dialog"
            aria-modal="true"
            aria-label={cfg.title}
          >
            {/* ── Header ─────────────────────────────────── */}
            <div className={`bg-gradient-to-r ${cfg.bgClass} px-5 py-4`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-white/20 p-2">
                    <ModeIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">{cfg.title}</h2>
                    <p className="text-xs text-white/70 truncate max-w-[260px]" title={entityTitle}>
                      {entityTitle}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-lg p-1.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                >
                  <HiOutlineXMark className="w-5 h-5" />
                </button>
              </div>

              {/* ── Mode Toggle (copy/move only for tasks) ── */}
              {entityType === "task" && activeMode !== "promote" && (
                <div className="flex mt-3 bg-white/10 rounded-lg p-0.5">
                  {["copy", "move"].map((m) => (
                    <button
                      key={m}
                      onClick={() => setActiveMode(m)}
                      className={`flex-1 rounded-md py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-150
                                  ${activeMode === m ? "bg-white text-gray-800 shadow-sm" : "text-white/70 hover:text-white"}`}
                    >
                      {m === "copy" ? "Copy" : "Move"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Body ───────────────────────────────────── */}
            <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Recent Destinations */}
              {dest.recentDestinations.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <HiOutlineClock className="w-3.5 h-3.5" />
                    Recent Destinations
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {dest.recentDestinations.map((recent, i) => (
                      <RecentChip
                        key={`${recent.listId}-${i}`}
                        dest={recent}
                        isActive={isRecentActive(recent)}
                        onClick={() => dest.applyRecentDestination(recent)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Cascading Selectors */}
              <div className="space-y-3">
                <CascadeSelect
                  label="Department"
                  icon={HiOutlineBuildingOffice2}
                  value={dest.selectedDepartmentId}
                  onChange={dest.selectDepartment}
                  options={dest.departments}
                  loading={dest.loadingDepartments}
                  placeholder="Select department"
                />
                <CascadeSelect
                  label="Project"
                  icon={HiOutlineFolder}
                  value={dest.selectedProjectId}
                  onChange={dest.selectProject}
                  options={dest.projects}
                  loading={dest.loadingProjects}
                  placeholder="Select project"
                  disabled={!dest.selectedDepartmentId}
                />
                <CascadeSelect
                  label="List"
                  icon={HiOutlineQueueList}
                  value={dest.selectedListId}
                  onChange={dest.selectList}
                  options={dest.lists}
                  loading={dest.loadingLists}
                  placeholder="Select list"
                  disabled={!dest.selectedProjectId}
                />
              </div>

              {/* Same list warning for move */}
              {activeMode === "move" && isSameList && dest.isDestinationComplete && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <HiOutlineExclamationTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    This task is already in the selected list. Choose a different destination to move.
                  </p>
                </div>
              )}

              {/* Copy Options (for copy & promote modes) */}
              {(activeMode === "copy" || activeMode === "promote") && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Include
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <CopyOption label="Comments" checked={copyOptions.copyComments} onChange={toggleOption("copyComments")} />
                    <CopyOption label="Attachments" checked={copyOptions.copyAttachments} onChange={toggleOption("copyAttachments")} />
                    <CopyOption label="Checklist" checked={copyOptions.copyChecklist} onChange={toggleOption("copyChecklist")} />
                    <CopyOption label="Assignees" checked={copyOptions.copyAssignees} onChange={toggleOption("copyAssignees")} />
                    <CopyOption label="Due Dates" checked={copyOptions.copyDueDates} onChange={toggleOption("copyDueDates")} />
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer ─────────────────────────────────── */}
            <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between bg-gray-50/50">
              <button
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit || !!submitDisabledReason}
                title={submitDisabledReason || ""}
                className={`rounded-lg bg-gradient-to-r ${cfg.bgClass} ${cfg.hoverClass} px-5 py-2 text-sm font-semibold text-white shadow-sm 
                           transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
                           flex items-center gap-2`}
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Processing…
                  </>
                ) : (
                  <>
                    <HiOutlineCheckCircle className="w-4 h-4" />
                    {cfg.actionLabel}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
});

CopyMoveModal.displayName = "CopyMoveModal";
export default CopyMoveModal;
