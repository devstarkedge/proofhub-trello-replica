import { useState, useEffect, useCallback } from 'react';
import { getSalesPreferences, getSalesSuggestions } from '../services/salesApi';
import { businessReads } from '../services/businessReadClient';
import { getStaticSuggestions } from '../utils/salesSuggestions';

/**
 * Hook for fetching and applying smart sales field preferences.
 *
 * - Loads user's last-used defaults on mount
 * - Provides `getSuggestionsForField(field, context)` that returns
 *   prioritized value list (dynamic from backend + static fallback)
 *
 * @returns {{ defaults: Object, loading: boolean, getSuggestionsForField: Function }}
 */
export const useSalesPreferences = () => {
  const [defaults, setDefaults] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch last-used defaults on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getSalesPreferences();
        if (!cancelled && res?.data?.lastUsed) {
          setDefaults(res.data.lastUsed);
        }
      } catch {
        // Silently fail — defaults remain empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * Get prioritized suggestions for a dropdown field.
   * Returns instant static fallback, then upgrades to dynamic when ready.
   *
   * @param {string} field - Target dropdown field name
   * @param {Object} context - Current form values for co-occurrence
   * @returns {Promise<string[]>} - Ordered suggestion values
   */
  const getSuggestionsForField = useCallback(async (field, context = {}) => {
    // Start with static suggestions
    let suggestions = getStaticSuggestions(field, context);

    // Try to get dynamic suggestions from backend
    try {
      const res = await getSalesSuggestions(field, context);
      if (res?.data?.suggestions?.length > 0) {
        suggestions = res.data.suggestions;
      }
    } catch {
      // Use static fallback
    }

    return suggestions;
  }, []);

  /**
   * Clear the suggestion cache (call when form context changes significantly)
   */
  const clearCache = useCallback(() => {
    businessReads.clear('sales', { resources: ['preferences'] });
  }, []);

  return { defaults, loading, getSuggestionsForField, clearCache };
};
