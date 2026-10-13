import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Save, Eye, EyeOff, Bell, BellOff, AlertTriangle,
  Lock, Globe, Columns, Filter, SortAsc,
  Zap, Clock, Mail, Volume2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import useSalesStore from '../../store/salesStore';

const ALERT_RULE_TYPES = [
  { type: 'new_row', label: 'New matching row added', icon: Zap },
  { type: 'status_changed', label: 'Status changed', icon: AlertTriangle },
  { type: 'budget_increased', label: 'Budget increased', icon: AlertTriangle },
  { type: 'rating_improved', label: 'Rating improved', icon: AlertTriangle },
  { type: 'dead_to_active', label: 'Dead lead became active', icon: Zap },
  { type: 'followup_overdue', label: 'Follow-up overdue', icon: Clock },
  { type: 'no_response_days', label: 'No response for X days', icon: Clock },
];

const FREQUENCY_OPTIONS = [
  { value: 'instant', label: 'Instant' },
  { value: '15min', label: 'Every 15 min' },
  { value: 'hourly', label: 'Hourly digest' },
  { value: 'daily', label: 'Daily summary' },
];

const CHANNEL_OPTIONS = [
  { value: 'in_app', label: 'In-app toast', icon: Volume2 },
  { value: 'notification_center', label: 'Notification center', icon: Bell },
  { value: 'email', label: 'Email digest', icon: Mail },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-gray-500' },
  { value: 'medium', label: 'Medium', color: 'text-amber-500' },
  { value: 'urgent', label: 'Urgent', color: 'text-red-500' },
];

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', icon: Lock, desc: 'Only you' },
  { value: 'public', label: 'Public', icon: Globe, desc: 'Requires admin approval' },
];

