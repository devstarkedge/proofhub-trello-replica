import { z } from 'zod';

/**
 * Validation schema for sales row creation/update
 */
export const salesRowSchema = z.object({
  date: z.date({
    required_error: 'Date is required',
    invalid_type_error: 'Please select a valid date'
  }),
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
 * Validation schema for import data
 */
export const importRowSchema = salesRowSchema.partial().extend({
  date: z.union([z.date(), z.string()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  })
});

/**
 * Helper function to validate and transform import data
 */
export const validateImportData = (data) => {
  const results = {
    valid: [],
    invalid: []
  };

  data.forEach((row, index) => {
    try {
      const validated = importRowSchema.parse(row);
      results.valid.push(validated);
    } catch (error) {
      results.invalid.push({
        index,
        row,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
    }
  });

  return results;
};
