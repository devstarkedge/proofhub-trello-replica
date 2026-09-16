import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import LeaveDateRangePicker from './LeaveDateRangePicker';
import { leaveRequestSchema } from '../../utils/leaveValidation';
import * as leaveApi from '../../services/leaveApi';
import useLeaveStore from '../../store/leaveStore';

const HALF_DAY_SIDE_OPTIONS = [
  { value: 'HALF_DAY_FIRST_HALF', label: 'First Half' },
  { value: 'HALF_DAY_SECOND_HALF', label: 'Second Half' }
];

const selectClass =
  'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const selectStyle = {
  backgroundColor: 'var(--color-bg-base)',
  borderColor: 'var(--color-border-default)',
  color: 'var(--color-text-primary)'
};

/**
 * The "Leave Type" dropdown presents exactly three shapes per underlying
 * LeaveType: Full Day, Half Day (only if the type supports it), and Short
 * Leave (only for a SHORT_LEAVE-category type) — never a generic day-shape
 * re-selection alongside it. Each option's `key` fully encodes both the
 * real leaveTypeId the backend needs (for balance bucketing) and which
 * shape was chosen; there is deliberately no option that leaves the shape
 * ambiguous (no bare "Half Day" without a side).
 */
function buildLeaveOptions(leaveTypes) {
  const options = [];
  for (const type of leaveTypes) {
    if (type.category === 'SHORT_LEAVE') {
      options.push({ key: `${type._id}:SHORT_LEAVE`, leaveTypeId: type._id, shape: 'SHORT_LEAVE', label: type.name });
    } else {
      options.push({ key: `${type._id}:FULL_DAY`, leaveTypeId: type._id, shape: 'FULL_DAY', label: type.name });
      if (type.supportsHalfDay !== false) {
        options.push({ key: `${type._id}:HALF_DAY`, leaveTypeId: type._id, shape: 'HALF_DAY', label: 'Half Day Leave' });
      }
    }
  }
  const halfDayOptions = options.filter((option) => option.shape === 'HALF_DAY');
  if (halfDayOptions.length > 1) {
    for (const option of halfDayOptions) {
      const type = leaveTypes.find((t) => t._id === option.leaveTypeId);
      option.label = `Half Day Leave (${type?.name || ''})`;
    }
  }
  return options;
}

const LeaveRequestForm = ({ onSubmitted, onCancel }) => {
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveOptionKey, setLeaveOptionKey] = useState('');
  const [serverError, setServerError] = useState(null);
  const submitLeaveRequest = useLeaveStore((state) => state.submitLeaveRequest);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: { leaveTypeId: '', dayType: '', reason: '', shortLeaveDurationMinutes: null }
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const shortLeaveStartTime = watch('shortLeaveStartTime');
  const shortLeaveEndTime = watch('shortLeaveEndTime');

  useEffect(() => {
    leaveApi.getLeaveTypes().then(({ data }) => setLeaveTypes(data || [])).catch(() => setLeaveTypes([]));
  }, []);

  const leaveOptions = useMemo(() => buildLeaveOptions(leaveTypes), [leaveTypes]);
  const selectedOption = leaveOptions.find((option) => option.key === leaveOptionKey) || null;
  const shape = selectedOption?.shape || null;

  const handleLeaveOptionChange = (key) => {
    setLeaveOptionKey(key);
    const option = leaveOptions.find((o) => o.key === key);
    setValue('leaveTypeId', option?.leaveTypeId || '', { shouldValidate: true });
    if (option?.shape === 'FULL_DAY' || option?.shape === 'SHORT_LEAVE') {
      // Full Day and Short Leave carry their whole meaning in the Leave
      // Type choice itself — no subtype exists for either, so none is sent.
      setValue('dayType', option.shape, { shouldValidate: true });
    } else {
      // Half Day (or nothing selected yet): clear any previously chosen
      // side immediately rather than leaving a stale value from a prior
      // selection sitting in the form state.
      setValue('dayType', '', { shouldValidate: false });
    }
  };

  // Derived, not separately entered — the backend's duration check
  // (leaveRequest.validation.js#assertShortLeaveDuration) needs a real
  // minute count, and asking for start+end time AND a duration number
  // would just invite the two to disagree.
  useEffect(() => {
    if (shape !== 'SHORT_LEAVE' || !shortLeaveStartTime || !shortLeaveEndTime) return;
    const [startH, startM] = shortLeaveStartTime.split(':').map(Number);
    const [endH, endM] = shortLeaveEndTime.split(':').map(Number);
    const minutes = (endH * 60 + endM) - (startH * 60 + startM);
    setValue('shortLeaveDurationMinutes', minutes > 0 ? minutes : null, { shouldValidate: true });
  }, [shape, shortLeaveStartTime, shortLeaveEndTime, setValue]);

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      const result = await submitLeaveRequest(values);
      onSubmitted?.(result);
    } catch (error) {
      setServerError(error.response?.data?.message || 'Failed to submit leave request');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {serverError && (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error-text)' }}
        >
          {serverError}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Leave Type</label>
        <select
          className={selectClass}
          style={selectStyle}
          value={leaveOptionKey}
          onChange={(e) => handleLeaveOptionChange(e.target.value)}
        >
          <option value="">Select leave type…</option>
          {leaveOptions.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
        {errors.leaveTypeId && <p className="text-xs mt-1" style={{ color: 'var(--color-error-text)' }}>{errors.leaveTypeId.message}</p>}
      </div>

      {shape === 'HALF_DAY' && (
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Type</label>
          <select className={selectClass} style={selectStyle} {...register('dayType')}>
            <option value="">Select…</option>
            {HALF_DAY_SIDE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {errors.dayType && <p className="text-xs mt-1" style={{ color: 'var(--color-error-text)' }}>Please choose First Half or Second Half.</p>}
        </div>
      )}

      <LeaveDateRangePicker
        startDate={startDate}
        endDate={endDate}
        singleDay={shape !== 'FULL_DAY'}
        onChange={({ startDate: s, endDate: e }) => {
          setValue('startDate', s, { shouldValidate: true });
          setValue('endDate', e, { shouldValidate: true });
        }}
      />
      {(errors.startDate || errors.endDate) && (
        <p className="text-xs" style={{ color: 'var(--color-error-text)' }}>
          {errors.startDate?.message || errors.endDate?.message}
        </p>
      )}

      {shape === 'SHORT_LEAVE' && (
        <div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Start Time</label>
              <input type="time" className={selectClass} style={selectStyle} {...register('shortLeaveStartTime')} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>End Time</label>
              <input type="time" className={selectClass} style={selectStyle} {...register('shortLeaveEndTime')} />
            </div>
          </div>
          {shortLeaveStartTime && shortLeaveEndTime && !watch('shortLeaveDurationMinutes') && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-error-text)' }}>End time must be after start time.</p>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Reason (optional)</label>
        <textarea rows={3} className={selectClass} style={selectStyle} {...register('reason')} />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</>) : 'Submit Request'}
        </Button>
      </div>
    </form>
  );
};

export default LeaveRequestForm;
