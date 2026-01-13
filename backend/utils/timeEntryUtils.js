/**
 * Time Entry Utilities
 * 
 * Provides helper functions for time entry ownership validation and processing.
 * These utilities ensure data integrity and prevent unauthorized modifications
 * when multiple users work on the same entity concurrently.
 * 
 * KEY RULES:
 * 1. Each time entry is permanently bound to its creator (user field)
 * 2. Only the creator can edit or delete their entries
 * 3. New entries always get assigned to the authenticated user (req.user)
 * 4. Existing entries preserve their original ownership
 * 5. Backend always validates ownership before any modification
 */

/**
 * Check if a string is a valid MongoDB ObjectId
 * @param {string} id - The ID to validate
 * @returns {boolean}
 */
export const isValidObjectId = (id) => {
  if (!id) return false;
  const str = id.toString();
  return /^[a-fA-F0-9]{24}$/.test(str);
};

/**
 * Get date string in YYYY-MM-DD format for consistent comparison
 * @param {Date|string} date - The date to format
 * @returns {string}
 */
export const getDateString = (date) => {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

/**
 * Get today's date string
 * @returns {string}
 */
export const getTodayString = () => getDateString(new Date());

/**
 * Extract user ID from various formats (object, string, ObjectId)
 * @param {Object|string} user - User object or ID
 * @returns {string|null}
 */
export const extractUserId = (user) => {
  if (!user) return null;
  if (typeof user === 'object' && user._id) return user._id.toString();
  if (typeof user === 'string') return user;
  return user.toString ? user.toString() : null;
};

/**
 * Check if a user owns a time entry
 * @param {Object} entry - The time entry object
 * @param {string} userId - The user ID to check
 * @returns {boolean}
 */
export const userOwnsEntry = (entry, userId) => {
  if (!entry || !userId) return false;
  const entryUserId = extractUserId(entry.user);
  return entryUserId === userId.toString();
};

/**
 * Calculate total minutes for a user on a specific date from time entries
 * @param {Array} entries - Array of time entries
 * @param {string} userId - User ID to calculate for
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {string} excludeEntryId - Entry ID to exclude (for edits)
 * @returns {number} Total minutes
 */
export const calculateUserTimeForDate = (entries, userId, dateString, excludeEntryId = null) => {
  const targetDate = dateString || getTodayString();
  let totalMinutes = 0;

  (entries || []).forEach(entry => {
    // Skip excluded entry (when editing)
    if (excludeEntryId && entry._id && entry._id.toString() === excludeEntryId.toString()) {
      return;
    }

    const entryUserId = extractUserId(entry.user);
    const entryDate = entry.date ? getDateString(entry.date) : getTodayString();

    if (entryUserId === userId.toString() && entryDate === targetDate) {
      const hours = parseInt(entry.hours || 0);
      const minutes = parseInt(entry.minutes || 0);
      totalMinutes += (hours * 60) + minutes;
    }
  });

  return totalMinutes;
};

/**
 * Validate that adding new time won't exceed 24h limit for user on that date
 * @param {Array} existingEntries - Current time entries
 * @param {number} newHours - Hours to add
 * @param {number} newMinutes - Minutes to add
 * @param {string} userId - User ID
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {string} excludeEntryId - Entry ID to exclude (for edits)
 * @returns {Object} { valid: boolean, error: string|null, remainingMinutes: number }
 */
export const validateTimeLimit = (existingEntries, newHours, newMinutes, userId, dateString, excludeEntryId = null) => {
  const hours = parseInt(newHours || 0);
  const minutes = parseInt(newMinutes || 0);
  const newTimeMinutes = (hours * 60) + minutes;

  if (newTimeMinutes === 0) {
    return { valid: false, error: 'Time cannot be zero', remainingMinutes: 24 * 60 };
  }

  const existingMinutes = calculateUserTimeForDate(existingEntries, userId, dateString, excludeEntryId);
  const totalMinutes = existingMinutes + newTimeMinutes;
  const maxMinutes = 24 * 60;

  if (totalMinutes > maxMinutes) {
    const existingHours = Math.floor(existingMinutes / 60);
    const existingMins = existingMinutes % 60;
    const remainingMinutes = maxMinutes - existingMinutes;
    const remainingHours = Math.floor(remainingMinutes / 60);
    const remainingMins = remainingMinutes % 60;
    
    return {
      valid: false,
      error: `Total time for ${dateString || 'today'} cannot exceed 24 hours. You have already logged ${existingHours}h ${existingMins}m. Maximum you can add: ${remainingHours}h ${remainingMins}m.`,
      remainingMinutes
    };
  }

  return { valid: true, error: null, remainingMinutes: maxMinutes - totalMinutes };
};

/**
 * Validate that date is not in the future
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {Object} { valid: boolean, error: string|null }
 */
export const validateNotFutureDate = (dateString) => {
  const todayString = getTodayString();
  const targetDate = dateString || todayString;
  
  if (targetDate > todayString) {
    return {
      valid: false,
      error: `Cannot add time entries for future dates. Selected date: ${targetDate}`
    };
  }
  
  return { valid: true, error: null };
};

/**
 * Process time tracking entries with strict ownership preservation
 * 
 * CRITICAL RULES:
 * - New entries (no valid MongoDB _id): Always assigned to authenticated user
 * - Existing entries (valid MongoDB _id): 
 *   - Owned by current user: Allow time/description updates only
 *   - Owned by other user: Preserve exactly as-is (read-only)
 * - Deleted entries: Only current user's entries can be deleted
 * 
 * @param {Array} incomingEntries - Entries from client request
 * @param {Array} existingEntries - Current entries in database
 * @param {Object} currentUser - Authenticated user { id, name }
 * @param {string} entryType - 'estimation' | 'logged' | 'billed'
 * @returns {Object} { entries: Array, errors: Array }
 */
export const processTimeEntriesWithOwnership = (incomingEntries, existingEntries, currentUser, entryType) => {
  const errors = [];
  const todayString = getTodayString();
  
  // Create lookup map for existing entries
  const existingMap = new Map();
  (existingEntries || []).forEach(entry => {
    if (entry._id) {
      existingMap.set(entry._id.toString(), entry);
    }
  });

  // Track which existing entries are still present (not deleted)
  const incomingIds = new Set();
  (incomingEntries || []).forEach(entry => {
    if (entry._id && isValidObjectId(entry._id.toString())) {
      incomingIds.add(entry._id.toString());
    }
  });

  // Check for unauthorized deletions (other users' entries missing from incoming)
  const unauthorizedDeletions = [];
  existingMap.forEach((entry, id) => {
    if (!incomingIds.has(id)) {
      const entryUserId = extractUserId(entry.user);
      if (entryUserId !== currentUser.id.toString()) {
        // Other user's entry was removed - this is unauthorized
        unauthorizedDeletions.push(entry);
      }
    }
  });

  if (unauthorizedDeletions.length > 0) {
    errors.push(`Cannot delete time entries created by other users. ${unauthorizedDeletions.length} entry(ies) will be preserved.`);
  }

  // Track time per date for 24h validation
  const timePerDate = new Map();
  existingMap.forEach((entry) => {
    const entryUserId = extractUserId(entry.user);
    if (entryUserId === currentUser.id.toString() && incomingIds.has(entry._id.toString())) {
      // User's own entry that's being kept - don't double count
    } else if (entryUserId === currentUser.id.toString()) {
      // User's entry being deleted - don't count
    } else {
      // Other user's entries - will be preserved anyway
    }
  });

  // Calculate existing time from entries that will remain (other users' entries)
  existingMap.forEach((entry) => {
    const entryUserId = extractUserId(entry.user);
    if (entryUserId === currentUser.id.toString()) {
      // Current user's time will be recalculated from incoming
      return;
    }
    // Other users' entries always remain
    const entryDate = entry.date ? getDateString(entry.date) : todayString;
    const currentTotal = timePerDate.get(`${entryUserId}-${entryDate}`) || 0;
    timePerDate.set(`${entryUserId}-${entryDate}`, currentTotal + (entry.hours * 60) + entry.minutes);
  });

  const processedEntries = [];

  // Process incoming entries
  (incomingEntries || []).forEach(entry => {
    const entryId = entry._id ? entry._id.toString() : null;
    const isExistingEntry = entryId && isValidObjectId(entryId) && existingMap.has(entryId);

    if (isExistingEntry) {
      const originalEntry = existingMap.get(entryId);
      const originalUserId = extractUserId(originalEntry.user);
      const isOwner = originalUserId === currentUser.id.toString();

      if (isOwner) {
        // Owner can update time values and description/reason
        processedEntries.push({
          _id: entry._id,
          hours: parseInt(entry.hours || originalEntry.hours),
          minutes: parseInt(entry.minutes || originalEntry.minutes),
          reason: entry.reason !== undefined ? entry.reason : originalEntry.reason,
          description: entry.description !== undefined ? entry.description : originalEntry.description,
          // CRITICAL: Preserve original ownership
          user: originalEntry.user,
          userName: originalEntry.userName,
          date: originalEntry.date // Preserve original date
        });
      } else {
        // Non-owner: Entry is read-only, preserve exactly as-is
        processedEntries.push({
          _id: originalEntry._id,
          hours: originalEntry.hours,
          minutes: originalEntry.minutes,
          reason: originalEntry.reason,
          description: originalEntry.description,
          user: originalEntry.user,
          userName: originalEntry.userName,
          date: originalEntry.date
        });
      }
    } else {
      // New entry - always assign to current user
      const entryDate = entry.date ? getDateString(entry.date) : todayString;
      
      // Validate not future date
      const dateValidation = validateNotFutureDate(entryDate);
      if (!dateValidation.valid) {
        errors.push(dateValidation.error);
        return; // Skip this entry
      }

      const newHours = parseInt(entry.hours || 0);
      const newMinutes = parseInt(entry.minutes || 0);
      const newTimeMinutes = (newHours * 60) + newMinutes;

      if (newTimeMinutes === 0) {
        errors.push('Time entry must have non-zero time');
        return; // Skip this entry
      }

      // Validate 24h limit for this user on this date
      const userDateKey = `${currentUser.id}-${entryDate}`;
      const existingMinutes = timePerDate.get(userDateKey) || 0;
      const totalMinutes = existingMinutes + newTimeMinutes;
      const maxMinutes = 24 * 60;

      if (totalMinutes > maxMinutes) {
        const existingHours = Math.floor(existingMinutes / 60);
        const existingMins = existingMinutes % 60;
        errors.push(`Total time for ${entryDate} cannot exceed 24 hours. You have already logged ${existingHours}h ${existingMins}m.`);
        return; // Skip this entry
      }

      // Update tracked time
      timePerDate.set(userDateKey, totalMinutes);

      processedEntries.push({
        hours: newHours,
        minutes: newMinutes,
        reason: entry.reason,
        description: entry.description,
        // CRITICAL: New entries always get authenticated user
        user: currentUser.id,
        userName: currentUser.name,
        date: entry.date || new Date()
      });
    }
  });

  // Add back other users' entries that were (attempted to be) deleted
  unauthorizedDeletions.forEach(entry => {
    processedEntries.push({
      _id: entry._id,
      hours: entry.hours,
      minutes: entry.minutes,
      reason: entry.reason,
      description: entry.description,
      user: entry.user,
      userName: entry.userName,
      date: entry.date
    });
  });

  return { entries: processedEntries, errors };
};

/**
 * Add a single time entry with ownership
 * @param {Array} existingEntries - Current time entries
 * @param {Object} newEntry - New entry data { hours, minutes, reason/description, date }
 * @param {Object} currentUser - Authenticated user { id, name }
 * @param {string} entryType - 'estimation' | 'logged' | 'billed'
 * @returns {Object} { entry: Object|null, error: string|null }
 */
export const addTimeEntry = (existingEntries, newEntry, currentUser, entryType) => {
  const todayString = getTodayString();
  const entryDate = newEntry.date ? getDateString(newEntry.date) : todayString;
  
  // Validate not future date
  const dateValidation = validateNotFutureDate(entryDate);
  if (!dateValidation.valid) {
    return { entry: null, error: dateValidation.error };
  }

  const hours = parseInt(newEntry.hours || 0);
  const minutes = parseInt(newEntry.minutes || 0);

  if (hours === 0 && minutes === 0) {
    return { entry: null, error: 'Time entry must have non-zero time' };
  }

  // Validate 24h limit
  const timeValidation = validateTimeLimit(existingEntries, hours, minutes, currentUser.id, entryDate);
  if (!timeValidation.valid) {
    return { entry: null, error: timeValidation.error };
  }

  // Validate required fields
  if (entryType === 'estimation' && !newEntry.reason?.trim()) {
    return { entry: null, error: 'Reason is required for estimation entries' };
  }
  if ((entryType === 'logged' || entryType === 'billed') && !newEntry.description?.trim()) {
    return { entry: null, error: `Description is required for ${entryType} time entries` };
  }

  const entry = {
    hours,
    minutes,
    reason: newEntry.reason,
    description: newEntry.description,
    user: currentUser.id,
    userName: currentUser.name,
    date: newEntry.date || new Date()
  };

  return { entry, error: null };
};

/**
 * Update a single time entry with ownership check
 * @param {Array} existingEntries - Current time entries
 * @param {string} entryId - ID of entry to update
 * @param {Object} updates - Update data { hours, minutes, reason/description }
 * @param {Object} currentUser - Authenticated user { id, name }
 * @param {string} entryType - 'estimation' | 'logged' | 'billed'
 * @returns {Object} { entries: Array, error: string|null }
 */
export const updateTimeEntry = (existingEntries, entryId, updates, currentUser, entryType) => {
  const entryIndex = existingEntries.findIndex(e => e._id && e._id.toString() === entryId);
  
  if (entryIndex === -1) {
    return { entries: existingEntries, error: 'Time entry not found' };
  }

  const entry = existingEntries[entryIndex];
  const entryUserId = extractUserId(entry.user);

  // Ownership check
  if (entryUserId !== currentUser.id.toString()) {
    return { entries: existingEntries, error: 'You can only edit your own time entries' };
  }

  const hours = parseInt(updates.hours ?? entry.hours);
  const minutes = parseInt(updates.minutes ?? entry.minutes);

  if (hours === 0 && minutes === 0) {
    return { entries: existingEntries, error: 'Time entry must have non-zero time' };
  }

  // Validate 24h limit (excluding current entry being edited)
  const entryDate = getDateString(entry.date);
  const timeValidation = validateTimeLimit(existingEntries, hours, minutes, currentUser.id, entryDate, entryId);
  if (!timeValidation.valid) {
    return { entries: existingEntries, error: timeValidation.error };
  }

  // Create updated entries array
  const updatedEntries = [...existingEntries];
  updatedEntries[entryIndex] = {
    ...entry,
    hours,
    minutes,
    reason: updates.reason !== undefined ? updates.reason : entry.reason,
    description: updates.description !== undefined ? updates.description : entry.description
    // Note: user, userName, and date are NEVER updated
  };

  return { entries: updatedEntries, error: null };
};

/**
 * Delete a single time entry with ownership check
 * @param {Array} existingEntries - Current time entries
 * @param {string} entryId - ID of entry to delete
 * @param {Object} currentUser - Authenticated user { id }
 * @returns {Object} { entries: Array, error: string|null }
 */
export const deleteTimeEntry = (existingEntries, entryId, currentUser) => {
  const entry = existingEntries.find(e => e._id && e._id.toString() === entryId);
  
  if (!entry) {
    return { entries: existingEntries, error: 'Time entry not found' };
  }

  const entryUserId = extractUserId(entry.user);

  // Ownership check
  if (entryUserId !== currentUser.id.toString()) {
    return { entries: existingEntries, error: 'You can only delete your own time entries' };
  }

  const updatedEntries = existingEntries.filter(e => !e._id || e._id.toString() !== entryId);
  return { entries: updatedEntries, error: null };
};

export default {
  isValidObjectId,
  getDateString,
  getTodayString,
  extractUserId,
  userOwnsEntry,
  calculateUserTimeForDate,
  validateTimeLimit,
  validateNotFutureDate,
  processTimeEntriesWithOwnership,
  addTimeEntry,
  updateTimeEntry,
  deleteTimeEntry
};
