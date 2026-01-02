/**
 * Slack Settings Component
 * Full-featured Slack integration settings panel
 */

import React, { useState, useEffect, useContext, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  MessageSquare, Link2, Unlink, Settings, Bell, BellOff,
  Clock, Moon, Sun, Zap, BarChart2, Users, Send,
  CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw,
  ChevronRight, ChevronDown, ExternalLink, Shield, Hash,
  Volume2, VolumeX, Calendar, Layers, Activity
} from 'lucide-react';
import AuthContext from '../context/AuthContext';
import slackService from '../services/slackService';

// Slack Logo SVG Component
const SlackLogo = ({ size = 24, className = '' }) => (
  <svg 
    viewBox="0 0 124 124" 
    width={size} 
    height={size} 
    className={className}
    fill="none"
  >
    <path d="M26.4 78.6c0 7.3-5.9 13.2-13.2 13.2S0 85.9 0 78.6s5.9-13.2 13.2-13.2h13.2v13.2zm6.6 0c0-7.3 5.9-13.2 13.2-13.2s13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2s-13.2-5.9-13.2-13.2V78.6z" fill="#E01E5A"/>
    <path d="M46.2 26.4c-7.3 0-13.2-5.9-13.2-13.2S38.9 0 46.2 0s13.2 5.9 13.2 13.2v13.2H46.2zm0 6.6c7.3 0 13.2 5.9 13.2 13.2s-5.9 13.2-13.2 13.2H13.2C5.9 59.4 0 53.5 0 46.2s5.9-13.2 13.2-13.2h33z" fill="#36C5F0"/>
    <path d="M97.6 46.2c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2s-5.9 13.2-13.2 13.2H97.6V46.2zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.2C64.6 5.9 70.5 0 77.8 0c7.3 0 13.2 5.9 13.2 13.2v33z" fill="#2EB67D"/>
    <path d="M77.8 97.6c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V97.6h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2h-33z" fill="#ECB22E"/>
  </svg>
);

