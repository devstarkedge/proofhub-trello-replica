// Attachment service for Cloudinary-based file management
const baseURL = import.meta.env.VITE_BACKEND_URL;

class AttachmentService {
  constructor() {
    this.uploadQueue = [];
    this.isProcessing = false;
    this.subscribers = new Map();
  }

  getHeaders(includeContentType = true) {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  // Subscribe to attachment updates for a card
  subscribe(cardId, callback) {
    if (!this.subscribers.has(cardId)) {
      this.subscribers.set(cardId, new Set());
    }
    this.subscribers.get(cardId).add(callback);
    
    return () => {
      const subs = this.subscribers.get(cardId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(cardId);
        }
      }
    };
  }

  // Notify subscribers of attachment changes
  notifySubscribers(cardId, attachments, action) {
    const subs = this.subscribers.get(cardId);
    if (subs) {
      subs.forEach(callback => callback(attachments, action));
    }
  }

  // Upload a single file - supports card, subtask, and nanoSubtask entity types
  async uploadFile(file, entityId, options = {}) {
    const { entityType = 'card', contextType, contextRef, commentId, setCover = false, onProgress } = options;

    const formData = new FormData();
    formData.append('file', file);
    
    // Add the appropriate parent ID based on entity type
    switch (entityType) {
      case 'card':
        formData.append('cardId', entityId);
        break;
      case 'subtask':
        formData.append('subtaskId', entityId);
        break;
      case 'nanoSubtask':
        formData.append('nanoSubtaskId', entityId);
        break;
      default:
        formData.append('cardId', entityId);
    }
    
    if (contextType) formData.append('contextType', contextType);
    if (contextRef) formData.append('contextRef', contextRef);
    if (commentId) formData.append('commentId', commentId);
    if (setCover && entityType === 'card') formData.append('setCover', 'true');

    try {
      const response = await fetch(`${baseURL}/api/attachments/upload`, {
        method: 'POST',
        headers: this.getHeaders(false),
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  // Upload multiple files with batching
  async uploadMultiple(files, cardId, options = {}) {
    const { contextType = 'card', contextRef, onProgress, batchSize = 3 } = options;

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('cardId', cardId);
    formData.append('contextType', contextType);
    if (contextRef) formData.append('contextRef', contextRef);

    try {
      const response = await fetch(`${baseURL}/api/attachments/upload-multiple`, {
        method: 'POST',
        headers: this.getHeaders(false),
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Batch upload error:', error);
      throw error;
    }
  }

  // Upload from clipboard paste (base64 image)
  async uploadFromPaste(imageData, entityId, options = {}) {
    const { entityType = 'card', contextType = 'description', contextRef, setCover } = options;

    // Build the request body with the correct parent ID field
    const body = {
      imageData,
      contextType,
      contextRef
    };
    
    // Add the appropriate parent ID based on entity type
    switch (entityType) {
      case 'card':
        body.cardId = entityId;
        break;
      case 'subtask':
        body.subtaskId = entityId;
        break;
      case 'nanoSubtask':
        body.nanoSubtaskId = entityId;
        break;
      default:
        body.cardId = entityId;
    }
    
    if (setCover && entityType === 'card') body.setCover = true;

    try {
      const response = await fetch(`${baseURL}/api/attachments/paste`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Paste upload failed');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Paste upload error:', error);
      throw error;
    }
  }

  // Get attachments for a card with pagination
  async getCardAttachments(cardId, options = {}) {
    const { page = 1, limit = 20, fileType } = options;
    
    const params = new URLSearchParams({ page, limit });
    if (fileType) params.append('fileType', fileType);

    try {
      const response = await fetch(
        `${baseURL}/api/attachments/card/${cardId}?${params}`,
        { headers: this.getHeaders() }
      );

      // Handle 404 gracefully - card might be newly created
      if (response.status === 404) {
        console.warn(`Card ${cardId} not found or has no attachments yet. Returning empty array.`);
        return {
          data: [],
          pagination: { page: 1, totalPages: 0, totalCount: 0, hasNext: false, hasPrev: false }
        };
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return {
        data: result.data || [],
        pagination: result.pagination || {}
      };
    } catch (error) {
      // If it's a 404, return empty array instead of throwing
      if (error.message.includes('404')) {
        console.warn(`Card ${cardId} not found. Returning empty attachments.`);
        return {
          data: [],
          pagination: { page: 1, totalPages: 0, totalCount: 0, hasNext: false, hasPrev: false }
        };
      }
      console.error('Get card attachments error:', error);
      throw error;
    }
  }

  // Get attachments for a subtask with pagination
  async getSubtaskAttachments(subtaskId, options = {}) {
    const { page = 1, limit = 20, fileType } = options;
    
    const params = new URLSearchParams({ page, limit });
    if (fileType) params.append('fileType', fileType);

    try {
      const response = await fetch(
        `${baseURL}/api/attachments/subtask/${subtaskId}?${params}`,
        { headers: this.getHeaders() }
      );

      // Handle 404 gracefully - subtask might be newly created
      if (response.status === 404) {
        console.warn(`Subtask ${subtaskId} not found or has no attachments yet. Returning empty array.`);
        return {
          data: [],
          pagination: { page: 1, totalPages: 0, totalCount: 0, hasNext: false, hasPrev: false }
        };
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return {
        data: result.data || [],
        pagination: result.pagination || {}
      };
    } catch (error) {
      // If it's a 404, return empty array instead of throwing
      if (error.message.includes('404')) {
        console.warn(`Subtask ${subtaskId} not found. Returning empty attachments.`);
        return {
          data: [],
          pagination: { page: 1, totalPages: 0, totalCount: 0, hasNext: false, hasPrev: false }
        };
      }
      console.error('Get subtask attachments error:', error);
      throw error;
    }
  }

  // Get attachments for a nano-subtask with pagination
  async getNanoSubtaskAttachments(nanoSubtaskId, options = {}) {
    const { page = 1, limit = 20, fileType } = options;
    
    const params = new URLSearchParams({ page, limit });
    if (fileType) params.append('fileType', fileType);

    try {
      const response = await fetch(
        `${baseURL}/api/attachments/nano-subtask/${nanoSubtaskId}?${params}`,
        { headers: this.getHeaders() }
      );

      // Handle 404 gracefully - nano-subtask might be newly created
      if (response.status === 404) {
        console.warn(`Nano-subtask ${nanoSubtaskId} not found or has no attachments yet. Returning empty array.`);
        return {
          data: [],
          pagination: { page: 1, totalPages: 0, totalCount: 0, hasNext: false, hasPrev: false }
        };
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return {
        data: result.data || [],
        pagination: result.pagination || {}
      };
    } catch (error) {
      // If it's a 404, return empty array instead of throwing
      if (error.message.includes('404')) {
        console.warn(`Nano-subtask ${nanoSubtaskId} not found. Returning empty attachments.`);
        return {
          data: [],
          pagination: { page: 1, totalPages: 0, totalCount: 0, hasNext: false, hasPrev: false }
        };
      }
      console.error('Get nano-subtask attachments error:', error);
      throw error;
    }
  }

  // Generic method to fetch attachments by entity type
  async getAttachmentsByEntity(entityType, entityId, options = {}) {
    switch (entityType) {
      case 'card':
        return this.getCardAttachments(entityId, options);
      case 'subtask':
        return this.getSubtaskAttachments(entityId, options);
      case 'nanoSubtask':
        return this.getNanoSubtaskAttachments(entityId, options);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  // Get attachments by context
  async getAttachmentsByContext(contextType, contextRef, options = {}) {
    const { page = 1, limit = 20 } = options;
    
    const params = new URLSearchParams({ page, limit });

    try {
      const response = await fetch(
        `${baseURL}/api/attachments/context/${contextType}/${contextRef}?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get attachments by context error:', error);
      throw error;
    }
  }

  // Get single attachment
  async getAttachment(attachmentId) {
    try {
      const response = await fetch(
        `${baseURL}/api/attachments/${attachmentId}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get attachment error:', error);
      throw error;
    }
  }

  // Delete single attachment
  async deleteAttachment(attachmentId) {
    try {
      const response = await fetch(
        `${baseURL}/api/attachments/${attachmentId}`,
        {
          method: 'DELETE',
          headers: this.getHeaders()
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Delete failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Delete attachment error:', error);
      throw error;
    }
  }

  // Delete multiple attachments
  async deleteMultiple(attachmentIds) {
    try {
      const response = await fetch(
        `${baseURL}/api/attachments/bulk`,
        {
          method: 'DELETE',
          headers: this.getHeaders(),
          body: JSON.stringify({ attachmentIds })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Bulk delete failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Bulk delete error:', error);
      throw error;
    }
  }

  // Set attachment as card cover
  async setAsCover(attachmentId) {
    try {
      const response = await fetch(
        `${baseURL}/api/attachments/${attachmentId}/set-cover`,
        {
          method: 'PATCH',
          headers: this.getHeaders()
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Set cover failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Set cover error:', error);
      throw error;
    }
  }

  // Delete attachment
  async deleteAttachment(attachmentId, cardId) {
    try {
      const response = await fetch(
        `${baseURL}/api/attachments/${attachmentId}`,
        {
          method: 'DELETE',
          headers: this.getHeaders()
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Delete failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Delete attachment error:', error);
      throw error;
    }
  }

  // Remove cover from card
  async removeCover(cardId) {
    try {
      const response = await fetch(
        `${baseURL}/api/cards/${cardId}/remove-cover`,
        {
          method: 'PATCH',
          headers: this.getHeaders()
        }
      );

      if (!response.ok) {
        throw new Error('Failed to remove cover');
      }

      return await response.json();
    } catch (error) {
      console.error('Remove cover error:', error);
      throw error;
    }
  }

  // Helper to get file type icon based on fileType
  getFileIcon(fileType) {
    const icons = {
      image: '🖼️',
      pdf: '📄',
      document: '📝',
      spreadsheet: '📊',
      presentation: '📽️',
      video: '🎬',
      text: '📋',
      other: '📎'
    };
    return icons[fileType] || icons.other;
  }

  // Helper to check if file type supports preview
  supportsPreview(fileType, mimeType) {
    if (fileType === 'image') return true;
    if (fileType === 'pdf') return true;
    if (mimeType?.includes('video')) return true;
    return false;
  }

  // Format file size
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default new AttachmentService();
