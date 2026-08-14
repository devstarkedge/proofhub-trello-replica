import React from 'react';
import { UserCog, Mail, ChevronRight, Users } from 'lucide-react';

const METHODS = [
  {
    key: 'direct',
    icon: UserCog,
    title: 'Create Account & Send Login Access',
    description: 'Recommended for company-managed employees. Sets up their account and workspace access immediately — no approval step.',
  },
  {
    key: 'self_register',
    icon: Mail,
    title: 'Send Registration Invitation',
    description: 'Recommended for contractors, remote employees, or self-registration. They register or sign in, then wait for your approval.',
  },
];

// "bulk" is handled specially by InviteMemberModal — choosing it closes this
// modal and opens the separate BulkInviteModal instead of advancing to a
// step-2 form here, per the "don't overload the single-invite modal" split.
const StepMethodChoice = ({ onChoose }) => (
  <div className="p-6 space-y-3">
    <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
      How would you like to bring this person into the workspace?
    </p>
    {METHODS.map(({ key, icon: Icon, title, description }) => (
      <button
        key={key}
        type="button"
        onClick={() => onChoose(key)}
        className="w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5"
        style={{ borderColor: 'var(--color-border-default)' }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-500/10">
          <Icon size={18} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{title}</div>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
        </div>
        <ChevronRight size={18} className="flex-shrink-0 mt-1" style={{ color: 'var(--color-text-muted)' }} />
      </button>
    ))}

    <div className="flex items-center gap-3 pt-1">
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
      <span className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--color-text-muted)' }}>or</span>
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
    </div>

    <button
      type="button"
      onClick={() => onChoose('bulk')}
      className="w-full flex items-center justify-center gap-2 p-3.5 rounded-xl border border-dashed text-sm font-semibold transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5"
      style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
    >
      <Users size={16} />
      Bulk Invite Multiple Members
    </button>
  </div>
);

export default StepMethodChoice;
