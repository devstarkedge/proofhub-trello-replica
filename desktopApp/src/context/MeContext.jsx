import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import api from "../services/api";

/**
 * MeContext - Manages the current logged-in user's data in memory
 * 
 * This context provides:
 * - User data stored in memory (not localStorage)
 * - Methods to update user data
 * - Loading state for user data operations
 * 
 * Security: No sensitive user data is stored in localStorage
 */

const MeContext = createContext(null);

export const MeProvider = ({ children }) => {
  const [me, setMe] = useState(null);
  const [meLoading, setMeLoading] = useState(false);
  const [meError, setMeError] = useState(null);

  /**
   * Fetches the current user's data from the API
   * Called after login or session restore
   */
  const fetchMe = useCallback(async () => {
    setMeLoading(true);
    setMeError(null);
    try {
      const response = await api.get(`/api/auth/verify?_t=${Date.now()}`);
      const userData = response.data.data;
      setMe(userData);
      return userData;
    } catch (error) {
      console.error("Failed to fetch user data:", error);
      setMeError(error);
      setMe(null);
      throw error;
    } finally {
      setMeLoading(false);
    }
  }, []);

  /**
   * Updates the user data in memory
   * Used when user data changes (e.g., profile update)
   */
  const updateMe = useCallback((userData) => {
    setMe(userData);
  }, []);

  /**
   * Clears the user data from memory
   * Called on logout
   */
  const clearMe = useCallback(() => {
    setMe(null);
    setMeError(null);
  }, []);

  /**
   * Refreshes user data from the API
   * Useful when user data might have changed
   */
  const refreshMe = useCallback(async () => {
    try {
      return await fetchMe();
    } catch (error) {
      // If refresh fails, keep existing data
      console.error("Failed to refresh user data:", error);
      return me;
    }
  }, [fetchMe, me]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    me,
    meLoading,
    meError,
    fetchMe,
    updateMe,
    clearMe,
    refreshMe,
    // Convenience getters
    isAdmin: me?.role === 'admin',
    isManager: me?.role === 'manager',
    isEmployee: me?.role === 'employee',
    canManageReminders: me?.role === 'admin' || me?.role === 'manager',
    userId: me?._id,
    userRole: me?.role || 'employee',
  }), [me, meLoading, meError, fetchMe, updateMe, clearMe, refreshMe]);

  return (
    <MeContext.Provider value={contextValue}>
      {children}
    </MeContext.Provider>
  );
};

/**
 * Custom hook to access the current user's data
 * @returns {Object} The MeContext value
 */
export const useMe = () => {
  const context = useContext(MeContext);
  if (!context) {
    throw new Error("useMe must be used within a MeProvider");
  }
  return context;
};

export default MeContext;
