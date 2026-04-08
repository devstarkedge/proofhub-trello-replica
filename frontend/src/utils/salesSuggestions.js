/**
 * Client-side static suggestion mappings for instant fallback
 * before backend dynamic suggestions load.
 * Mirrors backend/config/salesSuggestionMappings.js
 */

const STATIC_SUGGESTIONS = {
  platform: {
    'Upwork': {
      technology: ['React', 'Node.js', 'Python', 'WordPress', 'Flutter'],
      profile: ['Full Stack', 'Frontend', 'Backend', 'Mobile App'],
      status: ['Bid', 'Pending', 'Interview'],
    },
    'Freelancer': {
      technology: ['WordPress', 'PHP', 'React', 'Shopify'],
      profile: ['Full Stack', 'WordPress', 'E-Commerce'],
      status: ['Bid', 'Pending'],
    },
    'LinkedIn': {
      technology: ['React', 'Node.js', 'Python', 'AWS'],
      profile: ['Full Stack', 'DevOps', 'Backend'],
      status: ['Outreach', 'Pending', 'Interview'],
    },
    'Fiverr': {
      technology: ['WordPress', 'Shopify', 'React', 'Figma'],
      profile: ['WordPress', 'E-Commerce', 'UI/UX'],
      status: ['Gig', 'Pending'],
    },
  },
  technology: {
    'React': {
      platform: ['Upwork', 'LinkedIn', 'Freelancer'],
      profile: ['Frontend', 'Full Stack'],
    },
    'Node.js': {
      platform: ['Upwork', 'LinkedIn'],
      profile: ['Backend', 'Full Stack'],
    },
    'Python': {
      platform: ['Upwork', 'LinkedIn'],
      profile: ['Backend', 'Data Science', 'AI/ML'],
    },
    'WordPress': {
      platform: ['Freelancer', 'Fiverr', 'Upwork'],
      profile: ['WordPress', 'Full Stack'],
    },
    'Flutter': {
      platform: ['Upwork', 'LinkedIn'],
      profile: ['Mobile App'],
    },
    'React Native': {
      platform: ['Upwork', 'LinkedIn'],
      profile: ['Mobile App', 'Full Stack'],
    },
  },
  profile: {
    'Full Stack': {
      technology: ['React', 'Node.js', 'Python', 'Next.js'],
      platform: ['Upwork', 'LinkedIn'],
    },
    'Frontend': {
      technology: ['React', 'Vue.js', 'Angular', 'Next.js'],
      platform: ['Upwork', 'LinkedIn'],
    },
    'Backend': {
      technology: ['Node.js', 'Python', 'Java', 'Go'],
      platform: ['Upwork', 'LinkedIn'],
    },
    'Mobile App': {
      technology: ['Flutter', 'React Native', 'Swift', 'Kotlin'],
      platform: ['Upwork', 'LinkedIn'],
    },
    'WordPress': {
      technology: ['WordPress', 'PHP', 'Elementor', 'WooCommerce'],
      platform: ['Freelancer', 'Fiverr', 'Upwork'],
    },
  },
};

/**
 * Get instant client-side suggestions for a target field.
 * Used as fallback before backend response arrives.
 *
 * @param {string} targetField
 * @param {Object} context — current form values
 * @returns {string[]}
 */
export const getStaticSuggestions = (targetField, context = {}) => {
  const seen = new Set();
  const results = [];

  for (const [sourceField, valueMap] of Object.entries(STATIC_SUGGESTIONS)) {
    if (sourceField === targetField) continue;
    const ctxVal = context[sourceField];
    if (!ctxVal) continue;

    const mapping = valueMap[ctxVal];
    if (!mapping || !mapping[targetField]) continue;

    for (const suggestion of mapping[targetField]) {
      if (!seen.has(suggestion)) {
        seen.add(suggestion);
        results.push(suggestion);
      }
    }
  }

  return results;
};
