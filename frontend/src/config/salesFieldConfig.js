/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           SALES FIELD CONFIG — SINGLE SOURCE OF TRUTH           ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  This file defines every standard sales field, its metadata,    ║
 * ║  required status, type, and label.                              ║
 * ║                                                                  ║
 * ║  KEEP IN SYNC with:                                             ║
 * ║    backend/config/salesFieldConfig.js  (identical copy)         ║
 * ║                                                                  ║
 * ║  All validation, import mapping, form rendering, and table      ║
 * ║  columns MUST derive their field metadata from this config.     ║
 * ║  DO NOT hardcode field lists elsewhere.                          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

/**
 * Master field definitions for the Sales module.
 *
 * @typedef {Object} SalesFieldDef
 * @property {string} key         – DB / form field key (camelCase)
 * @property {string} label       – Human-readable label for UI & error messages
 * @property {'text'|'date'|'number'|'link'|'bidLink'|'dropdown'|'rating'|'percent'|'currency'|'name'|'color'} type
 * @property {boolean} required   – Whether the field is required for create/update
 * @property {boolean} [readOnly] – If true the field is system-derived (e.g. monthName)
 * @property {string}  [section]  – UI grouping hint
 */

export const SALES_FIELDS = [
  // ─── Deal Details ───────────────────────────────────────────
  { key: 'date',               label: 'Date',                type: 'date',     required: true,  section: 'deal' },
  { key: 'monthName',          label: 'Month',               type: 'text',     required: true,  readOnly: true, section: 'deal' },
  { key: 'name',               label: 'Name',                type: 'name',     required: true,  section: 'deal' },
  { key: 'platform',           label: 'Platform',            type: 'dropdown', required: true,  section: 'deal' },
  { key: 'technology',         label: 'Technology',          type: 'dropdown', required: true,  section: 'deal' },
  { key: 'profile',            label: 'Profile',             type: 'dropdown', required: true,  section: 'deal' },
  { key: 'bidLink',            label: 'Bid Link',            type: 'bidLink',  required: true,  section: 'deal' },

  // ─── Client Information ─────────────────────────────────────
  { key: 'clientRating',       label: 'Client Rating',       type: 'rating',   required: false, section: 'client' },
  { key: 'clientHireRate',     label: 'Client % Hire Rate',  type: 'percent',  required: false, section: 'client' },
  { key: 'clientBudget',       label: 'Client Budget',       type: 'text',     required: false, section: 'client' },
  { key: 'clientSpending',     label: 'Client Spending',     type: 'text',     required: false, section: 'client' },
  { key: 'clientLocation',     label: 'Client Location',     type: 'dropdown', required: false, section: 'client' },

  // ─── Deal Mechanics ─────────────────────────────────────────
  { key: 'rate',               label: 'Rate',                type: 'currency', required: false, section: 'mechanics' },
  { key: 'connects',           label: 'Connects',            type: 'number',   required: false, section: 'mechanics' },
  { key: 'proposalScreenshot', label: 'Proposal Screenshot', type: 'link',     required: false, section: 'mechanics' },

  // ─── Status & Tracking ─────────────────────────────────────
  { key: 'status',             label: 'Status',              type: 'dropdown', required: false, section: 'status' },
  { key: 'replyFromClient',    label: 'Reply From Client',   type: 'dropdown', required: false, section: 'status' },
  { key: 'followUps',          label: 'Follow Ups',          type: 'dropdown', required: false, section: 'status' },
  { key: 'followUpDate',       label: 'Follow Up Date',      type: 'date',     required: false, section: 'status' },

  // ─── Presentation ───────────────────────────────────────────
  { key: 'rowColor',           label: 'Row Color',           type: 'color',    required: false, section: 'extra' },
  { key: 'comments',           label: 'Comments',            type: 'text',     required: false, section: 'extra' },
];

// ─── Derived helpers ──────────────────────────────────────────

/** Array of field keys that are required */
export const SALES_REQUIRED_FIELDS = SALES_FIELDS
  .filter(f => f.required)
  .map(f => f.key);

/** Map of field key → human label */
export const SALES_FIELD_LABELS = Object.fromEntries(
  SALES_FIELDS.map(f => [f.key, f.label])
);

/** Map of field key → required label (for backend validation error messages) */
export const SALES_REQUIRED_LABELS = Object.fromEntries(
  SALES_FIELDS.filter(f => f.required).map(f => [f.key, f.label])
);

/** Flat array of all standard field keys (excludes system keys like _id, createdBy, etc.) */
export const SALES_STANDARD_FIELD_KEYS = SALES_FIELDS.map(f => f.key);

/** Array of field objects for import / column mapping UIs (excludes readOnly auto-derived fields) */
export const SALES_MAPPING_FIELDS = SALES_FIELDS.filter(f => !f.readOnly).map(f => ({
  key: f.key,
  label: f.label,
}));

/**
 * Check whether a given key is a standard sales field.
 * @param {string} key
 * @returns {boolean}
 */
export const isStandardField = (key) =>
  SALES_STANDARD_FIELD_KEYS.includes(key);

/**
 * Validate an object against required fields.
 * Returns null when valid, or { message, fields } when invalid.
 *
 * @param {object} data      – The data to validate
 * @param {object} [skip={}] – Keys to skip (e.g. { name: true } when server sets it)
 */
export const validateSalesRequired = (data, skip = {}) => {
  const missing = [];
  for (const { key, label } of SALES_FIELDS) {
    if (!SALES_REQUIRED_FIELDS.includes(key)) continue;
    if (skip[key]) continue;

    // Special handling for compound bidLink field
    if (key === 'bidLink') {
      const bl = data[key];
      if (!bl || (typeof bl === 'object' && !bl.type) || (typeof bl === 'string' && !bl.trim())) {
        missing.push(label);
      }
      continue;
    }

    const val = data[key];
    if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
      missing.push(label);
    }
  }
  if (missing.length === 0) return null;
  return {
    success: false,
    message: `Missing required fields: ${missing.join(', ')}`,
    fields: missing,
  };
};

// ─── BidLink helpers ──────────────────────────────────────────

/** Bid type options for dropdowns and filters */
export const BID_TYPES = [
  { value: 'link', label: 'Link' },
  { value: 'invite', label: 'Invite' },
  { value: 'direct', label: 'Direct' },
];

/** Known platform domains → display labels */
export const PLATFORM_DOMAINS = {
  'upwork.com': 'Upwork',
  'contra.com': 'Contra',
  'fiverr.com': 'Fiverr',
  'linkedin.com': 'LinkedIn',
  'freelancer.com': 'Freelancer',
  'toptal.com': 'Toptal',
  'guru.com': 'Guru',
  'peopleperhour.com': 'PPH',
};

/**
 * Extract platform label from a URL.
 * Returns the platform name (e.g. "Upwork") or null.
 */
export const detectPlatform = (url) => {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    for (const [domain, label] of Object.entries(PLATFORM_DOMAINS)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) return label;
    }
  } catch { /* invalid URL */ }
  return null;
};
