import React from 'react';
import { UserCog, Mail, ChevronRight } from 'lucide-react';

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
  </div>
);

export default StepMethodChoice;
