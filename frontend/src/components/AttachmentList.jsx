import React, { useState, useCallback, useMemo, useRef, useEffect, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Paperclip,
  Download,
  Trash2,
  ExternalLink,
  Eye,
  MoreVertical,
  FileText,
  FileImage,
  FileSpreadsheet,
  Film,
  File,
  CheckSquare,
  Square,
  Star,
  Loader,
  ChevronDown
} from 'lucide-react';
import useAttachmentStore from '../store/attachmentStore';
import { InlineAttachmentBadge } from './TinyPreview';
import { toast } from 'react-toastify';

// Lazy load the document viewer
const DocumentViewerModal = lazy(() => import('./DocumentViewerModal'));

const AttachmentList = ({ 
  cardId, 
  attachments: propAttachments,
  onDelete,
  onSetCover,
  showUploader = false,
  maxVisible = 6,
  virtualizeThreshold = 20
}) => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedMenu, setExpandedMenu] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const listRef = useRef(null);

  const {
    attachments: storeAttachments,
    loading,
    pagination,
    selectedAttachments,
    fetchAttachments,
    deleteAttachment,
    setAsCover,
    toggleSelectAttachment,
    clearSelection,
    selectAll,
    deleteSelected,
    isSelected,
    loadMore
  } = useAttachmentStore();

  // Use prop attachments if provided, otherwise use store
  const attachments = useMemo(() => {
    return propAttachments || storeAttachments[cardId] || [];
  }, [propAttachments, storeAttachments, cardId]);

  const isLoading = loading[cardId];
  const paginationData = pagination[cardId];

  // Fetch attachments on mount if using store
  useEffect(() => {
    if (!propAttachments && cardId) {
      fetchAttachments(cardId);
    }
  }, [cardId, propAttachments, fetchAttachments]);

  // Virtualization for large lists
  const shouldVirtualize = attachments.length > virtualizeThreshold;
  const visibleAttachments = useMemo(() => {
    if (showAll || shouldVirtualize) return attachments;
    return attachments.slice(0, maxVisible);
  }, [attachments, showAll, maxVisible, shouldVirtualize]);

  const hasMore = attachments.length > maxVisible && !showAll;

  const handlePreview = useCallback((attachment, index) => {
    setSelectedAttachment(attachment);
    setSelectedIndex(index);
    setViewerOpen(true);
  }, []);

  const handleDownload = useCallback((attachment, e) => {
    e?.stopPropagation();
    const url = attachment.secureUrl || attachment.url;
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.originalName || 'download';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleDelete = useCallback(async (attachment, e) => {
    e?.stopPropagation();
    setExpandedMenu(null);
    
    if (window.confirm(`Delete "${attachment.originalName}"?`)) {
      try {
        if (onDelete) {
          onDelete(attachment._id);
        } else {
          await deleteAttachment(cardId, attachment._id);
        }
        toast.success('Attachment deleted');
      } catch (error) {
        toast.error('Failed to delete attachment');
      }
    }
  }, [cardId, deleteAttachment, onDelete]);

  const handleSetCover = useCallback(async (attachment, e) => {
    e?.stopPropagation();
    setExpandedMenu(null);
    
    try {
      if (onSetCover) {
        await onSetCover(attachment);
      } else {
        await setAsCover(cardId, attachment._id);
      }
      toast.success('Cover image updated');
    } catch (error) {
      toast.error('Failed to set cover image');
    }
  }, [cardId, setAsCover, onSetCover]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedAttachments.length === 0) return;
    
    if (window.confirm(`Delete ${selectedAttachments.length} attachment(s)?`)) {
      try {
        await deleteSelected(cardId);
        toast.success(`${selectedAttachments.length} attachment(s) deleted`);
      } catch (error) {
        toast.error('Failed to delete attachments');
      }
    }
  }, [selectedAttachments, cardId, deleteSelected]);

  const getFileIcon = useCallback((fileType, size = 24) => {
    const icons = {
      image: <FileImage size={size} className="text-blue-500" />,
      pdf: <FileText size={size} className="text-red-500" />,
      document: <FileText size={size} className="text-blue-600" />,
      spreadsheet: <FileSpreadsheet size={size} className="text-green-500" />,
      presentation: <FileText size={size} className="text-orange-500" />,
      video: <Film size={size} className="text-purple-500" />,
      text: <FileText size={size} className="text-gray-500" />,
      other: <File size={size} className="text-gray-500" />
    };
    return icons[fileType] || icons.other;
  }, []);

  const formatFileSize = useCallback((bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  const formatDate = useCallback((date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = () => setExpandedMenu(null);
    if (expandedMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [expandedMenu]);

  if (attachments.length === 0 && !isLoading) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Paperclip size={20} className="text-gray-600" />
          <h4 className="font-semibold text-gray-800 text-lg">
            Attachments
          </h4>
          {attachments.length > 0 && (
            <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full font-medium">
              {attachments.length}
            </span>
          )}
        </div>

        {/* Bulk actions */}
        {selectedAttachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2"
          >
            <span className="text-sm text-gray-500">
              {selectedAttachments.length} selected
            </span>
            <button
              onClick={handleBulkDelete}
              className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
            >
              Delete
            </button>
            <button
              onClick={clearSelection}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
            >
              Clear
            </button>
          </motion.div>
        )}
      </div>

      {/* Loading state */}
      {isLoading && attachments.length === 0 && (
        <div className="ml-8 flex items-center gap-2 text-gray-400 py-4">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm">Loading attachments...</span>
        </div>
      )}

      {/* Attachment list (compact) */}
      <div ref={listRef} className="ml-8 space-y-2">
        <AnimatePresence mode="popLayout">
          {visibleAttachments.map((attachment, index) => (
            <motion.div
              key={attachment._id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: index * 0.03 }}
              className={`
                relative group bg-white rounded-xl border shadow-sm
                hover:shadow-md transition-all cursor-pointer flex items-center gap-3 p-2
                ${isSelected(attachment._id) ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300'}
              `}
              onClick={() => handlePreview(attachment, index)}
            >
              {/* Selection checkbox */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelectAttachment(attachment._id);
                }}
                className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {isSelected(attachment._id) ? (
                  <CheckSquare size={20} className="text-blue-500" />
                ) : (
                  <Square size={20} className="text-gray-400 hover:text-gray-600" />
                )}
              </button>

              {/* Cover badge */}
              {attachment.isCover && (
                <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-yellow-400 text-yellow-900 text-xs font-medium rounded-full flex items-center gap-1">
                  <Star size={12} />
                  Cover
                </div>
              )}

              {/* Preview thumbnail and info */}
              <div className="flex items-center gap-3 w-full">
                <div className="relative w-14 h-14 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                  {attachment.fileType === 'image' ? (
                    <img
                      src={attachment.thumbnailUrl || attachment.secureUrl || attachment.url}
                      alt={attachment.originalName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-500">
                      {getFileIcon(attachment.fileType, 20)}
                      <span className="text-[10px] uppercase font-medium">
                        {attachment.format || attachment.fileType}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {attachment.originalName}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                    <span>
                      {formatFileSize(attachment.fileSize)} • {formatDate(attachment.createdAt)}
                    </span>
                    {/* Source badge - shows where the attachment came from */}
                    {attachment.contextType && attachment.contextType !== 'card' && (
                      <InlineAttachmentBadge contextType={attachment.contextType} />
                    )}
                  </div>
                  {attachment.uploadedBy && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-medium">
                        {attachment.uploadedBy.name?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <span className="truncate">{attachment.uploadedBy.name}</span>
                    </div>
                  )}
                </div>

                {/* Actions menu */}
                <div className="relative self-start">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedMenu(expandedMenu === attachment._id ? null : attachment._id);
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <MoreVertical size={16} />
                  </button>

                  <AnimatePresence>
                    {expandedMenu === attachment._id && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                        className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handlePreview(attachment, index)}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <Eye size={14} />
                          Preview
                        </button>
                        <button
                          onClick={(e) => handleDownload(attachment, e)}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <Download size={14} />
                          Download
                        </button>
                        {attachment.fileType === 'image' && !attachment.isCover && (
                          <button
                            onClick={(e) => handleSetCover(attachment, e)}
                            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                          >
                            <Star size={14} />
                            Set as cover
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const url = attachment.secureUrl || attachment.url;
                            window.open(url, '_blank');
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <ExternalLink size={14} />
                          Open in tab
                        </button>
                        <hr className="my-1 border-gray-200" />
                        <button
                          onClick={(e) => handleDelete(attachment, e)}
                          className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Show more button */}
      {hasMore && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setShowAll(true)}
          className="ml-8 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          <ChevronDown size={16} />
          Show {attachments.length - maxVisible} more attachments
        </motion.button>
      )}

      {/* Load more (pagination) */}
      {paginationData?.hasNext && showAll && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => loadMore(cardId)}
          disabled={isLoading}
          className="ml-8 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
        >
          {isLoading ? (
            <Loader size={16} className="animate-spin" />
          ) : (
            <ChevronDown size={16} />
          )}
          Load more
        </motion.button>
      )}

      {/* Document Viewer Modal */}
      <Suspense fallback={null}>
        {viewerOpen && (
          <DocumentViewerModal
            attachment={selectedAttachment}
            attachments={attachments}
            initialIndex={selectedIndex}
            onClose={() => {
              setViewerOpen(false);
              setSelectedAttachment(null);
            }}
            onNavigate={(att) => setSelectedAttachment(att)}
          />
        )}
      </Suspense>
    </motion.div>
  );
};

export default React.memo(AttachmentList);
