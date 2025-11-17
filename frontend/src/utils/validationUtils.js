// Shared validation utilities for authentication forms
export const validationRules = {
  name: {
    required: true,
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-zA-Z\s]+$/,
    messages: {
      required: 'Full name is required',
      minLength: 'Name must be at least 2 characters long',
      maxLength: 'Name cannot exceed 50 characters',
      pattern: 'Name can only contain letters and spaces'
    }
  },

  email: {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    messages: {
      required: 'Email address is required',
      pattern: 'Please enter a valid email address',
      unique: 'This email address is already registered'
    }
  },

  password: {
    required: true,
    minLength: 6,
    pattern: /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    messages: {
      required: 'Password is required',
      minLength: 'Password must be at least 6 characters long',
      pattern: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      confirm: 'Passwords do not match'
    }
  },

  confirmPassword: {
    required: true,
    messages: {
      required: 'Please confirm your password',
      match: 'Passwords do not match'
    }
  },

  currentPassword: {
    required: true,
    messages: {
      required: 'Current password is required'
    }
  },

  title: {
    required: false,
    maxLength: 100,
    messages: {
      maxLength: 'Title cannot exceed 100 characters'
    }
  }
};

export const validateField = (fieldName, value, rules = validationRules) => {
  const fieldRules = rules[fieldName];
  if (!fieldRules) return '';

  const { required, minLength, maxLength, pattern, messages } = fieldRules;

  // Required check
  if (required && (!value || value.trim() === '')) {
    return messages.required;
  }

  // Skip other validations if field is empty and not required
  if (!value || value.trim() === '') return '';

  // Min length check
  if (minLength && value.length < minLength) {
    return messages.minLength;
  }

  // Max length check
  if (maxLength && value.length > maxLength) {
    return messages.maxLength;
  }

  // Pattern check
  if (pattern && !pattern.test(value)) {
    return messages.pattern;
  }

  return '';
};

export const validatePasswordMatch = (password, confirmPassword) => {
  if (!confirmPassword) return validationRules.confirmPassword.messages.required;
  if (password !== confirmPassword) return validationRules.confirmPassword.messages.match;
  return '';
};

export const validateForm = (formData, fields, rules = validationRules) => {
  const errors = {};

  fields.forEach(field => {
    const error = validateField(field, formData[field], rules);
    if (error) errors[field] = error;
  });

  // Special validation for password confirmation
  if (fields.includes('confirmPassword') && formData.password && formData.confirmPassword) {
    const matchError = validatePasswordMatch(formData.password, formData.confirmPassword);
    if (matchError) errors.confirmPassword = matchError;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Email uniqueness check
export const checkEmailUniqueness = async (email, currentUserId = null) => {
  try {
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/auth/check-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, excludeUserId: currentUserId })
    });

    const data = await response.json();
    return data.available;
  } catch (error) {
    console.error('Email uniqueness check failed:', error);
    // Return true to allow form submission if check fails
    return true;
  }
};

// Debounced email validation
let emailCheckTimeout;
export const debouncedEmailCheck = (email, currentUserId, callback) => {
  clearTimeout(emailCheckTimeout);
  emailCheckTimeout = setTimeout(async () => {
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const isAvailable = await checkEmailUniqueness(email, currentUserId);
      callback(isAvailable);
    } else {
      callback(true); // Valid if email format is invalid (will be caught by pattern validation)
    }
  }, 500);
};