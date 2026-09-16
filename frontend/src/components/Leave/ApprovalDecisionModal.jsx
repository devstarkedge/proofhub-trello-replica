import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { Button } from '../ui/button';

/** Approve/reject one pending approval task — recipe mirrors ui/BulkDeleteModal.jsx. */
const ApprovalDecisionModal = ({ isOpen, request, onApprove, onReject, onCancel, isSubmitting = false }) => {
  const [comment, setComment] = useState('');

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center isolate">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => !isSubmitting && onCancel()}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative rounded-2xl shadow-2xl w-full max-w-md mx-4 z-10 overflow-hidden"
            style={{ backgroundColor: 'var(--color-bg-base)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Decide Leave Request</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {request?.requester?.name} · {request?.leaveType?.name} · {request?.totalConsumingDayUnits} day(s)
                </p>
              </div>
              {!isSubmitting && (
                <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-[var(--color-bg-muted)]">
                  <X size={18} style={{ color: 'var(--color-text-muted)' }} />
                </button>
              )}
            </div>

            <div className="px-6 py-5">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Comment (optional)</label>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
                style={{ backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
              />
            </div>

            <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ backgroundColor: 'var(--color-bg-subtle)', borderTop: '1px solid var(--color-border-subtle)' }}>
              <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => onReject(comment)}
                disabled={isSubmitting}
                className="flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" /> Reject
              </Button>
              <Button
                onClick={() => onApprove(comment)}
                disabled={isSubmitting}
                className="flex items-center gap-2"
                style={{ backgroundColor: 'var(--color-success)' }}
              >
                <CheckCircle2 className="w-4 h-4" /> Approve
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ApprovalDecisionModal;
