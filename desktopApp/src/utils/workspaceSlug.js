// Mirrored from backend/utils/slug.js — for live-typing UX only. The
// backend re-normalizes and re-validates every value independently; this
// copy is never the authority (two-package repo, no shared module linking).
export const RESERVED_SLUGS = [
  'login', 'register', 'forgot-password', 'reset-password', 'verify-pending',
  'select-workspace', 'my-shortcuts', 'workspace-settings', 'teams', 'team-management',
  'sales', 'admin', 'hr-panel', 'access-control', 'search', 'list-view', 'calendar',
  'gantt', 'analytics', 'profile', 'settings', 'announcements', 'reminders',
  'reminder-calendar', 'pm-sheet', 'finance', 'workflow', 'invite', 'join', 'no-workspace',
  'api', 'app', 'www', 'static', 'assets', 'workspace', 'workspaces', 'new', 'create', 'edit', 'delete',
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
