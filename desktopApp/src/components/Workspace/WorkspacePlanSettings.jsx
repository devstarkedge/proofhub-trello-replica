import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  CreditCard, Users, MessageCircle, Check, Loader,
  Sparkles, ArrowUpCircle, ArrowDownCircle, Lock, TrendingUp,
} from 'lucide-react';
import workspacePlanService from '../../services/workspacePlanService';
import PlanChangeConfirmModal from './PlanChangeConfirmModal';

const PLAN_META = {
  free: { name: 'Free', price: '$0', color: '#64748b' },
  pro: { name: 'Pro', price: '$19/mo', color: '#10b981' },
  enterprise: { name: 'Enterprise', price: 'Custom', color: '#8b5cf6' },
};

// Free's numbers are a fixed platform constant (see backend's
// entitlementService.js / seed.js), not a per-workspace value — used here
// only as the downgrade target's preview shape for the confirmation modal.
// The actual downgrade is still validated and enforced server-side against
// the real Plan catalog regardless of what this preview shows.
const FREE_PLAN_PREVIEW = { name: 'Free', memberLimit: 10, chatEnabled: false };

const STATUS_META = {
  active: { label: 'Active', color: '#10b981' },
  trialing: { label: 'Trialing', color: '#3b82f6' },
  past_due: { label: 'Past Due', color: '#ef4444' },
  canceled: { label: 'Canceled', color: '#64748b' },
};

const COMPARISON = [
  { slug: 'free', name: 'Free', members: '10 members', chat: 'ChatApp not included' },
  { slug: 'pro', name: 'Pro', members: '20 members', chat: 'ChatApp included' },
  { slug: 'enterprise', name: 'Enterprise', members: 'Custom limits', chat: 'ChatApp included' },
];

/**
 * Plan & Billing card for the Workspace Settings page. Owner-only end to
 * end: the server rejects GET/POST for anyone but the workspace owner
 * (workspacePlanController.js), and WorkspaceSettingsPage.jsx only mounts
 * this component when the viewer already is the owner — this component
 * doesn't re-check that itself, matching "don't rely only on frontend
 * hiding" (the hiding lives one level up; the server is authoritative).
 *
 * Every plan-changing action goes through PlanChangeConfirmModal — no
 * button here mutates state directly, matching the required
 * confirm-before-apply flow.
 *
 * Stays live: entitlementService.js#notifyWorkspacePlanUpdated fires a
 * workspace-plan-updated socket event on every real plan change (self-serve
 * here, or a Super Admin billing change from another session) — this
 * component listens for it and refetches its own richer detail.
 */
