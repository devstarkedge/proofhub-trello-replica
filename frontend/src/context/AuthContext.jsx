import React, { createContext, useState, useEffect, useCallback } from "react";
import api from "../services/api";
import socketService from "../services/socket";
import useRoleStore from "../store/roleStore";
import { resetAllOnWorkspaceSwitch } from "../store/resetRegistry";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const normalizeUser = useCallback((userData) => {
    if (!userData || typeof userData !== "object") {
      return null;
    }

    const normalizedUser = {
      ...userData,
      _id: userData._id || userData.id,
      id: userData.id || userData._id,
    };

    if (!normalizedUser._id) {
      return null;
    }

    return normalizedUser;
  }, []);

  const loginUser = (userData, userToken) => {
    const normalizedUser = normalizeUser(userData);

    if (!normalizedUser || !userToken) {
      throw new Error("Invalid login response: missing user or token");
    }

    // Only store token in localStorage, NOT user data (security improvement)
    localStorage.setItem("token", userToken);
    setToken(userToken);
    setUser(normalizedUser);
    setIsAuthenticated(true);

    // Connect socket after authentication
    socketService.connect(normalizedUser._id, userToken);
  };

  const logoutUser = useCallback(() => {
    // Only remove token from localStorage
    localStorage.removeItem("token");
    localStorage.removeItem("workspaceId");
    sessionStorage.removeItem("push_modal_dismissed");
    setToken(null);

    setUser((prevUser) => {
      // Remove user's task preset if they have one
      if (prevUser && prevUser._id) {
        localStorage.removeItem(`taskPreset_${prevUser._id}`);
      }
      return null;
    });

    setIsAuthenticated(false);

    // Disconnect socket on logout
    socketService.disconnect();

    // Clear every workspace-scoped store (roleStore + anything else that
    // registered itself — see store/resetRegistry.js).
    resetAllOnWorkspaceSwitch();
  }, []);

  const restoreSession = useCallback(async () => {
    const savedToken = localStorage.getItem("token");

    if (!savedToken) {
      setLoading(false);
      return;
    }

    try {
      // Fetch fresh user data from API using the stored token
      const response = await api.get(`/api/auth/verify?_t=${Date.now()}`);
      const rawUser = response?.data?.data ?? response?.data?.user;
      const normalizedUser = normalizeUser(rawUser);

      if (!normalizedUser) {
        throw new Error("Invalid session payload: user not found");
      }

      // Re-hydrate state from verified data (user data in memory only)
      setToken(savedToken);
      setUser(normalizedUser);
      setIsAuthenticated(true);

      // Connect socket after session restore
      socketService.connect(normalizedUser._id, savedToken);

      // Permissions/roles are NOT loaded here — they need the active
      // workspace resolved first (x-workspace-id persisted to localStorage),
      // which WorkspaceContext's loadWorkspaces() owns. Loading them here
      // would race against that resolution and could fetch roles scoped to
      // whatever workspace happened to be stale in localStorage (e.g. a
      // previous session, or a different account on a shared browser) —
      // confirmed as the actual cause of custom roles appearing to "not be
      // dynamic": the fetch fires once, gets marked initialized, and nothing
      // ever re-fetches it even after the correct workspace resolves a
      // moment later. See WorkspaceContext.jsx's loadWorkspaces/switchWorkspace.
    } catch (error) {
      console.error("Session restore failed:", error);
      logoutUser();
    }

    setLoading(false);
  }, [logoutUser, normalizeUser]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Listen for real-time role changes affecting the current user
  useEffect(() => {
    const handleRoleChanged = (event) => {
      const { userId, newRole } = event.detail;
      if (user && user._id === userId) {
        setUser(prev => prev ? { ...prev, role: newRole } : prev);
        // Reload permissions so the UI reflects the new role immediately
        useRoleStore.getState().loadMyPermissions().catch(err =>
          console.error('Error reloading permissions after role change:', err)
        );
      }
    };

    window.addEventListener('socket-user-role-changed', handleRoleChanged);
    return () => window.removeEventListener('socket-user-role-changed', handleRoleChanged);
  }, [user]);

  // Axios interceptor for automatic token refresh
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        // Prevent retry on refresh endpoint to avoid infinite loops
        if (originalRequest.url && originalRequest.url.includes('/api/auth/refresh')) {
          return Promise.reject(error);
        }
        if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/api/auth/login')) {
          originalRequest._retry = true;
          try {
            const refreshResponse = await api.post("/api/auth/refresh");
            const { token: newToken } = refreshResponse.data;
            localStorage.setItem("token", newToken);
            setToken(newToken);
            originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
            return api(originalRequest);
          } catch (refreshError) {
            console.error("Token refresh failed:", refreshError);
            logoutUser();
            return Promise.reject(refreshError);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(interceptor);
    };
  }, [logoutUser]);

  const login = async (email, password) => {
    const body = JSON.stringify({ email, password });

    try {
      const res = await api.post("/api/auth/login", body);
      const { token, user } = res.data;
      loginUser(user, token);

      // Permissions/roles load from WorkspaceContext once the active
      // workspace is actually resolved — see restoreSession's comment above
      // for why loading them here (before that resolution) is wrong.

      return { success: true, user };
    } catch (err) {
      console.error(err.response?.data);
      throw err;
    }
  };

  const register = async (name, email, password, department, inviteToken) => {
    const body = JSON.stringify({ name, email, password, department, inviteToken });

    try {
      const res = await api.post("/api/auth/register", body);
      // The backend requires a valid inviteToken — there is no public,
      // standalone registration anymore (see authController.js's register).
      // Returned so InvitePage.jsx can auto-login straight into the
      // dashboard after an invite-based signup instead of a separate
      // sign-in step. `outcome` is 'joined' (normal case) or
      // 'pending_approval' (the invitation required approval — see
      // invitationService.js#acceptInvitation) — InvitePage.jsx branches on
      // it instead of unconditionally redirecting home.
      return { success: true, user: res.data.user, token: res.data.token, outcome: res.data.outcome };
    } catch (err) {
      console.error(err.response?.data);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        loading,
        login,
        loginUser,
        logoutUser,
        register,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;