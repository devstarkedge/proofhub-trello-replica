// Identity recovery and self-service settings never expose a legacy tenant
// role, assignment, permission override, password, or token-version field.
export const IDENTITY_PROFILE_FIELDS = '_id name email avatar title settings forcePasswordChange';
export function identityProfile(user) {
  if (!user) return null;
  const profile = Object.fromEntries(IDENTITY_PROFILE_FIELDS.split(' ').filter(key => user[key] !== undefined).map(key => [key, user[key]]));
  return { ...profile, role: null, roleId: null, department: [], team: null,
    accessType: null, allowedProjects: [], restriction: null, kind: null, workspaceId: null };
}
