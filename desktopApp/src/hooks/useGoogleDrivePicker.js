import { useState, useCallback, useRef } from 'react';
import googleDriveService from '../services/googleDriveService';

/**
 * React hook for Google Drive Picker integration
 * Provides a simple interface to open the picker and handle file selection
 */
const useGoogleDrivePicker = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState(null);
  const callbackRef = useRef(null);

  /**
   * Open the Google Drive Picker
   * @param {Object} options - Picker options
   * @param {Function} options.onSelect - Callback when files are selected
   * @param {Function} options.onCancel - Callback when picker is cancelled
   * @param {Function} options.onError - Callback when an error occurs
   */
  const openPicker = useCallback(async ({ onSelect, onCancel, onError } = {}) => {
    // Check if Google Drive is configured
    if (!googleDriveService.isConfigured()) {
      const errorMsg = 'Google Drive is not configured. Please contact your administrator.';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    setIsLoading(true);
    setError(null);
    callbackRef.current = { onSelect, onCancel, onError };

    try {
      await googleDriveService.openPicker((result) => {
        setIsLoading(false);
        setIsPickerOpen(false);

        if (result.error) {
          setError(result.error);
          callbackRef.current?.onError?.(result.error);
          return;
        }

        if (result.cancelled) {
          callbackRef.current?.onCancel?.();
          return;
        }

        if (result.files && result.files.length > 0) {
          callbackRef.current?.onSelect?.({
            files: result.files,
            accessToken: result.accessToken
          });
        }
      });

      setIsPickerOpen(true);
    } catch (err) {
      setIsLoading(false);
      setIsPickerOpen(false);
      const errorMsg = err.message || 'Failed to open Google Drive picker';
      setError(errorMsg);
      onError?.(errorMsg);
    }
  }, []);

  /**
   * Clear any error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Check if Google Drive is available
   */
  const isAvailable = googleDriveService.isConfigured();

  return {
    openPicker,
    isLoading,
    isPickerOpen,
    error,
    clearError,
    isAvailable
  };
};

export default useGoogleDrivePicker;
