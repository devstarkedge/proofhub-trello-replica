import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MoreVertical, Share2, Link as LinkIcon, Trash2, ArrowRightLeft, Copy, Archive } from "lucide-react";

const ENTITY_LABEL = {
  task: "Task",
  subtask: "Subtask",
  subtaskNano: "Neno-Subtask",
};

const CardActionMenu = ({
  entityType = "task",
  ids = {},
  onDelete,
  isDeleting = false,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setShareOpen(false);
        setConfirmingDelete(false);
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
    if (!projectId || !taskId) return null;

    let path = `/project/${projectId}/task/${taskId}`;
    if (ids.subtaskId) {
      path += `/subtask/${ids.subtaskId}`;
    }
    if (ids.nenoId) {
      path += `/neno/${ids.nenoId}`;
    }
    return `${window.location.origin}${path}`;
  }, [ids.projectId, ids.taskId, ids.subtaskId, ids.nenoId]);

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
    setConfirmingDelete(true);
  };

  const handleConfirmDelete = async () => {
    if (!onDelete || isDeleting) return;
    try {
      await onDelete();
      setIsOpen(false);
    } finally {
      setConfirmingDelete(false);
    }
  };

  const entityLabel = ENTITY_LABEL[entityType] || "Item";

  return (
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
            {confirmingDelete ? (
              <div className="p-4 text-sm text-gray-700 space-y-3">
                <p className="font-medium text-gray-900">
                  Delete {entityLabel}?
                </p>
                <p className="text-gray-500 text-xs leading-relaxed">
                  Are you sure you want to delete this {entityLabel}? This action cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setConfirmingDelete(false);
                      setShareOpen(false);
                    }}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-2">
                <button
                  onClick={() => console.log("Move button clicked")}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                >
                  <ArrowRightLeft size={16} className="text-gray-500" />
                  <span className="font-medium text-gray-800">Move</span>
                </button>
                <button
                  onClick={() => console.log("Copy button clicked")}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                >
                  <Copy size={16} className="text-gray-500" />
                  <span className="font-medium text-gray-800">Copy</span>
                </button>
                <button
                  onClick={() => console.log("Archive button clicked")}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                >
                  <Archive size={16} className="text-gray-500" />
                  <span className="font-medium text-gray-800">Archive</span>
                </button>
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

                <button
                  onClick={handleDeleteClick}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50 transition-colors"
                  disabled={isDeleting}
                >
                  <Trash2 size={16} />
                  <span className="font-semibold">
                    {isDeleting ? "Deleting..." : "Delete"}
                  </span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CardActionMenu;

