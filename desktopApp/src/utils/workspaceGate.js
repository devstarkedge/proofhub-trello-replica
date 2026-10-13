// Single source of truth for "what should a workspace-gated route do right
// now" — consumed by PrivateRoute today, and any future guard/route loader
// that needs the same decision instead of re-deriving it from raw
// status/list state. Pure and framework-free so it doesn't need a
// context/render to test, and kept out of WorkspaceContext.jsx so that file
// can stay a component-only export (Vite Fast Refresh requirement).
export function getWorkspaceGateDecision({ status, workspaces, currentWorkspace }) {
  if (status === "idle" || status === "loading") return "pending";
  if (status === "error") return "error";
  if (status === "resolved" && workspaces.length > 1 && !currentWorkspace) return "select-required";
  if (status === "no-workspace") return "no-workspace";
  return "ready";
}
