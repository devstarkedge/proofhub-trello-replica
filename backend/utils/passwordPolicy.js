// Mirrored at frontend/src/utils/validationUtils.js's `validationRules.password`
// — keep both in sync (two-package repo, no shared module linking).
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_COMPLEXITY_PATTERN = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 6 characters and contain at least one uppercase letter, one lowercase letter, and one number';

export const isValidPassword = (password) =>
  typeof password === 'string' &&
  password.length >= PASSWORD_MIN_LENGTH &&
  PASSWORD_COMPLEXITY_PATTERN.test(password);

// express-validator-compatible custom validator: body('password').custom(passwordValidator())
export const passwordValidator = () => (value) => {
  if (!isValidPassword(value)) {
    throw new Error(PASSWORD_POLICY_MESSAGE);
  }
  return true;
};
