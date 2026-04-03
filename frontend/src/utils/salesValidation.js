import { z } from 'zod';

/**
 * Human-readable labels for sales fields — used in toasts, error summaries, and import errors
 */
export const SALES_FIELD_LABELS = {
  date: 'Date',
  name: 'Name',
  bidLink: 'Bid Link',
  platform: 'Platform',
  profile: 'Profile',
  technology: 'Technology',
  clientRating: 'Client Rating',
  clientHireRate: 'Client Hire Rate',
  clientBudget: 'Client Budget',
  clientSpending: 'Client Spending',
  clientLocation: 'Client Location',
  replyFromClient: 'Reply From Client',
  followUps: 'Follow Ups',
  followUpDate: 'Follow Up Date',
  connects: 'Connects',
  rate: 'Rate',
  proposalScreenshot: 'Proposal Screenshot',
  status: 'Status',
  comments: 'Comments',
  rowColor: 'Row Color',
};

/**
 * Required fields for sales rows — used by import validation and error summaries
 */
export const SALES_REQUIRED_FIELDS = ['date', 'name', 'platform', 'technology', 'status'];

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
 * Validation schema for sales row creation/update
 */
export const salesRowSchema = z.object({
  date: z.date({
    required_error: 'Date is required',
    invalid_type_error: 'Please select a valid date'
  }),
  name: z.string().min(1, 'Name is required'),
  bidLink: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  platform: z.string().min(1, 'Platform is required'),
  profile: z.string().optional(),
  technology: z.string().min(1, 'Technology is required'),
  clientRating: z.number()
    .min(0, 'Rating must be at least 0')
    .max(5, 'Rating must not exceed 5')
    .optional()
    .nullable(),
  clientHireRate: z.number()
    .min(0, 'Hire rate must be at least 0%')
    .max(100, 'Hire rate must not exceed 100%')
    .optional()
    .nullable(),
  clientBudget: z.string().optional(),
  clientSpending: z.string().optional(),
  clientLocation: z.string().optional(),
  replyFromClient: z.string().optional(),
  followUps: z.string().optional(),
  followUpDate: z.date().optional().nullable(),
  connects: z.number().min(0, 'Connects must be a positive number').optional().nullable(),
  rate: z.number().min(0, 'Rate must be a positive number').optional().nullable(),
  proposalScreenshot: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  status: z.string().min(1, 'Status is required'),
  comments: z.string().optional(),
  rowColor: z.string().optional()
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
  })
  .partial({
    // Only these fields stay optional during import
    bidLink: true, profile: true, clientRating: true, clientHireRate: true,
    clientBudget: true, clientSpending: true, clientLocation: true,
    replyFromClient: true, followUps: true, followUpDate: true,
    connects: true, rate: true, proposalScreenshot: true,
    comments: true, rowColor: true,
  });

/**
 * Strict import validation — checks required fields (platform, technology, status)
 * Returns { valid: [], invalid: [] } with human-readable per-row errors
 */
export const validateImportRows = (rows) => {
  const valid = [];
  const invalid = [];

  rows.forEach((row, index) => {
    const missing = [];
    // date is always present after normalizeRow, but check anyway
    if (!row.date) missing.push('Date');
    if (!row.platform || !String(row.platform).trim()) missing.push('Platform');
    if (!row.technology || !String(row.technology).trim()) missing.push('Technology');
    if (!row.status || !String(row.status).trim()) missing.push('Status');

    // Validate URL fields if present
    const urlErrors = [];
    if (row.bidLink && typeof row.bidLink === 'string' && row.bidLink.trim()) {
      try { new URL(row.bidLink); } catch {
        if (!/^https?:\/\/.+/.test(row.bidLink)) urlErrors.push('Bid Link is not a valid URL');
      }
    }
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
