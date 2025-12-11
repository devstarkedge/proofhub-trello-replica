import React, { memo } from 'react';
import { 
  FileText, 
  FileSpreadsheet, 
  FileType, 
  Video, 
  File, 
  Download,
  ExternalLink 
} from 'lucide-react';

/**
 * TinyPreview - Small inline preview component for non-image attachments in rich text editor
 * Shows file icon + truncated name with hover actions
 */
const TinyPreview = memo(({ 
  attachment, 
  onClick,
  showActions = true,
  maxNameLength = 20,
  className = ''
}) => {
  const { fileType, originalName, fileName, url, secureUrl, thumbnailUrl } = attachment;
  const displayUrl = secureUrl || url;
  const displayName = originalName || fileName || 'Untitled';
  
  // Truncate name if too long
  const truncatedName = displayName.length > maxNameLength 
    ? `${displayName.slice(0, maxNameLength - 3)}...${displayName.split('.').pop()}`
    : displayName;

  // Get appropriate icon for file type
  const getFileIcon = () => {
    const iconProps = { size: 14, className: 'flex-shrink-0' };
    
    switch (fileType) {
      case 'pdf':
        return <FileText {...iconProps} className="text-red-500" />;
      case 'document':
        return <FileType {...iconProps} className="text-blue-500" />;
      case 'spreadsheet':
        return <FileSpreadsheet {...iconProps} className="text-green-500" />;
      case 'presentation':
        return <FileText {...iconProps} className="text-orange-500" />;
      case 'video':
        return <Video {...iconProps} className="text-purple-500" />;
      case 'text':
        return <FileText {...iconProps} className="text-gray-500" />;
      default:
        return <File {...iconProps} className="text-gray-500" />;
    }
  };

  // Get background color based on file type
  const getBgColor = () => {
    switch (fileType) {
      case 'pdf': return 'bg-red-50 hover:bg-red-100 border-red-200';
      case 'document': return 'bg-blue-50 hover:bg-blue-100 border-blue-200';
      case 'spreadsheet': return 'bg-green-50 hover:bg-green-100 border-green-200';
      case 'presentation': return 'bg-orange-50 hover:bg-orange-100 border-orange-200';
      case 'video': return 'bg-purple-50 hover:bg-purple-100 border-purple-200';
      default: return 'bg-gray-50 hover:bg-gray-100 border-gray-200';
    }
  };

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick) {
      onClick(attachment);
    } else {
      // Default: open in new tab
      window.open(displayUrl, '_blank');
    }
  };

  const handleDownload = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = displayUrl;
    link.download = displayName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <span 
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-md border cursor-pointer
        transition-all duration-150 text-xs font-medium select-none
        ${getBgColor()} ${className}
      `}
      onClick={handleClick}
      title={displayName}
      contentEditable={false}
      data-attachment-id={attachment._id}
      data-attachment-type={fileType}
    >
      {getFileIcon()}
      <span className="truncate max-w-[120px]">{truncatedName}</span>
      
      {showActions && (
        <span className="inline-flex gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleDownload}
            className="p-0.5 hover:bg-black/10 rounded"
            title="Download"
          >
            <Download size={10} />
          </button>
          <button
            onClick={handleClick}
            className="p-0.5 hover:bg-black/10 rounded"
            title="Open"
          >
            <ExternalLink size={10} />
          </button>
        </span>
      )}
    </span>
  );
});

TinyPreview.displayName = 'TinyPreview';

/**
 * TinyImagePreview - Small inline thumbnail for images
 */
export const TinyImagePreview = memo(({ 
  src, 
  alt = 'Preview',
  thumbnailSrc,
  onClick,
  className = '' 
}) => {
  const displaySrc = thumbnailSrc || src;
  
  return (
    <span 
      className={`inline-block cursor-pointer ${className}`}
      onClick={onClick}
      contentEditable={false}
    >
      <img 
        src={displaySrc}
        alt={alt}
        className="inline-block w-12 h-12 object-cover rounded border border-gray-200 
                   hover:border-blue-400 transition-colors shadow-sm hover:shadow-md"
        onError={(e) => {
          e.target.style.display = 'none';
        }}
      />
    </span>
  );
});

TinyImagePreview.displayName = 'TinyImagePreview';

/**
 * InlineAttachmentBadge - Source badge shown in main attachments list
 * Indicates where the attachment came from (Description, Comment, Direct upload)
 */
export const InlineAttachmentBadge = memo(({ contextType }) => {
  const getBadgeConfig = () => {
    switch (contextType) {
      case 'description':
        return { 
          label: 'Description', 
          className: 'bg-blue-100 text-blue-700 border-blue-200' 
        };
      case 'comment':
        return { 
          label: 'Comment', 
          className: 'bg-purple-100 text-purple-700 border-purple-200' 
        };
      case 'subtask':
        return { 
          label: 'Subtask', 
          className: 'bg-green-100 text-green-700 border-green-200' 
        };
      case 'subtaskNano':
        return { 
          label: 'Nano', 
          className: 'bg-pink-100 text-pink-700 border-pink-200' 
        };
      default:
        return { 
          label: 'Uploaded', 
          className: 'bg-gray-100 text-gray-600 border-gray-200' 
        };
    }
  };

  const { label, className } = getBadgeConfig();

  return (
    <span 
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium 
                  rounded border ${className}`}
    >
      {label}
    </span>
  );
});

InlineAttachmentBadge.displayName = 'InlineAttachmentBadge';

export default TinyPreview;