const SaveTabModal = ({ isOpen, onClose, editingTab = null }) => {
  const {
    filters, sortBy, sortOrder, columnFilters,
    savedTabs, createSavedTab, updateSavedTab,
  } = useSalesStore();

  const mode = editingTab ? 'edit' : 'create';
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [isWatchTab, setIsWatchTab] = useState(false);
  const [alertRules, setAlertRules] = useState([]);
  const [alertFrequency, setAlertFrequency] = useState('instant');
  const [alertChannels, setAlertChannels] = useState(['in_app', 'notification_center']);
  const [alertPriority, setAlertPriority] = useState('medium');
  const [noResponseDays, setNoResponseDays] = useState(7);

  // Filter snapshot (editable preview)
  const [tabFilters, setTabFilters] = useState({});
  const [tabSorting, setTabSorting] = useState({ sortBy: 'date', sortOrder: 'desc' });

  // Initialize from editing tab or current view
  useEffect(() => {
    if (editingTab) {
      setName(editingTab.name || '');
      setVisibility(editingTab.visibility || 'private');
      setIsWatchTab(editingTab.isWatchTab || false);
      setAlertRules((editingTab.alertRules || []).map((r) => r.type));
      setAlertFrequency(editingTab.alertFrequency || 'instant');
      setAlertChannels(editingTab.alertChannels || ['in_app', 'notification_center']);
      setAlertPriority(editingTab.alertPriority || 'medium');
      setTabFilters(editingTab.filters || {});
      setTabSorting(editingTab.sorting || { sortBy: 'date', sortOrder: 'desc' });

      const noRespRule = (editingTab.alertRules || []).find((r) => r.type === 'no_response_days');
      if (noRespRule?.config?.days) setNoResponseDays(noRespRule.config.days);
    } else {
      // Snapshot current view state
      setTabFilters({ ...filters, columnFilters: { ...columnFilters } });
      setTabSorting({ sortBy, sortOrder });
    }
  }, [editingTab, filters, sortBy, sortOrder, columnFilters]);

  // Real-time name validation
  const nameError = useMemo(() => {
    if (!name.trim()) return '';
    if (name.trim().length > 30) return 'Max 30 characters';
    const exists = savedTabs.some(
      (t) =>
        t.name && t.name.toLowerCase() === name.trim().toLowerCase() &&
        (!editingTab || t._id !== editingTab._id)
    );
    if (exists) return 'Name already exists';
    return '';
  }, [name, savedTabs, editingTab]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    const f = tabFilters;
    if (f.search) count++;
    if (f.name) count++;
    if (f.platform) count++;
    if (f.technology) count++;
    if (f.status) count++;
    if (f.location) count++;
    if (f.minRating != null) count++;
    if (f.minHireRate != null) count++;
    if (f.budget) count++;
    if (f.profile) count++;
    if (f.dateFrom) count++;
    if (f.dateTo) count++;
    if (f.replyFromClient) count++;
    if (f.followUps) count++;
    if (f.bidType) count++;
    if (f.bidDomain) count++;
    if (f.columnFilters) count += Object.keys(f.columnFilters).filter((k) => f.columnFilters[k]).length;
    return count;
  }, [tabFilters]);

  const toggleAlertRule = (type) => {
    setAlertRules((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleChannel = (ch) => {
    setAlertChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const removeFilter = (key) => {
    setTabFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Tab name is required');
      return;
    }
    if (nameError) {
      toast.error(nameError);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        filters: tabFilters,
        sorting: tabSorting,
        search: tabFilters.search || '',
        visibility,
        isWatchTab,
        ...(isWatchTab && {
          alertRules: alertRules.map((type) => ({
            type,
            config: type === 'no_response_days' ? { days: noResponseDays } : {},
          })),
          alertFrequency,
          alertChannels,
          alertPriority,
        }),
      };

      if (mode === 'edit') {
        await updateSavedTab(editingTab._id, payload);
        toast.success('Tab updated');
      } else {
        await createSavedTab(payload);
        toast.success('Tab saved');
      }
      onClose();
    } catch (error) {
      console.error('Save tab error:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg max-h-[90vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-600">
            <h2 className="text-lg font-bold text-white">
              {mode === 'edit' ? 'Edit Saved Tab' : 'Save as Tab'}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 overflow-y-auto max-h-[calc(90vh-140px)] space-y-6">
            {/* 1. Tab Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Tab Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                placeholder="e.g. High Budget Shopify USA"
                className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-colors
                  ${nameError
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                    : 'border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-200'
                  }
                  dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2`}
              />
              <div className="flex justify-between mt-1">
                {nameError && (
                  <p className="text-xs text-red-500">{nameError}</p>
                )}
                <p className="text-xs text-gray-400 ml-auto">{name.length}/30</p>
              </div>
            </div>

            {/* 2. Active Filters Preview */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Saved Filters
                </span>
                {activeFilterCount > 0 && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                    {activeFilterCount} active
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(tabFilters).map(([key, value]) => {
                  if (!value || key === 'columnFilters') return null;
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium"
                    >
                      <span className="text-gray-500 dark:text-gray-400">{key}:</span>
                      <span className="truncate max-w-[120px]">{String(value)}</span>
                      <button
                        onClick={() => removeFilter(key)}
                        className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
                {activeFilterCount === 0 && (
                  <p className="text-xs text-gray-400 italic">No filters active</p>
                )}
              </div>
            </div>

            {/* 3. Sorting Preview */}
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <SortAsc className="w-4 h-4" />
              <span>Sort: <strong>{tabSorting.sortBy}</strong> ({tabSorting.sortOrder})</span>
            </div>

            {/* 4. Visibility */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Visibility
              </label>
              <div className="grid grid-cols-3 gap-2">
                {VISIBILITY_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setVisibility(opt.value)}
                      className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border-2 transition-all text-xs font-medium ${
                        visibility === opt.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{opt.label}</span>
                      <span className="text-[10px] text-gray-400">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
              {visibility !== 'private' && (
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Shared tabs require admin approval
                </p>
              )}
            </div>

            {/* 5. Watch Tab Toggle */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Enable Watch Tab Alerts
                  </span>
                </div>
                <div
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    isWatchTab ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  onClick={() => setIsWatchTab(!isWatchTab)}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      isWatchTab ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </div>
              </label>
              <p className="text-xs text-gray-400 mt-1">
                Get notified when new records match this tab's filters
              </p>
            </div>

            {/* 6. Alert Config (shown when watch enabled) */}
            <AnimatePresence>
              {isWatchTab && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  {/* Alert Conditions */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      Alert Conditions
                    </label>
                    <div className="space-y-1.5">
                      {ALERT_RULE_TYPES.map((rule) => {
                        const Icon = rule.icon;
                        return (
                          <label
                            key={rule.type}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={alertRules.includes(rule.type)}
                              onChange={() => toggleAlertRule(rule.type)}
                              className="w-4 h-4 text-amber-500 rounded border-gray-300 dark:border-gray-600 focus:ring-amber-400"
                            />
                            <Icon className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{rule.label}</span>
                            {rule.type === 'no_response_days' && alertRules.includes('no_response_days') && (
                              <input
                                type="number"
                                value={noResponseDays}
                                onChange={(e) => setNoResponseDays(Math.max(1, parseInt(e.target.value) || 7))}
                                className="w-14 ml-auto px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md"
                                min={1}
                                max={90}
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Delivery Channels */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      Delivery
                    </label>
                    <div className="flex gap-2">
                      {CHANNEL_OPTIONS.map((ch) => {
                        const Icon = ch.icon;
                        return (
                          <button
                            key={ch.value}
                            type="button"
                            onClick={() => toggleChannel(ch.value)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                              alertChannels.includes(ch.value)
                                ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                : 'border-gray-200 dark:border-gray-600 text-gray-500'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {ch.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      Frequency
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {FREQUENCY_OPTIONS.map((freq) => (
                        <button
                          key={freq.value}
                          type="button"
                          onClick={() => setAlertFrequency(freq.value)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                            alertFrequency === freq.value
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                              : 'border-gray-200 dark:border-gray-600 text-gray-500'
                          }`}
                        >
                          {freq.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                      Priority
                    </label>
                    <div className="flex gap-2">
                      {PRIORITY_OPTIONS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setAlertPriority(p.value)}
                          className={`px-4 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                            alertPriority === p.value
                              ? `border-current ${p.color} bg-gray-50 dark:bg-gray-700`
                              : 'border-gray-200 dark:border-gray-600 text-gray-500'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Editing metadata */}
            {editingTab && (
              <div className="text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3">
                Added by <strong>{editingTab.ownerName}</strong>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim() || !!nameError}
              className={`relative px-5 py-2 text-sm font-semibold text-white rounded-xl transition-all
                ${saving || !name.trim() || nameError
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25'
                }`}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Save className="w-4 h-4" />
                  {mode === 'edit' ? 'Update Tab' : 'Save Tab'}
                </span>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default SaveTabModal;
