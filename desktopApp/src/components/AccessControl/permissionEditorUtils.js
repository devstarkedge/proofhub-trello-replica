export const applyViewCascade = (actions, actionKey, nextValue, viewActionKey) => {
  const next = { ...actions, [actionKey]: nextValue };
  if (actionKey === viewActionKey && !nextValue) {
    Object.keys(next).forEach((key) => { if (key !== viewActionKey) next[key] = false; });
  }
  return next;
};
export const verbForToggle = (actionKey, nextValue, viewActionKey) =>
  actionKey === viewActionKey ? (nextValue ? 'grant' : 'revoke') : (nextValue ? 'enable' : 'disable');

// Presentation only: permission keys and effective access come from the server registry.
const DESCRIPTIONS = {
  sales: 'Control access to sales records and the actions this member can perform.',
  finance: 'Control access to financial records, reports, and approvals.',
  access_control: 'Allow this member to manage access and permissions for other workspace members.',
  leave: 'Manage workspace leave policies, calendars, balances, and reporting. Personal leave and approval eligibility follow workspace rules.',
  attendance: 'Manage workspace attendance policies, schedules, corrections, and reporting. Personal attendance and department visibility follow workspace rules.'
};
export const resourceDescription = (key) => DESCRIPTIONS[key] || 'Choose the actions this member can perform in this module.';
export const sameIds = (left = [], right = []) => JSON.stringify([...left].map(String).sort()) === JSON.stringify([...right].map(String).sort());
export const idsOf = (items = []) => items.map((item) => String(item._id || item));
export const isRoleManagedResource = (key, detail) => detail?.source === 'admin' || (detail?.source === 'role-default' && key !== 'access_control');
