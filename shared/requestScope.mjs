import { actorFromToken } from './offlineQueue.mjs';

export function captureRequestScope(storage, workspaceId = storage.getItem('workspaceId') || '') {
  const token = storage.getItem('token') || '';
  let tokenVersion = '';
  try { tokenVersion = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).tokenVersion ?? ''; } catch { /* An unauthenticated read has no actor. */ }
  return { actorId: actorFromToken(token), tokenVersion, workspaceId: String(workspaceId || '') };
}

export function requestScopeKey(scope) {
  return JSON.stringify([scope.actorId, scope.tokenVersion, scope.workspaceId]);
}

export function assertRequestScope(storage, expected, { identityOnly = false } = {}) {
  const current = captureRequestScope(storage);
  if (requestScopeKey(identityOnly ? { ...current, workspaceId: '' } : current) !== requestScopeKey(identityOnly ? { ...expected, workspaceId: '' } : expected)) {
    const error = new Error('The account or workspace changed. Reload this view to continue.');
    error.name = 'CanceledError';
    error.code = 'ERR_CANCELED';
    error.skipOfflineQueue = true;
    throw error;
  }
}
