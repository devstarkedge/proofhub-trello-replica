import React, { createContext, useState, useCallback, useContext, useEffect, useRef } from "react";
import api from "../services/api";
import socketService from "../services/socket";
import AuthContext from "./AuthContext";
import { resetAllOnWorkspaceSwitch } from "../store/resetRegistry";

const WorkspaceContext = createContext();

export const WorkspaceProvider = ({ children }) => {
  const { user, token, isAuthenticated, setUser } = useContext(AuthContext);
  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  const loadedForUserId = useRef(null);

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
    setLoading(true);
    try {
      const response = await api.get("/api/workspaces");
      const list = response?.data?.data || [];
      setWorkspaces(list);

      const savedId = localStorage.getItem("workspaceId");
      const resolved = list.find((ws) => ws._id === savedId) || list[0] || null;
      setCurrentWorkspace(resolved);
      persistActiveWorkspace(resolved);

      return list;
    } catch (error) {
      console.error("Error loading workspaces:", error);
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
      setWorkspaces([]);
      setCurrentWorkspace(null);
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
    setWorkspaces((prev) => prev.filter((ws) => ws._id !== workspaceId));
    if (currentWorkspace?._id === workspaceId) {
      persistActiveWorkspace(null);
      setCurrentWorkspace(null);
    }
  }, [currentWorkspace, persistActiveWorkspace]);

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
