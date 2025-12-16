import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  History, 
  RotateCcw, 
  Clock, 
  User, 
  ChevronRight,
  ChevronDown,
  Eye,
  GitCompare,
  Loader,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import versionService from '../services/versionService';
import sanitizeHtml from '../utils/sanitizeHtml';
import { toast } from 'react-toastify';

const VersionHistoryModal = ({ 
  entityType, // 'card_description' | 'comment'
  entityId,
  currentContent,
  onClose,
  onRollback,
  title = 'Version History'
}) => {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [compareVersions, setCompareVersions] = useState({ v1: null, v2: null });
  const [isComparing, setIsComparing] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState(null);

  useEffect(() => {
    loadVersions();
  }, [entityType, entityId]);

  const loadVersions = async (page = 1) => {
    try {
      setLoading(true);
      const result = await versionService.getVersionHistory(entityType, entityId, { page, limit: 10 });
      setVersions(result.data || []);
      setPagination(result.pagination);
    } catch (error) {
      console.error('Failed to load version history:', error);
      toast.error('Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreVersions = async () => {
    if (!pagination?.hasNext) return;
    
    try {
      const result = await versionService.getVersionHistory(entityType, entityId, { 
        page: pagination.currentPage + 1, 
        limit: 10 
      });
      setVersions(prev => [...prev, ...(result.data || [])]);
      setPagination(result.pagination);
    } catch (error) {
      toast.error('Failed to load more versions');
    }
  };

  const handleRollback = async (version) => {
    if (!window.confirm(`Rollback to version ${version.versionNumber}? This will create a new version with the old content.`)) {
      return;
    }

    try {
      setRollbackLoading(true);
      const result = await versionService.rollbackToVersion(entityType, entityId, version.versionNumber);
      toast.success(`Rolled back to version ${version.versionNumber}`);
      // Notify parent - handle both old and new response shapes
      const restored = result?.data?.restoredContent ?? result?.restoredContent ?? result?.data?.restoredHtmlContent ?? result?.restoredHtmlContent ?? null;
      if (restored) onRollback?.(restored);
      
      // Reload versions
      loadVersions();
    } catch (error) {
      toast.error('Rollback failed: ' + error.message);
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleCompare = async () => {
    if (!compareVersions.v1 || !compareVersions.v2) {
      toast.error('Select two versions to compare');
      return;
    }

    try {
      setIsComparing(true);
      const result = await versionService.compareVersions(
        entityType, 
        entityId, 
        compareVersions.v1, 
        compareVersions.v2
      );
      // Show comparison modal or inline comparison
      console.log('Comparison result:', result);
    } catch (error) {
      toast.error('Comparison failed');
    } finally {
      setIsComparing(false);
    }
  };

  const formatDate = useCallback((date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const getChangeTypeLabel = useCallback((changeType) => {
    switch (changeType) {
      case 'created': return { label: 'Created', color: 'bg-green-100 text-green-700' };
      case 'edited': return { label: 'Edited', color: 'bg-blue-100 text-blue-700' };
      case 'rollback': return { label: 'Rollback', color: 'bg-yellow-100 text-yellow-700' };
      default: return { label: 'Modified', color: 'bg-gray-100 text-gray-700' };
    }
  }, []);

  const stripHtml = useCallback((html) => {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }, []);

  const truncateContent = useCallback((content, maxLength = 150) => {
    const text = stripHtml(content);
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }, [stripHtml]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <History size={20} className="text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                <p className="text-sm text-gray-500">
                  {versions.length} version{versions.length !== 1 ? 's' : ''} available
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(80vh-140px)]">
            {loading && versions.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader size={24} className="text-blue-500 animate-spin" />
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <History size={48} className="mb-3 opacity-30" />
                <p>No version history available</p>
                <p className="text-sm mt-1">Changes will be recorded when you edit content</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {/* Current Version */}
                <div className="p-4 bg-gradient-to-r from-blue-50 to-white">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle size={16} className="text-green-500" />
                    <span className="font-medium text-gray-800">Current Version</span>
                  </div>
                  <div className="ml-6 text-sm text-gray-600 line-clamp-2">
                    {truncateContent(currentContent)}
                  </div>
                </div>

                {/* Version list */}
                {versions.map((version, index) => {
                  const changeType = getChangeTypeLabel(version.changeType);
                  const isExpanded = expandedVersionId === version._id;

                  return (
                    <motion.div
                      key={version._id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <div
                        className="p-4 cursor-pointer"
                        onClick={() => setExpandedVersionId(isExpanded ? null : version._id)}
                      >
                        <div className="flex items-start gap-4">
                          {/* Timeline indicator */}
                          <div className="flex flex-col items-center">
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                            {index < versions.length - 1 && (
                              <div className="w-0.5 h-full bg-gray-200 mt-2" />
                            )}
                          </div>

                          {/* Version info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${changeType.color}`}>
                                {changeType.label}
                              </span>
                              <span className="text-sm font-medium text-gray-700">
                                Version {version.versionNumber}
                              </span>
                              <motion.div
                                animate={{ rotate: isExpanded ? 90 : 0 }}
                                className="text-gray-400"
                              >
                                <ChevronRight size={16} />
                              </motion.div>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                              <div className="flex items-center gap-1">
                                <User size={12} />
                                {version.editedBy?.name || 'Unknown'}
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock size={12} />
                                {formatDate(version.editedAt)}
                              </div>
                            </div>

                            {/* Preview */}
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {truncateContent(version.htmlContent || version.content)}
                            </p>

                            {/* Rollback info */}
                            {version.rolledBackFrom && (
                              <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                                <RotateCcw size={12} />
                                Rolled back from v{version.rolledBackFrom} to v{version.rolledBackTo}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVersion(version);
                              }}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Preview version"
                            >
                              <Eye size={16} />
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRollback(version);
                              }}
                              disabled={rollbackLoading}
                              className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Rollback to this version"
                            >
                              <RotateCcw size={16} />
                            </motion.button>
                          </div>
                        </div>

                        {/* Expanded content */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="ml-7 mt-3 pl-4 border-l-2 border-gray-200"
                            >
                              <div className="bg-gray-50 rounded-lg p-4">
                                <p className="text-xs text-gray-500 mb-2">Full content:</p>
                                <div 
                                  className="text-sm text-gray-700 prose prose-sm max-w-none"
                                  dangerouslySetInnerHTML={{ 
                                    __html: sanitizeHtml(version.htmlContent || version.content)
                                  }}
                                />
                              </div>
                              
                              {version.editSummary && (
                                <p className="text-xs text-gray-500 mt-2 italic">
                                  Note: {version.editSummary}
                                </p>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Load more */}
            {pagination?.hasNext && (
              <div className="p-4 text-center">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={loadMoreVersions}
                  className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Load older versions
                </motion.button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">
              Versions are saved automatically when content is edited
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>

        {/* Version Preview Modal */}
        <AnimatePresence>
          {selectedVersion && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"
              onClick={() => setSelectedVersion(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">
                    Version {selectedVersion.versionNumber}
                  </h3>
                  <button
                    onClick={() => setSelectedVersion(null)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[calc(70vh-120px)]">
                  <div className="mb-4 text-sm text-gray-500">
                      <p>Edited by {selectedVersion.editedBy?.name} on {formatDate(selectedVersion.editedAt)}</p>
                  </div>
                    <div 
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ 
                        __html: sanitizeHtml(selectedVersion.htmlContent || selectedVersion.content)
                      }}
                    />
                </div>
                <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
                  <button
                    onClick={() => setSelectedVersion(null)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      handleRollback(selectedVersion);
                      setSelectedVersion(null);
                    }}
                    disabled={rollbackLoading}
                    className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg disabled:opacity-50"
                  >
                    Rollback to this version
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default VersionHistoryModal;
