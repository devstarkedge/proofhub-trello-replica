import React, { useState } from 'react';
import {
  FileText,
  Image,
  Music,
  File,
  RotateCcw,
  Trash2,
  Calendar,
  User,
  ClipboardList,
  CheckCircle2,
  MessageSquare,
  AlertCircle,
  Eye
} from 'lucide-react';

/**
 * Compact Trash Item Card Component
 * - Fixed height (~80px) for consistent grid layout
 * - Thumbnail + metadata + actions in single row
 * - Icon-based information for space efficiency
 * - Hover effects for interactivity
 * - Click thumbnail to open preview modal
 */
const TrashItemCard = ({
  item,
  isSelected,
  onToggleSelect,
  onRestore,
  onDelete,
  isProcessing = false,
  showDeleteConfirm = false,
  onConfirmDelete,
  onPreview
}) => {
  const [showTooltip, setShowTooltip] = useState(null);
  const [thumbnailHovered, setThumbnailHovered] = useState(false);

  // Get file type icon
  const getFileTypeIcon = (fileType) => {
    const iconClass = 'w-5 h-5';
    switch (fileType) {
      case 'image':
        return <Image className={`${iconClass} text-blue-500`} />;
      case 'pdf':
        return <FileText className={`${iconClass} text-red-500`} />;
      case 'document':
        return <FileText className={`${iconClass} text-blue-600`} />;
      case 'video':
        return <Music className={`${iconClass} text-purple-500`} />;
      case 'spreadsheet':
        return <FileText className={`${iconClass} text-green-500`} />;
      default:
        return <File className={`${iconClass} text-gray-500`} />;
    }
  };

  // Get source type icon
  const getSourceIcon = (parentType) => {
    const iconClass = 'w-4 h-4';
    switch (parentType) {
      case 'card':
        return <ClipboardList className={`${iconClass}`} />;
      case 'subtask':
        return <CheckCircle2 className={`${iconClass}`} />;
      case 'nenoSubtask':
      case 'nanoSubtask':
        return <File className={`${iconClass}`} />;
      case 'comment':
        return <MessageSquare className={`${iconClass}`} />;
      default:
        return <File className={`${iconClass}`} />;
    }
  };

  const parentType = item.originalContext?.parentType || item.parentType || item.contextType;
  const taskName = item.card?.title || item.subtask?.title || item.nanoSubtask?.title || item.taskName || 'Unknown';
  const section = item.originalContext?.section || 'attachment';
  const fileName = item.originalName || item.fileName || 'Unknown';
  const deletedDate = new Date(item.deletedAt);
  const daysAgo = Math.floor((Date.now() - deletedDate) / (1000 * 60 * 60 * 24));
  const deletedByName = item.deletedBy?.name || 'Unknown';

  return (
    <div
      className={`group relative bg-white border rounded-lg transition-all duration-200 hover:shadow-md hover:border-blue-300 ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
      } ${isProcessing ? 'opacity-60' : ''}`}
    >
      {/* Checkbox */}
      <div className="absolute top-2 left-2 z-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(item._id)}
          className="w-4 h-4 rounded cursor-pointer"
          disabled={isProcessing}
        />
      </div>

      {/* Main Container - Flex Row */}
      <div className="flex items-center gap-3 p-3 h-20">
        {/* Thumbnail - Left Side */}
        <div 
          className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-gray-100 to-gray-200 rounded-md flex items-center justify-center overflow-hidden border border-gray-200 relative cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
          onClick={() => onPreview?.(item)}
          title="Click to preview"
          role="button"
          tabIndex={0}
          onMouseEnter={() => setThumbnailHovered(true)}
          onMouseLeave={() => setThumbnailHovered(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPreview?.(item);
            }
          }}
        >
          {isProcessing && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-md">
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          
          {/* Preview hint - Show on thumbnail hover only */}
          {thumbnailHovered && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center transition-all duration-200 rounded-md">
              <Eye className="w-5 h-5 text-white" />
            </div>
          )}
          {item.fileType === 'image' && !item.imgError ? (
            <img
              src={item.thumbnailUrl || item.secureUrl || item.url}
              alt={fileName}
              className="w-full h-full object-cover"
              onError={() => (item.imgError = true)}
            />
          ) : (
            <div className="flex items-center justify-center text-gray-500">
              {getFileTypeIcon(item.fileType)}
            </div>
          )}
        </div>

        {/* Middle Content - Stacked Info */}
        <div className="flex-1 min-w-0">
          {/* File Name - Primary Info */}
          <h3 className="text-sm font-semibold text-gray-900 truncate mb-1" title={fileName}>
            {fileName}
          </h3>

          {/* Meta Row - Icons + Text */}
          <div className="flex items-center gap-3 text-xs text-gray-600">
            {/* File Type + Size */}
            <div
              className="flex items-center gap-1"
              onMouseEnter={() => setShowTooltip('fileType')}
              onMouseLeave={() => setShowTooltip(null)}
            >
              {getFileTypeIcon(item.fileType)}
              <span className="capitalize text-gray-500">{item.fileType}</span>
              {showTooltip === 'fileType' && (
                <div className="absolute bottom-24 left-20 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50">
                  {item.formattedSize || 'File'}
                </div>
              )}
            </div>

            {/* Source Type */}
            <div
              className="flex items-center gap-1"
              onMouseEnter={() => setShowTooltip('source')}
              onMouseLeave={() => setShowTooltip(null)}
            >
              {getSourceIcon(parentType)}
              <span className="capitalize text-gray-500">
                {parentType === 'nenoSubtask' ? 'Nano' : parentType}
              </span>
              {showTooltip === 'source' && (
                <div className="absolute bottom-24 left-20 bg-gray-900 text-white text-xs px-2 py-1 rounded z-50">
                  {section}
                </div>
              )}
            </div>

            {/* Task Name - Truncated */}
            <div className="hidden sm:flex items-center gap-1 truncate">
              <span className="truncate text-gray-500 max-w-[150px]" title={taskName}>
                {taskName}
              </span>
            </div>

            {/* Deleted Time */}
            <div
              className="flex items-center gap-1 ml-auto"
              onMouseEnter={() => setShowTooltip('date')}
              onMouseLeave={() => setShowTooltip(null)}
            >
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500 whitespace-nowrap">
                {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
              </span>
              {showTooltip === 'date' && (
                <div className="absolute bottom-24 right-32 bg-gray-900 text-white text-xs px-2 py-1 rounded z-50">
                  {deletedDate.toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Secondary Info Row - Deleted By */}
          <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
            <User className="w-3.5 h-3.5" />
            <span className="truncate">Deleted by {deletedByName}</span>
          </div>
        </div>

        {/* Right Side - Actions */}
        <div className="flex-shrink-0 flex items-center gap-2">
          {/* Restore Button */}
          <button
            onClick={() => onRestore(item)}
            disabled={isProcessing}
            className="p-2 rounded-md bg-green-50 hover:bg-green-100 text-green-600 hover:text-green-700 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Restore attachment"
            aria-label="Restore attachment"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Delete Button with Confirmation */}
          {!showDeleteConfirm ? (
            <button
              onClick={() => onDelete(item)}
              disabled={isProcessing}
              className="p-2 rounded-md bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete permanently"
              aria-label="Delete permanently"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-red-50 rounded-md px-2 py-1">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <button
                onClick={onConfirmDelete}
                className="text-xs font-semibold text-red-600 hover:text-red-700"
              >
                Confirm?
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrashItemCard;
