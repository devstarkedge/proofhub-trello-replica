import { useContext } from 'react';
import AuthContext from '../context/AuthContext';

/**
 * Custom hook to access authentication context
 * Provides user data, token, and auth methods
 * 
 * @returns {Object} Auth context value
 * @property {Object|null} user - Current logged-in user data (stored in memory)
 * @property {string|null} token - JWT token (stored in localStorage)
 * @property {boolean} isAuthenticated - Whether user is authenticated
 * @property {boolean} loading - Whether auth state is being restored
 * @property {Function} login - Login function
 * @property {Function} logoutUser - Logout function
 * @property {Function} register - Register function
 * @property {Function} setUser - Update user data in memory
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default useAuth;
