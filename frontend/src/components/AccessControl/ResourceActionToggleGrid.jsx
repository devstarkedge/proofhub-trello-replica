import React from 'react';
import { Check, X } from 'lucide-react';

/**
 * The one button-grid renderer for "toggle these resource actions on/off".
 * Shared by ResourceAccessPanel (all users, one resource) and
 * UserAccessEditor (one user, all resources) so the cascade-off-on-view-
 * disable and disabled/enabled styling rules exist in exactly one place.
 */
const ResourceActionToggleGrid = ({ actions, effective, onToggle, accentColor = '#10b981', disabled = false, columns = 4 }) => {
  const viewActionKey = actions.find((a) => a.key === 'view')?.key;

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-${columns} gap-2`}>
      {actions.map(({ key, label }) => {
        const isEnabled = effective?.[key] === true;
        const isViewAction = key === viewActionKey;
        const isDisabled = disabled || (!isViewAction && Boolean(viewActionKey) && !effective?.[viewActionKey]);

        return (
          <button
            key={key}
            type="button"
            onClick={() => !isDisabled && onToggle(key, !isEnabled, viewActionKey)}
            disabled={isDisabled}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:cursor-not-allowed"
            style={{
              backgroundColor: isDisabled ? 'var(--color-bg-muted)' : isEnabled ? `${accentColor}18` : 'var(--color-bg-primary)',
              borderColor: isEnabled && !isDisabled ? accentColor : 'var(--color-border-subtle)',
              color: isDisabled ? 'var(--color-text-muted)' : isEnabled ? accentColor : 'var(--color-text-secondary)',
              opacity: isDisabled ? 0.6 : 1
            }}
          >
            {isEnabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {label}
          </button>
        );
      })}
    </div>
  );
};

/** Apply the "turning off the gating view action cascades off every other
 * action" rule shared by every consumer of this grid. */
export const applyViewCascade = (actions, actionKey, nextValue, viewActionKey) => {
  const next = { ...actions, [actionKey]: nextValue };
  if (actionKey === viewActionKey && !nextValue) {
    Object.keys(next).forEach((k) => {
      if (k !== viewActionKey) next[k] = false;
    });
  }
  return next;
};

/** Which of the confirmation modal's five verbs (grant/revoke/update/
 * enable/disable) describes turning one action on or off. The gating
 * "view" action reads as granting/revoking the whole module; any other
 * action reads as enabling/disabling that one capability. */
export const verbForToggle = (actionKey, nextValue, viewActionKey) => {
  const isViewAction = actionKey === viewActionKey;
  if (isViewAction) return nextValue ? 'grant' : 'revoke';
  return nextValue ? 'enable' : 'disable';
};

export default ResourceActionToggleGrid;
