import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, X } from 'lucide-react';
import { useSuperAdminPlans } from '../../hooks/useSuperAdminQueries';

const BILLING_CYCLES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' }
];

const SUBSCRIPTION_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'past_due', label: 'Past due' },
  { value: 'canceled', label: 'Canceled' }
];

const PlanAssignmentModal = ({ isOpen, workspace, currentSubscription, onConfirm, onCancel, isLoading = false }) => {
  const { data: assignablePlans, isLoading: plansLoading } = useSuperAdminPlans();
  // /api/super-admin/plans only lists isAssignableToNew plans (Free/Pro/
  // Business/Enterprise) — deliberately excludes Legacy so it's never
  // *chosen* for a workspace. But every pre-existing workspace's CURRENT
  // plan is Legacy (see migrateWorkspaceSubscriptions.js), so if we don't
  // also show it here, this modal can't accurately reflect the workspace's
  // actual current plan for the majority of real workspaces today. Prepend
  // it only when it's not already in the assignable list.
  const currentPlan = currentSubscription?.plan;
  const plans = currentPlan && !assignablePlans?.some((p) => p._id === currentPlan._id)
    ? [{ ...currentPlan, isCurrentOnly: true }, ...(assignablePlans || [])]
    : assignablePlans;
  const [planId, setPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [status, setStatus] = useState('active');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPlanId(currentSubscription?.plan?._id || '');
      setBillingCycle(currentSubscription?.billingCycle || 'monthly');
      setStatus(currentSubscription?.status || 'active');
      setNotes(currentSubscription?.notes || '');
    }
  }, [isOpen, currentSubscription]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (isOpen && !isLoading && e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isLoading, onCancel]);

  if (typeof document === 'undefined') return null;

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
            <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                    <CreditCard size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Change Plan</h3>
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
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Plan</label>
                <select
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  disabled={plansLoading}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none bg-white"
                  style={{ borderColor: '#e5e7eb' }}
                >
                  <option value="" disabled>{plansLoading ? 'Loading plans…' : 'Select a plan'}</option>
                  {plans?.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                      {p.isCurrentOnly
                        ? ' (current — not normally assignable)'
                        : p.isCustomPricing ? ' (custom pricing)' : p.priceCents ? ` ($${(p.priceCents / 100).toFixed(0)}/mo)` : ' (free)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Billing Cycle</label>
                  <select
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none bg-white"
                    style={{ borderColor: '#e5e7eb' }}
                  >
                    {BILLING_CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none bg-white"
                    style={{ borderColor: '#e5e7eb' }}
                  >
                    {SUBSCRIPTION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Internal note about this change…"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{ borderColor: '#e5e7eb' }}
                />
              </div>
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
                onClick={() => onConfirm({ planId, billingCycle, status, notes: notes.trim() })}
                disabled={!planId || isLoading}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-xl shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <span>Save Plan</span>
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

export default PlanAssignmentModal;
