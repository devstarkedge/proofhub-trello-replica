/**
 * Slack API Client
 * Enterprise-grade Slack API wrapper with retry logic, rate limiting, and error handling
 */

import { WebClient } from '@slack/web-api';
import SlackWorkspace from '../../models/SlackWorkspace.js';

// Rate limit tracking per workspace
const rateLimitTrackers = new Map();

class SlackApiClient {
  constructor(workspace = null) {
    this.workspace = workspace;
    this.client = null;
    this.retryConfig = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2
    };
  }

  /**
   * Initialize client with workspace
   */
  async initialize(workspaceOrTeamId) {
    if (typeof workspaceOrTeamId === 'string') {
      this.workspace = await SlackWorkspace.findByTeamId(workspaceOrTeamId);
    } else {
      this.workspace = workspaceOrTeamId;
    }

    if (!this.workspace) {
      throw new Error('Slack workspace not found');
    }

    const token = this.workspace.botAccessToken;
    if (!token) {
      throw new Error('Bot access token not available');
    }

    this.client = new WebClient(token, {
      retryConfig: {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 30000,
        randomize: true
      },
      logLevel: process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO'
    });

    return this;
  }

  /**
   * Get or create client for workspace
   */
  static async forWorkspace(workspaceId) {
    const client = new SlackApiClient();
    await client.initialize(workspaceId);
    return client;
  }

  /**
   * Check rate limit before making request
   */
  async checkRateLimit() {
    const teamId = this.workspace.teamId;
    const tracker = rateLimitTrackers.get(teamId);
    
    if (tracker && tracker.retryAfter > Date.now()) {
      const waitTime = tracker.retryAfter - Date.now();
      throw new RateLimitError(`Rate limited. Retry after ${waitTime}ms`, waitTime);
    }
  }

  /**
   * Handle rate limit response
   */
  handleRateLimit(retryAfter) {
    const teamId = this.workspace.teamId;
    rateLimitTrackers.set(teamId, {
      retryAfter: Date.now() + (retryAfter * 1000),
      timestamp: Date.now()
    });
  }

  /**
   * Execute API call with retry logic
   */
  async executeWithRetry(apiMethod, params, retryCount = 0) {
    try {
      await this.checkRateLimit();
      
      const startTime = Date.now();
      const result = await apiMethod(params);
      const responseTime = Date.now() - startTime;

      // Track successful call
      this.workspace.markHealthy();
      await this.workspace.save();

      return {
        success: true,
        data: result,
        responseTime
      };
    } catch (error) {
      // Handle rate limiting
      if (error.code === 'slack_webapi_rate_limited_error' || error.data?.error === 'ratelimited') {
        const retryAfter = error.retryAfter || 60;
        this.handleRateLimit(retryAfter);
        
        if (retryCount < this.retryConfig.maxRetries) {
          await this.delay(retryAfter * 1000);
          return this.executeWithRetry(apiMethod, params, retryCount + 1);
        }
        
        throw new RateLimitError('Rate limit exceeded after retries', retryAfter * 1000);
      }

      // Handle token errors
      if (error.data?.error === 'token_revoked' || error.data?.error === 'invalid_auth') {
        this.workspace.isActive = false;
        this.workspace.healthStatus = 'unhealthy';
        await this.workspace.save();
        throw new AuthenticationError('Slack token is invalid or revoked');
      }

      // Handle channel errors
      if (error.data?.error === 'channel_not_found') {
        throw new ChannelError('Channel not found');
      }

      // Handle user errors
      if (error.data?.error === 'user_not_found') {
        throw new UserError('User not found');
      }

      // Retry on transient errors
      const transientErrors = ['service_unavailable', 'internal_error', 'timeout'];
      if (transientErrors.includes(error.data?.error) && retryCount < this.retryConfig.maxRetries) {
        const delay = Math.min(
          this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, retryCount),
          this.retryConfig.maxDelayMs
        );
        await this.delay(delay);
        return this.executeWithRetry(apiMethod, params, retryCount + 1);
      }

      // Track failure
      this.workspace.markFailure();
      await this.workspace.save();

      throw error;
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== Message Methods ====================

  /**
   * Send a message to a channel
   */
  async sendMessage(channelId, options) {
    return this.executeWithRetry(
      (params) => this.client.chat.postMessage(params),
      {
        channel: channelId,
        ...options
      }
    );
  }

  /**
   * Send a message in a thread
   */
  async sendThreadReply(channelId, threadTs, options) {
    return this.executeWithRetry(
      (params) => this.client.chat.postMessage(params),
      {
        channel: channelId,
        thread_ts: threadTs,
        ...options
      }
    );
  }

  /**
   * Update an existing message
   */
  async updateMessage(channelId, messageTs, options) {
    return this.executeWithRetry(
      (params) => this.client.chat.update(params),
      {
        channel: channelId,
        ts: messageTs,
        ...options
      }
    );
  }

  /**
   * Delete a message
   */
  async deleteMessage(channelId, messageTs) {
    return this.executeWithRetry(
      (params) => this.client.chat.delete(params),
      {
        channel: channelId,
        ts: messageTs
      }
    );
  }

  /**
   * Send an ephemeral message (only visible to one user)
   */
  async sendEphemeral(channelId, userId, options) {
    return this.executeWithRetry(
      (params) => this.client.chat.postEphemeral(params),
      {
        channel: channelId,
        user: userId,
        ...options
      }
    );
  }

  /**
   * Schedule a message
   */
  async scheduleMessage(channelId, postAt, options) {
    return this.executeWithRetry(
      (params) => this.client.chat.scheduleMessage(params),
      {
        channel: channelId,
        post_at: postAt,
        ...options
      }
    );
  }

  // ==================== Direct Message Methods ====================

  /**
   * Open a DM channel with a user
   */
  async openDMChannel(userId) {
    return this.executeWithRetry(
      (params) => this.client.conversations.open(params),
      {
        users: userId
      }
    );
  }

  /**
   * Send a direct message to a user
   */
  async sendDirectMessage(userId, options) {
    const dmResult = await this.openDMChannel(userId);
    const channelId = dmResult.data.channel.id;
    
    return this.sendMessage(channelId, options);
  }

  // ==================== App Home Methods ====================

  /**
   * Publish App Home view
   */
  async publishHomeView(userId, view) {
    return this.executeWithRetry(
      (params) => this.client.views.publish(params),
      {
        user_id: userId,
        view
      }
    );
  }

  // ==================== Modal Methods ====================

  /**
   * Open a modal
   */
  async openModal(triggerId, view) {
    return this.executeWithRetry(
      (params) => this.client.views.open(params),
      {
        trigger_id: triggerId,
        view
      }
    );
  }

  /**
   * Update a modal
   */
  async updateModal(viewId, view) {
    return this.executeWithRetry(
      (params) => this.client.views.update(params),
      {
        view_id: viewId,
        view
      }
    );
  }

  /**
   * Push a new view onto modal stack
   */
  async pushModal(triggerId, view) {
    return this.executeWithRetry(
      (params) => this.client.views.push(params),
      {
        trigger_id: triggerId,
        view
      }
    );
  }

  // ==================== User Methods ====================

  /**
   * Get user info
   */
  async getUserInfo(userId) {
    return this.executeWithRetry(
      (params) => this.client.users.info(params),
      {
        user: userId
      }
    );
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email) {
    return this.executeWithRetry(
      (params) => this.client.users.lookupByEmail(params),
      {
        email
      }
    );
  }

  /**
   * Get list of users
   */
  async getUsers(cursor = null, limit = 200) {
    return this.executeWithRetry(
      (params) => this.client.users.list(params),
      {
        cursor,
        limit
      }
    );
  }

  // ==================== Channel Methods ====================

  /**
   * Get channel info
   */
  async getChannelInfo(channelId) {
    return this.executeWithRetry(
      (params) => this.client.conversations.info(params),
      {
        channel: channelId
      }
    );
  }

  /**
   * List channels
   */
  async listChannels(types = 'public_channel,private_channel', cursor = null, limit = 200) {
    return this.executeWithRetry(
      (params) => this.client.conversations.list(params),
      {
        types,
        cursor,
        limit
      }
    );
  }

  /**
   * Join a channel
   */
  async joinChannel(channelId) {
    return this.executeWithRetry(
      (params) => this.client.conversations.join(params),
      {
        channel: channelId
      }
    );
  }

  /**
   * Get channel members
   */
  async getChannelMembers(channelId, cursor = null, limit = 200) {
    return this.executeWithRetry(
      (params) => this.client.conversations.members(params),
      {
        channel: channelId,
        cursor,
        limit
      }
    );
  }

  // ==================== Reaction Methods ====================

  /**
   * Add a reaction to a message
   */
  async addReaction(channelId, messageTs, reaction) {
    return this.executeWithRetry(
      (params) => this.client.reactions.add(params),
      {
        channel: channelId,
        timestamp: messageTs,
        name: reaction
      }
    );
  }

  /**
   * Remove a reaction from a message
   */
  async removeReaction(channelId, messageTs, reaction) {
    return this.executeWithRetry(
      (params) => this.client.reactions.remove(params),
      {
        channel: channelId,
        timestamp: messageTs,
        name: reaction
      }
    );
  }

  // ==================== File Methods ====================

  /**
   * Upload a file
   */
  async uploadFile(channels, fileOptions) {
    return this.executeWithRetry(
      (params) => this.client.files.uploadV2(params),
      {
        channels,
        ...fileOptions
      }
    );
  }

  // ==================== Auth Methods ====================

  /**
   * Test authentication
   */
  async testAuth() {
    return this.executeWithRetry(
      () => this.client.auth.test(),
      {}
    );
  }

  /**
   * Revoke token
   */
  async revokeToken() {
    return this.executeWithRetry(
      () => this.client.auth.revoke(),
      {}
    );
  }

  // ==================== Team Methods ====================

  /**
   * Get team info
   */
  async getTeamInfo() {
    return this.executeWithRetry(
      () => this.client.team.info(),
      {}
    );
  }

  // ==================== Response URL Methods ====================

  /**
   * Respond to an interaction using response_url
   */
  async respondToInteraction(responseUrl, payload) {
    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Failed to respond to interaction: ${response.status}`);
    }

    return { success: true };
  }

  // ==================== Utility Methods ====================

  /**
   * Get bot user ID
   */
  getBotUserId() {
    return this.workspace?.botUserId;
  }

  /**
   * Get team ID
   */
  getTeamId() {
    return this.workspace?.teamId;
  }

  /**
   * Check if workspace is healthy
   */
  isHealthy() {
    return this.workspace?.healthStatus === 'healthy';
  }
}

// Custom error classes
class RateLimitError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class ChannelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChannelError';
  }
}

class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
  }
}

export default SlackApiClient;
export { RateLimitError, AuthenticationError, ChannelError, UserError };
