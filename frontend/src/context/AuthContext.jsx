import React, { createContext, useState, useEffect } from "react";
import axios from "axios";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState({
    token: localStorage.getItem("token"),
    isAuthenticated: !!localStorage.getItem("token"),
    loading: true,
    user: null,
  });

  const getProfile = async () => {
    const res = await axios.get("/api/users/profile");
    return res.data;
  };

  // Token refresh mechanism
  const refreshToken = async () => {
    try {
      const response = await axios.post('/api/auth/refresh');
      const { token } = response.data;
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      return token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
      throw error;
    }
  };

  // Axios interceptor for automatic token refresh
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const newToken = await refreshToken();
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            return axios(originalRequest);
          } catch (refreshError) {
            return Promise.reject(refreshError);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      getProfile()
        .then((user) => {
          setAuth((prev) => ({ ...prev, user, loading: false }));
        })
        .catch((err) => {
          console.error("Failed to fetch profile:", err);
          localStorage.removeItem("token");
          delete axios.defaults.headers.common["Authorization"];
          setAuth({
            token: null,
            isAuthenticated: false,
            loading: false,
            user: null,
          });
        });
    } else {
      setAuth({
        token: null,
        isAuthenticated: false,
        loading: false,
        user: null,
      });
    }
  }, []);

  const register = async (name, email, password, department) => {
    const config = {
      headers: {
        "Content-Type": "application/json",
      },
    };

    const body = JSON.stringify({ name, email, password, department });

    try {
      const res = await axios.post("/api/auth/register", body, config);
      // Do not set token or authenticate immediately; user needs verification
      setAuth({
        token: null,
        isAuthenticated: false,
        loading: false,
        user: null,
      });
      // Return success to show message in RegisterPage
      return { success: true };
    } catch (err) {
      console.error(err.response.data);
      throw err; // Re-throw to handle in component
    }
  };

  const login = async (email, password) => {
    const config = {
      headers: {
        "Content-Type": "application/json",
      },
    };

    const body = JSON.stringify({ email, password });

    try {
      const res = await axios.post("/api/auth/login", body, config);
      const { token, user } = res.data;

      localStorage.setItem("token", token);
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

      setAuth({ token, isAuthenticated: true, loading: false, user });

      // Role-based redirects
      const userRole = user.role.toLowerCase();

      if (userRole === "admin") {
        // Admin users are redirected to the dashboard
        return { success: true, redirect: "/" };
      } else if (!user.isVerified) {
        // Non-admin users who are not verified are redirected to a pending page
        return { success: true, redirect: "/verify-pending" };
      } else {
        // Verified non-admin users are redirected to the workflow/dashboard
        return { success: true, redirect: "/" };
      }
    } catch (err) {
      console.error(err.response?.data);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    delete axios.defaults.headers.common["Authorization"];
    setAuth({
      token: null,
      isAuthenticated: false,
      loading: false,
      user: null,
    });
  };

  return (
    <AuthContext.Provider
      value={{ ...auth, register, login, logout, getProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
