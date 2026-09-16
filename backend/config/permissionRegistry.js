/**
 * Permission Registry — the single "resource.action" capability catalog.
 *
 * This is the one place every module's permissions are defined. It replaces
 * the previously-separate ad hoc shapes used by the Sales matrix
 * (moduleVisible/canCreate/...) and the Finance toggle (hasAccess/...):
 * both are now just entries under a resource key here, sharing one engine
 * (modules/permissions/permissionEngine.js) and one UI component
 * (frontend ResourceAccessPanel).
 *
 * `legacyField` preserves the exact field name the existing UI/DB used
 * before centralization, purely so old API response shapes and already-
 * shipped frontend code keep working unchanged during the incremental
 * migration (see docs/access-control-migration.md).
 */

export const RESOURCES = {
  sales: {
    label: 'Sales',
    description: 'Sales module — deal rows, dropdowns, exports/imports.',
    actions: [
      { key: 'view', label: 'Module Access', description: 'Can view Sales module', legacyField: 'moduleVisible' },
      { key: 'create', label: 'Create', description: 'Can add new rows', legacyField: 'canCreate' },
      { key: 'update', label: 'Update', description: 'Can edit existing rows', legacyField: 'canUpdate' },
      { key: 'delete', label: 'Delete', description: 'Can delete rows', legacyField: 'canDelete' },
      { key: 'export', label: 'Export', description: 'Can export data', legacyField: 'canExport' },
      { key: 'import', label: 'Import', description: 'Can import data', legacyField: 'canImport' },
      { key: 'manage_options', label: 'Manage Options', description: 'Can manage dropdown values', legacyField: 'canManageDropdowns' },
      { key: 'view_logs', label: 'View Logs', description: 'Can view activity history', legacyField: 'canViewActivityLog' }
    ]
  },
  finance: {
    label: 'Finance',
    description: 'Finance page — revenue analytics and billing detail.',
    actions: [
      { key: 'view', label: 'Finance Page access', description: 'Controls whether the Finance route appears and loads.', legacyField: 'hasAccess' },
      { key: 'revenue_analytics', label: 'Revenue Analytics', description: 'Can view revenue analytics widgets', legacyField: 'revenueAnalytics' },
      { key: 'billing_details', label: 'Billing Details', description: 'Can view billing detail breakdowns', legacyField: 'billingDetails' }
    ]
  },
  access_control: {
    label: 'Access & Permissions',
    description: 'Delegated administration of the permission system itself.',
    actions: [
      { key: 'manage', label: 'Manage roles & permissions', description: 'Can open the Access & Permissions module and edit other users’ access', legacyField: null }
    ]
  },
  leave: {
    label: 'Leave Management',
    description: 'Administrative control of the Leave module — policies, calendars, balances, and reports. Self-service (viewing/requesting/cancelling one\'s own leave) and approver authority (department manager / HR / Admin routing) are derived structurally from org data and are never gated here — see modules/leave/leaveApproval.service.js.',
    actions: [
      { key: 'view_workspace', label: 'View Workspace Leave Data', description: 'Can view every employee\'s leave balances/requests workspace-wide', legacyField: null },
      { key: 'view_policy', label: 'View Policies', description: 'Can view leave policies, versions, and assignments', legacyField: null },
      { key: 'manage_policy', label: 'Manage Policies', description: 'Can create/version/assign leave policies and leave types', legacyField: null },
      { key: 'adjust_balance', label: 'Adjust Balances', description: 'Can create manual leave balance credits/debits', legacyField: null },
      { key: 'manage_calendar', label: 'Manage Work Calendar', description: 'Can configure working days, weekly offs, and holidays', legacyField: null },
      { key: 'cancel_approved', label: 'Cancel Approved Leave', description: 'Can cancel another employee\'s already-approved leave', legacyField: null },
      { key: 'view_reports', label: 'View Reports', description: 'Can view Leave analytics and reports', legacyField: null },
      { key: 'view_audit', label: 'View Audit Log', description: 'Can view the Leave module\'s audit trail', legacyField: null }
    ]
  }
};

export const RESOURCE_KEYS = Object.keys(RESOURCES);

export const resourceExists = (resource) => Boolean(RESOURCES[String(resource || '').toLowerCase()]);

export const getResourceActionKeys = (resource) => {
  const entry = RESOURCES[String(resource || '').toLowerCase()];
  return entry ? entry.actions.map((a) => a.key) : [];
};

/** Convert an engine action map ({view:true,...}) into the legacy field-shaped
 * object old consumers (ModuleAccessPanel, FinanceAccessControl, Sidebar,
 * SalesPage) expect, e.g. {moduleVisible:true, canCreate:false, ...}. */
export const toLegacyShape = (resource, actions = {}) => {
  const key = String(resource || '').toLowerCase();
  const entry = RESOURCES[key];
  const legacy = {};
  if (!entry) return legacy;
  entry.actions.forEach(({ key: actionKey, legacyField }) => {
    if (legacyField) legacy[legacyField] = actions[actionKey] === true;
  });
  return legacy;
};

/** Convert a legacy field-shaped payload ({moduleVisible:true,...}) into the
 * engine's action-key map ({view:true,...}). Used by the one-time migration
 * and by any write path still receiving legacy-shaped bodies. */
export const fromLegacyShape = (resource, legacyPayload = {}) => {
  const key = String(resource || '').toLowerCase();
  const entry = RESOURCES[key];
  const actions = {};
  if (!entry) return actions;
  entry.actions.forEach(({ key: actionKey, legacyField }) => {
    if (legacyField && legacyPayload[legacyField] !== undefined) {
      actions[actionKey] = legacyPayload[legacyField] === true;
    }
  });
  return actions;
};

export default RESOURCES;
