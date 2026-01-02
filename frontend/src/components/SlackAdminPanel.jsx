/**
 * Slack Admin Panel Component
 * Admin-level Slack workspace management
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  Settings, Users, BarChart2, Activity, AlertTriangle,
  CheckCircle, XCircle, RefreshCw, Loader2, Hash,
  Building, Users2, Bell, Clock, Zap, Shield,
  TrendingUp, TrendingDown, ChevronDown, ExternalLink
} from 'lucide-react';
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

const SlackAdminPanel = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [workspaceSettings, setWorkspaceSettings] = useState(null);
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [queueStats, setQueueStats] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, healthRes] = await Promise.all([
        slackService.getWorkspaceSettings().catch(() => null),
        slackService.getHealthStatus().catch(() => null)
      ]);

      if (settingsRes?.data) {
        setWorkspaceSettings(settingsRes.data);
      }
      if (healthRes?.data) {
        setHealthStatus(healthRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch Slack admin data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch analytics
  const fetchAnalytics = useCallback(async () => {
    try {
      const [analyticsRes, queueRes] = await Promise.all([
        slackService.getAnalytics('daily', 30),
        slackService.getQueueStats()
      ]);
      setAnalytics(analyticsRes.data);
      setQueueStats(queueRes.data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      const res = await slackService.getWorkspaceUsers(1, 50);
      setUsers(res.data.users || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalytics();
    } else if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab, fetchAnalytics, fetchUsers]);

  // Update workspace setting
  const handleSettingChange = async (key, value) => {
    try {
      setSaving(true);
      await slackService.updateWorkspaceSettings({ [key]: value });
      setWorkspaceSettings(prev => ({
        ...prev,
        settings: { ...prev.settings, [key]: value }
      }));
      toast.success('Setting updated');
    } catch (error) {
      console.error('Failed to update setting:', error);
      toast.error('Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!workspaceSettings) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <SlackLogo size={40} />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Slack Workspace Connected
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Connect your Slack workspace from the Settings page first.
        </p>
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
              Slack Admin Panel
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {workspaceSettings.teamName} • Workspace Management
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <StatusBadge status={healthStatus?.status} />
          <button
            onClick={fetchData}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        {[
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'settings', label: 'Settings', icon: Settings },
          { id: 'users', label: 'Users', icon: Users },
          { id: 'analytics', label: 'Analytics', icon: BarChart2 }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <OverviewTab 
            workspace={workspaceSettings} 
            health={healthStatus}
            queues={queueStats}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab 
            settings={workspaceSettings.settings}
            onChange={handleSettingChange}
            saving={saving}
          />
        )}
        {activeTab === 'users' && (
          <UsersTab users={users} />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab analytics={analytics} />
        )}
      </AnimatePresence>
    </div>
  );
};

// Overview Tab
const OverviewTab = ({ workspace, health, queues }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
  >
    <StatCard
      label="Workspace Status"
      value={workspace.isActive ? 'Active' : 'Inactive'}
      icon={<CheckCircle className={`w-5 h-5 ${workspace.isActive ? 'text-green-500' : 'text-red-500'}`} />}
      color={workspace.isActive ? 'green' : 'red'}
    />
    <StatCard
      label="Health Status"
      value={health?.status || 'Unknown'}
      icon={<Activity className="w-5 h-5 text-blue-500" />}
      color="blue"
    />
    <StatCard
      label="Queued Messages"
      value={queues?.totalPending || 0}
      icon={<Clock className="w-5 h-5 text-yellow-500" />}
      color="yellow"
    />
    <StatCard
      label="Installed Since"
      value={new Date(workspace.installedAt).toLocaleDateString()}
      icon={<SlackLogo size={20} />}
      color="purple"
    />

    {/* Health Details */}
    {health && (
      <div className="col-span-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-medium text-gray-900 dark:text-white mb-4">System Health</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <HealthItem label="API Connection" status={health.apiConnected} />
          <HealthItem label="Queue System" status={health.queueHealthy} />
          <HealthItem label="Database" status={health.dbConnected} />
          <HealthItem label="Rate Limits" status={health.rateLimitOk} />
        </div>
      </div>
    )}

    {/* Queue Status */}
    {queues && (
      <div className="col-span-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-medium text-gray-900 dark:text-white mb-4">Queue Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(queues.queues || {}).map(([name, stats]) => (
            <div key={name} className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.waiting || 0}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {name}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </motion.div>
);

// Settings Tab
const SettingsTab = ({ settings, onChange, saving }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="space-y-6"
  >
    {/* General Settings */}
    <SettingsSection title="General Settings" icon={<Settings className="w-5 h-5" />}>
      <SettingToggle
        label="Notifications Enabled"
        description="Master switch for all Slack notifications"
        checked={settings?.notificationsEnabled !== false}
        onChange={(v) => onChange('notificationsEnabled', v)}
        disabled={saving}
      />
      <SettingToggle
        label="Threaded Notifications"
        description="Group related notifications in threads"
        checked={settings?.threadedNotifications !== false}
        onChange={(v) => onChange('threadedNotifications', v)}
        disabled={saving}
      />
    </SettingsSection>

    {/* Batching Settings */}
    <SettingsSection title="Batching & Performance" icon={<Zap className="w-5 h-5" />}>
      <SettingToggle
        label="Batch Similar Notifications"
        description="Combine similar notifications to reduce noise"
        checked={settings?.batchingEnabled === true}
        onChange={(v) => onChange('batchingEnabled', v)}
        disabled={saving}
      />
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-white">
            Batch Interval
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            How long to wait before sending batched notifications
          </p>
        </div>
        <select
          value={settings?.batchIntervalMinutes || 5}
          onChange={(e) => onChange('batchIntervalMinutes', parseInt(e.target.value))}
          className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          disabled={saving}
        >
          <option value={1}>1 minute</option>
          <option value={5}>5 minutes</option>
          <option value={10}>10 minutes</option>
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
        </select>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-white">
            Max Notifications/Minute
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Rate limit for outgoing notifications
          </p>
        </div>
        <input
          type="number"
          value={settings?.maxNotificationsPerMinute || 60}
          onChange={(e) => onChange('maxNotificationsPerMinute', parseInt(e.target.value))}
          className="w-24 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
          min={10}
          max={300}
          disabled={saving}
        />
      </div>
    </SettingsSection>

    {/* Quiet Hours */}
    <SettingsSection title="Quiet Hours" icon={<Clock className="w-5 h-5" />}>
      <SettingToggle
        label="Enable Quiet Hours"
        description="Pause notifications during specific hours"
        checked={settings?.quietHoursEnabled === true}
        onChange={(v) => onChange('quietHoursEnabled', v)}
        disabled={saving}
      />
      {settings?.quietHoursEnabled && (
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start Time
            </label>
            <input
              type="time"
              value={settings?.quietHoursStart || '22:00'}
              onChange={(e) => onChange('quietHoursStart', e.target.value)}
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
              value={settings?.quietHoursEnd || '08:00'}
              onChange={(e) => onChange('quietHoursEnd', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              disabled={saving}
            />
          </div>
        </div>
      )}
    </SettingsSection>

    {/* Features */}
    <SettingsSection title="Features" icon={<Shield className="w-5 h-5" />}>
      <SettingToggle
        label="Slash Commands"
        description="Enable /mytasks, /overdue, /task commands"
        checked={settings?.slashCommandsEnabled !== false}
        onChange={(v) => onChange('slashCommandsEnabled', v)}
        disabled={saving}
      />
      <SettingToggle
        label="Interactive Actions"
        description="Allow users to interact with notifications"
        checked={settings?.interactiveActionsEnabled !== false}
        onChange={(v) => onChange('interactiveActionsEnabled', v)}
        disabled={saving}
      />
      <SettingToggle
        label="App Home Tab"
        description="Enable the FlowTask App Home dashboard"
        checked={settings?.appHomeEnabled !== false}
        onChange={(v) => onChange('appHomeEnabled', v)}
        disabled={saving}
      />
    </SettingsSection>
  </motion.div>
);

// Users Tab
const UsersTab = ({ users }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
  >
    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
      <h3 className="font-medium text-gray-900 dark:text-white">
        Connected Users ({users.length})
      </h3>
    </div>
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      {users.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          No users connected yet
        </div>
      ) : (
        users.map(user => (
          <div key={user._id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                {user.user?.avatar ? (
                  <img 
                    src={user.user.avatar} 
                    alt={user.user.name}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <Users className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {user.user?.name || 'Unknown User'}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  @{user.slackUsername} • {user.user?.email}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 text-xs rounded-full ${
                user.isActive 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(user.linkedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  </motion.div>
);

// Analytics Tab
const AnalyticsTab = ({ analytics }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="space-y-6"
  >
    {/* Summary Cards */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard
        label="Total Sent"
        value={analytics?.summary?.totalSent || 0}
        icon={<TrendingUp className="w-5 h-5 text-blue-500" />}
        color="blue"
      />
      <StatCard
        label="Delivered"
        value={analytics?.summary?.totalDelivered || 0}
        icon={<CheckCircle className="w-5 h-5 text-green-500" />}
        color="green"
      />
      <StatCard
        label="Interactions"
        value={analytics?.summary?.totalInteractions || 0}
        icon={<Activity className="w-5 h-5 text-purple-500" />}
        color="purple"
      />
      <StatCard
        label="Delivery Rate"
        value={`${((analytics?.summary?.totalDelivered / analytics?.summary?.totalSent) * 100 || 0).toFixed(1)}%`}
        icon={<BarChart2 className="w-5 h-5 text-yellow-500" />}
        color="yellow"
      />
    </div>

    {/* Top Notification Types */}
    {analytics?.topTypes && analytics.topTypes.length > 0 && (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-medium text-gray-900 dark:text-white mb-4">
          Top Notification Types
        </h3>
        <div className="space-y-3">
          {analytics.topTypes.slice(0, 5).map((type, index) => (
            <div key={type._id} className="flex items-center gap-3">
              <span className="w-6 text-sm text-gray-400">{index + 1}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                    {type._id.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm text-gray-500">{type.count}</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full"
                    style={{ 
                      width: `${(type.count / analytics.topTypes[0].count) * 100}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </motion.div>
);

// Helper Components
const StatCard = ({ label, value, icon, color }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      {icon}
    </div>
    <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
  </div>
);

const StatusBadge = ({ status }) => {
  const colors = {
    healthy: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    degraded: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    unhealthy: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  };
  
  return (
    <span className={`px-3 py-1 text-sm font-medium rounded-full ${colors[status] || colors.unhealthy}`}>
      {status || 'Unknown'}
    </span>
  );
};

const HealthItem = ({ label, status }) => (
  <div className="flex items-center gap-2">
    {status ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <XCircle className="w-4 h-4 text-red-500" />
    )}
    <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
  </div>
);

const SettingsSection = ({ title, icon, children }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
    <div className="flex items-center gap-2 mb-4">
      <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300">
        {icon}
      </div>
      <h3 className="font-medium text-gray-900 dark:text-white">{title}</h3>
    </div>
    <div className="space-y-4">
      {children}
    </div>
  </div>
);

const SettingToggle = ({ label, description, checked, onChange, disabled }) => (
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

export default SlackAdminPanel;
