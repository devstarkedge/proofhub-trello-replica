/**
 * Google Drive Service
 * Handles Google Drive Picker initialization, OAuth, and file selection
 */

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GOOGLE_APP_ID = import.meta.env.VITE_GOOGLE_APP_ID;

// Scopes required for read-only access to Drive files
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

// Google API script URLs
const GAPI_SCRIPT_URL = 'https://apis.google.com/js/api.js';
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

class GoogleDriveService {
  constructor() {
    this.gapiLoaded = false;
    this.gisLoaded = false;
    this.tokenClient = null;
    this.accessToken = null;
    this.pickerCallback = null;
    this.loadPromise = null;
  }

  /**
   * Load Google APIs (GAPI and GIS)
   * @returns {Promise<void>}
   */
  async loadGoogleApis() {
    // Return existing promise if already loading
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = Promise.all([
      this.loadScript(GAPI_SCRIPT_URL, 'gapi'),
      this.loadScript(GIS_SCRIPT_URL, 'gis')
    ]).then(async () => {
      // Initialize GAPI client
      await new Promise((resolve) => {
        window.gapi.load('picker', resolve);
      });
      this.gapiLoaded = true;
      this.gisLoaded = true;
      
      // Initialize token client
      this.initializeTokenClient();
    });

    return this.loadPromise;
  }

  /**
   * Load a script dynamically
   * @param {string} url - Script URL
   * @param {string} type - Script identifier
   * @returns {Promise<void>}
   */
  loadScript(url, type) {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (type === 'gapi' && window.gapi) {
        resolve();
        return;
      }
      if (type === 'gis' && window.google?.accounts) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${type} script`));
      document.head.appendChild(script);
    });
  }

  /**
   * Initialize Google Identity Services token client
   */
  initializeTokenClient() {
    if (!window.google?.accounts?.oauth2) {
      console.error('Google Identity Services not loaded');
      return;
    }

    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          console.error('OAuth error:', response.error);
          if (this.pickerCallback) {
            this.pickerCallback({ error: response.error, files: [] });
          }
          return;
        }
        this.accessToken = response.access_token;
        this.createAndShowPicker();
      },
    });
  }

  /**
   * Request access token (triggers OAuth flow if needed)
   */
  requestAccessToken() {
    if (!this.tokenClient) {
      console.error('Token client not initialized');
      return;
    }

    // If we have a valid token, use it directly
    if (this.accessToken) {
      this.createAndShowPicker();
    } else {
      // Request new token (will show consent screen if needed)
      this.tokenClient.requestAccessToken({ prompt: '' });
    }
  }

  /**
   * Create and display the Google Drive Picker
   */
  createAndShowPicker() {
    if (!window.google?.picker || !this.accessToken) {
      console.error('Picker not ready or no access token');
      return;
    }

    const view = new window.google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);

    // Allow multiple file selection
    const picker = new window.google.picker.PickerBuilder()
      .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
      .addView(view)
      .addView(new window.google.picker.DocsUploadView())
      .setOAuthToken(this.accessToken)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setAppId(GOOGLE_APP_ID)
      .setCallback(this.handlePickerCallback.bind(this))
      .build();

    picker.setVisible(true);
  }

  /**
   * Handle picker selection callback
   * @param {Object} data - Picker response data
   */
  handlePickerCallback(data) {
    if (data.action === window.google.picker.Action.PICKED) {
      const files = data.docs.map(doc => ({
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType,
        size: doc.sizeBytes || 0,
        iconUrl: doc.iconUrl,
        url: doc.url,
        lastModified: doc.lastEditedUtc
      }));

      if (this.pickerCallback) {
        this.pickerCallback({ 
          files, 
          accessToken: this.accessToken,
          error: null 
        });
      }
    } else if (data.action === window.google.picker.Action.CANCEL) {
      if (this.pickerCallback) {
        this.pickerCallback({ 
          files: [], 
          accessToken: null, 
          cancelled: true,
          error: null 
        });
      }
    }
  }

  /**
   * Open the Google Drive Picker
   * @param {Function} callback - Callback function to receive selected files
   * @returns {Promise<void>}
   */
  async openPicker(callback) {
    // Validate configuration
    if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY || !GOOGLE_APP_ID) {
      const error = new Error('Google Drive configuration missing. Please set VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY, and VITE_GOOGLE_APP_ID environment variables.');
      callback({ error: error.message, files: [] });
      return;
    }

    this.pickerCallback = callback;

    try {
      // Ensure APIs are loaded
      await this.loadGoogleApis();
      
      // Request access token (will show picker after token is obtained)
      this.requestAccessToken();
    } catch (error) {
      console.error('Failed to open picker:', error);
      callback({ error: error.message, files: [] });
    }
  }

  /**
   * Revoke access token (sign out)
   */
  revokeToken() {
    if (this.accessToken) {
      window.google?.accounts?.oauth2?.revoke(this.accessToken, () => {
        console.log('Access token revoked');
        this.accessToken = null;
      });
    }
  }

  /**
   * Check if Google Drive is configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!(GOOGLE_CLIENT_ID && GOOGLE_API_KEY && GOOGLE_APP_ID);
  }

  /**
   * Get current access token
   * @returns {string|null}
   */
  getAccessToken() {
    return this.accessToken;
  }
}

// Export singleton instance
export default new GoogleDriveService();
