import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Reusable KPI stat card — extracted from the inline KPI-card markup
 * pattern used throughout FinanceDashboard.jsx (label + big number +
 * colored icon chip), generalized for the Super Admin overview grid.
 *
 * Distinguishes loading from zero from unavailable, per the spec's
 * explicit "never show 0 while data hasn't loaded" rule: pass `loading`
 * while the query is in flight, and `value={null}` (not 0) for a metric
 * this app genuinely can't compute (e.g. platform-wide tasks-completed).
 */
const PlatformKpiCard = ({ label, value, icon: Icon, color = '#7c3aed', loading = false, subtext, onClick }) => {
  const displayValue = value === null || value === undefined ? 'Not available' : value;
  const isUnavailable = value === null || value === undefined;

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className="rounded-xl border p-4 text-left w-full transition-colors"
      style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide truncate" style={{ color: 'var(--color-text-muted)' }}>
            {label}
          </p>
          {loading ? (
            <div className="mt-2 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            <p
              className="mt-1 text-2xl font-bold truncate"
              style={{ color: isUnavailable ? 'var(--color-text-muted)' : 'var(--color-text-primary)', fontSize: isUnavailable ? '0.95rem' : undefined }}
            >
              {displayValue}
            </p>
          )}
          {subtext && !loading && (
            <p className="mt-0.5 text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{subtext}</p>
          )}
        </div>
        {Icon && (
          <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: `${color}1f` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
        )}
      </div>
    </Wrapper>
  );
};

export default PlatformKpiCard;
