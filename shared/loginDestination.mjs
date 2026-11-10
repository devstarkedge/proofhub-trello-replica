export function requiredPasswordChangePath(user) {
  return user?.forcePasswordChange ? '/settings' : null;
}

// A fresh sign-in starts at Home. Explicit invitation links still complete
// their acceptance flow, and membership/password gates remain authoritative.
export function loginDestination({ user, workspaces, returnTo }) {
  if (user.isSuperAdmin) return '/super-admin';
  const passwordPath = requiredPasswordChangePath(user);
  if (passwordPath) return passwordPath;
  if (user.role !== 'admin' && !user.isVerified) return '/verify-pending';
  if (returnTo && /^\/invite\/[A-Za-z0-9_-]+(?:\?[^#]*)?$/.test(returnTo)) return returnTo;
  if (!workspaces.length) return '/no-workspace';
  // Workspace bootstrap has already selected a membership this account owns.
  // Multiple memberships can be switched from Home after sign-in.
  return '/';
}
