import React from 'react';

// Only Free/Pro/Enterprise are ever active/selectable now (Legacy and
// Business were both retired — see scripts/migrateRetireLegacyPlan.js /
// migratePlanCatalogV2.js). Falls back to a neutral gray for anything
// unrecognized rather than guessing a color, matching
// WorkspaceStatusBadge.jsx's own fallback-to-a-safe-default pattern.
const PLAN_STYLES = {
  free: { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280', label: 'Free' },
  pro: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', label: 'Pro' },
  enterprise: { bg: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', label: 'Enterprise' },
};

const PlanBadge = ({ slug, name, className = '' }) => {
  const style = PLAN_STYLES[slug] || { bg: 'rgba(107, 114, 128, 0.12)', color: '#6b7280', label: name || 'Not configured' };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {style.label}
    </span>
  );
};

export default PlanBadge;
