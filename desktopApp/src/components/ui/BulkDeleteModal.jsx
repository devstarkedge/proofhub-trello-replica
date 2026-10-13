import React, { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, AlertTriangle, X, FolderKanban } from "lucide-react";

const BulkDeleteModal = memo(({
  isOpen,
  projects = [],
  onConfirm,
  onCancel,
  isLoading = false
}) => {
  const count = projects.length;
  const previewNames = projects.slice(0, 3).map(p => p.name);
  const remaining = count - previewNames.length;

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
              if (!isLoading) onCancel();
            }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative bg-white rounded-2xl shadow-2xl p-0 w-full max-w-md mx-4 z-10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with red gradient */}
            <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <AlertTriangle size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Delete {count} Project{count !== 1 ? 's' : ''}?
                    </h3>
                    <p className="text-red-100 text-xs mt-0.5">This action cannot be undone</p>
                  </div>
                </div>
                {!isLoading && (
                  <button
                    onClick={onCancel}
                    className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X size={18} className="text-white" />
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Are you sure you want to delete the selected project{count !== 1 ? 's' : ''}? 
                All lists, cards, subtasks, and related data within {count !== 1 ? 'them' : 'it'} will be permanently removed.
              </p>

              {/* Project preview list */}
              {previewNames.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 mb-4 border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Projects to delete
                  </p>
                  <div className="space-y-1.5">
                    {previewNames.map((name, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <FolderKanban size={14} className="text-red-400 flex-shrink-0" />
                        <span className="truncate font-medium">{name}</span>
                      </motion.div>
                    ))}
                    {remaining > 0 && (
                      <p className="text-xs text-gray-400 mt-1 pl-5">
                        and {remaining} more project{remaining !== 1 ? 's' : ''}...
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Warning */}
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-1">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  You'll have a few seconds to undo this action after confirming.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onCancel}
                disabled={isLoading}
                className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onConfirm}
                disabled={isLoading}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-red-600 rounded-xl hover:from-red-600 hover:to-red-700 shadow-lg shadow-red-200 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Delete {count} Project{count !== 1 ? 's' : ''}</span>
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
});

BulkDeleteModal.displayName = 'BulkDeleteModal';

export default BulkDeleteModal;
