import React from 'react';
import { AlertTriangle, ArrowRight, Ban, Check, ShieldCheck, ShieldOff, ShieldQuestion, X } from 'lucide-react';
import useConfirmModalStore from '../../store/confirmModalStore';

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
  const { targetUserName, changes = [], actionVerb } = details;
  const config = VERB_CONFIG[actionVerb] || VERB_CONFIG.update;
  if (changes.length === 1) {
    return `You are ${actionVerb}ing "${changes[0].label}" ${config.preposition} ${targetUserName}.`;
  }
  return `You are about to ${actionVerb} ${changes.length} permission${changes.length === 1 ? '' : 's'} ${config.preposition} ${targetUserName}.`;
};

/**
 * THE single confirmation modal for every permission change in the app —
 * grant, revoke, update, enable, disable — across Sales, Finance, Access
 * Control delegation, role assignment, access scope, and role permission
 * checklists. No module renders its own confirmation dialog; every one of
 * them calls useConfirmPermissionChange() and awaits this component's
 * verdict. Mounted once, in App.jsx.
 *
 * Responsiveness approach:
 *  - Modal is full-width on xs, capped at max-w-lg on sm+
 *  - Change rows wrap label onto its own line on very narrow screens
 *  - Before→After value pair stays on one line (shrink-0 on the value group)
 *  - Long labels truncate with ellipsis on single-line but wrap on two-column layout
 *  - Footer buttons stack to column on xs viewports (flex-col sm:flex-row)
 */
const PermissionConfirmModal = () => {
  const isOpen  = useConfirmModalStore((state) => state.isOpen);
  const details = useConfirmModalStore((state) => state.details);
  const resolve = useConfirmModalStore((state) => state.resolve);

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
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" />

      {/* Dialog card */}
      <div
        className="relative z-10 w-full max-w-lg rounded-xl border bg-white shadow-2xl dark:bg-gray-900 flex flex-col"
        style={{ borderColor: 'var(--color-border-subtle)', maxHeight: '90dvh' }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-start gap-3 px-4 sm:px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--color-border-subtle)' }}
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
                className="text-sm font-medium break-words"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {targetUserName}
              </span>
              {targetUserRole && (
                <span
                  className="px-1.5 py-0.5 rounded text-xs font-medium shrink-0"
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
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body — scrollable when many changes ── */}
        <div className="px-4 sm:px-5 py-4 space-y-2.5 overflow-y-auto">
          {changes.map((change, idx) => (
            <div
              key={idx}
              className="rounded-lg border px-3 py-2.5"
              style={{ borderColor: 'var(--color-border-subtle)', backgroundColor: 'var(--color-bg-secondary)' }}
            >
              {/*
                Two-row layout on very narrow screens, single-row on wider:
                  Row 1: label (breaks naturally)
                  Row 2: before → after value (always on same line, shrink-0)
                On sm+: flex-row with label growing and value shrinking.
              */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                <span
                  className="text-sm font-medium flex-1 min-w-0"
                  style={{ color: 'var(--color-text-primary)', wordBreak: 'break-word' }}
                >
                  {change.label}
                </span>

                {change.previous !== undefined && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold shrink-0">
                    <span style={{ color: 'var(--color-text-muted)' }}>{formatValue(change.previous)}</span>
                    <ArrowRight className="w-3 h-3 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                    <span style={{ color: config.color }}>{formatValue(change.next)}</span>
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Warning / confirmation message */}
          <div
            className="flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 break-words"
            style={{ backgroundColor: config.bg, color: config.color }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="break-words">{finalMessage}</span>
          </div>
        </div>

        {/* ── Footer — stacks on xs, row on sm+ ── */}
        <div
          className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 px-4 sm:px-5 py-4 border-t shrink-0"
          style={{ borderColor: 'var(--color-border-subtle)' }}
        >
          <button
            type="button"
            onClick={() => resolve(false)}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg text-sm font-semibold border text-center"
            style={{
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--color-text-primary)',
              backgroundColor: 'var(--color-bg-secondary)'
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
