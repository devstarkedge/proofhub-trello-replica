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
  AlertTriangle,
  Eye,
  Loader2
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
  onCancelDelete,
  onPreview
}) => {
  const [thumbnailHovered, setThumbnailHovered] = useState(false);

  // Helper to format bytes
  const formatBytes = (bytes, decimals = 1) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

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
    const iconClass = 'w-3.5 h-3.5';
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
  
  let taskName = item.taskName || 'Unknown';
  if (item.card?.title) {
    taskName = item.card.title;
  } else if (item.subtask?.title) {
    const cardTitle = item.subtask.task?.title;
    taskName = cardTitle ? `${cardTitle} - ${item.subtask.title}` : item.subtask.title;
  } else if (item.nanoSubtask?.title) {
    const cardTitle = item.nanoSubtask.subtask?.task?.title;
    taskName = cardTitle ? `${cardTitle} - ${item.nanoSubtask.title}` : item.nanoSubtask.title;
  }

  // const section = item.originalContext?.section || 'attachment';
  const fileName = item.originalName || item.fileName || 'Unknown';
  const deletedDate = new Date(item.deletedAt);
  const daysAgo = Math.floor((Date.now() - deletedDate) / (1000 * 60 * 60 * 24));
  
  const deletedByName = item.deletedBy?.name || 'Unknown';
  const uploadedByName = item.uploadedBy?.name || 'Unknown';
  const fileSize = formatBytes(item.fileSize || 0);

  return (
    <div
      className={`group relative bg-white border rounded-xl transition-all duration-200 hover:shadow-lg hover:border-blue-300 ${
        isSelected ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200'
      } ${isProcessing ? 'opacity-60' : ''}`}
    >
      {/* Checkbox (Absolute) */}
      <div className="absolute top-3 left-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(item._id)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shadow-sm"
          disabled={isProcessing}
        />
      </div>
      {isSelected && (
        <div className="absolute top-3 left-3 z-10">
           <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(item._id)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shadow-sm"
            disabled={isProcessing}
          />
        </div>
      )}

      {/* Main Container */}
      <div className="flex gap-4 p-4">
        {/* Thumbnail - Left Side */}
        <div 
          className="flex-shrink-0 w-20 h-20 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 relative cursor-pointer group/thumb group-hover:border-blue-200 transition-colors"
          onClick={() => onPreview?.(item)}
        >
          {isProcessing && (
            <div className="absolute inset-0 bg-white/60 z-20 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            </div>
          )}
          
          {/* Preview overlay */}
          <div className={`absolute inset-0 bg-black/5 rounded-lg flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-all duration-200 z-10`}>
             <Eye className={`w-6 h-6 drop-shadow-sm ${item.fileType === 'pdf' ? 'text-green-800' : 'text-gray-600'}`} />
          </div>

          {item.fileType === 'image' && !item.imgError ? (
            <img
              src={item.thumbnailUrl || item.secureUrl || item.url}
              alt={fileName}
              className="w-full h-full object-cover"
              onError={() => (item.imgError = true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400">
              {getFileTypeIcon(item.fileType)}
            </div>
          )}
        </div>

        {/* Content Column */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          
          {/* Header: Name + Date */}
          <div className="flex justify-between items-start gap-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate leading-tight" title={fileName}>
              {fileName}
            </h3>
            <span className="text-[10px] sm:text-xs text-gray-400 whitespace-nowrap flex-shrink-0" title={`Deleted: ${deletedDate.toLocaleString()}`}>
              {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
            </span>
          </div>

          {/* Metadata Row: Size • Type • Source */}
          <div className="flex items-center flex-wrap gap-2 text-xs text-gray-500 mt-1">
            <span className="font-medium text-gray-700">{fileSize}</span>
            <span className="text-gray-300">•</span>
            <span className="capitalize">{item.fileType}</span>
            <span className="text-gray-300 hidden sm:inline">•</span>
            
            {/* Source Context Badge */}
            <div className="flex items-center gap-1.5">
               <span className="text-gray-400">From:-</span>
               <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-full border border-gray-200 max-w-[140px] sm:max-w-[180px]">
                  <span className="text-gray-400 flex-shrink-0">
                    {getSourceIcon(parentType)}
                  </span>
                  <span className="truncate text-[11px] font-medium text-gray-700" title={`From: ${taskName}`}>
                    {taskName}
                  </span>
               </div>
            </div>
          </div>

          {/* Footer: User Info */}
          <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-50">
             <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[9px] font-bold ring-1 ring-blue-100">
                   {uploadedByName.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-gray-400 leading-none">Uploaded by</span>
                  <span className="text-[10px] font-medium text-gray-700 truncate max-w-[80px]" title={uploadedByName}>{uploadedByName}</span>
                </div>
             </div>
             
             <div className="w-px h-6 bg-gray-100 mx-1"></div>

             <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-5 h-5 rounded-full bg-red-50 text-red-600 flex items-center justify-center text-[9px] font-bold ring-1 ring-red-100">
                   {deletedByName.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] text-gray-400 leading-none">Deleted by</span>
                  <span className="text-[10px] font-medium text-gray-700 truncate max-w-[80px]" title={deletedByName}>{deletedByName}</span>
                </div>
             </div>
          </div>
        </div>

        {/* Actions Column */}
        <div className="flex-shrink-0 flex flex-col items-end gap-2 pl-2 border-l border-gray-50">
          <button
            onClick={() => onRestore(item)}
            disabled={isProcessing}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 hover:text-green-700 transition-colors border border-green-100"
            title="Restore attachment"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

            <button
              onClick={() => onDelete(item)}
              disabled={isProcessing}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 transition-colors border border-red-100"
              title="Delete permanently"
            >
              <Trash2 className="w-4 h-4" />
            </button>
        </div>
      </div>

      {/* Delete Confirmation Overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-20 backdrop-blur-md bg-white/70 rounded-xl flex items-center justify-between px-4 sm:px-6 animate-in fade-in duration-200">
             <div className="flex items-center gap-3 min-w-0">
                 <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 animate-bounce">
                     <AlertTriangle className="w-5 h-5 text-red-600" />
                 </div>
                 <div className="flex flex-col">
                     <h4 className="text-sm font-bold text-gray-900 leading-tight">Delete Permanently?</h4>
                     <p className="text-[11px] text-gray-500 leading-tight mt-0.5">This action cannot be undone.</p>
                 </div>
             </div>
             <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                 <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancelDelete();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-all duration-200"
                 >
                    Cancel
                 </button>
                 <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onConfirmDelete();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-700 hover:shadow-md transition-all duration-200 shadow-sm flex items-center gap-1.5"
                 >
                    <Trash2 className="w-3 h-3" />
                    Delete
                 </button>
             </div>
        </div>
      )}
    </div>
  );
};

export default TrashItemCard;
