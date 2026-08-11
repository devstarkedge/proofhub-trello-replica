// Shared between CreateWorkspaceWizard's StepBasics and WorkspaceSettingsPage
// so the two upload entry points can never drift out of sync with the
// backend's own ICON_ALLOWED_TYPES / ICON_MAX_FILE_SIZE
// (backend/controllers/workspaceController.js).
export const WORKSPACE_ICON_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
export const WORKSPACE_ICON_MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export const validateWorkspaceIconFile = (file) => {
  if (!file) return 'No file selected';
  if (!WORKSPACE_ICON_ALLOWED_TYPES.includes(file.type)) {
    return 'Invalid file type. Allowed: PNG, JPG, JPEG, WEBP, SVG';
  }
  if (file.size > WORKSPACE_ICON_MAX_FILE_SIZE) {
    return `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum: 2MB`;
  }
  return null;
};
