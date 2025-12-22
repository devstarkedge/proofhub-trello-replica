/**
 * FlowTask Theme Provider
 * 
 * React context provider that initializes and manages theme state.
 * Handles system preference changes and provides theme utilities.
 */

import React, { createContext, useContext, useEffect, useCallback } from 'react';
import useThemeStore from '../store/themeStore';

// Create context
const ThemeContext = createContext(null);

/**
 * Theme Provider Component
 */
export const ThemeProvider = ({ children }) => {
  // Get store actions and state
  const initializeTheme = useThemeStore((state) => state.initializeTheme);
  const updateEffectiveMode = useThemeStore((state) => state.updateEffectiveMode);
  const appearance = useThemeStore((state) => state.appearance);
  
  // Initialize theme on mount
  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  // Listen for system preference changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = () => {
      // Only update if in auto mode
      if (appearance === 'auto') {
        updateEffectiveMode();
      }
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } 
    // Legacy browsers
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, [appearance, updateEffectiveMode]);

  // Time-based check for auto mode (every minute)
  useEffect(() => {
    if (appearance !== 'auto') return;

    const checkTime = () => {
      updateEffectiveMode();
    };

    // Check every minute for time-based theme changes
    const interval = setInterval(checkTime, 60000);
    
    return () => clearInterval(interval);
  }, [appearance, updateEffectiveMode]);

  return (
    <ThemeContext.Provider value={null}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Hook to use theme store
 * Provides convenient access to theme state and actions
 */
export const useTheme = () => {
  const store = useThemeStore();
  
  const setAppearance = useCallback((mode) => {
    store.setAppearance(mode);
  }, [store]);

  const setThemeColor = useCallback((color) => {
    store.setThemeColor(color);
  }, [store]);

  return {
    // State
    appearance: store.appearance,
    themeColor: store.themeColor,
    effectiveMode: store.effectiveMode,
    isPreviewMode: store.isPreviewMode,
    
    // Actions
    setAppearance,
    setThemeColor,
    enterPreviewMode: store.enterPreviewMode,
    applyPreview: store.applyPreview,
    cancelPreview: store.cancelPreview,
    resetToDefault: store.resetToDefault,
    getCurrentTheme: store.getCurrentTheme,
  };
};

export default ThemeProvider;
