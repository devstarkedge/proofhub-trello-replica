import React, { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  Settings as SettingsIcon, Moon, Sun, Monitor, Bell, BellOff,
  Shield, Eye, EyeOff, Lock, Save, Loader2, CheckCircle,
  XCircle, Palette, Globe, UserCheck, Activity
} from 'lucide-react';
import api from '../services/api';
import AuthContext from '../context/AuthContext';
import NotificationContext from '../context/NotificationContext';
import Header from '../components/Header';
import Loading from '../components/Loading';
import { validateField, validatePasswordMatch, validateForm, validationRules } from '../utils/validationUtils';

const Settings = () => {
  const { user, setUser } = useContext(AuthContext);
  const { pushSupported, pushEnabled, enablePushNotifications, disablePushNotifications } = useContext(NotificationContext);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsData, setSettingsData] = useState({
    notifications: {
      email: true,
      push: true,
      taskAssigned: true,
      taskUpdated: true,
      commentMention: true,
      projectUpdates: true,
      taskDeleted: true,
      userCreated: true
    },
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await api.get('/api/users/profile');
      const userData = response.data.data;
      if (userData.settings) {
        setSettingsData(prev => ({
          ...prev,
          notifications: { ...prev.notifications, ...userData.settings.notifications }
        }));
      }
    } catch (error) {
      toast.error('Failed to load settings');
      console.error('Settings fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const validatePasswordForm = () => {
    const fieldsToValidate = ['currentPassword', 'newPassword', 'confirmPassword'];
    const { isValid, errors: validationErrors } = validateForm(settingsData, fieldsToValidate);

    // Additional validation for password matching
    if (settingsData.newPassword && settingsData.confirmPassword) {
      const matchError = validatePasswordMatch(settingsData.newPassword, settingsData.confirmPassword);
      if (matchError) {
        validationErrors.confirmPassword = matchError;
      }
    }

    // Check if new password is same as current password
    if (settingsData.newPassword && settingsData.currentPassword && settingsData.newPassword === settingsData.currentPassword) {
      validationErrors.newPassword = 'New password cannot be the same as current password';
    }

    setErrors(validationErrors);
    return isValid && Object.keys(validationErrors).length === 0;
  };

  const handleSettingChange = (category, field, value) => {
    setSettingsData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handlePasswordChange = (field, value) => {
    setSettingsData(prev => ({ ...prev, [field]: value }));

    // Real-time validation
    const error = validateField(field, value);
    setErrors(prev => ({ ...prev, [field]: error }));

    // Additional real-time password matching validation
    if (field === 'confirmPassword' || field === 'newPassword') {
      const newPassword = field === 'newPassword' ? value : settingsData.newPassword;
      const confirmPassword = field === 'confirmPassword' ? value : settingsData.confirmPassword;
      if (newPassword && confirmPassword) {
        const matchError = validatePasswordMatch(newPassword, confirmPassword);
        setErrors(prev => ({ ...prev, confirmPassword: matchError }));
      }
    }
  };

  const handleSaveSettings = async () => {
    if (!validatePasswordForm()) return;

    setSaving(true);
    try {
      const updateData = {
        notifications: settingsData.notifications
      };

      if (settingsData.newPassword) {
        updateData.currentPassword = settingsData.currentPassword;
        updateData.newPassword = settingsData.newPassword;
      }

      const response = await api.put('/api/users/settings', updateData);
      const updatedUser = response.data.data;

      // Update context
      setUser && setUser(prev => ({ ...prev, settings: updatedUser.settings }));

      // Clear password fields
      setSettingsData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));

      toast.success('Settings updated successfully!');
    } catch (error) {
      console.error('Settings update error:', error);
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else {
        toast.error('Failed to update settings');
      }
    } finally {
      setSaving(false);
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
          <Loading size="lg" text="Loading settings..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
            <p className="text-gray-600">Customize your experience and manage your preferences</p>
          </div>

          <div className="space-y-6">
            {/* Password Settings - Moved to top */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <Lock className="text-red-600" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Password</h3>
                  <p className="text-sm text-gray-600">Update your password to keep your account secure</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Current Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      value={settingsData.currentPassword}
                      onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                      className={`w-full pl-4 pr-10 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        errors.currentPassword ? 'border-red-300 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('current')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.current ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {errors.currentPassword && (
                    <p className="text-sm text-red-600 mt-1">{errors.currentPassword}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.new ? 'text' : 'password'}
                      value={settingsData.newPassword}
                      onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                      className={`w-full pl-4 pr-10 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        errors.newPassword ? 'border-red-300 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('new')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.new ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {errors.newPassword && (
                    <p className="text-sm text-red-600 mt-1">{errors.newPassword}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={settingsData.confirmPassword}
                      onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                      className={`w-full pl-4 pr-10 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        errors.confirmPassword ? 'border-red-300 bg-red-50' : 'border-gray-300'
                      }`}
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('confirm')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.confirm ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-red-600 mt-1">{errors.confirmPassword}</p>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Notification Settings */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Bell className="text-blue-600" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
                  <p className="text-sm text-gray-600">Choose what notifications you want to receive</p>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  { key: 'email', label: 'Email Notifications', desc: 'Receive notifications via email' },
                  { key: 'push', label: 'Push Notifications', desc: pushSupported ? (pushEnabled ? 'Push notifications are enabled' : 'Click to enable push notifications') : 'Push notifications not supported in this browser', action: pushSupported ? (pushEnabled ? disablePushNotifications : enablePushNotifications) : null, state: pushEnabled },
                  { key: 'taskAssigned', label: 'Task Assignments', desc: 'When tasks are assigned to you' },
                  { key: 'taskUpdated', label: 'Task Updates', desc: 'When assigned tasks are updated' },
                  { key: 'taskDeleted', label: 'Task Deletions', desc: 'When tasks are deleted' },
                  { key: 'userCreated', label: 'New User Creations', desc: 'When new users are created' },
                  { key: 'commentMention', label: 'Mentions', desc: 'When someone mentions you in comments' },
                  { key: 'projectUpdates', label: 'Project Updates', desc: 'Updates on projects you\'re involved in' }
                ].map(({ key, label, desc, action, state }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{label}</p>
                      <p className="text-sm text-gray-600">{desc}</p>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={action || (() => handleSettingChange('notifications', key, !settingsData.notifications[key]))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        (state !== undefined ? state : settingsData.notifications[key]) ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          (state !== undefined ? state : settingsData.notifications[key]) ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </motion.button>
                  </div>
                ))}

                {/* Test Notification Button */}
                <div className="pt-4 border-t border-gray-200">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={async () => {
                      try {
                        const response = await api.post('/api/notifications/test');
                        toast.success('Test notification sent! Check your notifications.');
                      } catch (error) {
                        toast.error('Failed to send test notification');
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Bell size={16} />
                    Send Test Notification
                  </motion.button>
                </div>
              </div>
            </motion.div>



            {/* Save Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="flex justify-end"
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveSettings}
                disabled={saving}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Save size={20} />
                )}
                {saving ? 'Saving...' : 'Save All Settings'}
              </motion.button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Settings;
