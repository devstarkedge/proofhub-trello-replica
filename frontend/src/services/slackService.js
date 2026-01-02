/**
 * Slack Integration Service
 * Frontend service for Slack API interactions
 */

import api from './api';

const slackService = {
  // ==================== Connection Management ====================
  
  /**
   * Get OAuth URL to start Slack connection
   */
  async getOAuthUrl() {
    const response = await api.get('/api/slack/oauth/url');
    return response.data;
  },

  /**
   * Get current Slack connection status
   */
  async getConnectionStatus() {
    const response = await api.get('/api/slack/connection');
    return response.data;
  },

  /**
   * Disconnect Slack account
   */
  async disconnect() {
    const response = await api.delete('/api/slack/connection');
    return response.data;
  },

  // ==================== User Preferences ====================

  /**
   * Update Slack notification preferences
   */
  async updatePreferences(preferences) {
    const response = await api.put('/api/slack/preferences', preferences);
    return response.data;
  },

  // ==================== Admin Functions ====================

  /**
   * Get workspace settings (admin only)
   */
  async getWorkspaceSettings() {
    const response = await api.get('/api/slack/admin/workspace');
    return response.data;
  },

  /**
   * Update workspace settings (admin only)
   */
  async updateWorkspaceSettings(settings) {
    const response = await api.put('/api/slack/admin/workspace/settings', settings);
    return response.data;
  },

  /**
   * Get workspace users (admin only)
   */
  async getWorkspaceUsers(page = 1, limit = 20) {
    const response = await api.get(`/api/slack/admin/users?page=${page}&limit=${limit}`);
    return response.data;
  },

  /**
   * Get queue statistics (admin only)
   */
  async getQueueStats() {
    const response = await api.get('/api/slack/admin/queues');
    return response.data;
  },

  /**
   * Set default notification channel (admin only)
   */
  async setDefaultChannel(channelId, channelName) {
    const response = await api.put('/api/slack/admin/channel', { channelId, channelName });
    return response.data;
  },

  /**
   * Link department to Slack channel (admin only)
   */
  async linkDepartmentChannel(departmentId, channelId, channelName) {
    const response = await api.put('/api/slack/admin/department-channel', {
      departmentId,
      channelId,
      channelName
    });
    return response.data;
  },

  /**
   * Link team to Slack channel (admin only)
   */
  async linkTeamChannel(teamId, channelId, channelName) {
    const response = await api.put('/api/slack/admin/team-channel', {
      teamId,
      channelId,
      channelName
    });
    return response.data;
  },

  // ==================== Analytics ====================

  /**
   * Get Slack notification analytics (admin only)
   */
  async getAnalytics(period = 'daily', days = 30) {
    const response = await api.get(`/api/slack/analytics?period=${period}&days=${days}`);
    return response.data;
  },

  /**
   * Get notification history
   */
  async getNotificationHistory(page = 1, limit = 20, filters = {}) {
    const params = new URLSearchParams({ page, limit, ...filters });
    const response = await api.get(`/api/slack/notifications?${params}`);
    return response.data;
  },

  // ==================== Health & Testing ====================

  /**
   * Get health status (admin only)
   */
  async getHealthStatus() {
    const response = await api.get('/api/slack/health');
    return response.data;
  },

  /**
   * Send test notification
   */
  async sendTestNotification() {
    const response = await api.post('/api/slack/test');
    return response.data;
  },

  // ==================== Helper Functions ====================

  /**
   * Format notification preference key for display
   */
  formatPreferenceLabel(key) {
    const labels = {
      notificationsEnabled: 'Enable Slack Notifications',
      directMessageEnabled: 'Receive as Direct Messages',
      taskAssigned: 'Task Assignments',
      taskUpdated: 'Task Updates',
      taskCompleted: 'Task Completions',
      taskDeleted: 'Task Deletions',
      taskOverdue: 'Overdue Alerts',
      taskDueSoon: 'Due Soon Reminders',
      commentAdded: 'New Comments',
      commentMention: 'Mentions in Comments',
      subtaskUpdates: 'Subtask Updates',
      projectUpdates: 'Project Updates',
      teamUpdates: 'Team Updates',
      announcements: 'Announcements',
      reminders: 'Reminders',
      statusChanges: 'Status Changes',
      digestEnabled: 'Daily/Weekly Digest',
      digestFrequency: 'Digest Frequency',
      digestTime: 'Digest Time',
      quietHoursEnabled: 'Quiet Hours',
      quietHoursStart: 'Quiet Hours Start',
      quietHoursEnd: 'Quiet Hours End',
      batchingEnabled: 'Batch Similar Notifications',
      batchIntervalMinutes: 'Batch Interval (minutes)',
      preferThreadedReplies: 'Thread Related Notifications'
    };
    return labels[key] || key;
  },

  /**
   * Get preference categories
   */
  getPreferenceCategories() {
    return {
      general: {
        label: 'General',
        preferences: ['notificationsEnabled', 'directMessageEnabled']
      },
      notifications: {
        label: 'Notification Types',
        preferences: [
          'taskAssigned', 'taskUpdated', 'taskCompleted', 'taskDeleted',
          'taskOverdue', 'taskDueSoon', 'commentAdded', 'commentMention',
          'subtaskUpdates', 'projectUpdates', 'teamUpdates', 'announcements',
          'reminders', 'statusChanges'
        ]
      },
      digest: {
        label: 'Digest Settings',
        preferences: ['digestEnabled', 'digestFrequency', 'digestTime']
      },
      quietHours: {
        label: 'Quiet Hours',
        preferences: ['quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd']
      },
      advanced: {
        label: 'Advanced',
        preferences: ['batchingEnabled', 'batchIntervalMinutes', 'preferThreadedReplies']
      }
    };
  }
};

export default slackService;
