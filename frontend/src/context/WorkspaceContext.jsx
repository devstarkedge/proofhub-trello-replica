import React, { createContext, useState, useCallback, useContext, useEffect, useRef } from "react";
import api from "../services/api";
import socketService from "../services/socket";
import AuthContext from "./AuthContext";
import useRoleStore from "../store/roleStore";
import { resetAllOnWorkspaceSwitch } from "../store/resetRegistry";
import logger from "../utils/logger";

// Role/permission data is workspace-scoped, so it must only ever be fetched
// AFTER the active workspace is resolved and persisted (x-workspace-id) —
// never independently/in parallel with that resolution. Fetching it too
// early (e.g. from AuthContext right after login, before this context has
// had a chance to run) would use whatever workspace happened to be stale in
// localStorage — a previous session's, or a different account's on a shared
// browser — and since loadRoles()/loadMyPermissions() mark themselves
// "initialized" on that first call, nothing would ever re-fetch the correct
// data afterward. This was the actual cause of custom roles silently not
// appearing in role dropdowns despite existing correctly in the database.
const loadRoleAndPermissionData = () => Promise.all([
  useRoleStore.getState().loadMyPermissions().catch((err) => console.error("Error loading permissions:", err)),
  useRoleStore.getState().loadRoles().catch((err) => console.error("Error loading roles:", err)),
]);

const WorkspaceContext = createContext();

