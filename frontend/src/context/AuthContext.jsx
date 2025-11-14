import React, { createContext, useState, useEffect, useCallback } from "react";
import api from "../services/api";
import socketService from "../services/socket";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const loginUser = (userData, userToken) => {
    localStorage.setItem("token", userToken);
    localStorage.setItem("user", JSON.stringify(userData));
    setToken(userToken);
    setUser(userData);
    setIsAuthenticated(true);

    // Connect socket after authentication
    socketService.connect(userData._id, userToken);
  };

  const logoutUser = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);

    // Disconnect socket on logout
    socketService.disconnect();
  }, []);

  const restoreSession = useCallback(async () => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");

    if (savedToken && savedUser) {
      try {
        const response = await api.get("/api/auth/verify");
        const userData = response.data.data;

        // Re-hydrate state from verified data
        setToken(savedToken);
        setUser(userData);
        setIsAuthenticated(true);

        // Connect socket after session restore
        socketService.connect(userData._id, savedToken);
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
        if (error.response?.status === 401 && !originalRequest._retry) {
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