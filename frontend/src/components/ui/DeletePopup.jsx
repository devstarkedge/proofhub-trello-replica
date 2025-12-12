import React, { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, AlertTriangle, X } from "lucide-react";

const ITEM_CONFIG = {
  list: {
    title: "Delete List?",
    description: "Are you sure you want to delete this list? All its cards will also be removed.",
    warning: "This action cannot be undone."
  },
  card: {
    title: "Delete Card?",
    description: "Do you really want to delete this card?",
    warning: "This action cannot be undone. All comments, attachments, and subtasks will be lost."
  },
  subtask: {
    title: "Delete Subtask?",
    description: "Delete this subtask permanently?",
    warning: "This cannot be recovered."
  },
  "subtaskNano": {
    title: "Delete Neno-Subtask?",
    description: "Delete this neno-subtask?",
    warning: null
  },
  comment: {
    title: "Delete Comment?",
    description: "Delete this comment?",
    warning: null
  },
  attachment: {
    title: "Delete Attachment?",
    description: "Are you sure you want to remove this attachment?",
    warning: "This file will be permanently deleted."
  },
  project: {
    title: "Delete Project?",
    description: "Are you sure you want to delete this project? All lists and cards within it will be permanently removed.",
    warning: "This action cannot be undone."
  },
  default: {
    title: "Delete Item?",
    description: "Are you sure you want to delete this item?",
    warning: "This action cannot be undone."
  }
};

const DeletePopup = memo(({
  isOpen,
  onConfirm,
  onCancel,
  title, // override
  description, // override
  itemType = "default",
  isLoading = false,
  preventCloseOnOverlay = false
}) => {
  const config = ITEM_CONFIG[itemType] || ITEM_CONFIG.default;
  const displayTitle = title || config.title;
  const displayDesc = description || config.description;

  useEffect(() => {
    const handleEscape = (e) => {
      if (isOpen && !isLoading && e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, isLoading, onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center isolate">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLoading && !preventCloseOnOverlay) onCancel();
            }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <div className="p-6 text-center">
              {/* Icon */}
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <motion.div
                  initial={{ scale: 0.8, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.1, type: "spring" }}
                >
                  <Trash2 className="w-6 h-6 text-red-600" />
                </motion.div>
              </div>

              {/* Text */}
              <h3 
                id="delete-dialog-title" 
                className="text-lg font-bold text-gray-900 mb-2 leading-tight"
              >
                {displayTitle}
              </h3>
              
              <div className="text-sm text-gray-500 leading-relaxed mb-6 space-y-2">
                <p>{displayDesc}</p>
                {config.warning && (
                  <p className="flex items-center justify-center gap-1.5 text-red-600 font-medium bg-red-50/50 py-1 px-2 rounded-lg text-xs">
                    <AlertTriangle size={12} />
                    {config.warning}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel();
                  }}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirm();
                  }}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-red-200 disabled:opacity-70 disabled:cursor-wait disabled:shadow-none flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                >
                  {isLoading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Delete</span>
                  )}
                </button>
              </div>
            </div>

            {/* Close Button (Optional, but good for accessibility) */}
            {!isLoading && (
              <button
                onClick={onCancel}
                className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
});

DeletePopup.displayName = 'DeletePopup';

export default DeletePopup;
