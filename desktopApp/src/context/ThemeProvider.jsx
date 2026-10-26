/**
 * FlowTask Theme Provider
 * 
 * React context provider that initializes and manages theme state.
 * Handles system preference changes and provides theme utilities.
 */

import { createContext, useEffect, useCallback } from 'react';
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
  const toggleMode = useThemeStore((state) => state.toggleMode);
  const syncFromRemoteTab = useThemeStore((state) => state.syncFromRemoteTab);
  const appearance = useThemeStore((state) => state.appearance);
  
  // Initialize theme on mount
  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  // Multi-tab synchronization via BroadcastChannel & localStorage
  useEffect(() => {
    let channel = null;

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel('flowtask_theme_sync');
        channel.onmessage = (event) => {
          if (event && event.data) {
            syncFromRemoteTab(event.data);
          }
        };
      } catch (e) {
        // BroadcastChannel blocked or unavailable
      }
    }

    // Fallback: storage event for cross-tab sync
    const handleStorageChange = (e) => {
      if (e.key === 'flowtask-theme' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && parsed.state) {
            syncFromRemoteTab({
              appearance: parsed.state.appearance,
              themeColor: parsed.state.themeColor,
              density: parsed.state.density,
            });
          }
        } catch (err) {
          // Ignore parse errors
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (channel) {
        channel.close();
      }
    };
  }, [syncFromRemoteTab]);

  // Global Keyboard Shortcut: Ctrl+Shift+L / Cmd+Shift+L to toggle Dark/Light mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Ctrl+Shift+L (Windows/Linux) or Cmd+Shift+L (Mac)
      const isModifier = e.ctrlKey || e.metaKey;
      if (isModifier && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        // Don't intercept if user is typing in form inputs, textareas or contenteditables
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        const isEditable = document.activeElement?.isContentEditable;
        if (activeTag === 'input' || activeTag === 'textarea' || isEditable) {
          return;
        }

        e.preventDefault();
        // Ripple from center or active element
        const rect = document.activeElement?.getBoundingClientRect();
        const origin = rect && rect.width > 0 ? {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        } : null;

        toggleMode(origin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleMode]);

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
 * Provides convenient access to theme state and actions with granular selectors
 */
export const useTheme = () => {
  const appearance = useThemeStore((s) => s.appearance);
  const themeColor = useThemeStore((s) => s.themeColor);
  const density = useThemeStore((s) => s.density);
  const effectiveMode = useThemeStore((s) => s.effectiveMode);
  const isPreviewMode = useThemeStore((s) => s.isPreviewMode);

  const setAppearance = useThemeStore((s) => s.setAppearance);
  const setThemeColor = useThemeStore((s) => s.setThemeColor);
  const setDensity = useThemeStore((s) => s.setDensity);
  const toggleMode = useThemeStore((s) => s.toggleMode);
  const enterPreviewMode = useThemeStore((s) => s.enterPreviewMode);
  const applyPreview = useThemeStore((s) => s.applyPreview);
  const cancelPreview = useThemeStore((s) => s.cancelPreview);
  const resetToDefault = useThemeStore((s) => s.resetToDefault);
  const getCurrentTheme = useThemeStore((s) => s.getCurrentTheme);

  return {
    // State
    appearance,
    themeColor,
    density,
    effectiveMode,
    isPreviewMode,
    
    // Actions
    setAppearance,
    setThemeColor,
    setDensity,
    toggleMode,
    enterPreviewMode,
    applyPreview,
    cancelPreview,
    resetToDefault,
    getCurrentTheme,
  };
};

export default ThemeProvider;
