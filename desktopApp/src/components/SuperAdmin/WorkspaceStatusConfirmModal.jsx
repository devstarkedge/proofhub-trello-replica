import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, PauseCircle, Archive, RotateCcw, PlayCircle } from 'lucide-react';

/**
 * One parameterized modal for all four workspace status transitions
 * (suspend/archive are destructive — reactivate/restore are reversible),
 * rather than four near-duplicate components. Portal + AnimatePresence
 * shell matches components/ui/BulkDeleteModal.jsx; the typed-confirmation
 * input (must type the workspace name) reuses the same pattern
 * WorkspaceSettingsPage.jsx already uses for its own deactivate-workspace
 * danger zone.
 */
const TRANSITION_CONFIG = {
  suspended: {
    title: 'Suspend Workspace?',
    subtitle: 'This will prevent workspace members from using the workspace.',
    icon: PauseCircle,
    destructive: true,
    confirmLabel: 'Suspend Workspace',
    confirmingLabel: 'Suspending…',
    reasonRequired: true
  },
  archived: {
    title: 'Archive Workspace?',
    subtitle: 'This will prevent workspace members from using the workspace. Data is preserved and can be restored.',
    icon: Archive,
    destructive: true,
    confirmLabel: 'Archive Workspace',
    confirmingLabel: 'Archiving…',
    reasonRequired: true
  },
  reactivate: {
    title: 'Reactivate Workspace?',
    subtitle: 'Members will immediately regain access to this workspace.',
    icon: PlayCircle,
    destructive: false,
    confirmLabel: 'Reactivate Workspace',
    confirmingLabel: 'Reactivating…',
    reasonRequired: false
  },
  restore: {
    title: 'Restore Workspace?',
    subtitle: 'This workspace will become active again and members will regain access.',
    icon: RotateCcw,
    destructive: false,
    confirmLabel: 'Restore Workspace',
    confirmingLabel: 'Restoring…',
    reasonRequired: false
  }
};

/**
 * @param {'suspended'|'archived'|'reactivate'|'restore'} transition
 */
const WorkspaceStatusConfirmModal = ({ isOpen, workspace, transition, onConfirm, onCancel, isLoading = false }) => {
  const [confirmInput, setConfirmInput] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) {
      setConfirmInput('');
      setReason('');
    }
  }, [isOpen, transition]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (isOpen && !isLoading && e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isLoading, onCancel]);

  if (typeof document === 'undefined' || !transition) return null;
  const config = TRANSITION_CONFIG[transition];
  const nameMatches = confirmInput.trim() === workspace?.name;
  const canConfirm = config.destructive
    ? nameMatches && reason.trim().length > 0
    : true;

  const gradient = config.destructive
    ? 'from-red-500 to-red-600'
    : 'from-emerald-500 to-emerald-600';
  const shadow = config.destructive ? 'shadow-red-200' : 'shadow-emerald-200';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center isolate">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={() => !isLoading && onCancel()}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 z-10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`bg-gradient-to-r ${gradient} px-6 py-5`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <config.icon size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{config.title}</h3>
                    <p className="text-white/80 text-xs mt-0.5 truncate max-w-[240px]">{workspace?.name}</p>
                  </div>
                </div>
                {!isLoading && (
                  <button onClick={onCancel} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                    <X size={18} className="text-white" />
                  </button>
                )}
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-gray-600 text-sm leading-relaxed">{config.subtitle}</p>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Reason {config.reasonRequired ? '(required)' : '(optional)'}
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Why is this workspace being changed?"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{ borderColor: '#e5e7eb' }}
                />
              </div>

              {config.destructive && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">
                    Type <span className="font-mono font-bold text-gray-700">{workspace?.name}</span> to confirm.
                  </p>
                  <input
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ borderColor: '#e5e7eb' }}
                  />
                </div>
              )}

              {config.destructive && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Workspace data is preserved — members are just locked out until this is reversed.
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={onCancel}
                disabled={isLoading}
                className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(reason.trim())}
                disabled={!canConfirm || isLoading}
                className={`px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r ${gradient} rounded-xl shadow-lg ${shadow} transition-all disabled:opacity-50 flex items-center gap-2`}
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>{config.confirmingLabel}</span>
                  </>
                ) : (
                  <span>{config.confirmLabel}</span>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default WorkspaceStatusConfirmModal;
