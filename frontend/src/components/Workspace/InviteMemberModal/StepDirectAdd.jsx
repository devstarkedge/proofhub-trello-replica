import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { ArrowLeft, Loader, UserPlus } from 'lucide-react';
import { inviteMemberDirect } from '../../../services/memberInvitationApi';

const inputClass = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-emerald-500/30';
const inputStyle = {
  backgroundColor: 'var(--color-bg-muted)',
  borderColor: 'var(--color-border-default)',
  color: 'var(--color-text-primary)',
};
const labelClass = 'text-xs font-semibold mb-1.5 block';

const StepDirectAdd = ({ workspaceId, departmentOptions, roleOptions, defaultDepartmentId, onBack, onSuccess }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState(defaultDepartmentId || departmentOptions?.[0]?._id || '');
  const [role, setRole] = useState(roleOptions?.find((r) => r.slug === 'employee')?.slug || roleOptions?.[0]?.slug || '');
  const [employeeId, setEmployeeId] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !department || !role || !temporaryPassword) {
      toast.warning('Full name, email, department, role, and a temporary password are required');
      return;
    }
    if (temporaryPassword.length < 6) {
      toast.warning('Temporary password must be at least 6 characters');
      return;
    }
    if (temporaryPassword !== confirmPassword) {
      toast.warning('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const result = await inviteMemberDirect(workspaceId, {
        fullName: fullName.trim(),
        email: email.trim(),
        department,
        role,
        employeeId: employeeId.trim() || undefined,
        temporaryPassword,
        sendWelcomeEmail,
        requirePasswordChangeOnFirstLogin: requirePasswordChange,
      });
      toast.success(
        result?.newUser ? `${fullName.trim()} has been added — welcome email sent` : `${fullName.trim()} has been added to this workspace`
      );
      onSuccess();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to create and invite this member');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-medium"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelClass} style={{ color: 'var(--color-text-secondary)' }}>Full Name *</label>
          <input className={inputClass} style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div className="col-span-2">
          <label className={labelClass} style={{ color: 'var(--color-text-secondary)' }}>Email *</label>
          <input type="email" className={inputClass} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--color-text-secondary)' }}>Department *</label>
          <select className={inputClass} style={inputStyle} value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Select...</option>
            {(departmentOptions || []).map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--color-text-secondary)' }}>Role *</label>
          <select className={`${inputClass} capitalize`} style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
            {(roleOptions || []).map((r) => (
              <option key={r._id} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelClass} style={{ color: 'var(--color-text-secondary)' }}>Employee ID (optional)</label>
          <input className={inputClass} style={inputStyle} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="EMP-1042" />
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--color-text-secondary)' }}>Temporary Password *</label>
          <input type="password" className={inputClass} style={inputStyle} value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} placeholder="At least 6 characters" />
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--color-text-secondary)' }}>Confirm Password *</label>
          <input type="password" className={inputClass} style={inputStyle} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" />
        </div>
      </div>

      <p className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
        If this email already has a FlowTask account, they'll simply be added to this workspace — the password above is ignored in that case.
      </p>

      <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <label className="flex items-center gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--color-text-primary)' }}>
          <input type="checkbox" checked={sendWelcomeEmail} onChange={(e) => setSendWelcomeEmail(e.target.checked)} className="rounded" />
          Send Welcome Email
        </label>
        <label className="flex items-center gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--color-text-primary)' }}>
          <input type="checkbox" checked={requirePasswordChange} onChange={(e) => setRequirePasswordChange(e.target.checked)} className="rounded" />
          Require Password Change on First Login
        </label>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 transition-all"
        >
          {saving ? <Loader size={16} className="animate-spin" /> : <UserPlus size={16} />}
          {saving ? 'Creating...' : 'Create & Invite'}
        </button>
      </div>
    </form>
  );
};

export default StepDirectAdd;
