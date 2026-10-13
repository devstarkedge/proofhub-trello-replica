import { z } from 'zod';
import {
  SALES_FIELDS,
  SALES_FIELD_LABELS as _LABELS,
  SALES_REQUIRED_FIELDS as _REQUIRED,
} from '../config/salesFieldConfig';

/**
 * Human-readable labels — re-exported from single-source-of-truth config
 */
export const SALES_FIELD_LABELS = _LABELS;

/**
 * Required field keys — re-exported from single-source-of-truth config
 */
export const SALES_REQUIRED_FIELDS = _REQUIRED;

/**
 * Build a human-readable error summary from react-hook-form errors object
 * @param {object} errors - react-hook-form errors object
 * @returns {{ fieldNames: string[], message: string }}
 */
export const getErrorSummary = (errors) => {
  const fieldNames = Object.keys(errors).map(
    key => SALES_FIELD_LABELS[key] || key
  );
  const message = fieldNames.length
    ? `Missing required fields: ${fieldNames.join(', ')}`
    : 'Please fix the errors before saving.';
  return { fieldNames, message };
};

/**
 * Strict validation schema for sales row creation/update
 * Invite REQUIRES URL in create/update mode
 */
const bidLinkSchema = z.object({
  type: z.enum(['link', 'invite', 'direct'], {
    required_error: 'Bid type is required',
    invalid_type_error: 'Bid type must be link, invite, or direct'
  }),
  url: z.string().nullable().default(null),
}).superRefine((val, ctx) => {
  if (val.type === 'direct' && val.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Direct bids must not have a URL', path: ['url'] });
  }
  if (val.type === 'link' && !val.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'URL is required for link bids', path: ['url'] });
  }
  if (val.type === 'invite' && !val.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invite requires a valid link', path: ['url'] });
  }
  if (val.url && !/^https?:\/\/.+/.test(val.url)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'URL must start with http:// or https://', path: ['url'] });
  }
});

/**
 * Flexible validation schema for import — invite without URL is allowed
 */
const bidLinkImportSchema = z.object({
  type: z.enum(['link', 'invite', 'direct'], {
    required_error: 'Bid type is required',
    invalid_type_error: 'Bid type must be link, invite, or direct'
  }),
  url: z.string().nullable().default(null),
  isValid: z.boolean().optional(),
}).superRefine((val, ctx) => {
  if (val.type === 'direct' && val.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Direct bids must not have a URL', path: ['url'] });
  }
  if (val.type === 'link' && !val.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'URL is required for link bids', path: ['url'] });
  }
  // invite without URL is ALLOWED during import (flagged isValid=false on backend)
  if (val.url && !/^https?:\/\/.+/.test(val.url)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'URL must start with http:// or https://', path: ['url'] });
  }
});

export const salesRowSchema = z.object({
  date: z.date({
    required_error: 'Date is required',
    invalid_type_error: 'Please select a valid date'
  }),
  name: z.string().min(1, 'Name is required'),
  bidLink: bidLinkSchema,
  platform: z.string().min(1, 'Platform is required'),
  profile: z.string().min(1, 'Profile is required'),
  technology: z.string().min(1, 'Technology is required'),
  clientRating: z.preprocess(
    (v) => (v === '' || Number.isNaN(v) ? null : v),
    z.number().min(0, 'Rating must be at least 0').max(5, 'Rating must not exceed 5').optional().nullable()
  ),
  clientHireRate: z.preprocess(
    (v) => (v === '' || Number.isNaN(v) ? null : v),
    z.number().min(0, 'Hire rate must be at least 0%').max(100, 'Hire rate must not exceed 100%').optional().nullable()
  ),
  clientBudget: z.string().optional(),
  clientSpending: z.string().optional(),
  clientLocation: z.string().optional(),
  replyFromClient: z.string().optional(),
  followUps: z.string().optional(),
  followUpDate: z.date().optional().nullable(),
  connects: z.preprocess(
    (v) => (v === '' || Number.isNaN(v) ? null : v),
    z.number().min(0, 'Connects must be a positive number').optional().nullable()
  ),
  rate: z.preprocess(
    (v) => (v === '' || Number.isNaN(v) ? null : v),
    z.number().min(0, 'Rate must be a positive number').optional().nullable()
  ),
  proposalScreenshot: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  status: z.string().optional(),
  comments: z.string().optional(),
  rowColor: z.string().optional(),
  // Auto-derived from date on frontend; overwritten by pre-save hook on backend
  monthName: z.string().optional(),
});
// Allow additional dynamic custom column keys (created columns)
export const salesRowSchemaFlexible = salesRowSchema.passthrough();

/**
 * Validation schema for custom column creation
 */
