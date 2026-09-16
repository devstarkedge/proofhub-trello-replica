import React from 'react';

/**
 * Never shows one ambiguous "Pending Leaves" number — always the five
 * distinct values the spec calls for (Earned/Reserved/Available/Used/Expired),
 * per leave type.
 */
const METRICS = [
  { key: 'earned', label: 'Earned' },
  { key: 'consumed', label: 'Used' },
  { key: 'reserved', label: 'Reserved' },
  { key: 'available', label: 'Available' },
  { key: 'expired', label: 'Expired' }
];

const LeaveBalanceSummaryCard = ({ balance }) => {
  const { leaveType } = balance;
  const nearestExpiry = (balance.buckets || [])
    .filter((bucket) => bucket.expiresAt && bucket.availableAmount > 0)
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))[0];

  return (
    <div
      className="rounded-xl border p-4 shadow-sm sm:p-5"
      style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: leaveType.color || '#3b82f6' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{leaveType.name}</h3>
      </div>

      <div className="grid grid-cols-5 gap-1 text-center sm:gap-2">
        {METRICS.map(({ key, label }) => (
          <div key={key}>
            <div
              className="text-base font-bold sm:text-lg"
              style={{ color: key === 'available' ? 'var(--color-success-text)' : 'var(--color-text-primary)' }}
            >
              {balance[key]}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      {nearestExpiry && (
        <p className="text-xs mt-3" style={{ color: 'var(--color-warning-text)' }}>
          {nearestExpiry.availableAmount} expiring {new Date(nearestExpiry.expiresAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
};

export default LeaveBalanceSummaryCard;