export const WorkspaceProvider = ({ children }) => {
  const { user, token, isAuthenticated, setUser } = useContext(AuthContext);
  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  // Explicit resolution status, distinct from `loading`: `loading` is reused
  // by every async op (switch/create/leave/etc.), so it can't by itself
  // distinguish "haven't fetched yet" from "confirmed empty" for the very
  // first bootstrap fetch — see loadWorkspaces()'s isInitialLoad handling.
  const [status, setStatus] = useState("idle"); // 'idle' | 'loading' | 'resolved' | 'no-workspace' | 'error'
  const loadedForUserId = useRef(null);
  const hasResolvedOnceRef = useRef(false);

  const persistActiveWorkspace = useCallback((ws) => {
    if (ws?._id) {
      localStorage.setItem("workspaceId", ws._id);
    } else {
      localStorage.removeItem("workspaceId");
    }
  }, []);

  /**
   * Loads the caller's workspaces and resolves which one is active:
   * the one already persisted in localStorage (if the user is still a
   * member of it), otherwise the first one returned. Returns the list so
   * callers (e.g. LoginPage) can decide whether to show the picker without
   * a second round-trip.
   */
  const loadWorkspaces = useCallback(async () => {
    // Only the very first resolution attempt is allowed to move `status`
    // into the transient 'loading'/'error' states. loadWorkspaces() is also
    // called by createWorkspace/leaveWorkspace/deactivateWorkspace and by the
    // socket-workspace-membership-added listener, all of which can fire mid-
    // session on an already-working screen — those must silently refresh
    // workspaces/currentWorkspace without ever blanking the UI to a spinner
    // or error state. See utils/workspaceGate.js's getWorkspaceGateDecision()
    // for the consumer side of this contract.
    const isInitialLoad = !hasResolvedOnceRef.current;
    logger.debug("WORKSPACE_RESOLUTION_START", { isInitialLoad });
    if (isInitialLoad) setStatus("loading");
    setLoading(true);
    try {
      const response = await api.get("/api/workspaces");

      // services/api.js's response interceptor RESOLVES (not rejects) a
      // request that fails mid-flight while offline, returning
      // { data: { offline: true } } so it can queue it for replay. Without
      // this check that shape falls through to `list = []` below and gets
      // misreported as a confirmed-empty workspace list instead of a
      // connectivity failure.
      if (response?.data?.offline) {
        throw new Error("Request queued: offline");
      }

      const list = response?.data?.data || [];
      setWorkspaces(list);

      const savedId = localStorage.getItem("workspaceId");
      const resolved = list.find((ws) => ws._id === savedId) || list[0] || null;
      setCurrentWorkspace(resolved);
      persistActiveWorkspace(resolved);

      // Now that the correct workspace is persisted (x-workspace-id), it's
      // safe to fetch role/permission data — it'll resolve against the
      // right workspace instead of racing ahead of this resolution.
      if (resolved) {
        loadRoleAndPermissionData();
      }

      hasResolvedOnceRef.current = true;
      const nextStatus = list.length > 0 ? "resolved" : "no-workspace";
      setStatus(nextStatus);
      logger.debug("WORKSPACE_RESOLUTION_COMPLETE", { status: nextStatus, count: list.length });

      return list;
    } catch (error) {
      console.error("Error loading workspaces:", error);
      logger.debug("WORKSPACE_RESOLUTION_FAILED", { message: error?.message, isInitialLoad });
      if (isInitialLoad) setStatus("error");
      return [];
    } finally {
      setLoading(false);
    }
  }, [persistActiveWorkspace]);

  /**
   * Switches the active workspace: persists the new selection, clears every
   * workspace-scoped Zustand store, reconnects the socket under the new
   * workspace, and immediately patches AuthContext's in-memory user with
   * the returned membership overlay — no full page reload, no re-login.
   */
  const switchWorkspace = useCallback(async (workspace) => {
    if (!workspace?._id || workspace._id === currentWorkspace?._id) return;

    setLoading(true);
    try {
      const response = await api.post(`/api/workspaces/${workspace._id}/switch`);
      const { workspace: switchedWorkspace, membership } = response.data.data;

      persistActiveWorkspace(switchedWorkspace);
      setCurrentWorkspace(switchedWorkspace);
      setWorkspaces((prev) =>
        prev.map((ws) => ({ ...ws, isActive: ws._id === switchedWorkspace._id }))
      );

      resetAllOnWorkspaceSwitch();

      if (user?._id) {
        socketService.switchWorkspace(user._id, token, switchedWorkspace._id);
      }

      setUser((prev) => (prev ? { ...prev, ...membership } : prev));

      // Immediately re-fetch for the new workspace — resetAllOnWorkspaceSwitch()
      // just cleared roleStore, and nothing else is guaranteed to notice and
      // re-fetch it on its own.
      loadRoleAndPermissionData();

      return switchedWorkspace;
    } catch (error) {
      console.error("Error switching workspace:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, persistActiveWorkspace, setUser, token, user]);

  // Auto-load on session restore / page refresh — LoginPage also calls
  // loadWorkspaces() explicitly right after login so it can inspect the
  // result synchronously for the post-login redirect decision, but nothing
  // would otherwise populate this context on a plain page refresh.
  useEffect(() => {
    if (isAuthenticated && user?._id && loadedForUserId.current !== user._id) {
      loadedForUserId.current = user._id;
      loadWorkspaces();
    }
    if (!isAuthenticated) {
      loadedForUserId.current = null;
      hasResolvedOnceRef.current = false;
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setStatus("idle");
    }
  }, [isAuthenticated, user?._id, loadWorkspaces]);

  /**
   * Accepts the full creation payload (name, slug, type, industry,
   * companySize, department) — see CreateWorkspaceWizard. Awaits
   * loadWorkspaces() + switchWorkspace() fully before resolving so callers
   * can safely fire follow-up requests (icon upload, invites) right after,
   * knowing the x-workspace-id header already points at the new workspace.
   */
  const createWorkspace = useCallback(async (payload) => {
    const response = await api.post("/api/workspaces", payload);
    const created = response.data.data;
    await loadWorkspaces();
    await switchWorkspace(created);
    return created;
  }, [loadWorkspaces, switchWorkspace]);

  /**
   * Renames a workspace and keeps the switcher/pill in sync immediately —
   * no need to wait for a full loadWorkspaces() round-trip.
   */
  const renameWorkspace = useCallback(async (workspaceId, name) => {
    const response = await api.patch(`/api/workspaces/${workspaceId}`, { name });
    const updated = response.data.data;
    setWorkspaces((prev) => prev.map((ws) => (ws._id === workspaceId ? { ...ws, name: updated.name } : ws)));
    setCurrentWorkspace((prev) => (prev?._id === workspaceId ? { ...prev, name: updated.name } : prev));
    return updated;
  }, []);

  /**
   * Leaving/deactivating both remove a workspace from the caller's own
   * list — shared cleanup so the switcher never shows a workspace the
   * caller can no longer use.
   */
  const dropWorkspaceFromState = useCallback((workspaceId) => {
    const next = workspaces.filter((ws) => ws._id !== workspaceId);
    setWorkspaces(next);
    // leaveWorkspace/deactivateWorkspace both follow this with an awaited
    // loadWorkspaces() that will settle `status` from the server's fresh
    // answer regardless — this just closes the one-render window where
    // `workspaces` would otherwise already be empty while `status` still
    // reads its previous 'resolved' value (dropping your last workspace).
    if (next.length === 0) {
      setStatus("no-workspace");
    }
    if (currentWorkspace?._id === workspaceId) {
      persistActiveWorkspace(null);
      setCurrentWorkspace(null);
    }
  }, [workspaces, currentWorkspace, persistActiveWorkspace]);

  const leaveWorkspace = useCallback(async (workspaceId) => {
    await api.post(`/api/workspaces/${workspaceId}/leave`);
    dropWorkspaceFromState(workspaceId);
    await loadWorkspaces();
  }, [dropWorkspaceFromState, loadWorkspaces]);

  const deactivateWorkspace = useCallback(async (workspaceId) => {
    await api.delete(`/api/workspaces/${workspaceId}`);
    dropWorkspaceFromState(workspaceId);
    await loadWorkspaces();
  }, [dropWorkspaceFromState, loadWorkspaces]);

  const transferOwnership = useCallback(async (workspaceId, newOwnerId) => {
    const response = await api.patch(`/api/workspaces/${workspaceId}/owner`, { newOwnerId });
    return response.data.data;
  }, []);

  /**
   * Applies an icon change (or removal, icon=null) to local state — used
   * both for the actor's own optimistic update right after upload/remove,
   * and for the workspace-icon-updated socket event so every other tab/user
   * currently viewing that workspace updates without a refresh.
   */
  const applyWorkspaceIcon = useCallback((workspaceId, icon) => {
    setWorkspaces((prev) => prev.map((ws) => (ws._id === workspaceId ? { ...ws, icon } : ws)));
    setCurrentWorkspace((prev) => (prev?._id === workspaceId ? { ...prev, icon } : prev));
  }, []);

  const uploadWorkspaceIcon = useCallback(async (workspaceId, file) => {
    const formData = new FormData();
    formData.append('icon', file);
    const response = await api.post(`/api/workspaces/${workspaceId}/icon`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const { icon } = response.data.data;
    applyWorkspaceIcon(workspaceId, icon);
    return icon;
  }, [applyWorkspaceIcon]);

  const removeWorkspaceIcon = useCallback(async (workspaceId) => {
    await api.delete(`/api/workspaces/${workspaceId}/icon`);
    applyWorkspaceIcon(workspaceId, null);
  }, [applyWorkspaceIcon]);

  // Live icon sync from other members/tabs.
  useEffect(() => {
    const handleIconUpdated = (event) => {
      const { workspaceId, icon } = event.detail || {};
      if (workspaceId) applyWorkspaceIcon(workspaceId, icon || null);
    };
    window.addEventListener('socket-workspace-icon-updated', handleIconUpdated);
    return () => window.removeEventListener('socket-workspace-icon-updated', handleIconUpdated);
  }, [applyWorkspaceIcon]);

  // Another session just added/restored this user into a workspace (HR
  // Panel, invite accept) — refresh the switcher's list live rather than
  // requiring a logout or manual refresh to see it.
  useEffect(() => {
    const handleMembershipAdded = () => {
      loadWorkspaces();
    };
    window.addEventListener('socket-workspace-membership-added', handleMembershipAdded);
    return () => window.removeEventListener('socket-workspace-membership-added', handleMembershipAdded);
  }, [loadWorkspaces]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        loading,
        status,
        loadWorkspaces,
        switchWorkspace,
        createWorkspace,
        renameWorkspace,
        leaveWorkspace,
        deactivateWorkspace,
        transferOwnership,
        uploadWorkspaceIcon,
        removeWorkspaceIcon,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export default WorkspaceContext;
