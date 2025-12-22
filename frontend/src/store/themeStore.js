/**
 * FlowTask Theme Store
 * 
 * Zustand store for managing theme state with persistence.
 * Handles appearance mode, theme color, and preview functionality.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Theme schema version for migrations
const THEME_SCHEMA_VERSION = 1;

// Default theme settings
const DEFAULT_THEME = {
  appearance: 'light', // 'light' | 'dark' | 'auto'
  themeColor: 'blue',  // 'blue' | 'purple' | 'emerald' | 'rose' | 'amber' | 'cyan' | 'indigo' | 'slate'
  version: THEME_SCHEMA_VERSION,
};

// Available theme colors
export const THEME_COLORS = [
  { id: 'blue', name: 'Blue', color: '#3b82f6' },
  { id: 'purple', name: 'Purple', color: '#a855f7' },
  { id: 'emerald', name: 'Emerald', color: '#10b981' },
  { id: 'rose', name: 'Rose', color: '#f43f5e' },
  { id: 'amber', name: 'Amber', color: '#f59e0b' },
  { id: 'cyan', name: 'Cyan', color: '#06b6d4' },
  { id: 'indigo', name: 'Indigo', color: '#6366f1' },
  { id: 'slate', name: 'Slate', color: '#64748b' },
];

// Appearance mode options
export const APPEARANCE_MODES = [
  { id: 'light', name: 'Light', icon: 'sun' },
  { id: 'dark', name: 'Dark', icon: 'moon' },
  { id: 'auto', name: 'Auto', icon: 'laptop' },
];

/**
 * Compute effective theme mode based on settings and system/time
 */
const computeEffectiveMode = (appearance) => {
  if (appearance === 'light' || appearance === 'dark') {
    return appearance;
  }

  // Auto mode: check system preference first
  if (typeof window !== 'undefined' && window.matchMedia) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) return 'dark';
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  }

  // Fallback to time-based: dark 6PM-6AM, light 6AM-6PM
  const hour = new Date().getHours();
  return (hour >= 6 && hour < 18) ? 'light' : 'dark';
};

/**
 * Apply theme to document
 */
const applyThemeToDOM = (effectiveMode, themeColor, enableTransition = true) => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  
  // Add transition class for smooth theme switch
  if (enableTransition) {
    root.classList.add('theme-transitioning');
  }

  // Set theme attributes
  root.setAttribute('data-theme', effectiveMode);
  root.setAttribute('data-color', themeColor);

  // Also add class for Tailwind dark mode support
  if (effectiveMode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Remove transition class after animation completes
  if (enableTransition) {
    setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 300);
  }
};

/**
 * Migrate old theme settings if needed
 */
const migrateThemeSettings = (persisted) => {
  if (!persisted || !persisted.state) {
    return undefined;
  }

  const { state } = persisted;
  
  // Check version and migrate if needed
  if (!state.version || state.version < THEME_SCHEMA_VERSION) {
    // Migration logic for future versions would go here
    return {
      ...persisted,
      state: {
        ...state,
        version: THEME_SCHEMA_VERSION,
      },
    };
  }

  return persisted;
};

/**
 * Theme Store
 */
