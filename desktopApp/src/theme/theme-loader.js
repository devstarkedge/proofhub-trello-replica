/**
 * FlowTask Theme Loader
 * 
 * This script runs inline in the HTML <head> before any rendering
 * to prevent flash of wrong theme (FOWT).
 * 
 * It reads stored theme preferences from localStorage and applies
 * the correct theme attributes to <html> immediately.
 */

(function() {
  try {
    // Theme storage key (must match themeStore.js)
    var STORAGE_KEY = 'flowtask-theme';
    
    // Default values
    var defaultTheme = 'light';
    var defaultColor = 'blue';
    
    // Read from localStorage
    var stored = localStorage.getItem(STORAGE_KEY);
    var appearance = defaultTheme;
    var themeColor = defaultColor;
    
    if (stored) {
      try {
        var parsed = JSON.parse(stored);
        if (parsed && parsed.state) {
          appearance = parsed.state.appearance || defaultTheme;
          themeColor = parsed.state.themeColor || defaultColor;
        }
      } catch (e) {
        // Parsing failed, use defaults
      }
    }
    
    // Compute effective mode
    var effectiveMode = appearance;
    
    if (appearance === 'auto') {
      // Check system preference
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        effectiveMode = 'dark';
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        effectiveMode = 'light';
      } else {
        // Time-based fallback: dark 6PM-6AM
        var hour = new Date().getHours();
        effectiveMode = (hour >= 6 && hour < 18) ? 'light' : 'dark';
      }
    }
    
    // Apply to document immediately
    var root = document.documentElement;
    root.setAttribute('data-theme', effectiveMode);
    root.setAttribute('data-color', themeColor);
    
    // Add dark class for Tailwind compatibility
    if (effectiveMode === 'dark') {
      root.classList.add('dark');
    }
    
    // Set background color immediately to prevent flash
    root.style.backgroundColor = effectiveMode === 'dark' ? '#111827' : '#ffffff';
    root.style.colorScheme = effectiveMode;
    
  } catch (e) {
    // If anything fails, default to light theme
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-color', 'blue');
  }
})();