export const customColumnSchema = z.object({
  name: z.string()
    .min(1, 'Column name is required')
    .max(50, 'Column name cannot exceed 50 characters'),
  type: z.enum(['dropdown', 'date', 'text', 'link', 'number'], {
    required_error: 'Column type is required'
  }),
  isRequired: z.boolean().optional().default(false)
});

/**
 * Validation schema for dropdown option
 */
export const dropdownOptionSchema = z.object({
  label: z.string()
    .min(1, 'Label is required')
    .max(50, 'Label cannot exceed 50 characters'),
  value: z.string().optional(),
  color: z.string().optional()
});

/**
 * Validation schema for import data — requires key fields, accepts string dates
 */
export const importRowSchema = salesRowSchema
  .extend({
    date: z.union([z.date(), z.string().min(1, 'Date is required')]).transform((val) => {
      if (typeof val === 'string') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? val : d;
      }
      return val;
    }),
    // For import, name can default to importer so it's optional here
    name: z.string().optional(),
    // For import, monthName is auto-derived from date
    monthName: z.string().optional(),
    // For import, bidLink may arrive as string (auto-detected on backend) or { type, url }
    bidLink: z.union([
      bidLinkImportSchema,
      z.string().optional().or(z.literal('')),
      z.object({ type: z.string(), url: z.string().nullable() }).passthrough(),
    ]).optional(),
  })
  .partial({
    // Non-required fields stay optional during import
    clientRating: true, clientHireRate: true,
    clientBudget: true, clientSpending: true, clientLocation: true,
    replyFromClient: true, followUps: true, followUpDate: true,
    connects: true, rate: true, proposalScreenshot: true,
    status: true, comments: true, rowColor: true,
  });

/**
 * Strict import validation — checks required fields from config
 * Returns { valid: [], invalid: [] } with human-readable per-row errors
 */
export const validateImportRows = (rows) => {
  const valid = [];
  const invalid = [];

  // Required fields from config (skip monthName — auto-derived from date)
  const importRequired = SALES_REQUIRED_FIELDS.filter(k => k !== 'monthName');

  rows.forEach((row, index) => {
    const missing = [];
    importRequired.forEach(key => {
      if (key === 'bidLink') {
        // bidLink can be a string (pre-normalization) or an object (post-normalization)
        const bl = row[key];
        if (!bl) {
          missing.push(SALES_FIELD_LABELS[key] || key);
        } else if (typeof bl === 'object' && !bl.type) {
          missing.push(SALES_FIELD_LABELS[key] || key);
        }
        return;
      }
      const val = row[key];
      if (val === undefined || val === null || (typeof val === 'string' && !String(val).trim())) {
        missing.push(SALES_FIELD_LABELS[key] || key);
      }
    });

    // BidLink-specific validation (flexible for import)
    const bidLinkErrors = [];
    const bl = row.bidLink;
    if (bl && typeof bl === 'object') {
      // link type always requires URL
      if (bl.type === 'link' && !bl.url) {
        bidLinkErrors.push('URL required for link type');
      }
      // invite without URL is ALLOWED during import (incomplete, not invalid)
      // Only validate URL format if present
      if (bl.url && !/^https?:\/\/.+/.test(bl.url)) {
        bidLinkErrors.push('Invalid URL format');
      }
    }

    // Validate URL fields if present (bidLink accepts plain text so skip URL check for it)
    const urlErrors = [];
    if (row.proposalScreenshot && typeof row.proposalScreenshot === 'string' && row.proposalScreenshot.trim()) {
      try { new URL(row.proposalScreenshot); } catch {
        if (!/^https?:\/\/.+/.test(row.proposalScreenshot)) urlErrors.push('Proposal Screenshot is not a valid URL');
      }
    }

    // Validate numeric fields if present
    const numericErrors = [];
    if (row.clientRating !== undefined && row.clientRating !== null && row.clientRating !== '') {
      const num = Number(row.clientRating);
      if (isNaN(num)) numericErrors.push('Client Rating must be a number');
      else if (num < 0 || num > 5) numericErrors.push('Client Rating must be 0-5');
    }
    if (row.clientHireRate !== undefined && row.clientHireRate !== null && row.clientHireRate !== '') {
      const num = Number(row.clientHireRate);
      if (isNaN(num)) numericErrors.push('Client Hire Rate must be a number');
      else if (num < 0 || num > 100) numericErrors.push('Client Hire Rate must be 0-100%');
    }

    const allErrors = [
      ...missing.map(f => `${f} is required`),
      ...bidLinkErrors,
      ...urlErrors,
      ...numericErrors,
    ];

    if (allErrors.length > 0) {
      invalid.push({ index, data: row, error: allErrors.join('; ') });
    } else {
      valid.push(row);
    }
  });

  return { valid, invalid };
};
