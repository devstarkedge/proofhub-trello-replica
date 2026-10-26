/**
 * FlowTask Theme Store
 * 
 * Zustand store for managing theme state with persistence.
 * Handles appearance mode, theme color, and preview functionality.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Theme schema version for migrations
const THEME_SCHEMA_VERSION = 2;

// Default theme settings
const DEFAULT_THEME = {
  appearance: 'light', // 'light' | 'dark' | 'auto'
  themeColor: 'blue',  // 'blue' | 'purple' | 'emerald' | 'rose' | 'amber' | 'cyan' | 'indigo' | 'slate'
  density: 'comfortable', // 'comfortable' | 'compact'
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

// Display density options
export const DENSITY_MODES = [
  { id: 'comfortable', name: 'Comfortable', description: 'Standard spacing & readability' },
  { id: 'compact', name: 'Compact', description: 'High data density for power users' },
];

// Cross-tab synchronization channel
let syncChannel = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    syncChannel = new BroadcastChannel('flowtask_theme_sync');
  } catch (e) {
    // Graceful fallback for environments blocking BroadcastChannel
  }
}

export const broadcastThemeUpdate = (payload) => {
  if (syncChannel) {
    try {
      syncChannel.postMessage(payload);
    } catch (e) {
      // Ignore broadcast errors
    }
  }
};

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
 * Executes a state change with a circular ripple reveal using the View Transitions API
 */
