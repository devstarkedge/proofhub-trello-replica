import SalesUserPreference from '../models/SalesUserPreference.js';
import { getStaticSuggestions } from '../config/salesSuggestionMappings.js';

/**
 * @desc    Get current user's sales preferences (last-used defaults)
 * @route   GET /api/sales/preferences
 * @access  Private
 */
export const getPreferences = async (req, res) => {
  try {
    const pref = await SalesUserPreference.findOne({ user: req.user._id }).lean();

    res.json({
      success: true,
      data: {
        lastUsed: pref?.lastUsed || {},
        hasHistory: !!pref
      }
    });
  } catch (error) {
    console.error('Get sales preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch preferences'
    });
  }
};

/**
 * @desc    Get intelligent suggestions for a specific field
 * @route   POST /api/sales/preferences/suggestions
 * @access  Private
 * @body    { field: string, context: { platform?: string, technology?: string, ... } }
 */
export const getSuggestions = async (req, res) => {
  try {
    const { field, context } = req.body;

    if (!field || typeof field !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'field is required'
      });
    }

    const validFields = [
      'platform', 'technology', 'profile', 'status',
      'clientLocation', 'clientBudget', 'replyFromClient', 'followUps'
    ];

    if (!validFields.includes(field)) {
      return res.status(400).json({
        success: false,
        message: `Invalid field. Must be one of: ${validFields.join(', ')}`
      });
    }

    // Get dynamic suggestions from user's co-occurrence data
    const dynamicSuggestions = await SalesUserPreference.getSuggestions(
      req.user._id,
      field,
      context || {}
    );

    // Get static fallback suggestions
    const staticSuggestions = getStaticSuggestions(field, context || {});

    // Merge: dynamic first, then static (deduplicated)
    const seen = new Set(dynamicSuggestions);
    const merged = [...dynamicSuggestions];
    for (const s of staticSuggestions) {
      if (!seen.has(s)) {
        seen.add(s);
        merged.push(s);
      }
    }

    res.json({
      success: true,
      data: {
        suggestions: merged.slice(0, 8), // Cap at 8
        source: dynamicSuggestions.length > 0 ? 'dynamic' : 'static'
      }
    });
  } catch (error) {
    console.error('Get sales suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch suggestions'
    });
  }
};
