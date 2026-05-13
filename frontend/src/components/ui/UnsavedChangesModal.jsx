import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Save, Trash2, Edit3 } from 'lucide-react';

/**
 * UnsavedChangesModal
 * Appears over any card/subtask modal when user tries to close without saving.
 *
 * Props:
 *   isOpen            - boolean
 *   entityName        - display name of the task/subtask (string)
 *   dirtyFields       - array of human-readable changed field names
 *   onSave            - () => void  — save and close
 *   onDiscard         - () => void  — discard and close
 *   onContinueEditing - () => void  — close this modal, stay in editor
 *   saving            - boolean    — shows loading state on Save button
 */
const UnsavedChangesModal = ({
  isOpen,
  entityName = 'this item',
  dirtyFields = [],
  onSave,
  onDiscard,
  onContinueEditing,
  saving = false,
}) => {
  const saveButtonRef = useRef(null);
  const modalRef = useRef(null);

  // Auto-focus the save button when modal opens
  useEffect(() => {
    if (isOpen && saveButtonRef.current) {
      // Small delay to ensure portal is mounted
      const timer = setTimeout(() => {
        saveButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Keyboard handling: Escape → continue editing, Enter → save, Tab → trap focus
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Escape → continue editing (close protection modal, stay in main modal)
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onContinueEditing();
        return;
      }

      // Enter → save (only if save button is focused or no specific button is focused)
      if (e.key === 'Enter' && !saving && document.activeElement === saveButtonRef.current) {
        e.preventDefault();
        onSave();
        return;
      }

      // Tab → trap focus within modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    // Use capture phase so this fires before any other keydown handlers in child modals
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, saving, onSave, onContinueEditing]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 9999 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onContinueEditing}
            aria-hidden="true"
          />

          {/* Modal panel */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-modal-title"
            aria-describedby="unsaved-modal-desc"
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ duration: 0.15 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-auto overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top accent stripe */}
            <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />

            <div className="p-6">
              {/* Icon + title */}
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
                  <AlertTriangle size={20} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2
                    id="unsaved-modal-title"
                    className="text-base font-bold text-gray-900 leading-tight"
                  >
                    Unsaved Changes
                  </h2>
                  <p id="unsaved-modal-desc" className="text-xs text-gray-500 mt-0.5">
                    You made updates to:
                  </p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5 break-words line-clamp-2">
                    &ldquo;{entityName}&rdquo;
                  </p>
                </div>
              </div>

              {/* Changed sections list */}
              {dirtyFields.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <p className="text-[11px] font-semibold text-amber-700 mb-1.5 uppercase tracking-wide">
                    Modified sections:
                  </p>
                  <ul className="space-y-1">
                    {dirtyFields.map((field) => (
                      <li key={field} className="flex items-center gap-2 text-sm text-amber-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                        {field}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-sm text-gray-500 mb-5">
                Do you want to save before leaving?
              </p>

              {/* Action buttons */}
              <div className="flex flex-col gap-2">
                {/* Save Changes */}
                <button
                  ref={saveButtonRef}
                  onClick={onSave}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-medium text-sm hover:from-blue-700 hover:to-blue-800 disabled:opacity-60 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                >
                  <Save size={15} />
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>

                {/* Discard */}
                <button
                  onClick={onDiscard}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-red-200 text-red-600 rounded-xl font-medium text-sm hover:bg-red-50 disabled:opacity-60 transition-all focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
                >
                  <Trash2 size={15} />
                  Discard &amp; Close
                </button>

                {/* Continue Editing */}
                <button
                  onClick={onContinueEditing}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-gray-200 text-gray-600 rounded-xl font-medium text-sm hover:bg-gray-50 disabled:opacity-60 transition-all focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1"
                >
                  <Edit3 size={15} />
                  Continue Editing
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default UnsavedChangesModal;
