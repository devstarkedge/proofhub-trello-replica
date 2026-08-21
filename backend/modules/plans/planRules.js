/**
 * Single source of truth for "what plan-state transitions can a workspace
 * owner self-serve, and what's the next tier to preview" — read by
 * workspacePlanController.js for both request validation and the `nextPlan`
 * field in the GET /:id/plan response. Adding a future tier (or a real
 * paid Enterprise self-serve path) is a one-line table edit here, not a
 * new conditional scattered across a controller and a component.
 *
 * Deliberately data, not a switch statement — this is what makes the
 * entitlement system "scalable" rather than hardcoded Free/Pro checks.
 */

// Self-serve transitions a workspace owner can trigger directly (no
// payment gateway exists yet, per subscriptionService.js — Phase 1 activates
// immediately on confirmation). Enterprise and Legacy have none: Enterprise
// is only ever provisioned through the approved Contact Sales / admin
// process, and Legacy is a grandfathered, admin-only backfill tier.
export const SELF_SERVE_TRANSITIONS = Object.freeze({
  free: ['pro'],
  pro: ['free'],
  enterprise: [],
  legacy: [],
});

export function isSelfServeTransitionAllowed(fromSlug, toSlug) {
  return (SELF_SERVE_TRANSITIONS[fromSlug] || []).includes(toSlug);
}

// The "next tier up" to preview in the UI — independent of whether that
// specific hop is self-serve. free -> pro previews Pro (self-serve);
// pro -> enterprise previews Enterprise, but that hop is NOT self-serve
// (see SELF_SERVE_TRANSITIONS above) — it routes to Contact Sales instead
// of ever calling changeSubscription. Enterprise/Legacy have no next tier
// to preview; they're managed entirely outside this self-serve system.
const NEXT_DISPLAY_PLAN = Object.freeze({
  free: 'pro',
  pro: 'enterprise',
  enterprise: null,
  legacy: null,
});

export function nextDisplayPlanSlug(currentSlug) {
  return NEXT_DISPLAY_PLAN[currentSlug] ?? null;
}

export default { SELF_SERVE_TRANSITIONS, isSelfServeTransitionAllowed, nextDisplayPlanSlug };
