// This is only a limiter degradation policy. JWT/account/workspace validation
// runs before it; device ownership, consent and capture leases still run after.
// Business writes (check-in/out, work changes, settings, takeover) fail closed.
export function canUseTrackingTelemetryFallback(req) {
  if(req.method!=='POST'||!req.user||!req.workspaceId)return false;
  const route=String(req.originalUrl||'').split('?')[0];
  return /^\/api\/tracking\/devices\/[a-f\d]{24}\/(?:heartbeat|intervals|screenshots\/prepare|screenshots\/[a-f\d]{24}\/complete)\/?$/i.test(route);
}
