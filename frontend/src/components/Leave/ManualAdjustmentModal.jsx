import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from '../ui/button';
import Database from '../../services/database';
import * as leaveApi from '../../services/leaveApi';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };

/**
 * Manual HR/Admin balance adjustment — spec §28. Always creates a ledger
 * entry via POST /api/leave/adjustments (backend never accepts a direct
 * balance overwrite); a reason is mandatory both here and server-side.
 */
const ManualAdjustmentModal = ({ onClose, onDone }) => {
  const [users, setUsers] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [form, setForm] = useState({ userId: '', leaveTypeId: '', operation: 'CREDIT', count: '', reason: '' });
  const [expiryMode, setExpiryMode] = useState('POLICY');
  const [expiryMonths, setExpiryMonths] = useState('3');
  const clientAdjustmentId = useRef(crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Database.getUsers().then((res) => setUsers(res?.data || res?.users || [])).catch(() => setUsers([]));
    leaveApi.getLeaveTypes().then(({ data }) => setLeaveTypes(data || [])).catch(() => setLeaveTypes([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.userId || !form.leaveTypeId || !form.count || Number(form.count) <= 0 || !form.reason.trim()) {
      toast.error('All fields, including a reason, are required');
      return;
    }
    const customExpiry = form.operation === 'CREDIT' && expiryMode !== 'POLICY';
    if (customExpiry && expiryMode === 'FIXED_MONTHS_AFTER_CREDIT'
      && (!Number.isSafeInteger(Number(expiryMonths)) || Number(expiryMonths) < 1)) {
      toast.error('Expiry months must be a positive whole number');
      return;
    }
    setSubmitting(true);
    try {
      await leaveApi.createAdjustment({ ...form, count: Number(form.count), clientAdjustmentId: clientAdjustmentId.current,
        ...(customExpiry ? { expiryRule: { mode: expiryMode, months: expiryMode === 'FIXED_MONTHS_AFTER_CREDIT' ? Number(expiryMonths) : null } } : {}) });
      window.dispatchEvent(new CustomEvent('socket-leave-balance-updated'));
      toast.success('Balance adjustment recorded');
      onDone?.();
    } catch {
      // axios interceptor already toasts the server error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onClose}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="manual-adjustment-title" className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-6 space-y-3" style={{ backgroundColor: 'var(--color-bg-base)' }} onClick={(e) => e.stopPropagation()}>
        <h3 id="manual-adjustment-title" className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Manual Balance Adjustment</h3>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Employee</label>
          <select className={inputClass} style={inputStyle} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
            <option value="">Select employee…</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Leave Type</label>
          <select className={inputClass} style={inputStyle} value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}>
            <option value="">Select leave type…</option>
            {leaveTypes.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            Operation
          </label>
          <select className={inputClass} style={inputStyle} value={form.operation} onChange={(e) => setForm({ ...form, operation: e.target.value })}>
            <option value="CREDIT">Credit — Add leave</option>
            <option value="DEBIT">Debit — Deduct leave</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Leave Count</label>
          <input type="number" required min="0" max="1000000" step={leaveTypes.find((t) => t._id === form.leaveTypeId)?.category === 'SHORT_LEAVE' ? '1' : '0.5'} className={inputClass} style={inputStyle} value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>Enter entitlements, not hours. The employee’s policy determines permitted increments and balance limits.</p>
        </div>

        {form.operation === 'CREDIT' && (
          <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-subtle)' }}>
            <label className="block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              Credit expiry
              <select className={`${inputClass} mt-1.5`} style={inputStyle} value={expiryMode} onChange={(e) => setExpiryMode(e.target.value)}>
                <option value="POLICY">Use employee’s leave policy</option>
                <option value="FIXED_MONTHS_AFTER_CREDIT">Fixed months after credit</option>
                <option value="CALENDAR_YEAR_END">End of calendar year</option>
                <option value="NEVER">Never expires</option>
              </select>
            </label>
            {expiryMode === 'FIXED_MONTHS_AFTER_CREDIT' && (
              <label className="block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Expires after (months)
                <input type="number" min="1" step="1" required className={`${inputClass} mt-1.5`} style={inputStyle}
                  value={expiryMonths} onChange={(e) => setExpiryMonths(e.target.value)} />
              </label>
            )}
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              {expiryMode === 'POLICY' ? 'This credit follows the employee’s applicable leave policy.'
                : 'Applies only to this credit. Unused leave expires using the workspace’s timezone.'}
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Reason (required)</label>
          <textarea rows={2} className={inputClass} style={inputStyle} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Apply Adjustment'}</Button>
        </div>
      </form>
    </div>
  );
};

export default ManualAdjustmentModal;
