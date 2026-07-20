const moneyToCents = (value) => {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const cents = (Number(whole) * 100) + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
};

export const createEmptyMilestone = () => ({
  clientId: globalThis.crypto?.randomUUID?.() || `milestone-${Date.now()}-${Math.random()}`,
  title: '',
  amount: '',
  dueDate: '',
  order: 0
});

export const validateMilestoneSchedule = ({ totalProjectBudget, milestones = [] }) => {
  const budgetCents = moneyToCents(totalProjectBudget);
  if (!budgetCents || budgetCents <= 0) return 'Total project budget must be greater than zero';
  if (!Array.isArray(milestones) || milestones.length === 0) return 'Add at least one milestone';
  let totalCents = 0;
  for (let index = 0; index < milestones.length; index += 1) {
    const milestone = milestones[index];
    if (!String(milestone.title || '').trim()) return `Milestone ${index + 1} title is required`;
    const amountCents = moneyToCents(milestone.amount);
    if (!amountCents || amountCents <= 0) return `Milestone ${index + 1} amount must be greater than zero`;
    totalCents += amountCents;
  }
  if (totalCents !== budgetCents) return 'Milestone amounts must equal the total project budget';
  return null;
};

export { moneyToCents };
