import React, { useMemo } from 'react';
import { X, Loader, File, FileText, FileImage, FileSpreadsheet, Film, AlertCircle, RefreshCw } from 'lucide-react';
import useAttachmentStore from '../store/attachmentStore';
import { motion, AnimatePresence } from 'framer-motion';

const EditorAttachmentPreview = ({ 
  entityType = 'card',
  entityId,
  cardId, // Legacy support
  contextType, 
  contextRef 
}) => {
  const uploadProgress = useAttachmentStore(state => state.uploadProgress);
  const retryUpload = useAttachmentStore(state => state.retryUpload);

  // Filter uploads relevant to this specific editor context
  const activeUploads = useMemo(() => {
    // Resolve entity info (Entity takes precedence over legacy cardId)
    const targetEntityType = entityId ? entityType : 'card';
    const targetEntityId = entityId || cardId;

    if (!targetEntityId) return [];

    return Object.entries(uploadProgress)
      .map(([id, data]) => ({ id, ...data }))
      .filter(upload => {
        // Strict matching: Entity Type + Entity ID matching
        const uploadEntityType = upload.entityType || 'card';
        const uploadEntityId = upload.entityId || upload.cardId;

        return uploadEntityType === targetEntityType && 
               uploadEntityId === targetEntityId;
      })
      .filter(upload => 
        upload.contextType === contextType && 
        (!contextRef || upload.contextRef === contextRef) &&
        upload.status !== 'completed' // Only show pending/error states
      );
  }, [uploadProgress, cardId, entityId, entityType, contextType, contextRef]);

  if (activeUploads.length === 0) return null;

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
    <div className="mt-2 w-full animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex flex-nowrap overflow-x-auto gap-2 py-2 px-1 custom-scrollbar items-center">
        <AnimatePresence mode='popLayout'>
          {activeUploads.map((upload) => (
            <motion.div
              key={upload.id}
              initial={{ opacity: 0, scale: 0.8, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: 'auto' }}
              exit={{ opacity: 0, scale: 0.8, width: 0, transition: { duration: 0.2 } }}
              layout
              className="relative group flex-shrink-0 w-16 h-16 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow"
              title={`${upload.fileName} (${upload.status === 'error' ? 'Failed' : Math.round(upload.progress) + '%'})`}
            >
              {/* Background Preview or Icon */}
              {upload.preview && upload.fileType === 'image' ? (
                <img 
                  src={upload.preview} 
                  alt={upload.fileName} 
                  className={`w-full h-full object-cover transition-opacity ${
                    upload.status === 'uploading' ? 'opacity-50' : 'opacity-80'
                  }`}
                />
              ) : (
                <div className="flex flex-col items-center gap-1 p-1">
                  {getFileIcon(upload.fileType)}
                  <span className="text-[9px] text-gray-500 text-center truncate w-full max-w-[50px] leading-tight">
                    {upload.fileName.substring(0, 8)}...
                  </span>
                </div>
              )}

              {/* Overlay Loader / Error / Retry */}
              <div className="absolute inset-0 flex items-center justify-center">
                {upload.status === 'error' ? (
                  <div className="bg-white/80 rounded-full p-1 cursor-pointer hover:bg-white transition-colors shadow-sm"
                       onClick={(e) => {
                         e.stopPropagation();
                         retryUpload(upload.id);
                       }}
                       title="Retry Upload"
                  >
                    <RefreshCw size={18} className="text-red-500" />
                  </div>
                ) : (
                  <div className="relative w-8 h-8 flex items-center justify-center">
                    {/* Simplified Circular Progress for compact view */}
                    <svg className="w-full h-full rotate-[-90deg]" viewBox="0 0 36 36">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="white"
                        strokeWidth="4"
                        strokeOpacity="0.8"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke={upload.status === 'error' ? '#ef4444' : '#3b82f6'}
                        strokeWidth="4"
                        strokeDasharray={`${upload.progress}, 100`}
                        strokeLinecap="round"
                        className="transition-all duration-300 ease-out"
                      />
                    </svg>
                    {/* Text might be too small, maybe just show loader? User asked for % */}
                     <span className="absolute text-[8px] font-bold text-white drop-shadow-md select-none">
                      {Math.round(upload.progress)}%
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
      `}</style>
    </div>
  );
};

export default EditorAttachmentPreview;
