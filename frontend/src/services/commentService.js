import Database from "./database";

/**
 * Optimized Comment Service
 * Handles optimistic updates, local caching, and efficient comment management
 * across Card, Subtask, and SubtaskNano entities.
 */

class CommentService {
  constructor() {
    // Cache for comments by entity type
    this.cache = {
      card: {},
      subtask: {},
      nano: {}
    };

    // Debounce timers for API calls
    this.debounceTimers = new Map();
    
    // Pending requests queue for batch operations
    this.pendingRequests = [];
  }

  /**
   * Generate cache key based on entity type and ID
   */
  getCacheKey(type, entityId) {
    return `${type}-${entityId}`;
  }

  /**
   * Get cached comments for an entity
   */
  getFromCache(type, entityId) {
    const key = this.getCacheKey(type, entityId);
    return this.cache[type]?.[key] || null;
  }

  /**
   * Set cached comments for an entity
   */
  setInCache(type, entityId, comments) {
    const key = this.getCacheKey(type, entityId);
    if (!this.cache[type]) {
      this.cache[type] = {};
    }
    this.cache[type][key] = comments;
  }

  /**
   * Clear cache for an entity
   */
  clearCache(type, entityId) {
    const key = this.getCacheKey(type, entityId);
    if (this.cache[type]) {
      delete this.cache[type][key];
    }
  }

  /**
   * Add a comment optimistically with immediate UI update
   * Returns: { tempComment, promise }
   * - tempComment: Immediately displayed in UI
   * - promise: Background save operation
   */
  async addCommentOptimistic(entityData) {
    const { type, entityId, htmlContent, user } = entityData;

    // Generate temporary comment for immediate UI update
    const tempComment = {
      _id: `temp-${Date.now()}`,
      id: `temp-${Date.now()}`,
      htmlContent,
      text: htmlContent,
      user: {
        _id: user._id,
        name: user.name
      },
      createdAt: new Date().toISOString(),
      isOptimistic: true
    };

    // Get current cache
    const cachedComments = this.getFromCache(type, entityId) || [];

    // Update cache with optimistic comment
    const updatedComments = [...cachedComments, tempComment];
    this.setInCache(type, entityId, updatedComments);

    // Dispatch event for immediate UI update
    this.dispatchCommentUpdate(type, entityId, updatedComments);

    // Start background save operation
    const savePromise = this.saveCommentToServer(
      { type, entityId, htmlContent },
      tempComment._id
    );

    return { tempComment, promise: savePromise };
  }

  /**
   * Save comment to server and update cache
   */
  async saveCommentToServer(entityData, tempId) {
    const { type, entityId, htmlContent } = entityData;

    try {
      const payload = {
        htmlContent
      };

      // Map entity type to API call and parameters
      // Database.createComment expects: { cardId, subtaskId, nanoId, htmlContent }
      switch (type) {
        case 'card':
          payload.cardId = entityId;
          payload.subtaskId = undefined;
          payload.nanoId = undefined;
          break;
        case 'subtask':
          payload.cardId = entityData.parentTaskId;
          payload.subtaskId = entityId;
          payload.nanoId = undefined;
          break;
        case 'nano':
          payload.cardId = entityData.parentTaskId;
          payload.subtaskId = entityData.parentSubtaskId;
          payload.nanoId = entityId;
          break;
      }

      // Save to server
      const response = await Database.createComment(payload);
      // Backend returns the comment directly or wrapped in .data property
      const savedComment = response.data || response;

      // Ensure the saved comment has the necessary fields
      if (!savedComment._id && !savedComment.id) {
        throw new Error("Invalid comment response from server");
      }

      // Get current cache
      const cachedComments = this.getFromCache(type, entityId) || [];

      // Replace temporary comment with actual comment from server
      const updatedComments = cachedComments.map(comment =>
        comment._id === tempId ? { ...savedComment, isOptimistic: false } : comment
      );

      // Update cache
      this.setInCache(type, entityId, updatedComments);

      // Dispatch update event
      this.dispatchCommentUpdate(type, entityId, updatedComments);

      return savedComment;
    } catch (error) {
      console.error("Error saving comment:", error);

      // On error, remove the optimistic comment from cache
      const cachedComments = this.getFromCache(type, entityId) || [];
      const updatedComments = cachedComments.filter(c => c._id !== tempId);
      this.setInCache(type, entityId, updatedComments);

      // Dispatch error event
      this.dispatchCommentUpdate(type, entityId, updatedComments, error);

      throw error;
    }
  }

