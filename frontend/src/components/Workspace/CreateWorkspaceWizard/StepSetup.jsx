import React, { useEffect } from 'react';
import { INDUSTRY_OPTIONS, COMPANY_SIZE_OPTIONS, WORKSPACE_TYPE_RULES } from './shared/constants';
import EmailInviteInput from '../EmailInviteInput';

/**
 * Step 2 — Setup: fields shown here are entirely driven by the selected
 * workspace type (WORKSPACE_TYPE_RULES). "Continue"/"Create" is gated on
 * only the fields that type actually requires — reported upward via
 * onValidityChange.
 */
const StepSetup = ({ formData, updateField, onValidityChange }) => {
  const rules = WORKSPACE_TYPE_RULES[formData.type] || WORKSPACE_TYPE_RULES.team;

  useEffect(() => {
    const industryValid = !rules.requiresIndustry || !!formData.industry;
    const companySizeValid = !rules.requiresCompanySize || !!formData.companySize;
    const departmentValid = !rules.requiresDepartment || !!formData.departmentName.trim();
    onValidityChange(industryValid && companySizeValid && departmentValid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.industry, formData.companySize, formData.departmentName, rules]);

  return (
    <div className="space-y-5">
      {rules.autoDepartmentName ? (
        <div className="p-3 rounded-xl text-sm" style={{ backgroundColor: 'var(--color-bg-muted)', color: 'var(--color-text-secondary)' }}>
          We&apos;ll set up a default <strong>&quot;{rules.autoDepartmentName}&quot;</strong> department for you automatically.
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
            First department <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            autoFocus
            value={formData.departmentName}
            onChange={(e) => updateField('departmentName', e.target.value)}
            placeholder="e.g. Engineering"
            maxLength={50}
            className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:ring-2 focus:ring-emerald-500/30"
            style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
          />
          <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Every workspace needs at least one department to organize projects. You can add more later.
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
          Industry {rules.requiresIndustry && <span className="text-red-500">*</span>}
        </label>
        <select
          value={formData.industry}
          onChange={(e) => updateField('industry', e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:ring-2 focus:ring-emerald-500/30"
          style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
        >
          <option value="">Select an industry</option>
          {INDUSTRY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
          Company size {rules.requiresCompanySize && <span className="text-red-500">*</span>}
        </label>
        <select
          value={formData.companySize}
          onChange={(e) => updateField('companySize', e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors focus:ring-2 focus:ring-emerald-500/30"
          style={{ backgroundColor: 'var(--color-bg-muted)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
        >
          <option value="">Select company size</option>
          {COMPANY_SIZE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
          Invite members <span className="text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>(optional)</span>
        </label>
        <EmailInviteInput emails={formData.inviteEmails} onChange={(emails) => updateField('inviteEmails', emails)} />
      </div>
    </div>
  );
};

export default StepSetup;
