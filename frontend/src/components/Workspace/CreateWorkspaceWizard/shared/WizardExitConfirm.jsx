import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, Edit3 } from 'lucide-react';

/**
 * Confirms discarding an in-progress workspace creation. Visually modeled
 * on ui/UnsavedChangesModal.jsx, but with a 2-button contract instead of 3
 * — nothing exists server-side yet at this point in the flow, so there's no
 * "Save Changes" action that applies here.
 */
const WizardExitConfirm = ({ isOpen, onDiscard, onContinueEditing }) => {
  const continueButtonRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen && continueButtonRef.current) {
      const timer = setTimeout(() => continueButtonRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onContinueEditing();
        return;
      }
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
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onContinueEditing]);

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
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onContinueEditing}
            aria-hidden="true"
          />

          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wizard-exit-title"
            aria-describedby="wizard-exit-desc"
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ duration: 0.15 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-auto overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />

            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
                  <AlertTriangle size={20} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 id="wizard-exit-title" className="text-base font-bold text-gray-900 leading-tight">
                    Discard workspace creation?
                  </h2>
                  <p id="wizard-exit-desc" className="text-sm text-gray-500 mt-1">
                    Your entered information will be lost.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  ref={continueButtonRef}
                  onClick={onContinueEditing}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-medium text-sm hover:from-emerald-700 hover:to-teal-700 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                >
                  <Edit3 size={15} />
                  Continue Editing
                </button>

                <button
                  onClick={onDiscard}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-red-200 text-red-600 rounded-xl font-medium text-sm hover:bg-red-50 transition-all focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
                >
                  <Trash2 size={15} />
                  Discard
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

export default WizardExitConfirm;
