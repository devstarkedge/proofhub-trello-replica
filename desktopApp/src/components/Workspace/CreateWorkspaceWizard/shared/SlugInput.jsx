import React, { useState, useEffect, useRef } from 'react';
import { Check, X, Loader } from 'lucide-react';
import { useDebounce } from '../../../../hooks/useDebounce';
import { slugify, isValidSlugFormat, isReservedSlug } from '../../../../utils/workspaceSlug';
import { checkSlugAvailability } from '../../../../services/workspaceSetupApi';

const REASON_MESSAGES = {
  too_short: 'Must be at least 3 characters (letters, numbers, hyphens)',
  reserved: 'This URL is reserved — please choose another',
  taken: 'This URL is already taken',
};

/**
 * Workspace URL/slug field. Auto-derives from the workspace name until the
 * user manually edits it directly, then debounces live-availability checks
 * against the backend (the only authority on availability — this local
 * format/reserved check is a UX nicety that saves a round-trip for the
 * obviously-invalid cases).
 */
const SlugInput = ({ name, value, onChange, onValidityChange }) => {
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [status, setStatus] = useState({ checking: false, available: null, reason: null });
  const [debouncedValue] = useDebounce(value, 400);
  const latestCheckedRef = useRef('');

  // Auto-derive from name until the user types into this field directly.
  useEffect(() => {
    if (manuallyEdited) return;
    onChange(slugify(name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, manuallyEdited]);

  useEffect(() => {
    const candidate = debouncedValue;
    if (!candidate) {
      setStatus({ checking: false, available: null, reason: null });
      return undefined;
    }
    if (!isValidSlugFormat(candidate)) {
      setStatus({ checking: false, available: false, reason: 'too_short' });
      return undefined;
    }
    if (isReservedSlug(candidate)) {
      setStatus({ checking: false, available: false, reason: 'reserved' });
      return undefined;
    }

    let cancelled = false;
    latestCheckedRef.current = candidate;
    setStatus((prev) => ({ ...prev, checking: true }));

    checkSlugAvailability(candidate)
      .then((result) => {
        // A stale response for an older value must never clobber a newer
        // one — the debounce alone doesn't close this race if two requests
        // are in flight at once.
        if (cancelled || latestCheckedRef.current !== candidate) return;
        setStatus({ checking: false, available: result?.available ?? null, reason: result?.reason ?? null });
      })
      .catch(() => {
        if (cancelled || latestCheckedRef.current !== candidate) return;
        setStatus({ checking: false, available: null, reason: null });
      });

    return () => { cancelled = true; };
  }, [debouncedValue]);

  useEffect(() => {
    const stillTyping = value !== debouncedValue;
    onValidityChange?.({
      isValid: !!value && isValidSlugFormat(value) && !isReservedSlug(value) && status.available === true,
      checking: status.checking || stillTyping,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debouncedValue, status]);

  const handleChange = (e) => {
    setManuallyEdited(true);
    onChange(slugify(e.target.value));
  };

  const settled = value && value === debouncedValue && !status.checking;

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
        Workspace URL
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono" style={{ color: 'var(--color-text-muted)' }}>
          /
        </span>
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="acme-corp"
          maxLength={60}
          className="w-full pl-6 pr-10 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:ring-2 focus:ring-emerald-500/30 font-mono"
          style={{
            backgroundColor: 'var(--color-bg-muted)',
            borderColor: status.available === false ? '#ef4444' : 'var(--color-border-default)',
            color: 'var(--color-text-primary)',
          }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {status.checking || value !== debouncedValue ? (
            <Loader size={16} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
          ) : settled && status.available === true ? (
            <Check size={16} className="text-emerald-500" />
          ) : settled && status.available === false ? (
            <X size={16} className="text-red-500" />
          ) : null}
        </span>
      </div>
      {settled && status.available === false ? (
        <p className="text-xs text-red-500 mt-1.5">{REASON_MESSAGES[status.reason] || 'This URL is unavailable'}</p>
      ) : (
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
          A unique identifier for your workspace. Lowercase letters, numbers, and hyphens only.
        </p>
      )}
    </div>
  );
};

export default SlugInput;
