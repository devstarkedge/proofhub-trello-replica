import React, { useMemo, useState } from 'react';
import { X, Loader, File, FileText, FileImage, FileSpreadsheet, Film, AlertCircle, Maximize2 } from 'lucide-react';
import useAttachmentStore from '../store/attachmentStore';
import { motion, AnimatePresence } from 'framer-motion';

const EditorAttachmentPreview = ({ cardId, contextType, contextRef }) => {
  const uploadProgress = useAttachmentStore(state => state.uploadProgress);
  const [expanded, setExpanded] = useState(false);
  const MAX_VISIBLE_PREVIEWS = 5;

  // Filter uploads relevant to this specific editor context
  const activeUploads = useMemo(() => {
    return Object.entries(uploadProgress)
      .map(([id, data]) => ({ id, ...data }))
      .filter(upload => 
        upload.cardId === cardId && 
        upload.contextType === contextType && 
        (contextRef ? upload.contextRef === contextRef : true) &&
        upload.status !== 'completed' // Only show pending/error states
      );
  }, [uploadProgress, cardId, contextType, contextRef]);

  if (activeUploads.length === 0) return null;

  const visibleUploads = expanded ? activeUploads : activeUploads.slice(0, MAX_VISIBLE_PREVIEWS);
  const remainingCount = activeUploads.length - MAX_VISIBLE_PREVIEWS;

  const getFileIcon = (fileType) => {
    switch (fileType) {
      case 'image': return <FileImage size={14} className="text-blue-500" />;
      case 'pdf': return <FileText size={14} className="text-red-500" />;
      case 'spreadsheet': return <FileSpreadsheet size={14} className="text-green-500" />;
      case 'video': return <Film size={14} className="text-purple-500" />;
      default: return <File size={14} className="text-gray-500" />;
    }
  };

  return (
    <div className="mt-2 flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
      <AnimatePresence>
        {visibleUploads.map((upload) => (
          <motion.div
            key={upload.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative group w-16 h-16 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow"
            title={`${upload.fileName} (${Math.round(upload.progress)}%)`}
          >
            {/* Background Preview or Icon */}
            {upload.preview && upload.fileType === 'image' ? (
              <img 
                src={upload.preview} 
                alt={upload.fileName} 
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 p-1">
                {getFileIcon(upload.fileType)}
                <span className="text-[9px] text-gray-500 text-center truncate w-full max-w-[50px] leading-tight">
                  {upload.fileName.substring(0, 8)}...
                </span>
              </div>
            )}

            {/* Overlay Loader / Error */}
            <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
              {upload.status === 'error' ? (
                <AlertCircle size={20} className="text-red-500 drop-shadow-sm" />
              ) : (
                <div className="relative w-8 h-8 flex items-center justify-center">
                  <svg className="w-full h-full rotate-[-90deg]" viewBox="0 0 36 36">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="white"
                      strokeWidth="4"
                      strokeOpacity="0.5"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={upload.status === 'error' ? '#ef4444' : '#3b82f6'}
                      strokeWidth="4"
                      strokeDasharray={`${upload.progress}, 100`}
                      className="transition-all duration-300 ease-out"
                    />
                  </svg>
                  <span className="absolute text-[8px] font-bold text-white drop-shadow-md">
                    {Math.round(upload.progress)}%
                  </span>
                </div>
              )}
            </div>

            {/* Cancel Button (on hover) */}
            <button
               onClick={(e) => {
                 e.stopPropagation();
                 // TODO: Implement cancel logic in store if supported, currently just hides locally
                 // For now we rely on the component unmounting or status changing
               }}
               className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 hover:bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all transform scale-75 hover:scale-100"
            >
              <X size={10} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Expand Button for +N items */}
      {!expanded && remainingCount > 0 && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setExpanded(true)}
          className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 flex flex-col items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
        >
          <span className="text-sm font-bold">+{remainingCount}</span>
          <span className="text-[10px]">uploading</span>
        </motion.button>
      )}
      
      {/* Collapse button when expanded */}
      {expanded && activeUploads.length > MAX_VISIBLE_PREVIEWS && (
         <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setExpanded(false)}
            className="w-16 h-16 rounded-lg bg-gray-50 border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Show less"
         >
           <X size={20} />
         </motion.button>
      )}
    </div>
  );
};

export default EditorAttachmentPreview;
