import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { ArrowLeft, Loader, Send } from 'lucide-react';
import { inviteMemberSelfRegister } from '../../../services/memberInvitationApi';

const inputClass = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-emerald-500/30';
const inputStyle = {
  backgroundColor: 'var(--color-bg-muted)',
  borderColor: 'var(--color-border-default)',
  color: 'var(--color-text-primary)',
};
const labelClass = 'text-xs font-semibold mb-1.5 block';

const StepRegistrationInvite = ({ workspaceId, departmentOptions, roleOptions, defaultDepartmentId, onBack, onSuccess }) => {
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState(defaultDepartmentId || '');
  const [role, setRole] = useState(roleOptions?.find((r) => r.slug === 'employee')?.slug || '');
  const [personalMessage, setPersonalMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.warning('An email address is required');
      return;
    }

    setSaving(true);
    try {
      await inviteMemberSelfRegister(workspaceId, {
        email: email.trim(),
        department: department || undefined,
        role: role || undefined,
        personalMessage: personalMessage.trim() || undefined,
      });
      toast.success(`Invitation sent to ${email.trim()}`);
      onSuccess();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to send this invitation');
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

      <div>
        <label className={labelClass} style={{ color: 'var(--color-text-secondary)' }}>Email *</label>
        <input type="email" className={inputClass} style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contractor@example.com" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} style={{ color: 'var(--color-text-secondary)' }}>Department (Requested)</label>
          <select className={inputClass} style={inputStyle} value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">No preference</option>
            {(departmentOptions || []).map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} style={{ color: 'var(--color-text-secondary)' }}>Role (Requested)</label>
          <select className={`${inputClass} capitalize`} style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
            {(roleOptions || []).map((r) => (
              <option key={r._id} value={r.slug}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} style={{ color: 'var(--color-text-secondary)' }}>Personal Message (optional)</label>
        <textarea
          className={inputClass}
          style={{ ...inputStyle, resize: 'none' }}
          rows={3}
          maxLength={500}
          value={personalMessage}
          onChange={(e) => setPersonalMessage(e.target.value)}
          placeholder="Looking forward to having you on the team!"
        />
      </div>

      <p className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
        No account is created yet. They'll register or sign in, then someone who can approve join requests will review before they get access.
      </p>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 transition-all"
        >
          {saving ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
          {saving ? 'Sending...' : 'Send Invitation'}
        </button>
      </div>
    </form>
  );
};

export default StepRegistrationInvite;
