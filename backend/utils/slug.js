// Mirrored at frontend/src/utils/workspaceSlug.js for live-typing UX — this
// copy is the one that actually gates creation; the frontend one never is
// the final authority.

// Every top-level frontend route (see frontend/src/App.jsx) plus generic
// words a workspace slug should never be able to claim. Slugs aren't
// currently used for routing anywhere in the app, but reserving these now
// avoids a breaking rename later if that ever changes.
export const RESERVED_SLUGS = [
  'login', 'register', 'forgot-password', 'reset-password', 'verify-pending',
  'select-workspace', 'my-shortcuts', 'workspace-settings', 'teams', 'team-management',
  'sales', 'admin', 'hr-panel', 'access-control', 'search', 'list-view', 'calendar',
  'gantt', 'analytics', 'profile', 'settings', 'announcements', 'reminders',
  'reminder-calendar', 'pm-sheet', 'finance', 'workflow', 'invite', 'join', 'no-workspace',
  'api', 'app', 'www', 'static', 'assets', 'workspace', 'workspaces', 'new', 'create', 'edit', 'delete',
  // Platform administration lives at /super-admin — a genuinely separate
  // context from any tenant, never a workspace itself (see
  // middleware/requireSuperAdmin.js). Reserved here so a workspace can never
  // collide with that route again, the way one already did once by accident.
  'super-admin', 'superadmin', 'platform-admin', 'platform'
];

const MIN_SLUG_LENGTH = 3;

export function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isReservedSlug(slug) {
  return RESERVED_SLUGS.includes(slug);
}

export function isValidSlugFormat(slug) {
  return typeof slug === 'string' && slug.length >= MIN_SLUG_LENGTH && slug === slugify(slug);
}