const useThemeStore = create(
  persist(
    (set, get) => ({
      // State
      appearance: DEFAULT_THEME.appearance,
      themeColor: DEFAULT_THEME.themeColor,
      effectiveMode: 'light',
      version: THEME_SCHEMA_VERSION,

      // Preview state (temporary during settings modal)
      isPreviewMode: false,
      previewAppearance: null,
      previewThemeColor: null,
      savedAppearance: null,
      savedThemeColor: null,

      // Actions
      
      /**
       * Initialize theme on app load
       */
      initializeTheme: () => {
        const { appearance, themeColor } = get();
        const effectiveMode = computeEffectiveMode(appearance);
        
        set({ effectiveMode });
        applyThemeToDOM(effectiveMode, themeColor, false);
      },

      /**
       * Set appearance mode
       */
      setAppearance: (newAppearance) => {
        const { themeColor, isPreviewMode } = get();
        const effectiveMode = computeEffectiveMode(newAppearance);

        if (isPreviewMode) {
          set({ previewAppearance: newAppearance });
          applyThemeToDOM(effectiveMode, themeColor);
        } else {
          set({ appearance: newAppearance, effectiveMode });
          applyThemeToDOM(effectiveMode, themeColor);
        }
      },

      /**
       * Set theme color
       */
      setThemeColor: (newColor) => {
        const { appearance, isPreviewMode, previewAppearance } = get();
        const currentAppearance = isPreviewMode && previewAppearance ? previewAppearance : appearance;
        const effectiveMode = computeEffectiveMode(currentAppearance);

        if (isPreviewMode) {
          set({ previewThemeColor: newColor });
          applyThemeToDOM(effectiveMode, newColor);
        } else {
          set({ themeColor: newColor });
          applyThemeToDOM(effectiveMode, newColor);
        }
      },

      /**
       * Enter preview mode (for settings modal)
       */
      enterPreviewMode: () => {
        const { appearance, themeColor } = get();
        set({
          isPreviewMode: true,
          savedAppearance: appearance,
          savedThemeColor: themeColor,
          previewAppearance: appearance,
          previewThemeColor: themeColor,
        });
      },

      /**
       * Apply preview and exit preview mode
       */
      applyPreview: () => {
        const { previewAppearance, previewThemeColor } = get();
        const effectiveMode = computeEffectiveMode(previewAppearance || 'light');

        set({
          appearance: previewAppearance,
          themeColor: previewThemeColor,
          effectiveMode,
          isPreviewMode: false,
          previewAppearance: null,
          previewThemeColor: null,
          savedAppearance: null,
          savedThemeColor: null,
        });
      },

      /**
       * Cancel preview and revert to saved
       */
      cancelPreview: () => {
        const { savedAppearance, savedThemeColor } = get();
        const effectiveMode = computeEffectiveMode(savedAppearance || 'light');

        // Revert DOM
        applyThemeToDOM(effectiveMode, savedThemeColor || 'blue');

        set({
          isPreviewMode: false,
          previewAppearance: null,
          previewThemeColor: null,
          savedAppearance: null,
          savedThemeColor: null,
        });
      },

      /**
       * Reset to default theme
       */
      resetToDefault: () => {
        const effectiveMode = computeEffectiveMode(DEFAULT_THEME.appearance);

        set({
          appearance: DEFAULT_THEME.appearance,
          themeColor: DEFAULT_THEME.themeColor,
          effectiveMode,
          isPreviewMode: false,
          previewAppearance: null,
          previewThemeColor: null,
        });

        applyThemeToDOM(effectiveMode, DEFAULT_THEME.themeColor);
      },

      /**
       * Update effective mode (called when system preference changes)
       */
      updateEffectiveMode: () => {
        const { appearance, themeColor } = get();
        const effectiveMode = computeEffectiveMode(appearance);
        
        set({ effectiveMode });
        applyThemeToDOM(effectiveMode, themeColor);
      },

      /**
       * Get current display values (considering preview mode)
       */
      getCurrentTheme: () => {
        const { 
          appearance, themeColor, effectiveMode,
          isPreviewMode, previewAppearance, previewThemeColor 
        } = get();

        if (isPreviewMode) {
          return {
            appearance: previewAppearance || appearance,
            themeColor: previewThemeColor || themeColor,
            effectiveMode: computeEffectiveMode(previewAppearance || appearance),
          };
        }

        return { appearance, themeColor, effectiveMode };
      },
    }),
    {
      name: 'flowtask-theme',
      storage: createJSONStorage(() => localStorage),
      version: THEME_SCHEMA_VERSION,
      migrate: migrateThemeSettings,
      partialize: (state) => ({
        appearance: state.appearance,
        themeColor: state.themeColor,
        version: state.version,
      }),
    }
  )
);

export default useThemeStore;