const SlackSettings = () => {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [preferences, setPreferences] = useState({});
  const [expandedSections, setExpandedSections] = useState({
    general: true,
    notifications: false,
    digest: false,
    quietHours: false,
    advanced: false
  });

  // Fetch connection status and preferences
  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await slackService.getConnectionStatus();
      setConnectionStatus(data);
      if (data.connected && data.preferences) {
        setPreferences(data.preferences);
      }
    } catch (error) {
      console.error('Failed to fetch Slack status:', error);
      if (error.response?.status !== 404) {
        toast.error('Failed to load Slack settings');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    
    // Check for OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast.success(`Connected to Slack workspace: ${params.get('team')}`);
      window.history.replaceState({}, '', window.location.pathname);
      fetchStatus();
    } else if (params.get('error')) {
      toast.error(`Slack connection failed: ${params.get('error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchStatus]);

  // Connect to Slack
  const handleConnect = async () => {
    try {
      const { data } = await slackService.getOAuthUrl();
      window.location.href = data.url;
    } catch (error) {
      console.error('Failed to get OAuth URL:', error);
      toast.error('Failed to initiate Slack connection');
    }
  };

  // Disconnect from Slack
  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect from Slack?')) return;
    
    try {
      await slackService.disconnect();
      setConnectionStatus({ connected: false });
      setPreferences({});
      toast.success('Disconnected from Slack');
    } catch (error) {
      console.error('Failed to disconnect:', error);
      toast.error('Failed to disconnect from Slack');
    }
  };

  // Update preference
  const handlePreferenceChange = async (key, value) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);
    
    try {
      setSaving(true);
      await slackService.updatePreferences({ [key]: value });
    } catch (error) {
      console.error('Failed to save preference:', error);
      toast.error('Failed to save preference');
      setPreferences(preferences); // Revert on error
    } finally {
      setSaving(false);
    }
  };

  // Send test notification
  const handleTestNotification = async () => {
    try {
      setTesting(true);
      await slackService.sendTestNotification();
      toast.success('Test notification sent! Check your Slack.');
    } catch (error) {
      console.error('Failed to send test notification:', error);
      toast.error('Failed to send test notification');
    } finally {
      setTesting(false);
    }
  };

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow">
            <SlackLogo size={32} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Slack Integration
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Get notified in Slack and manage tasks without leaving chat
            </p>
          </div>
        </div>
        
        {connectionStatus?.connected && (
          <button
            onClick={fetchStatus}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Connection Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`p-6 rounded-xl border-2 ${
          connectionStatus?.connected
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}
      >
        {connectionStatus?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    Connected to {connectionStatus.workspace.teamName}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Signed in as @{connectionStatus.slackUser.slackUsername}
                  </p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                <Unlink className="w-4 h-4" />
                Disconnect
              </button>
            </div>
            
            {/* Quick Actions */}
            <div className="flex items-center gap-3 pt-4 border-t border-green-200 dark:border-green-800">
              <button
                onClick={handleTestNotification}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                {testing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Send Test Notification
              </button>
              
              <a
                href={`https://slack.com/app_redirect?channel=${connectionStatus.slackUser.slackUserId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                Open in Slack
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <SlackLogo size={40} />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Connect to Slack
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Receive task notifications, manage tasks, and collaborate with your team directly in Slack.
            </p>
            <button
              onClick={handleConnect}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#4A154B] hover:bg-[#611f69] text-white font-medium rounded-lg transition-colors"
            >
              <SlackLogo size={20} className="brightness-0 invert" />
              Add to Slack
            </button>
          </div>
        )}
      </motion.div>

      {/* Preferences (only show when connected) */}
      {connectionStatus?.connected && (
        <div className="space-y-4">
          {/* General Settings */}
          <PreferenceSection
            title="General"
            icon={<Settings className="w-5 h-5" />}
            expanded={expandedSections.general}
            onToggle={() => toggleSection('general')}
          >
            <PreferenceToggle
              label="Enable Slack Notifications"
              description="Receive FlowTask notifications in Slack"
              checked={preferences.notificationsEnabled !== false}
              onChange={(v) => handlePreferenceChange('notificationsEnabled', v)}
              disabled={saving}
            />
            <PreferenceToggle
              label="Direct Messages"
              description="Receive notifications as DMs instead of channel posts"
              checked={preferences.directMessageEnabled !== false}
              onChange={(v) => handlePreferenceChange('directMessageEnabled', v)}
              disabled={saving}
            />
          </PreferenceSection>

          {/* Notification Types */}
          <PreferenceSection
            title="Notification Types"
            icon={<Bell className="w-5 h-5" />}
            expanded={expandedSections.notifications}
            onToggle={() => toggleSection('notifications')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PreferenceToggle
                label="Task Assignments"
                checked={preferences.taskAssigned !== false}
                onChange={(v) => handlePreferenceChange('taskAssigned', v)}
                disabled={saving}
              />
              <PreferenceToggle
                label="Task Updates"
                checked={preferences.taskUpdated !== false}
                onChange={(v) => handlePreferenceChange('taskUpdated', v)}
                disabled={saving}
              />
              <PreferenceToggle
                label="Task Completions"
                checked={preferences.taskCompleted !== false}
                onChange={(v) => handlePreferenceChange('taskCompleted', v)}
                disabled={saving}
              />
              <PreferenceToggle
                label="Overdue Alerts"
                checked={preferences.taskOverdue !== false}
                onChange={(v) => handlePreferenceChange('taskOverdue', v)}
                disabled={saving}
              />
              <PreferenceToggle
                label="Due Soon Reminders"
                checked={preferences.taskDueSoon !== false}
                onChange={(v) => handlePreferenceChange('taskDueSoon', v)}
                disabled={saving}
              />
              <PreferenceToggle
                label="New Comments"
                checked={preferences.commentAdded !== false}
                onChange={(v) => handlePreferenceChange('commentAdded', v)}
                disabled={saving}
              />
              <PreferenceToggle
                label="Mentions"
                checked={preferences.commentMention !== false}
                onChange={(v) => handlePreferenceChange('commentMention', v)}
                disabled={saving}
              />
              <PreferenceToggle
                label="Subtask Updates"
                checked={preferences.subtaskUpdates !== false}
                onChange={(v) => handlePreferenceChange('subtaskUpdates', v)}
                disabled={saving}
              />
              <PreferenceToggle
                label="Project Updates"
                checked={preferences.projectUpdates !== false}
                onChange={(v) => handlePreferenceChange('projectUpdates', v)}
                disabled={saving}
              />
              <PreferenceToggle
                label="Announcements"
                checked={preferences.announcements !== false}
                onChange={(v) => handlePreferenceChange('announcements', v)}
                disabled={saving}
              />
            </div>
          </PreferenceSection>

          {/* Digest Settings */}
          <PreferenceSection
            title="Digest Settings"
            icon={<Calendar className="w-5 h-5" />}
            expanded={expandedSections.digest}
            onToggle={() => toggleSection('digest')}
          >
            <PreferenceToggle
              label="Enable Daily/Weekly Digest"
              description="Get a summary of your tasks and activities"
              checked={preferences.digestEnabled === true}
              onChange={(v) => handlePreferenceChange('digestEnabled', v)}
              disabled={saving}
            />
            {preferences.digestEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Frequency
                  </label>
                  <select
                    value={preferences.digestFrequency || 'daily'}
                    onChange={(e) => handlePreferenceChange('digestFrequency', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    disabled={saving}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    value={preferences.digestTime || '09:00'}
                    onChange={(e) => handlePreferenceChange('digestTime', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    disabled={saving}
                  />
                </div>
              </div>
            )}
          </PreferenceSection>

          {/* Quiet Hours */}
          <PreferenceSection
            title="Quiet Hours"
            icon={<Moon className="w-5 h-5" />}
            expanded={expandedSections.quietHours}
            onToggle={() => toggleSection('quietHours')}
          >
            <PreferenceToggle
              label="Enable Quiet Hours"
              description="Pause notifications during specific hours"
              checked={preferences.quietHoursEnabled === true}
              onChange={(v) => handlePreferenceChange('quietHoursEnabled', v)}
              disabled={saving}
            />
            {preferences.quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={preferences.quietHoursStart || '22:00'}
                    onChange={(e) => handlePreferenceChange('quietHoursStart', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={preferences.quietHoursEnd || '08:00'}
                    onChange={(e) => handlePreferenceChange('quietHoursEnd', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                    disabled={saving}
                  />
                </div>
              </div>
            )}
          </PreferenceSection>

          {/* Advanced Settings */}
          <PreferenceSection
            title="Advanced"
            icon={<Zap className="w-5 h-5" />}
            expanded={expandedSections.advanced}
            onToggle={() => toggleSection('advanced')}
          >
            <PreferenceToggle
              label="Batch Similar Notifications"
              description="Group similar notifications to reduce noise"
              checked={preferences.batchingEnabled === true}
              onChange={(v) => handlePreferenceChange('batchingEnabled', v)}
              disabled={saving}
            />
            <PreferenceToggle
              label="Thread Related Notifications"
              description="Reply in threads for related task updates"
              checked={preferences.preferThreadedReplies !== false}
              onChange={(v) => handlePreferenceChange('preferThreadedReplies', v)}
              disabled={saving}
            />
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Minimum Priority Level
              </label>
              <select
                value={preferences.minPriorityLevel || 'all'}
                onChange={(e) => handlePreferenceChange('minPriorityLevel', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                disabled={saving}
              >
                <option value="all">All priorities</option>
                <option value="low">Low and above</option>
                <option value="medium">Medium and above</option>
                <option value="high">High and above</option>
                <option value="critical">Critical only</option>
              </select>
            </div>
          </PreferenceSection>
        </div>
      )}

      {/* Features Showcase (when not connected) */}
      {!connectionStatus?.connected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            icon={<Bell className="w-6 h-6 text-blue-500" />}
            title="Smart Notifications"
            description="Get task updates, assignments, and mentions right in Slack"
          />
          <FeatureCard
            icon={<Zap className="w-6 h-6 text-yellow-500" />}
            title="Quick Actions"
            description="Complete tasks, change status, and reply to comments without leaving Slack"
          />
          <FeatureCard
            icon={<BarChart2 className="w-6 h-6 text-green-500" />}
            title="App Home Dashboard"
            description="View your tasks, deadlines, and stats in Slack's App Home"
          />
        </div>
      )}
    </div>
  );
};

// Preference Section Component
const PreferenceSection = ({ title, icon, expanded, onToggle, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
  >
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300">
          {icon}
        </div>
        <span className="font-medium text-gray-900 dark:text-white">{title}</span>
      </div>
      <motion.div
        animate={{ rotate: expanded ? 90 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </motion.div>
    </button>
    <AnimatePresence>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="border-t border-gray-200 dark:border-gray-700"
        >
          <div className="p-4 space-y-4">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
);

// Preference Toggle Component
const PreferenceToggle = ({ label, description, checked, onChange, disabled }) => (
  <label className="flex items-start gap-3 cursor-pointer group">
    <div className="relative mt-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only"
      />
      <div className={`w-10 h-6 rounded-full transition-colors ${
        checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}>
        <motion.div
          animate={{ x: checked ? 16 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="w-5 h-5 bg-white rounded-full shadow-sm mt-0.5"
        />
      </div>
    </div>
    <div className="flex-1">
      <span className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-500 transition-colors">
        {label}
      </span>
      {description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {description}
        </p>
      )}
    </div>
  </label>
);

// Feature Card Component
const FeatureCard = ({ icon, title, description }) => (
  <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
    <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-3">
      {icon}
    </div>
    <h3 className="font-medium text-gray-900 dark:text-white mb-1">{title}</h3>
    <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
  </div>
);

export default SlackSettings;
