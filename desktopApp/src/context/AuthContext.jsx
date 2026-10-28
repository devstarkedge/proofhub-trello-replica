import { createContext, useState, useEffect, useCallback, useRef } from "react";
import api from "../services/api";
import socketService from "../services/socket";
import { BACKEND_UNAVAILABLE_MESSAGE, getSafeAuthDiagnostic, isAuthenticationRejection, isTransientBackendError } from "../services/authErrors";
import useRoleStore from "../store/roleStore";
import { resetAllOnWorkspaceSwitch } from "../store/resetRegistry";
import { clearAttendanceLocationBootstrapState } from "../utils/attendanceLocationBootstrap";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(null);
  const restoreRetryCount = useRef(0);
  const restoreRetryTimer = useRef(null);
  const restoreSessionRef = useRef(null);
  const restoreInFlightRef = useRef(null);
  const sessionErrorRef = useRef(null);

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
    setSessionError(null);
    sessionErrorRef.current = null;
    restoreRetryCount.current = 0;
    if (restoreRetryTimer.current) clearTimeout(restoreRetryTimer.current);
    restoreRetryTimer.current = null;

    // WorkspaceProvider opens the authenticated connection after workspace resolution.
  };

  const logoutUser = useCallback(() => {
    window.flowtaskDesktop?.tracking?.configure(null).catch(() => {});
    // Only remove token from localStorage
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) api.post('/api/auth/logout', { refreshToken }, { skipOfflineQueue: true }).catch(() => {});
    localStorage.removeItem('refreshToken');
    localStorage.removeItem("token");
    localStorage.removeItem("workspaceId");
    sessionStorage.removeItem("push_modal_dismissed");
    clearAttendanceLocationBootstrapState();
    setToken(null);

    setUser((prevUser) => {
      // Remove user's task preset if they have one
      if (prevUser && prevUser._id) {
        localStorage.removeItem(`taskPreset_${prevUser._id}`);
      }
      return null;
    });

    setIsAuthenticated(false);
    setSessionError(null);
    sessionErrorRef.current = null;
    restoreRetryCount.current = 0;
    if (restoreRetryTimer.current) clearTimeout(restoreRetryTimer.current);
    restoreRetryTimer.current = null;

    // Disconnect socket on logout
    socketService.disconnect();

    // Clear every workspace-scoped store (roleStore + anything else that
    // registered itself — see store/resetRegistry.js).
    resetAllOnWorkspaceSwitch();
  }, []);

  const restoreSession = useCallback(() => {
    if (restoreInFlightRef.current) return restoreInFlightRef.current;

    const operation = (async () => {
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
        const payloadError = new Error("Invalid session payload: user not found");
        payloadError.code = 'INVALID_SESSION_PAYLOAD';
        throw payloadError;
      }

      // Re-hydrate state from verified data (user data in memory only)
      setToken(localStorage.getItem("token"));
      setUser(normalizedUser);
      setIsAuthenticated(true);
      setSessionError(null);
      sessionErrorRef.current = null;
      restoreRetryCount.current = 0;
      if (restoreRetryTimer.current) clearTimeout(restoreRetryTimer.current);
      restoreRetryTimer.current = null;

      // WorkspaceProvider reconnects with the verified token and resolved workspace.

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
      if (isAuthenticationRejection(error)) {
        console.warn("Saved FlowTask session was rejected by the backend.", getSafeAuthDiagnostic(error));
        logoutUser();
      } else if (isTransientBackendError(error)) {
        // A valid credential must survive a temporary proxy/backend outage.
        // Retry only a bounded number of times so startup failures cannot
        // become an infinite request loop.
        console.warn("Session verification is temporarily unavailable.", getSafeAuthDiagnostic(error));
        setSessionError(BACKEND_UNAVAILABLE_MESSAGE);
        sessionErrorRef.current = BACKEND_UNAVAILABLE_MESSAGE;
        const delays = [2000, 5000, 15000];
        if (!restoreRetryTimer.current && restoreRetryCount.current < delays.length) {
          const delay = delays[restoreRetryCount.current++];
          restoreRetryTimer.current = setTimeout(() => {
            restoreRetryTimer.current = null;
            restoreSessionRef.current?.();
          }, delay);
        }
      } else {
        console.warn("Saved FlowTask session response was invalid.", getSafeAuthDiagnostic(error));
        logoutUser();
      }
      }

      setLoading(false);
    })();

    const tracked = operation.finally(() => {
      if (restoreInFlightRef.current === tracked) restoreInFlightRef.current = null;
    });
    restoreInFlightRef.current = tracked;
    return tracked;
  }, [logoutUser, normalizeUser]);

  const retrySession = useCallback(() => {
    if (!localStorage.getItem("token")) return;
    restoreRetryCount.current = 0;
    if (restoreRetryTimer.current) clearTimeout(restoreRetryTimer.current);
    restoreRetryTimer.current = null;
    setLoading(true);
    restoreSessionRef.current?.();
  }, []);

  useEffect(() => {
    restoreSessionRef.current = restoreSession;
  }, [restoreSession]);

  useEffect(() => {
    restoreSession();
    return () => {
      if (restoreRetryTimer.current) clearTimeout(restoreRetryTimer.current);
    };
  }, [restoreSession]);

  useEffect(() => {
    const recover = () => {
      if (sessionErrorRef.current && localStorage.getItem("token")) retrySession();
    };
    const clearRecoveredError = () => {
      setSessionError(null);
      sessionErrorRef.current = null;
      restoreRetryCount.current = 0;
      if (restoreRetryTimer.current) clearTimeout(restoreRetryTimer.current);
      restoreRetryTimer.current = null;
    };
    window.addEventListener('online', recover);
    window.addEventListener('desktop-resume', recover);
    window.addEventListener('flowtask:backend-recovered', clearRecoveredError);
    return () => {
      window.removeEventListener('online', recover);
      window.removeEventListener('desktop-resume', recover);
      window.removeEventListener('flowtask:backend-recovered', clearRecoveredError);
    };
  }, [retrySession]);

  useEffect(() => {
    const expired = () => restoreSession();
    window.addEventListener('socket-auth-expired', expired);
    return () => window.removeEventListener('socket-auth-expired', expired);
  }, [restoreSession]);

  // Listen for real-time role changes affecting the current user
  useEffect(() => {
    const handleRoleChanged = (event) => {
      const { userId, newRole } = event.detail;
      if (user && user._id === userId) {
        resetAllOnWorkspaceSwitch();
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

  useEffect(() => {
    const updated = event => {
      if (event.detail.token) setToken(event.detail.token);
      else logoutUser();
    };
    window.addEventListener('session-token-updated', updated);
    return () => window.removeEventListener('session-token-updated', updated);
  }, [logoutUser]);

  useEffect(() => {
    const changed = event => {
      const detail = event.detail || {};
      if (detail.workspaceId && String(detail.workspaceId) !== localStorage.getItem('workspaceId')) return;
      if (detail.userId && String(detail.userId) !== String(user?._id || user?.id)) return;
      resetAllOnWorkspaceSwitch();
      restoreSession();
    };
    const events = ['socket-authz-changed', 'socket-user-project-access-changed', 'socket-access-control-updated'];
    events.forEach(event => window.addEventListener(event, changed));
    return () => events.forEach(event => window.removeEventListener(event, changed));
  }, [user?._id, user?.id, restoreSession]);

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
        sessionError,
        retrySession,
        register,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
