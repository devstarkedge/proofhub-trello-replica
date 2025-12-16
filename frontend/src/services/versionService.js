// Version history service for tracking edits and rollback
const baseURL = import.meta.env.VITE_BACKEND_URL;

class VersionService {
  getHeaders() {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  // Get version history for an entity
  async getVersionHistory(entityType, entityId, options = {}) {
    const { page = 1, limit = 10 } = options;
    const params = new URLSearchParams({ page, limit });

    try {
      const response = await fetch(
        `${baseURL}/api/versions/${entityType}/${entityId}?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      // Return the full response so callers can access `data` and `pagination`
      return result;
    } catch (error) {
      console.error('Get version history error:', error);
      throw error;
    }
  }

  // Get specific version
  async getVersion(entityType, entityId, versionNumber) {
    try {
      const response = await fetch(
        `${baseURL}/api/versions/${entityType}/${entityId}/version/${versionNumber}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || null;
    } catch (error) {
      console.error('Get version error:', error);
      throw error;
    }
  }

  // Get version count
  async getVersionCount(entityType, entityId) {
    try {
      const response = await fetch(
        `${baseURL}/api/versions/${entityType}/${entityId}/count`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data?.count || 0;
    } catch (error) {
      console.error('Get version count error:', error);
      return 0; // Return 0 instead of throwing to avoid breaking the UI
    }
  }

  // Get latest version
  async getLatestVersion(entityType, entityId) {
    try {
      const response = await fetch(
        `${baseURL}/api/versions/${entityType}/${entityId}/latest`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || null;
    } catch (error) {
      console.error('Get latest version error:', error);
      throw error;
    }
  }

  // Rollback to a specific version
  async rollbackToVersion(entityType, entityId, versionNumber) {
    try {
      const response = await fetch(
        `${baseURL}/api/versions/${entityType}/${entityId}/rollback/${versionNumber}`,
        {
          method: 'POST',
          headers: this.getHeaders()
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Rollback failed');
      }

      const result = await response.json();
      return result.data || null;
    } catch (error) {
      console.error('Rollback error:', error);
      throw error;
    }
  }

  // Compare two versions
  async compareVersions(entityType, entityId, v1, v2) {
    try {
      const response = await fetch(
        `${baseURL}/api/versions/${entityType}/${entityId}/compare/${v1}/${v2}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || null;
    } catch (error) {
      console.error('Compare versions error:', error);
      throw error;
    }
  }

  // Format time since edit
  formatTimeSince(date) {
    const now = new Date();
    const editDate = new Date(date);
    const diff = now - editDate;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  }
}

export default new VersionService();
