import mongoose from 'mongoose';
import ProjectDropdownOption from '../models/ProjectDropdownOption.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

export function validateMarketingContact(details) {
  if (details && Object.hasOwn(details, 'marketingContact') && typeof details.marketingContact !== 'boolean') {
    throw new ErrorResponse('Marketing Contact must be true or false', 400);
  }
}

export async function validateProjectTechnologies(values, workspaceId) {
  if (!Array.isArray(values) || values.length > 100 || values.some(value => typeof value !== 'string' || !mongoose.isValidObjectId(value))) {
    throw new ErrorResponse('Technologies must be an array of valid technology IDs (up to 100)', 400);
  }
  const unique = [...new Set(values)];
  if (unique.length && await ProjectDropdownOption.countDocuments({
    _id: { $in: unique }, workspaceId, type: 'technology', isActive: true
  }) !== unique.length) {
    throw new ErrorResponse('Select active technologies belonging to the current workspace', 400);
  }
  return unique;
}
