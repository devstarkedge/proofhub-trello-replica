import React, { useEffect, useState } from 'react';
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
  const [form, setForm] = useState({ userId: '', leaveTypeId: '', amount: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Database.getUsers().then((res) => setUsers(res?.data || res?.users || [])).catch(() => setUsers([]));
    leaveApi.getLeaveTypes().then(({ data }) => setLeaveTypes(data || [])).catch(() => setLeaveTypes([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.userId || !form.leaveTypeId || !form.amount || !form.reason.trim()) {
      toast.error('All fields, including a reason, are required');
      return;
    }
    setSubmitting(true);
    try {
      await leaveApi.createAdjustment({ ...form, amount: Number(form.amount) });
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
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl p-6 space-y-3" style={{ backgroundColor: 'var(--color-bg-base)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>Manual Balance Adjustment</h3>

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
            Amount (positive to credit, negative to debit)
          </label>
          <input type="number" step="0.5" className={inputClass} style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>

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
