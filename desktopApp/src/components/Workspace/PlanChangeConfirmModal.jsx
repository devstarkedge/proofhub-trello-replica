import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Check, Loader, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

const formatMemberLimit = (limit) => (limit == null ? 'Unlimited' : `${limit} members`);

/**
 * Reusable Free<->Pro plan-change confirmation modal — used for both
 * upgrade and downgrade so the owner always sees an explicit before/after
 * plan and the concrete benefit (or tradeoff) delta before anything
 * actually changes. Mirrors the exact modal shell already used by
 * ManageInvitationsModal/InviteMemberModal (createPortal + AnimatePresence
 * backdrop + gradient header), not a new pattern.
 *
 * `fromPlan`/`toPlan` are the same lightweight shape everywhere in this
 * feature: `{ name, memberLimit, chatEnabled }`.
 */
const PlanChangeConfirmModal = ({ isOpen, onClose, onConfirm, loading, direction, fromPlan, toPlan }) => {
  if (!isOpen || !fromPlan || !toPlan) return null;

  const isUpgrade = direction === 'upgrade';
  const Icon = isUpgrade ? ArrowUpCircle : ArrowDownCircle;

  const benefits = [];
  if (fromPlan.memberLimit !== toPlan.memberLimit) {
    benefits.push(`Member limit: ${formatMemberLimit(fromPlan.memberLimit)} → ${formatMemberLimit(toPlan.memberLimit)}`);
  }
  if (fromPlan.chatEnabled !== toPlan.chatEnabled) {
    benefits.push(`ChatApp access ${toPlan.chatEnabled ? 'enabled' : 'disabled'}`);
    if (toPlan.chatEnabled) benefits.push('Open Chat enabled');
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={loading ? undefined : onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--color-card-bg)' }}
        >
          <div className={`flex items-center justify-between px-6 py-4 bg-gradient-to-r ${isUpgrade ? 'from-emerald-600 to-teal-600' : 'from-slate-600 to-slate-700'}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                <Icon size={18} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">{isUpgrade ? 'Confirm Upgrade' : 'Confirm Downgrade'}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-center flex-1">
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Current Plan</p>
                <p className="text-base font-bold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{fromPlan.name}</p>
              </div>
              <ArrowRight size={18} style={{ color: 'var(--color-text-muted)' }} className="flex-shrink-0" />
              <div className="text-center flex-1">
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{isUpgrade ? 'Upgrade To' : 'Downgrade To'}</p>
                <p
                  className="text-base font-bold mt-0.5"
                  style={{ color: isUpgrade ? '#10b981' : 'var(--color-text-primary)' }}
                >
                  {toPlan.name}
                </p>
              </div>
            </div>

            {benefits.length > 0 && (
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-bg-muted)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                  {isUpgrade ? 'New Benefits' : 'What Changes'}
                </p>
                <ul className="space-y-1.5">
                  {benefits.map((b) => (
                    <li key={b} className="text-sm flex items-start gap-2" style={{ color: 'var(--color-text-primary)' }}>
                      <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: isUpgrade ? '#10b981' : '#f59e0b' }} />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium rounded-xl border transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-60 ${
                isUpgrade
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                  : 'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800'
              }`}
            >
              {loading ? <Loader size={15} className="animate-spin" /> : <Icon size={15} />}
              {loading ? 'Processing...' : isUpgrade ? 'Confirm Upgrade' : 'Confirm Downgrade'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default PlanChangeConfirmModal;
