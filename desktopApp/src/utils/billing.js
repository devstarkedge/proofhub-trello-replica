export const normalizeBillingType = (value) => value === 'hourly' ? 'hr' : value;

export const getBillingTypeLabel = (value) => {
  const normalized = normalizeBillingType(value);
  if (normalized === 'hr') return 'Hourly';
  if (normalized === 'fixed') return 'Fixed';
  if (normalized === 'milestone') return 'Milestone';
  if (normalized === 'mixed') return 'Mixed';
  return 'Not specified';
};

export const getBillingTypeStyle = (value) => {
  const normalized = normalizeBillingType(value);
  if (normalized === 'hr') return { backgroundColor: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' };
  if (normalized === 'milestone') return { backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#059669' };
  if (normalized === 'mixed') return { backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' };
  return { backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' };
};

export const getBillingContractValue = (project, formatCurrency) => {
  const normalized = normalizeBillingType(project?.billingCycle || project?.billingType);
  if (normalized === 'hr') return `$${project?.hourlyPrice || 0}/hr`;
  if (normalized === 'milestone') return formatCurrency(project?.totalProjectBudget || 0);
  if (normalized === 'fixed') return formatCurrency(project?.fixedPrice || 0);
  return '-';
};
