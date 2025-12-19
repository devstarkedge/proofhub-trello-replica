import React, { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Search,
  RotateCcw,
  Trash2,
  AlertTriangle,
  CheckSquare,
  Trash2 as TrashIcon,
  Loader2
} from 'lucide-react';
import useTrashStore from '../store/trashStore';
import Header from '../components/Header';
import TrashItemCard from '../components/TrashItemCard';

// Lazy load the document viewer
const DocumentViewerModal = lazy(() => import('../components/DocumentViewerModal'));

/**
 * Project Trash Page - Compact, Professional UI
 * - Grid layout with fixed-height cards (80px)
 * - Search & filters for efficient discovery
 * - Bulk operations with clear visual feedback
 * - Responsive design (desktop: 2 cols, mobile: 1 col)
 * - Accessibility-first with proper ARIA labels
 */
const ProjectTrash = () => {
  const { projectId, deptId } = useParams();
  const navigate = useNavigate();

  const {
    itemsByProject,
    loadingByProject,
    fetchTrash,
    restoreOne,
    deletePermanentOne,
    toggleSelect,
    selected,
    clearSelection,
    selectAll,
    bulkRestore,
    bulkPermanentDelete
  } = useTrashStore();

  // Local UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('');
  const [showConfirm, setShowConfirm] = useState(null); // Item ID for permanent delete confirmation
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [processingItems, setProcessingItems] = useState(new Set());
  
  // Preview modal state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items = itemsByProject[projectId] || [];
  const loading = loadingByProject[projectId] || false;

  // Fetch trash on mount
  useEffect(() => {
    fetchTrash(projectId, { page: 1, limit: 100 });
  }, [projectId, fetchTrash]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Search by file name or task name
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const fileName = (item.originalName || item.fileName || '').toLowerCase();
        const taskName = (item.card?.title || item.subtask?.title || item.nanoSubtask?.title || '').toLowerCase();
        const matchesSearch = fileName.includes(searchLower) || taskName.includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Filter by file type
      if (fileTypeFilter && item.fileType !== fileTypeFilter) return false;

      return true;
    });
  }, [items, searchTerm, fileTypeFilter]);

  // Get unique file types for filter
  const fileTypes = useMemo(() => {
    const types = [...new Set(items.map((i) => i.fileType))];
    return types.sort();
  }, [items]);

  // Handle restore with optimistic update
  const handleRestore = async (item) => {
    setProcessingItems((prev) => new Set([...prev, item._id]));
    try {
      await restoreOne(projectId, item);
    } finally {
      setProcessingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(item._id);
        return newSet;
      });
    }
  };

  // Handle permanent delete with confirmation
  const handleDeleteClick = (item) => {
    setShowConfirm(item._id);
  };

  const handleConfirmDelete = async (item) => {
    setProcessingItems((prev) => new Set([...prev, item._id]));
    try {
      await deletePermanentOne(projectId, item);
      setShowConfirm(null);
    } finally {
      setProcessingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(item._id);
        return newSet;
      });
    }
  };

  // Handle bulk restore
  const handleBulkRestore = async () => {
    if (selected.length === 0) return;
    await bulkRestore(projectId);
    clearSelection();
  };

  // Handle bulk permanent delete
  const handleBulkPermanentDelete = async () => {
    if (selected.length === 0) return;
    await bulkPermanentDelete(projectId);
    clearSelection();
    setBulkDeleteConfirm(false);
  };

  // Handle preview click - open DocumentViewerModal
  const handlePreviewClick = (item) => {
    const index = filteredItems.findIndex(att => att._id === item._id);
    setSelectedAttachment(item);
    setSelectedIndex(index >= 0 ? index : 0);
    setViewerOpen(true);
  };

  // Handle viewer close
  const handleViewerClose = () => {
    setViewerOpen(false);
    setSelectedAttachment(null);
    setSelectedIndex(0);
  };

  // Handle viewer navigation
  const handleViewerNavigate = (direction) => {
    const newIndex = direction === 'next' 
      ? (selectedIndex + 1) % filteredItems.length 
      : (selectedIndex - 1 + filteredItems.length) % filteredItems.length;
    setSelectedIndex(newIndex);
    setSelectedAttachment(filteredItems[newIndex]);
  };

  // Handle Select All
  const handleSelectAll = () => {
    if (selected.length === filteredItems.length && filteredItems.length > 0) {
      // If all are selected, deselect all
      clearSelection();
    } else {
      // Select all filtered items
      filteredItems.forEach((item) => {
        if (!selected.includes(item._id)) {
          toggleSelect(item._id);
        }
      });
    }
  };

  // Loading skeleton
  if (loading && items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => navigate(`/workflow/${deptId}/${projectId}`)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-bold">Project Trash (Media)</h1>
          </div>

          {/* Skeleton grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {Array(6)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
              ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/workflow/${deptId}/${projectId}`)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Go back to project"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold">Project Trash (Media)</h1>
                <p className="text-sm text-gray-600 mt-1">
                  {filteredItems.length} attachment{filteredItems.length !== 1 ? 's' : ''} • Files deleted after 30 days
                </p>
              </div>
            </div>

            {/* Top Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchTrash(projectId, { page: 1, limit: 100 })}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors text-sm font-medium"
                aria-label="Refresh trash"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by file name or task..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                aria-label="Search trash"
              />
            </div>

            {/* File Type Filter */}
            {fileTypes.length > 0 && (
              <select
                value={fileTypeFilter}
                onChange={(e) => setFileTypeFilter(e.target.value)}
                className="px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                aria-label="Filter by file type"
              >
                <option value="">All file types</option>
                {fileTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selected.length > 0 && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Checkbox for Select All */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.length > 0 && selected.length === filteredItems.length}
                  indeterminate={selected.length > 0 && selected.length < filteredItems.length}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded cursor-pointer"
                />
              </label>

              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-gray-900">
                  {selected.length} of {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} selected
                </span>
              </div>

              <button
                onClick={clearSelection}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear
              </button>

              {selected.length < filteredItems.length && filteredItems.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Select All
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkRestore}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={processingItems.size > 0}
              >
                <RotateCcw size={16} />
                Restore {selected.length}
              </button>

              <button
                onClick={() => setBulkDeleteConfirm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={processingItems.size > 0}
              >
                <Trash2 size={16} />
                Delete {selected.length}
              </button>
            </div>
          </div>
        )}

        {/* Bulk Delete Confirmation */}
        {bulkDeleteConfirm && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-4 animate-in fade-in">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">Permanently delete {selected.length} attachments?</h3>
              <p className="text-sm text-gray-600 mt-1">This action cannot be undone. Files will be removed from Trash permanently.</p>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleBulkPermanentDelete}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={processingItems.size > 0}
                >
                  Yes, Delete Permanently
                </button>
                <button
                  onClick={() => setBulkDeleteConfirm(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-900 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 py-12 px-4 text-center">
            <TrashIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Trash is empty</h3>
            <p className="text-gray-600 text-sm">
              {searchTerm || fileTypeFilter
                ? 'No attachments match your filters.'
                : 'Deleted attachments will appear here for 30 days.'}
            </p>
            {(searchTerm || fileTypeFilter) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFileTypeFilter('');
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-4"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredItems.map((item) => (
              <TrashItemCard
                key={item._id}
                item={item}
                isSelected={selected.includes(item._id)}
                onToggleSelect={toggleSelect}
                onRestore={handleRestore}
                onDelete={handleDeleteClick}
                onConfirmDelete={() => handleConfirmDelete(item)}
                isProcessing={processingItems.has(item._id)}
                showDeleteConfirm={showConfirm === item._id}
                onPreview={handlePreviewClick}
              />
            ))}
          </div>
        )}

        {/* Preview Modal */}
        {viewerOpen && selectedAttachment && (
          <Suspense fallback={
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
              <Loader2 className="w-8 h-8 animate-spin text-white" />
            </div>
          }>
            <DocumentViewerModal
              attachment={selectedAttachment}
              attachments={filteredItems}
              initialIndex={selectedIndex}
              onClose={handleViewerClose}
              onNavigate={handleViewerNavigate}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default ProjectTrash;
