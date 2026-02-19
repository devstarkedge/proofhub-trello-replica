import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MoreVertical, Share2, Link as LinkIcon, Trash2, ArrowRightLeft, Copy, Archive, ArchiveRestore, ArrowUpCircle } from "lucide-react";
import DeletePopup from "../ui/DeletePopup";
import CopyMoveModal from "../CopyMoveModal";
import usePermissions from "../../hooks/usePermissions";

const ENTITY_LABEL = {
  task: "Task",
  subtask: "Subtask",
  subtaskNano: "Neno-Subtask",
};

const CardActionMenu = ({
  entityType = "task",
  ids = {},
  onDelete,
  onArchive,
  onUnarchive,
  isArchived = false,
  isDeleting = false,
  isArchiving = false,
  disabled = false,
  // Copy/Move props
  entityData = null,
  currentDepartmentId = null,
  currentProjectId = null,
  currentListId = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [showCopyMoveModal, setShowCopyMoveModal] = useState(false);
  const [copyMoveMode, setCopyMoveMode] = useState("copy");
  
  const wrapperRef = useRef(null);
  const { role, isAdmin } = usePermissions();
  const canCopyMove = isAdmin || role === "manager";

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      // Don't close if clicking inside the delete popup (which is in a portal)
      // The portal is outside this DOM tree, so we don't need to check its ref here usually
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setShareOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    let timeout;
    if (copied) {
      timeout = setTimeout(() => setCopied(false), 2000);
    }
    return () => clearTimeout(timeout);
  }, [copied]);

  const shareLink = useMemo(() => {
    if (typeof window === "undefined") return null;
    const projectId = ids.projectId;
    const taskId = ids.taskId;
    const departmentId = ids.departmentId; // Now receiving departmentId
    
    // Check for required IDs - departmentId is now required for correct routing
    if (!projectId || !taskId || !departmentId) return null;

    // New format: /workflow/{departmentId}/{projectId}/{taskId}/
    let path = `/workflow/${departmentId}/${projectId}/${taskId}`;
    
    // Append additional segments if present (though typically handled via simple task link now)
    if (ids.subtaskId) {
      // If needed, we can append query params or hash, but user requested clean path.
      // Assuming nested routing might support it or we stick to task link.
      // The user request was specific: /workflow/{departmentId}/{projectId}/{taskId}/
      // If subtask linking is needed, it might need backend/routing support in that format.
      // For now, based on "This should be the only link format used going forward", I'll stick to the base task link
      // UNLESS the legacy code supported deep linking that works with the new route.
      // The new workflow route structure in App.jsx (lines 87-91) supports:
      // /workflow/:deptId/:projectId/:taskId
      // It DOES NOT explicitly show /subtask/:subtaskId in the new routes list I saw in App.jsx.
      // However, line 90 in App.jsx was: /project/:projectId/task/:taskId/subtask/:subtaskId
      // I am removing that. The new routes (lines 86-88) are:
      // /workflow/:deptId/:projectId
      // /workflow/:deptId/:projectId/:taskId
      // So deep linking to subtasks might not be supported in the URL path directly anymore, 
      // OR it relies on query params/state.
      // I will output the requested format.
    }
    
    return `${window.location.origin}${path}`;
  }, [ids.projectId, ids.taskId, ids.departmentId]);

  const handleCopyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
    } catch (error) {
      console.error("Failed to copy link", error);
    }
  };

  const handleDeleteClick = () => {
    if (!onDelete || isDeleting) return;
    setIsOpen(false); // Close the menu
    setShowDeletePopup(true); // Open the popup
  };

  const handleConfirmDelete = async () => {
    if (!onDelete || isDeleting) return;
    try {
      await onDelete();
      // Popup will be closed by the parent component usually or we can close it here
      setShowDeletePopup(false); 
    } catch (error) {
       console.error("Delete failed", error);
       // Keep popup open on error? Or toast?
    }
  };

  return (
    <>
      <div className="relative" ref={wrapperRef}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`p-2 rounded-full border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors ${
            disabled ? "opacity-40 cursor-not-allowed" : ""
          }`}
          aria-label="Open actions menu"
        >
          <MoreVertical size={20} />
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-2xl border border-gray-100 z-50"
            >
              <div className="py-2">
                {/* Copy/Move/Promote — only for admin/manager, hidden for subtaskNano */}
                {canCopyMove && entityType !== "subtaskNano" && (
                  <>
                    <button
                      onClick={() => {
                        setIsOpen(false);
                        setCopyMoveMode("move");
                        setShowCopyMoveModal(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                    >
                      <ArrowRightLeft size={16} className="text-gray-500" />
                      <span className="font-medium text-gray-800">Move</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsOpen(false);
                        setCopyMoveMode("copy");
                        setShowCopyMoveModal(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                    >
                      <Copy size={16} className="text-gray-500" />
                      <span className="font-medium text-gray-800">Copy</span>
                    </button>
                    {entityType === "subtask" && (
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          setCopyMoveMode("promote");
                          setShowCopyMoveModal(true);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-emerald-50 transition-colors"
                      >
                        <ArrowUpCircle size={16} className="text-emerald-600" />
                        <span className="font-medium text-emerald-700">Promote to Task</span>
                      </button>
                    )}
                  </>
                )}

                {/* Archive/Unarchive button - only visible for tasks */}
                {entityType === "task" && (
                  isArchived ? (
                    <button
                      onClick={() => {
                        setIsOpen(false);
                        onUnarchive?.();
                      }}
                      disabled={isArchiving}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArchiveRestore size={16} className="text-green-600" />
                      <span className="font-medium text-green-700">Unarchive</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setIsOpen(false);
                        onArchive?.();
                      }}
                      disabled={isArchiving}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Archive size={16} className="text-gray-500" />
                      <span className="font-medium text-gray-800">Archive</span>
                    </button>
                  )
                )}
                <div
                  className="relative group"
                  onMouseEnter={() => shareLink && setShareOpen(true)}
                  onMouseLeave={() => setShareOpen(false)}
                >
                  <button
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${
                      !shareLink ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    disabled={!shareLink}
                  >
                    <Share2 size={16} className="text-gray-500" />
                    <span className="font-medium text-gray-800">Share</span>
                  </button>

                  <AnimatePresence>
                    {shareOpen && shareLink && (
                      <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-1/2 right-full mr-3 -translate-y-1/2 bg-white border border-gray-100 rounded-lg shadow-xl px-3 py-2 z-50 min-w-[140px]"
                      >
                        <button
                          onClick={handleCopyLink}
                          className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                        >
                          <LinkIcon size={14} />
                          Copy link
                        </button>
                        <AnimatePresence>
                          {copied && (
                            <motion.span
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              className="mt-2 inline-block text-xs font-semibold text-green-600"
                            >
                              Link copied!
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="my-1 border-t border-gray-100" />

                <button
                  onClick={handleDeleteClick}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50 transition-colors"
                  disabled={isDeleting}
                >
                  <Trash2 size={16} />
                  <span className="font-semibold">
                    Delete {ENTITY_LABEL[entityType]}
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <DeletePopup
        isOpen={showDeletePopup}
        onCancel={() => setShowDeletePopup(false)}
        onConfirm={handleConfirmDelete}
        itemType={entityType === "subtaskNano" ? "subtaskNano" : entityType}
        isLoading={isDeleting}
      />

      <CopyMoveModal
        isOpen={showCopyMoveModal}
        onClose={() => setShowCopyMoveModal(false)}
        mode={copyMoveMode}
        entityType={entityType}
        entityData={entityData}
        currentDepartmentId={currentDepartmentId}
        currentProjectId={currentProjectId || ids.projectId}
        currentListId={currentListId}
      />
    </>
  );
};

export default CardActionMenu;


