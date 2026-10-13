export function leaveApprovalRedirect({ search = '', requestId } = {}) {
  const params = new URLSearchParams(search);
  const id = requestId || params.get('request') || params.get('requestId');
  params.delete('requestId');
  if (id) params.set('request', id);
  params.set('view', 'approval');
  return `/leave?${params}`;
}
