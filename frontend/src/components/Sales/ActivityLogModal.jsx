import React, { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, Lock, Unlock, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { getActivityLog } from '../../services/salesApi';
import Avatar from '../Avatar';
import { format } from 'date-fns';

const ActivityLogModal = ({ isOpen, onClose, rowId }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && rowId) {
      fetchLogs();
    }
  }, [isOpen, rowId]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getActivityLog(rowId);
      setLogs(response.data || []);
    } catch (err) {
      setError('Failed to load activity logs');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'created':
        return <Plus className="w-4 h-4 text-white" />;
      case 'updated':
        return <Edit2 className="w-4 h-4 text-white" />;
      case 'deleted':
        return <Trash2 className="w-4 h-4 text-white" />;
      case 'locked':
        return <Lock className="w-4 h-4 text-white" />;
      case 'unlocked':
        return <Unlock className="w-4 h-4 text-white" />;
      default:
        return <Clock className="w-4 h-4 text-white" />;
    }
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'created':
        return 'bg-emerald-500';
      case 'updated':
        return 'bg-blue-500';
      case 'deleted':
        return 'bg-red-500';
      case 'locked':
        return 'bg-amber-500';
      case 'unlocked':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  const isIsoDateString = (val) => {
    if (typeof val !== 'string') return false;
    // quick check for ISO-like strings
    return /\d{4}-\d{2}-\d{2}T/.test(val) || (!Number.isNaN(Date.parse(val)) && val.indexOf('T') !== -1);
  };

  const renderChangeValue = (val) => {
    if (val === null || val === undefined) {
      return <span className="italic text-gray-400">Empty</span>;
    }

    if (isIsoDateString(val)) {
      const dt = new Date(val);
      if (!Number.isNaN(dt.getTime())) {
        return (
          <span title={dt.toString()}>{format(dt, 'EEE, MMM d, yyyy h:mm a')}</span>
        );
      }
    }

    return String(val);
  };

  const formatInlineText = (text) => {
    if (!text || typeof text !== 'string') return text;
    const regex = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)|([A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{4}\s\d{2}:\d{2}:\d{2}\sGMT[+\-]\d{4}\s\([^)]+\))/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const matched = match[0];
      const idx = match.index;
      if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
      const dt = new Date(matched);
      const friendly = !Number.isNaN(dt.getTime()) ? format(dt, 'EEE, MMM d, yyyy h:mm a') : matched;
      parts.push(
        <span key={idx} title={matched} className="font-medium text-gray-700 dark:text-gray-200">
          {friendly}
        </span>
      );
      lastIndex = idx + matched.length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return <>{parts.map((p, i) => (typeof p === 'string' ? <span key={i}>{p}</span> : p))}</>;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Activity Log</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              History of changes for this record
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-500 dark:text-gray-400">Loading history...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <p className="text-red-500 font-medium">{error}</p>
              <button 
                onClick={fetchLogs}
                className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors pointer-events-auto"
              >
                Try Again
              </button>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <div className="bg-gray-100 dark:bg-gray-700/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Activity Yet</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                No changes have been recorded for this item. Future updates will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent dark:before:via-gray-700">
              {logs.map((log) => (
                <div key={log._id} className="relative flex group">
                  {/* Timeline Node */}
                  <div className={`absolute left-0 top-1 w-10 h-10 rounded-full flex items-center justify-center border-4 border-white dark:border-gray-800 shadow-sm z-10 ${getActionColor(log.action)}`}>
                    {getActionIcon(log.action)}
                  </div>

                  {/* Content Card */}
                  <div className="ml-16 flex-1">
                    <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg border border-gray-100 dark:border-gray-700 p-4 transition-all hover:bg-white dark:hover:bg-gray-700 hover:shadow-md hover:border-gray-200 dark:hover:border-gray-600">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <Avatar 
                            src={log.user?.avatar} 
                            name={log.user?.name || 'Unknown User'} 
                            size="sm"
                          />
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {log.user?.name || 'Unknown User'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {log.user?.email}
                            </p>
                          </div>
                        </div>
                        <time className="text-xs font-medium text-gray-400 whitespace-nowrap bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                          {format(new Date(log.createdAt), 'MMM d, yyyy h:mm a')}
                        </time>
                      </div>

                      <div className="ml-11">
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded uppercase tracking-wider mr-2 ${getActionColor(log.action).replace('bg-', 'bg-').replace('500', '100 text-') + log.action.replace('created', 'emerald-700').replace('updated', 'blue-700').replace('deleted', 'red-700').replace('locked', 'amber-700').replace('unlocked', 'gray-700')}`}>
                            {log.action}
                          </span>
                          {formatInlineText(log.description)}
                        </p>

                        {/* Collapsible Changes */}
                        {log.changes && log.changes.length > 0 && (
                          <div className="mt-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs uppercase text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                  <th className="px-3 py-2 w-1/3">Field</th>
                                  <th className="px-3 py-2 w-1/3">Old Value</th>
                                  <th className="px-3 py-2 w-1/3 text-blue-600 dark:text-blue-400">New Value</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {log.changes.map((change, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                                      {change.fieldLabel}
                                    </td>
                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-500 line-through decoration-red-300 decoration-1">
                                      {renderChangeValue(change.oldValue)}
                                    </td>
                                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100 font-medium">
                                      {renderChangeValue(change.newValue)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
           <button
             onClick={onClose}
             className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors font-medium"
           >
             Close
           </button>
        </div>
      </div>
    </div>
  );
};
export default ActivityLogModal;