  /**
   * Fetch comments from server (with caching)
   */
  async fetchComments(type, entityId, forceRefresh = false) {
    // Return from cache if available and not forcing refresh
    if (!forceRefresh) {
      const cached = this.getFromCache(type, entityId);
      if (cached) {
        return cached;
      }
    }

    try {
      let comments;

      switch (type) {
        case 'card':
          comments = await Database.getComments(entityId);
          break;
        case 'subtask':
          comments = await Database.getSubtaskComments(entityId);
          break;
        case 'nano':
          comments = await Database.getNanoComments(entityId);
          break;
        default:
          throw new Error(`Unknown comment type: ${type}`);
      }

      // Store in cache
      this.setInCache(type, entityId, comments);

      return comments || [];
    } catch (error) {
      console.error(`Error fetching ${type} comments:`, error);
      return [];
    }
  }

  /**
   * Dispatch custom event for comment updates
   * Allows components to listen for changes without polling
   */
  dispatchCommentUpdate(type, entityId, comments, error = null) {
    const eventName = `comments-updated-${type}-${entityId}`;
    const event = new CustomEvent(eventName, {
      detail: {
        type,
        entityId,
        comments,
        error,
        timestamp: Date.now()
      }
    });
    window.dispatchEvent(event);
  }

  /**
   * Create listener for comment updates
   * Component subscribes to changes for this specific entity
   */
  onCommentsUpdated(type, entityId, callback) {
    const eventName = `comments-updated-${type}-${entityId}`;
    
    const listener = (event) => {
      callback(event.detail.comments, event.detail.error);
    };

    window.addEventListener(eventName, listener);

    // Return unsubscribe function
    return () => {
      window.removeEventListener(eventName, listener);
    };
  }

  /**
   * Delete a comment (optimistic delete)
   */
  async deleteComment(commentId, type, entityId) {
    // Remove from cache optimistically
    const cachedComments = this.getFromCache(type, entityId) || [];
    const updatedComments = cachedComments.filter(c => c._id !== commentId && c.id !== commentId);
    this.setInCache(type, entityId, updatedComments);

    // Dispatch immediate update
    this.dispatchCommentUpdate(type, entityId, updatedComments);

    // Delete from server in background
    try {
      await Database.deleteComment(commentId);
    } catch (error) {
      console.error("Error deleting comment:", error);
      // Optionally restore the comment on error
      this.setInCache(type, entityId, cachedComments);
      this.dispatchCommentUpdate(type, entityId, cachedComments, error);
      throw error;
    }
  }

  /**
   * Update a comment (optimistic update)
   */
  async updateComment(commentId, newText, type, entityId) {
    // Update in cache optimistically
    const cachedComments = this.getFromCache(type, entityId) || [];
    const updatedComments = cachedComments.map(c =>
      (c._id === commentId || c.id === commentId) ? { ...c, htmlContent: newText, text: newText } : c
    );
    this.setInCache(type, entityId, updatedComments);

    // Dispatch immediate update
    this.dispatchCommentUpdate(type, entityId, updatedComments);

    // Update on server in background
    try {
      await Database.updateComment(commentId, newText);
    } catch (error) {
      console.error("Error updating comment:", error);
      // Restore original on error
      this.setInCache(type, entityId, cachedComments);
      this.dispatchCommentUpdate(type, entityId, cachedComments, error);
      throw error;
    }
  }

  /**
   * Invalidate cache to force refresh
   */
  invalidateCache(type, entityId) {
    this.clearCache(type, entityId);
  }

  /**
   * Clear all caches
   */
  clearAllCache() {
    this.cache = {
      card: {},
      subtask: {},
      nano: {}
    };
  }
}

// Export singleton instance
const commentService = new CommentService();
export default commentService;
