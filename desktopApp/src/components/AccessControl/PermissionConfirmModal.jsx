import { useRef } from 'react';
import { AlertTriangle, Ban, Check, ShieldCheck, ShieldOff, ShieldQuestion, X } from 'lucide-react';
import useConfirmModalStore from '../../store/confirmModalStore';
import useModalFocus from '../../hooks/useModalFocus';

const VERB_CONFIG = {
  grant:   { icon: ShieldCheck,   color: '#059669', bg: 'rgba(16,185,129,0.12)',  confirmLabel: 'Grant Access',    preposition: 'to'   },
  enable:  { icon: ShieldCheck,   color: '#059669', bg: 'rgba(16,185,129,0.12)',  confirmLabel: 'Enable',          preposition: 'for'  },
  revoke:  { icon: ShieldOff,     color: '#dc2626', bg: 'rgba(239,68,68,0.12)',   confirmLabel: 'Revoke Access',   preposition: 'from' },
  disable: { icon: Ban,           color: '#dc2626', bg: 'rgba(239,68,68,0.12)',   confirmLabel: 'Disable',         preposition: 'for'  },
  update:  { icon: ShieldQuestion,color: '#2563eb', bg: 'rgba(37,99,235,0.12)',   confirmLabel: 'Confirm Update',  preposition: 'for'  }
};

const formatValue = (value) => {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (Array.isArray(value))       return value.length ? value.join(', ') : 'None';
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
};

const buildDefaultMessage = (details) => {
  const { targetUserName, changes = [] } = details;
  if (changes.length === 1) {
    return `Review the change to “${changes[0].label}” for ${targetUserName} before confirming.`;
  }
  return `Review these ${changes.length} access changes for ${targetUserName} before confirming.`;
};

/**
 * THE single confirmation modal for every permission change in the app —
 * grant, revoke, update, enable, disable — across Sales, Finance, Access
 * Control delegation, role assignment, access scope, and role permission
 * checklists. No module renders its own confirmation dialog; every one of
 * them calls useConfirmPermissionChange() and awaits this component's
 * verdict. Mounted once, in App.jsx.
 */
const PermissionConfirmModal = () => {
  const isOpen  = useConfirmModalStore((state) => state.isOpen);
  const details = useConfirmModalStore((state) => state.details);
  const resolve = useConfirmModalStore((state) => state.resolve);
  const dialogRef = useRef(null);
  useModalFocus({ open: isOpen, dialogRef, onClose: () => resolve(false) });

  if (!isOpen || !details) return null;

  const {
    targetUserName,
    targetUserRole,
    actionVerb = 'update',
    changes = [],
    message
  } = details;

  const config       = VERB_CONFIG[actionVerb] || VERB_CONFIG.update;
  const Icon         = config.icon;
  const finalMessage = message || buildDefaultMessage(details);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="permission-confirm-title"
      onMouseDown={(e) => e.target === e.currentTarget && resolve(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onMouseDown={() => resolve(false)} />

      {/* Dialog card */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative z-10 w-full max-w-lg rounded-xl border bg-white shadow-2xl dark:bg-gray-900 flex flex-col"
        style={{ borderColor: 'var(--color-border-default)', maxHeight: '90dvh' }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-start gap-3 px-4 sm:px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--color-border-default)' }}
        >
          <div
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: config.bg, color: config.color }}
          >
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <h3
              id="permission-confirm-title"
              className="font-bold text-sm sm:text-base leading-snug"
              style={{ color: 'var(--color-text-primary)' }}
            >
              Confirm Permission Change
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <span
                className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {targetUserName}
              </span>
              {targetUserRole && (
                <span
                  className="max-w-full rounded px-1.5 py-0.5 text-xs font-medium [overflow-wrap:anywhere]"
                  style={{ backgroundColor: 'var(--color-bg-muted)', color: 'var(--color-text-secondary)' }}
                >
                  {targetUserRole}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => resolve(false)}
            className="p-1.5 rounded-lg shrink-0 hover:opacity-70 transition-opacity"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Close confirmation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body — scrollable when many changes ── */}
        <div className="min-h-0 space-y-2.5 overflow-y-auto px-4 py-4 sm:px-5">
          {changes.map((change, idx) => (
            <div
              key={idx}
              className="rounded-lg border px-3 py-2.5"
              style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-subtle)' }}
            >
              <p className="text-sm font-medium [overflow-wrap:anywhere]" style={{ color: 'var(--color-text-primary)' }}>
                {change.label}
              </p>
              {change.previous !== undefined && (
                <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 sm:gap-4">
                  <div className="min-w-0">
                    <dt className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>Current</dt>
                    <dd className="mt-0.5 [overflow-wrap:anywhere]" style={{ color: 'var(--color-text-muted)' }}>
                      {formatValue(change.previous)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>New</dt>
                    <dd className="mt-0.5 font-semibold [overflow-wrap:anywhere]" style={{ color: config.color }}>
                      {formatValue(change.next)}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          ))}

          {/* Warning / confirmation message */}
          <div
            className="flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 break-words"
            style={{ backgroundColor: config.bg, color: config.color }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{finalMessage}</span>
          </div>
        </div>

        {/* ── Footer — stacks on xs, row on sm+ ── */}
        <div
          className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 px-4 sm:px-5 py-4 border-t shrink-0"
          style={{ borderColor: 'var(--color-border-default)' }}
        >
          <button
            type="button"
            onClick={() => resolve(false)}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg text-sm font-semibold border text-center"
            style={{
              borderColor: 'var(--color-border-default)',
              color: 'var(--color-text-primary)',
              backgroundColor: 'var(--color-bg-subtle)'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => resolve(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: config.color }}
          >
            <Check className="w-4 h-4 shrink-0" />
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionConfirmModal;