const WorkspacePlanSettings = ({ workspaceId, isDarkMode }) => {
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [modalDirection, setModalDirection] = useState(null); // 'upgrade' | 'downgrade' | null

  const loadPlan = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const { data } = await workspacePlanService.getPlan(workspaceId);
      setPlan(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load plan details');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    setLoading(true);
    loadPlan();
  }, [loadPlan]);

  // Another tab/session (or a Super Admin) changed the plan — refresh this
  // card's detail (member count, next-plan preview) live, no refresh needed.
  useEffect(() => {
    const handlePlanUpdated = (event) => {
      if (event.detail?.workspaceId === workspaceId) loadPlan();
    };
    window.addEventListener('socket-workspace-plan-updated', handlePlanUpdated);
    return () => window.removeEventListener('socket-workspace-plan-updated', handlePlanUpdated);
  }, [workspaceId, loadPlan]);

  const closeModal = () => {
    if (actionLoading) return;
    setModalDirection(null);
  };

  const handleConfirm = async () => {
    setActionLoading(true);
    try {
      if (modalDirection === 'upgrade') {
        await workspacePlanService.upgradeToPro(workspaceId);
        toast.success('Upgraded to Pro — ChatApp is now unlocked!');
      } else {
        await workspacePlanService.downgradeToFree(workspaceId);
        toast.success('Downgraded to Free');
      }
      setModalDirection(null);
      await loadPlan();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update plan');
    } finally {
      setActionLoading(false);
    }
  };

  const cardClass = `rounded-2xl border shadow-sm mb-6 ${isDarkMode ? 'bg-gray-800/80 border-gray-700' : 'bg-white border-gray-100'}`;

  if (loading) {
    return (
      <div className={cardClass}>
        <div className="flex justify-center py-10">
          <Loader size={20} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        </div>
      </div>
    );
  }

  if (!plan) return null;

  const meta = PLAN_META[plan.planSlug] || PLAN_META.free;
  const statusMeta = STATUS_META[plan.planStatus] || STATUS_META.active;
  const usagePercent = plan.memberLimit
    ? Math.min(100, Math.round((plan.currentMemberCount / plan.memberLimit) * 100))
    : 0;
  const atOrOverLimit = plan.memberLimit != null && plan.currentMemberCount >= plan.memberLimit;
  const canDowngrade = plan.currentMemberCount <= 10;

  const currentPlanShape = { name: meta.name, memberLimit: plan.memberLimit, chatEnabled: plan.chatEnabled };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cardClass}>
      <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <h2 className={`font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
          <CreditCard size={18} className="text-emerald-500" />
          Plan &amp; Billing
        </h2>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${statusMeta.color}1a`, color: statusMeta.color }}
          >
            {statusMeta.label}
          </span>
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
          >
            {meta.name}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{meta.name} Plan</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{meta.price}</p>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {plan.chatEnabled ? (
              <MessageCircle size={15} className="text-emerald-500" />
            ) : (
              <Lock size={15} style={{ color: 'var(--color-text-muted)' }} />
            )}
            <span style={{ color: plan.chatEnabled ? '#10b981' : 'var(--color-text-muted)' }}>
              ChatApp {plan.chatEnabled ? 'available' : 'not available'}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              <Users size={12} /> Members
            </span>
            <span style={{ color: atOrOverLimit ? '#ef4444' : 'var(--color-text-secondary)' }}>
              {plan.currentMemberCount}{plan.memberLimit != null ? ` / ${plan.memberLimit}` : ' (unlimited)'}
            </span>
          </div>
          {plan.memberLimit != null && (
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-bg-muted)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${usagePercent}%`, backgroundColor: atOrOverLimit ? '#ef4444' : meta.color }}
              />
            </div>
          )}
        </div>

        {plan.nextPlan && (
          <div
            className="rounded-xl border-2 border-dashed p-4"
            style={{ borderColor: `${PLAN_META[plan.nextPlan.slug]?.color || '#10b981'}55` }}
          >
            <p className="text-xs font-semibold flex items-center gap-1.5 mb-2" style={{ color: 'var(--color-text-muted)' }}>
              <TrendingUp size={12} /> Next Plan
            </p>
            <p className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{plan.nextPlan.name}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {plan.nextPlan.memberLimit != null ? `${plan.nextPlan.memberLimit} Members` : 'Custom member limits'}
              {' · '}
              ChatApp {plan.nextPlan.chatEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
          {plan.planSlug === 'free' && plan.nextPlan?.selfServe && (
            <button
              onClick={() => setModalDirection('upgrade')}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 transition-all"
            >
              <ArrowUpCircle size={15} />
              Upgrade to Pro
            </button>
          )}

          {plan.planSlug === 'pro' && (
            <>
              <button
                onClick={() => setModalDirection('downgrade')}
                disabled={actionLoading || !canDowngrade}
                title={!canDowngrade ? `Remove members down to 10 or fewer first (currently ${plan.currentMemberCount})` : ''}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border disabled:opacity-50 transition-colors"
                style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
              >
                <ArrowDownCircle size={15} />
                Downgrade to Free
              </button>
              <button
                onClick={() => navigate('/contact-sales')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 transition-all"
              >
                <Sparkles size={15} />
                Upgrade to Enterprise
              </button>
            </>
          )}

          {plan.planSlug === 'enterprise' && (
            <button
              onClick={() => navigate('/contact-sales')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border transition-colors"
              style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
            >
              <Sparkles size={15} />
              Contact Sales
            </button>
          )}

          {!canDowngrade && plan.planSlug === 'pro' && (
            <p className="text-xs w-full" style={{ color: 'var(--color-text-muted)' }}>
              You have {plan.currentMemberCount} members — remove members down to 10 or fewer to downgrade to Free.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
          {COMPARISON.map((c) => {
            const isActive = plan.planSlug === c.slug;
            return (
              <div
                key={c.slug}
                className="rounded-xl border-2 p-3 relative"
                style={{
                  borderColor: isActive ? PLAN_META[c.slug].color : 'var(--color-border-default)',
                  backgroundColor: isActive ? `${PLAN_META[c.slug].color}11` : 'var(--color-bg-muted)',
                }}
              >
                {isActive && (
                  <span
                    className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: PLAN_META[c.slug].color }}
                  >
                    <Check size={10} className="text-white" />
                  </span>
                )}
                <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{c.name}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{c.members}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{c.chat}</p>
              </div>
            );
          })}
        </div>
      </div>

      <PlanChangeConfirmModal
        isOpen={!!modalDirection}
        onClose={closeModal}
        onConfirm={handleConfirm}
        loading={actionLoading}
        direction={modalDirection}
        fromPlan={modalDirection === 'upgrade' ? currentPlanShape : currentPlanShape}
        toPlan={modalDirection === 'upgrade' ? plan.nextPlan : FREE_PLAN_PREVIEW}
      />
    </motion.div>
  );
};

export default WorkspacePlanSettings;
