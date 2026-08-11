import React, { useState } from 'react';
import { X, Mail } from 'lucide-react';
import { EMAIL_REGEX } from '../ProjectModals/shared/constants';

const MAX_EMAILS = 20;

/**
 * Chip-style multi-email input. Used by both the create-workspace wizard's
 * Step 2 and WorkspaceOnboardingChecklist's "Invite your team" CTA — kept
 * standalone (not nested inside the wizard's own component tree) for that
 * reuse.
 */
const EmailInviteInput = ({ emails, onChange, disabled = false }) => {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const commitDraft = () => {
    const candidate = draft.trim().toLowerCase();
    if (!candidate) return;

    if (!EMAIL_REGEX.test(candidate)) {
      setError('Enter a valid email address');
      return;
    }
    if (emails.includes(candidate)) {
      setError('That email is already added');
      return;
    }
    if (emails.length >= MAX_EMAILS) {
      setError(`You can invite up to ${MAX_EMAILS} people at once`);
      return;
    }

    onChange([...emails, candidate]);
    setDraft('');
    setError('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && !draft && emails.length > 0) {
      onChange(emails.slice(0, -1));
    }
  };

  const removeEmail = (email) => {
    onChange(emails.filter((e) => e !== email));
  };

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-1.5 w-full px-3 py-2 rounded-xl border text-sm min-h-[44px] focus-within:ring-2 focus-within:ring-emerald-500/30 transition-colors"
        style={{
          backgroundColor: disabled ? 'var(--color-bg-subtle)' : 'var(--color-bg-muted)',
          borderColor: error ? '#ef4444' : 'var(--color-border-default)',
        }}
      >
        {emails.map((email) => (
          <span
            key={email}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-600"
          >
            <Mail size={11} />
            {email}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeEmail(email)}
                className="hover:text-red-500 transition-colors"
                aria-label={`Remove ${email}`}
              >
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        <input
          type="text"
          value={draft}
          disabled={disabled}
          onChange={(e) => { setDraft(e.target.value); setError(''); }}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          placeholder={emails.length === 0 ? 'colleague@company.com' : ''}
          className="flex-1 min-w-[140px] outline-none bg-transparent disabled:cursor-not-allowed"
          style={{ color: 'var(--color-text-primary)' }}
        />
      </div>
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
};

export default EmailInviteInput;
