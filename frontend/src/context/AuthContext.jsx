import React, { createContext, useState, useEffect, useCallback } from "react";
import api from "../services/api";
import socketService from "../services/socket";
import useRoleStore from "../store/roleStore";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const loginUser = (userData, userToken) => {
    // Only store token in localStorage, NOT user data (security improvement)
    localStorage.setItem("token", userToken);
    setToken(userToken);
    setUser(userData);
    setIsAuthenticated(true);

    // Connect socket after authentication
    socketService.connect(userData._id, userToken);
  };

  const logoutUser = useCallback(() => {
    // Only remove token from localStorage
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);

    // Disconnect socket on logout
    socketService.disconnect();
    
    // Reset role store
    useRoleStore.getState().reset();
  }, []);

  const restoreSession = useCallback(async () => {
    const savedToken = localStorage.getItem("token");

    if (savedToken) {
      try {
        // Fetch fresh user data from API using the stored token
        const response = await api.get(`/api/auth/verify?_t=${Date.now()}`);
        const userData = response.data.data;

        // Re-hydrate state from verified data (user data in memory only)
        setToken(savedToken);
        setUser(userData);
        setIsAuthenticated(true);

        // Connect socket after session restore
        socketService.connect(userData._id, savedToken);
        
        // Load user permissions after session restore
        try {
          await useRoleStore.getState().loadMyPermissions();
          await useRoleStore.getState().loadRoles();
        } catch (permErr) {
          console.error("Error loading permissions:", permErr);
        }
      } catch (error) {
        console.error("Session restore failed:", error);
        logoutUser();
      }
    }
    setLoading(false);
  }, [logoutUser]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

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
      
      // Load user permissions after login
      try {
        await useRoleStore.getState().loadMyPermissions();
        await useRoleStore.getState().loadRoles();
      } catch (permErr) {
        console.error("Error loading permissions:", permErr);
      }
      
      return { success: true, user };
    } catch (err) {
      console.error(err.response?.data);
      throw err;
    }
  };

  const register = async (name, email, password, department) => {
    const body = JSON.stringify({ name, email, password, department });

    try {
      await api.post("/api/auth/register", body);
      return { success: true };
    } catch (err) {
      console.error(err.response.data);
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