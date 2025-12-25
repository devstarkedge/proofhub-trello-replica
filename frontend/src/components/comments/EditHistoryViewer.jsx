import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, History, Clock, ChevronLeft, ChevronRight, User } from 'lucide-react';
import versionService from '../../services/versionService';

/**
 * EditHistoryViewer - Modal component to view comment edit history
 * Shows previous versions with timestamps and who made the edit
 */
const EditHistoryViewer = ({
  isOpen,
  onClose,
  commentId,
  theme = 'light',
}) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isDark = theme === 'dark';

  // Fetch version history when modal opens
  useEffect(() => {
    if (isOpen && commentId) {
      fetchVersions();
    }
  }, [isOpen, commentId]);

  const fetchVersions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await versionService.getVersionHistory('comment', commentId);
      const versionData = response?.data || response?.versions || [];
      setVersions(versionData);
      setSelectedIndex(0);
    } catch (err) {
      console.error('Error fetching version history:', err);
      setError('Failed to load edit history');
    } finally {
      setLoading(false);
    }
  };

  // Format date
  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get relative time
  const getRelativeTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(date);
  };

  const currentVersion = versions[selectedIndex];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={`relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden ${
            isDark ? 'bg-gray-900' : 'bg-white'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`flex items-center justify-between p-4 border-b ${
            isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                isDark ? 'bg-indigo-900/50' : 'bg-indigo-100'
              }`}>
                <History size={20} className={isDark ? 'text-indigo-400' : 'text-indigo-600'} />
              </div>
              <div>
                <h3 className={`font-semibold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Edit History
                </h3>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {versions.length} version{versions.length !== 1 ? 's' : ''} found
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                isDark 
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                  : 'hover:bg-gray-200 text-gray-500 hover:text-gray-700'
              }`}
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className={`text-center py-12 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                <p>{error}</p>
              </div>
            ) : versions.length === 0 ? (
              <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                <History size={48} className="mx-auto mb-4 opacity-50" />
                <p className="font-medium">No edit history available</p>
                <p className="text-sm mt-1">This comment hasn't been edited yet.</p>
              </div>
            ) : (
              <>
                {/* Version Navigation */}
                <div className={`flex items-center justify-between mb-4 p-3 rounded-lg ${
                  isDark ? 'bg-gray-800' : 'bg-gray-100'
                }`}>
                  <button
                    onClick={() => setSelectedIndex(Math.min(selectedIndex + 1, versions.length - 1))}
                    disabled={selectedIndex >= versions.length - 1}
                    className={`p-2 rounded-lg transition-colors ${
                      selectedIndex >= versions.length - 1
                        ? 'opacity-50 cursor-not-allowed'
                        : isDark
                          ? 'hover:bg-gray-700 text-gray-400'
                          : 'hover:bg-gray-200 text-gray-600'
                    }`}
                    title="Older version"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <div className="text-center">
                    <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      Version {versions.length - selectedIndex} of {versions.length}
                    </p>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {getRelativeTime(currentVersion?.editedAt || currentVersion?.createdAt)}
                    </p>
                  </div>

                  <button
                    onClick={() => setSelectedIndex(Math.max(selectedIndex - 1, 0))}
                    disabled={selectedIndex <= 0}
                    className={`p-2 rounded-lg transition-colors ${
                      selectedIndex <= 0
                        ? 'opacity-50 cursor-not-allowed'
                        : isDark
                          ? 'hover:bg-gray-700 text-gray-400'
                          : 'hover:bg-gray-200 text-gray-600'
                    }`}
                    title="Newer version"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                {/* Version Details */}
                {currentVersion && (
                  <div className={`rounded-xl border overflow-hidden ${
                    isDark ? 'border-gray-700' : 'border-gray-200'
                  }`}>
                    {/* Version Header */}
                    <div className={`flex items-center gap-3 p-3 ${
                      isDark ? 'bg-gray-800/50' : 'bg-gray-50'
                    }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isDark ? 'bg-indigo-600' : 'bg-indigo-100'
                      }`}>
                        {currentVersion.editedBy?.avatar ? (
                          <img 
                            src={currentVersion.editedBy.avatar} 
                            alt={currentVersion.editedBy.name}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <User size={16} className={isDark ? 'text-white' : 'text-indigo-600'} />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {currentVersion.editedBy?.name || 'Unknown user'}
                        </p>
                        <p className={`text-xs flex items-center gap-1 ${
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          <Clock size={12} />
                          {formatDate(currentVersion.editedAt || currentVersion.createdAt)}
                        </p>
                      </div>
                    </div>

                    {/* Version Content */}
                    <div className={`p-4 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                      <div 
                        className={`prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''}`}
                        dangerouslySetInnerHTML={{ 
                          __html: currentVersion.htmlContent || currentVersion.content || '<em>Empty content</em>'
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Version Timeline */}
                <div className="mt-4">
                  <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${
                    isDark ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    All Versions
                  </p>
                  <div className="flex gap-1">
                    {versions.map((version, idx) => (
                      <button
                        key={version._id || idx}
                        onClick={() => setSelectedIndex(idx)}
                        className={`flex-1 h-2 rounded-full transition-all ${
                          idx === selectedIndex
                            ? 'bg-indigo-500'
                            : isDark
                              ? 'bg-gray-700 hover:bg-gray-600'
                              : 'bg-gray-200 hover:bg-gray-300'
                        }`}
                        title={`Version ${versions.length - idx}`}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className={`p-4 border-t ${
            isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
          }`}>
            <button
              onClick={onClose}
              className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                isDark
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EditHistoryViewer;
