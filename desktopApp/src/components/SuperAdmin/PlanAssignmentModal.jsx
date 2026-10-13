import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, X, ArrowRight, AlertTriangle } from 'lucide-react';
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

const chatAccessLabel = (slug) => (slug === 'free' ? 'Disabled' : 'Enabled');

// Free/Pro use their fixed global limit; Enterprise has no shared limit —
// its cap is whatever this specific workspace was configured with (may not
// be set yet, which is distinct from "Custom" and must read that way).
const formatMemberLimitFor = (plan, customMemberLimit) => {
  if (!plan) return '—';
  if (plan.slug === 'enterprise') return customMemberLimit != null ? `${customMemberLimit} members` : 'Not configured';
  return plan.memberLimit == null ? 'Custom' : `${plan.memberLimit} members`;
};

const PlanAssignmentModal = ({ isOpen, workspace, currentSubscription, currentMemberCount, onConfirm, onCancel, isLoading = false }) => {
  const { data: assignablePlans, isLoading: plansLoading } = useSuperAdminPlans();
  // /api/super-admin/plans only lists isActive+isAssignableToNew plans
  // (Free/Pro/Enterprise) — deliberately excludes any retired tier (Legacy,
  // Business) so one can never be *chosen* again. A workspace's CURRENT
  // plan could still be a since-retired one if this modal is opened before
  // a backfill migration has run, so it's prepended here (read-only,
  // labeled accordingly) purely so the dropdown can still accurately
  // reflect what the workspace is on today — never assignable, just visible.
  const currentPlan = currentSubscription?.plan;
  const plans = currentPlan && !assignablePlans?.some((p) => p._id === currentPlan._id)
    ? [{ ...currentPlan, isCurrentOnly: true }, ...(assignablePlans || [])]
    : assignablePlans;
  const [planId, setPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [status, setStatus] = useState('active');
  const [notes, setNotes] = useState('');
  const [customMemberLimit, setCustomMemberLimit] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPlanId(currentSubscription?.plan?._id || '');
      setBillingCycle(currentSubscription?.billingCycle || 'monthly');
      setStatus(currentSubscription?.status || 'active');
      setNotes(currentSubscription?.notes || '');
      setCustomMemberLimit(currentSubscription?.customMemberLimit != null ? String(currentSubscription.customMemberLimit) : '');
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

  const selectedPlan = plans?.find((p) => p._id === planId);
  const isPlanChanging = selectedPlan && currentPlan && selectedPlan._id !== currentPlan._id;
  const isEnterpriseSelected = selectedPlan?.slug === 'enterprise';

  // Enterprise has no shared Plan.memberLimit (always null) — every
  // Enterprise workspace is individually provisioned, so the limit typed
  // into the field below is what's actually compared/persisted, never the
  // plan document's own (always-null) memberLimit.
  const parsedCustomLimit = Number(customMemberLimit);
  const enterpriseLimitInvalid = isEnterpriseSelected && (!customMemberLimit.trim() || !Number.isInteger(parsedCustomLimit) || parsedCustomLimit <= 0);
  const effectiveNewLimit = isEnterpriseSelected ? (enterpriseLimitInvalid ? null : parsedCustomLimit) : selectedPlan?.memberLimit;
  const blockedByMemberLimit =
    isPlanChanging && effectiveNewLimit != null && currentMemberCount != null && currentMemberCount > effectiveNewLimit;

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
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 z-10 overflow-hidden max-h-[90vh] overflow-y-auto"
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
                        ? ' (current — no longer assignable)'
                        : p.isCustomPricing ? ' (custom pricing)' : p.priceCents ? ` ($${(p.priceCents / 100).toFixed(0)}/mo)` : ' (free)'}
                    </option>
                  ))}
                </select>
              </div>

              {isEnterpriseSelected && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Member Limit <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={customMemberLimit}
                    onChange={(e) => setCustomMemberLimit(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ borderColor: enterpriseLimitInvalid && customMemberLimit ? '#fca5a5' : '#e5e7eb' }}
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Enterprise has no shared limit — this workspace's own member cap, required and stored just for it.
                  </p>
                </div>
              )}

              {isPlanChanging && (
                <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: blockedByMemberLimit ? '#fca5a5' : '#e5e7eb', backgroundColor: blockedByMemberLimit ? '#fef2f2' : '#f9fafb' }}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-center flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Current Plan</p>
                      <p className="font-bold text-gray-900">{currentPlan?.name || '—'}</p>
                    </div>
                    <ArrowRight size={16} className="text-gray-400 shrink-0" />
                    <div className="text-center flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">New Plan</p>
                      <p className="font-bold text-indigo-600">{selectedPlan.name}</p>
                    </div>
                  </div>

                  <div className="text-xs space-y-1 pt-2 border-t" style={{ borderColor: 'inherit' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Member Limit</span>
                      <span className="font-medium text-gray-800">
                        {formatMemberLimitFor(currentPlan, currentSubscription?.customMemberLimit)}
                        {' → '}
                        {isEnterpriseSelected
                          ? (customMemberLimit.trim() && !enterpriseLimitInvalid ? `${parsedCustomLimit} members` : 'Not configured')
                          : formatMemberLimitFor(selectedPlan, null)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Current Members</span>
                      <span className="font-medium text-gray-800">{currentMemberCount ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">ChatApp Access</span>
                      <span className="font-medium text-gray-800">
                        {chatAccessLabel(currentPlan?.slug)} → {chatAccessLabel(selectedPlan.slug)}
                      </span>
                    </div>
                  </div>

                  {blockedByMemberLimit && (
                    <div className="flex items-start gap-2 text-xs text-red-700 pt-2 border-t border-red-200">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>
                        Cannot downgrade this workspace to {selectedPlan.name} because it currently has {currentMemberCount} members.
                        The {selectedPlan.name} plan supports a maximum of {effectiveNewLimit} members.
                      </span>
                    </div>
                  )}
                </div>
              )}

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
                onClick={() => onConfirm({
                  planId, billingCycle, status, notes: notes.trim(),
                  customMemberLimit: isEnterpriseSelected && !enterpriseLimitInvalid ? parsedCustomLimit : undefined,
                })}
                disabled={!planId || isLoading || blockedByMemberLimit || enterpriseLimitInvalid}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-xl shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <span>Confirm Plan Change</span>
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
