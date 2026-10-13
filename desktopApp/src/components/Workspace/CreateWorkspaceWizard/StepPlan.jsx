import React, { useEffect } from 'react';
import { Check, Users, MessageCircle, Sparkles } from 'lucide-react';

const PLANS = [
  {
    slug: 'free',
    name: 'Free',
    price: '$0',
    description: 'For small teams getting started',
    members: 'Up to 10 members',
    chat: 'ChatApp not included',
    chatEnabled: false,
  },
  {
    slug: 'pro',
    name: 'Pro',
    price: '$19/mo',
    description: 'For growing teams that need more room',
    members: 'Up to 20 members',
    chat: 'ChatApp included',
    chatEnabled: true,
    highlight: true,
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    description: 'Built for teams that need more flexibility, scale, and support',
    members: 'Custom member limits',
    chat: 'ChatApp included',
    chatEnabled: true,
  },
];

/**
 * Step 2 — Plan: Free / Pro / Enterprise picker. Free and Pro select
 * formData.plan and continue through the wizard normally (Setup is next).
 * Enterprise never continues into the wizard at all — it immediately hands
 * off to the Contact Sales page via onSelectEnterprise, since Enterprise
 * workspaces are never created through this self-serve flow.
 */
const StepPlan = ({ formData, updateField, onValidityChange, onSelectEnterprise }) => {
  useEffect(() => {
    onValidityChange(formData.plan === 'free' || formData.plan === 'pro');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.plan]);

  const handleSelect = (plan) => {
    if (plan.slug === 'enterprise') {
      onSelectEnterprise();
      return;
    }
    updateField('plan', plan.slug);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Choose a plan</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          You can upgrade or downgrade later from Workspace Settings.
        </p>
      </div>

      <div className="space-y-3">
        {PLANS.map((plan) => {
          const isSelected = formData.plan === plan.slug;
          return (
            <button
              key={plan.slug}
              type="button"
              onClick={() => handleSelect(plan)}
              className="w-full text-left p-4 rounded-xl border-2 transition-all relative"
              style={{
                borderColor: isSelected ? '#10b981' : 'var(--color-border-default)',
                backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'var(--color-bg-muted)',
              }}
            >
              {plan.highlight && (
                <span className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-full text-[10px] font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600">
                  Most popular
                </span>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>{plan.name}</p>
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>{plan.price}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{plan.description}</p>
                  <div className="flex items-center gap-4 mt-2.5">
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      <Users size={13} /> {plan.members}
                    </span>
                    <span
                      className="flex items-center gap-1.5 text-xs"
                      style={{ color: plan.chatEnabled ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}
                    >
                      <MessageCircle size={13} /> {plan.chat}
                    </span>
                  </div>
                </div>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{
                    backgroundColor: isSelected ? '#10b981' : 'transparent',
                    border: isSelected ? 'none' : '2px solid var(--color-border-default)',
                  }}
                >
                  {isSelected && <Check size={13} className="text-white" />}
                  {!isSelected && plan.slug === 'enterprise' && <Sparkles size={12} style={{ color: 'var(--color-text-muted)' }} />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default StepPlan;
