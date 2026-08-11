import React from 'react';
import { getGradient } from '../../../../utils/avatarGradient';

/**
 * Live logo-or-initials + name preview — reacts to the exact same identity
 * data (name, logo file) that will eventually be persisted, so what the
 * user sees here is what they'll see in the switcher afterward. Reuses
 * Avatar.jsx's gradient-hash so the initials fallback matches the same
 * "consistent color per name" logic used everywhere else in the app.
 */
const BrandingPreview = ({ name, logoPreviewUrl }) => {
  const trimmedName = (name || '').trim();
  const initial = trimmedName ? trimmedName.charAt(0).toUpperCase() : '?';
  const gradient = getGradient(trimmedName);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-muted)' }}>
      <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center">
        {logoPreviewUrl ? (
          <img src={logoPreviewUrl} alt="Workspace logo preview" className="w-full h-full object-contain bg-white" />
        ) : (
          <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradient} text-white font-bold text-lg`}>
            {initial}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
          {trimmedName || 'Your workspace name'}
        </p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Preview</p>
      </div>
    </div>
  );
};

export default BrandingPreview;
