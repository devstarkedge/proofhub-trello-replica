import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import SlugInput from './shared/SlugInput';
import BrandingPreview from './shared/BrandingPreview';
import { WORKSPACE_TYPES } from './shared/constants';
import { validateWorkspaceIconFile } from '../../../utils/workspaceIcon';

/**
 * Step 1 — Basics: logo, name, URL/slug, and workspace type. "Continue" is
 * gated on name + a genuinely-available slug + a selected type (reported
 * upward via onValidityChange), never just on the fields being non-empty.
 */
const StepBasics = ({ formData, updateField, logoPreviewUrl, onLogoFileChange, onLogoRemove, logoError, onValidityChange }) => {
  const fileInputRef = useRef(null);
  const [slugStatus, setSlugStatus] = useState({ isValid: false, checking: false });

  useEffect(() => {
    const nameValid = !!formData.name.trim();
    const typeValid = !!formData.type;
    onValidityChange(nameValid && typeValid && slugStatus.isValid && !slugStatus.checking);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.name, formData.type, slugStatus]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateWorkspaceIconFile(file);
    onLogoFileChange(file, validationError);
  };

  const handleRemoveClick = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    onLogoRemove();
  };

  return (
    <div className="space-y-5">
      <BrandingPreview name={formData.name} logoPreviewUrl={logoPreviewUrl} />

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden flex-shrink-0 transition-colors hover:border-emerald-500"
          style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-muted)' }}
          title="Upload workspace logo (optional)"
        >
          {logoPreviewUrl ? (
            <img src={logoPreviewUrl} alt="Logo preview" className="w-full h-full object-contain" />
          ) : (
            <ImagePlus size={22} style={{ color: 'var(--color-text-muted)' }} />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Workspace logo (optional)</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>PNG, JPG, WEBP or SVG, up to 2MB</p>
          {logoPreviewUrl && (
            <button type="button" onClick={handleRemoveClick} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 mt-1">
              <Trash2 size={11} /> Remove
            </button>
          )}
          {logoError && <p className="text-xs text-red-500 mt-1">{logoError}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
          Workspace name
        </label>
        <input
          type="text"
          autoFocus
          value={formData.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="e.g. Acme Corp"
          maxLength={100}
          className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:ring-2 focus:ring-emerald-500/30"
          style={{
            backgroundColor: 'var(--color-bg-muted)',
            borderColor: 'var(--color-border-default)',
            color: 'var(--color-text-primary)',
          }}
        />
      </div>

      <SlugInput
        name={formData.name}
        value={formData.slug}
        onChange={(v) => updateField('slug', v)}
        onValidityChange={setSlugStatus}
      />

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
          Workspace type
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {WORKSPACE_TYPES.map((typeOption) => {
            const { value, label, description } = typeOption;
            const Icon = typeOption.icon;
            const isSelected = formData.type === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => updateField('type', value)}
                className="text-left p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between"
                style={{
                  borderColor: isSelected ? '#10b981' : 'var(--color-border-default)',
                  backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'var(--color-bg-muted)',
                }}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: isSelected ? '#10b981' : 'var(--color-bg-tertiary)',
                      color: isSelected ? '#ffffff' : 'var(--color-text-muted)'
                    }}
                  >
                    <Icon size={18} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StepBasics;