const transitionWithRipple = (updateFn, originCoordinates = null) => {
  if (typeof document === 'undefined') {
    updateFn();
    return;
  }

  const prefersReducedMotion = typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!document.startViewTransition || prefersReducedMotion) {
    updateFn();
    return;
  }

  const x = originCoordinates?.x ?? (window.innerWidth / 2);
  const y = originCoordinates?.y ?? (window.innerHeight / 2);
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const transition = document.startViewTransition(updateFn);

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`
        ],
      },
      {
        duration: 380,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)',
      }
    );
  }).catch(() => {
    // Graceful fallback
  });
};

/**
 * Apply theme to document with zero-latency updates, density, and optional GPU View Transitions
 */
export const applyThemeToDOM = (
  effectiveMode,
  themeColor,
  withViewTransition = false,
  originCoordinates = null,
  density = 'comfortable'
) => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  const updateDOM = () => {
    root.setAttribute('data-theme', effectiveMode);
    root.setAttribute('data-color', themeColor);
    root.setAttribute('data-density', density || 'comfortable');
    root.style.colorScheme = effectiveMode;

    if (effectiveMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Enterprise Desktop App Native Titlebar & Theme Sync
    if (typeof window !== 'undefined' && window.flowtaskDesktop?.setNativeTheme) {
      try {
        window.flowtaskDesktop.setNativeTheme(effectiveMode);
      } catch (e) {
        // Ignore native bridge errors
      }
    }
  };

  if (withViewTransition) {
    transitionWithRipple(updateDOM, originCoordinates);
  } else {
    updateDOM();
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
      density: DEFAULT_THEME.density,
      effectiveMode: 'light',
      version: THEME_SCHEMA_VERSION,

      // Preview state (temporary during settings modal)
      isPreviewMode: false,
      previewAppearance: null,
      previewThemeColor: null,
      previewDensity: null,
      savedAppearance: null,
      savedThemeColor: null,
      savedDensity: null,

      // Actions
      
      /**
       * Initialize theme on app load
       */
      initializeTheme: () => {
        const { appearance, themeColor, density } = get();
        const effectiveMode = computeEffectiveMode(appearance);
        
        set({ effectiveMode });
        applyThemeToDOM(effectiveMode, themeColor, false, null, density);
      },

      /**
       * Quick toggle between light and dark mode with circular ripple animation
       */
      toggleMode: (originCoordinates = null) => {
        const { appearance, effectiveMode, themeColor, density } = get();
        const nextMode = (appearance === 'dark' || (appearance === 'auto' && effectiveMode === 'dark')) ? 'light' : 'dark';
        
        set({ appearance: nextMode, effectiveMode: nextMode });
        applyThemeToDOM(nextMode, themeColor, true, originCoordinates, density);
        broadcastThemeUpdate({ appearance: nextMode, themeColor, density });
      },

      /**
       * Set appearance mode
       */
      setAppearance: (newAppearance, withTransition = false, originCoordinates = null) => {
        const { themeColor, density, isPreviewMode } = get();
        const effectiveMode = computeEffectiveMode(newAppearance);

        if (isPreviewMode) {
          set({ previewAppearance: newAppearance });
          applyThemeToDOM(effectiveMode, themeColor, false, null, density);
        } else {
          set({ appearance: newAppearance, effectiveMode });
          applyThemeToDOM(effectiveMode, themeColor, withTransition, originCoordinates, density);
          broadcastThemeUpdate({ appearance: newAppearance, themeColor, density });
        }
      },

      /**
       * Set theme color
       */
      setThemeColor: (newColor, withTransition = false, originCoordinates = null) => {
        const { appearance, density, isPreviewMode, previewAppearance } = get();
        const currentAppearance = isPreviewMode && previewAppearance ? previewAppearance : appearance;
        const effectiveMode = computeEffectiveMode(currentAppearance);

        if (isPreviewMode) {
          set({ previewThemeColor: newColor });
          applyThemeToDOM(effectiveMode, newColor, false, null, density);
        } else {
          set({ themeColor: newColor });
          applyThemeToDOM(effectiveMode, newColor, withTransition, originCoordinates, density);
          broadcastThemeUpdate({ appearance, themeColor: newColor, density });
        }
      },

      /**
       * Set display density (Comfortable vs Compact)
       */
      setDensity: (newDensity) => {
        const { appearance, themeColor, isPreviewMode } = get();
        const effectiveMode = computeEffectiveMode(appearance);

        if (isPreviewMode) {
          set({ previewDensity: newDensity });
          applyThemeToDOM(effectiveMode, themeColor, false, null, newDensity);
        } else {
          set({ density: newDensity });
          applyThemeToDOM(effectiveMode, themeColor, false, null, newDensity);
          broadcastThemeUpdate({ appearance, themeColor, density: newDensity });
        }
      },

      /**
       * Synchronize state from another browser tab
       */
      syncFromRemoteTab: (remoteState) => {
        if (!remoteState) return;
        const current = get();
        const nextAppearance = remoteState.appearance ?? current.appearance;
        const nextColor = remoteState.themeColor ?? current.themeColor;
        const nextDensity = remoteState.density ?? current.density;
        const effectiveMode = computeEffectiveMode(nextAppearance);

        set({
          appearance: nextAppearance,
          themeColor: nextColor,
          density: nextDensity,
          effectiveMode,
        });

        applyThemeToDOM(effectiveMode, nextColor, false, null, nextDensity);
      },

      /**
       * Enter preview mode (for settings modal)
       */
      enterPreviewMode: () => {
        const { appearance, themeColor, density } = get();
        set({
          isPreviewMode: true,
          savedAppearance: appearance,
          savedThemeColor: themeColor,
          savedDensity: density,
          previewAppearance: appearance,
          previewThemeColor: themeColor,
          previewDensity: density,
        });
      },

      /**
       * Apply preview and exit preview mode
       */
      applyPreview: (withTransition = true, originCoordinates = null) => {
        const { 
          previewAppearance, previewThemeColor, previewDensity,
          appearance, themeColor, density 
        } = get();
        const finalAppearance = previewAppearance || appearance;
        const finalColor = previewThemeColor || themeColor;
        const finalDensity = previewDensity || density;
        const effectiveMode = computeEffectiveMode(finalAppearance);

        applyThemeToDOM(effectiveMode, finalColor, withTransition, originCoordinates, finalDensity);
        broadcastThemeUpdate({ appearance: finalAppearance, themeColor: finalColor, density: finalDensity });

        set({
          appearance: finalAppearance,
          themeColor: finalColor,
          density: finalDensity,
          effectiveMode,
          isPreviewMode: false,
          previewAppearance: null,
          previewThemeColor: null,
          previewDensity: null,
          savedAppearance: null,
          savedThemeColor: null,
          savedDensity: null,
        });
      },

      /**
       * Cancel preview and revert to saved
       */
      cancelPreview: () => {
        const { savedAppearance, savedThemeColor, savedDensity, appearance, themeColor, density } = get();
        const revertAppearance = savedAppearance || appearance;
        const revertColor = savedThemeColor || themeColor;
        const revertDensity = savedDensity || density;
        const effectiveMode = computeEffectiveMode(revertAppearance);

        // Revert DOM instantly
        applyThemeToDOM(effectiveMode, revertColor, false, null, revertDensity);

        set({
          isPreviewMode: false,
          previewAppearance: null,
          previewThemeColor: null,
          previewDensity: null,
          savedAppearance: null,
          savedThemeColor: null,
          savedDensity: null,
        });
      },

      /**
       * Reset to default theme
       */
      resetToDefault: () => {
        const effectiveMode = computeEffectiveMode(DEFAULT_THEME.appearance);
        applyThemeToDOM(effectiveMode, DEFAULT_THEME.themeColor, true, null, DEFAULT_THEME.density);
        broadcastThemeUpdate({
          appearance: DEFAULT_THEME.appearance,
          themeColor: DEFAULT_THEME.themeColor,
          density: DEFAULT_THEME.density,
        });

        set({
          appearance: DEFAULT_THEME.appearance,
          themeColor: DEFAULT_THEME.themeColor,
          density: DEFAULT_THEME.density,
          effectiveMode,
          isPreviewMode: false,
          previewAppearance: null,
          previewThemeColor: null,
          previewDensity: null,
          savedAppearance: null,
          savedThemeColor: null,
          savedDensity: null,
        });
      },

      /**
       * Update effective mode (called when system preference changes)
       */
      updateEffectiveMode: () => {
        const { appearance, themeColor, density } = get();
        const effectiveMode = computeEffectiveMode(appearance);
        
        set({ effectiveMode });
        applyThemeToDOM(effectiveMode, themeColor, false, null, density);
      },

      /**
       * Get current display values (considering preview mode)
       */
      getCurrentTheme: () => {
        const { 
          appearance, themeColor, density, effectiveMode,
          isPreviewMode, previewAppearance, previewThemeColor, previewDensity 
        } = get();

        if (isPreviewMode) {
          return {
            appearance: previewAppearance || appearance,
            themeColor: previewThemeColor || themeColor,
            density: previewDensity || density,
            effectiveMode: computeEffectiveMode(previewAppearance || appearance),
          };
        }

        return { appearance, themeColor, density, effectiveMode };
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
        density: state.density,
        version: state.version,
      }),
    }
  )
);

export default useThemeStore;
