import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState({ token: localStorage.getItem('token'), isAuthenticated: false, loading: true, user: null });

  const getProfile = async () => {
    try {
      const res = await axios.get('/api/users/profile');
      setAuth(prev => ({ ...prev, user: res.data, isAuthenticated: true, loading: false }));
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setAuth(prev => ({ ...prev, isAuthenticated: false, loading: false, user: null }));
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['x-auth-token'];
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['x-auth-token'] = token;
      getProfile();
    } else {
      setAuth({ token: null, isAuthenticated: false, loading: false, user: null });
    }
  }, []);

  const register = async (name, email, password) => {
    const config = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const body = JSON.stringify({ name, email, password });

    try {
      const res = await axios.post('/api/auth/register', body, config);
      localStorage.setItem('token', res.data.token);
      axios.defaults.headers.common['x-auth-token'] = res.data.token;
      setAuth({ token: res.data.token, isAuthenticated: true, loading: false, user: null });
      await getProfile();
    } catch (err) {
      console.error(err.response.data);
      // Handle error (e.g., show an error message)
    }
  };

  const login = async (email, password) => {
    const config = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const body = JSON.stringify({ email, password });

    try {
      const res = await axios.post('/api/auth/login', body, config);
      localStorage.setItem('token', res.data.token);
      axios.defaults.headers.common['x-auth-token'] = res.data.token;
      setAuth({ token: res.data.token, isAuthenticated: true, loading: false, user: null });
      await getProfile();
    } catch (err) {
      console.error(err.response.data);
      // Handle error (e.g., show an error message)
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['x-auth-token'];
    setAuth({ token: null, isAuthenticated: false, loading: false, user: null });
  };

  return (
    <AuthContext.Provider value={{ ...auth, register, login, logout, getProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
