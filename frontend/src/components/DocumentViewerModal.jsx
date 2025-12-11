import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileSpreadsheet,
  File,
  ExternalLink,
  Loader
} from 'lucide-react';

const DocumentViewerModal = ({ 
  attachment, 
  attachments = [], 
  onClose, 
  onNavigate,
  initialIndex = 0 
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const currentAttachment = attachments.length > 0 
    ? attachments[currentIndex] 
    : attachment;

  const canNavigate = attachments.length > 1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < attachments.length - 1;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) handlePrev();
      if (e.key === 'ArrowRight' && hasNext) handleNext();
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, hasPrev, hasNext]);

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      setCurrentIndex(prev => prev - 1);
      setZoom(1);
      setRotation(0);
      setLoading(true);
      setError(null);
      onNavigate?.(attachments[currentIndex - 1]);
    }
  }, [currentIndex, hasPrev, attachments, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      setCurrentIndex(prev => prev + 1);
      setZoom(1);
      setRotation(0);
      setLoading(true);
      setError(null);
      onNavigate?.(attachments[currentIndex + 1]);
    }
  }, [currentIndex, hasNext, attachments, onNavigate]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const handleDownload = useCallback(() => {
    const url = currentAttachment?.secureUrl || currentAttachment?.url;
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = currentAttachment.originalName || 'download';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [currentAttachment]);

  const handleOpenInNewTab = useCallback(() => {
    const url = currentAttachment?.secureUrl || currentAttachment?.url;
    if (url) {
      window.open(url, '_blank');
    }
  }, [currentAttachment]);

  const renderPreview = () => {
    if (!currentAttachment) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          <p>No file to preview</p>
        </div>
      );
    }

    const { fileType, mimeType, secureUrl, url, thumbnailUrl, previewUrl } = currentAttachment;
    const displayUrl = secureUrl || url;

    // Image preview
    if (fileType === 'image') {
      return (
        <div className="flex items-center justify-center h-full overflow-hidden">
          <motion.img
            src={displayUrl}
            alt={currentAttachment.originalName}
            className="max-w-full max-h-full object-contain transition-all duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError('Failed to load image');
            }}
            draggable={false}
          />
        </div>
      );
    }

    // PDF preview
    if (fileType === 'pdf') {
      return (
        <div className="w-full h-full">
          <iframe
            src={`${displayUrl}#toolbar=1&navpanes=0&scrollbar=1`}
            className="w-full h-full border-0 rounded"
            title={currentAttachment.originalName}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError('Failed to load PDF');
            }}
          />
        </div>
      );
    }

    // Video preview
    if (fileType === 'video' || mimeType?.startsWith('video/')) {
      return (
        <div className="flex items-center justify-center h-full">
          <video
            src={displayUrl}
            controls
            className="max-w-full max-h-full rounded-lg"
            style={{ transform: `scale(${zoom})` }}
            onLoadedData={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError('Failed to load video');
            }}
          >
            Your browser does not support video playback.
          </video>
        </div>
      );
    }

    // Document/Spreadsheet/Other - show info card
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="bg-gray-100 rounded-2xl p-8 text-center max-w-md">
          <div className="w-24 h-24 mx-auto mb-6 bg-gray-200 rounded-xl flex items-center justify-center">
            {fileType === 'document' && <FileText size={48} className="text-blue-500" />}
            {fileType === 'spreadsheet' && <FileSpreadsheet size={48} className="text-green-500" />}
            {fileType === 'presentation' && <FileText size={48} className="text-orange-500" />}
            {!['document', 'spreadsheet', 'presentation'].includes(fileType) && (
              <File size={48} className="text-gray-500" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2 truncate">
            {currentAttachment.originalName}
          </h3>
          <p className="text-gray-500 text-sm mb-4">
            {currentAttachment.formattedSize || formatFileSize(currentAttachment.fileSize)}
          </p>
          <p className="text-gray-400 text-xs mb-6">
            Preview not available for this file type
          </p>
          <div className="flex gap-3 justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
            >
              <Download size={18} />
              Download
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleOpenInNewTab}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg flex items-center gap-2 hover:bg-gray-300 transition-colors"
            >
              <ExternalLink size={18} />
              Open
            </motion.button>
          </div>
        </div>
      </div>
    );
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col"
        onClick={onClose}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-4 bg-black/50"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-4">
            <h3 className="text-white font-medium truncate max-w-md">
              {currentAttachment?.originalName}
            </h3>
            {canNavigate && (
              <span className="text-gray-400 text-sm">
                {currentIndex + 1} of {attachments.length}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Zoom controls for images */}
            {currentAttachment?.fileType === 'image' && (
              <>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleZoomOut}
                  className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut size={20} />
                </motion.button>
                <span className="text-white text-sm min-w-[60px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleZoomIn}
                  className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn size={20} />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleRotate}
                  className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Rotate"
                >
                  <RotateCw size={20} />
                </motion.button>
                <div className="w-px h-6 bg-white/20 mx-2" />
              </>
            )}
            
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleDownload}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Download"
            >
              <Download size={20} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleOpenInNewTab}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Open in new tab"
            >
              <ExternalLink size={20} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors ml-2"
              title="Close"
            >
              <X size={20} />
            </motion.button>
          </div>
        </div>

        {/* Main content area */}
        <div 
          className="flex-1 relative flex items-center justify-center overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Navigation arrows */}
          {canNavigate && hasPrev && (
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.1)' }}
              whileTap={{ scale: 0.9 }}
              onClick={handlePrev}
              className="absolute left-4 z-10 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <ChevronLeft size={24} />
            </motion.button>
          )}
          
          {canNavigate && hasNext && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.1)' }}
              whileTap={{ scale: 0.9 }}
              onClick={handleNext}
              className="absolute right-4 z-10 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <ChevronRight size={24} />
            </motion.button>
          )}

          {/* Loading overlay */}
          {loading && currentAttachment?.fileType === 'image' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader size={32} className="text-white animate-spin" />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="text-center text-white">
                <p className="mb-4">{error}</p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleDownload}
                  className="px-4 py-2 bg-blue-600 rounded-lg"
                >
                  Download instead
                </motion.button>
              </div>
            </div>
          )}

          {/* Preview content */}
          <div className="w-full h-full p-4">
            {renderPreview()}
          </div>
        </div>

        {/* Thumbnail strip for navigation */}
        {canNavigate && (
          <div 
            className="p-4 bg-black/50 overflow-x-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex gap-2 justify-center">
              {attachments.map((att, index) => (
                <motion.button
                  key={att._id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setCurrentIndex(index);
                    setZoom(1);
                    setRotation(0);
                    setLoading(true);
                    setError(null);
                    onNavigate?.(att);
                  }}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors flex-shrink-0 ${
                    index === currentIndex 
                      ? 'border-blue-500' 
                      : 'border-transparent hover:border-white/50'
                  }`}
                >
                  {att.fileType === 'image' ? (
                    <img
                      src={att.thumbnailUrl || att.secureUrl || att.url}
                      alt={att.originalName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                      <FileText size={24} className="text-gray-400" />
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

const PreviewLoader = () => (
  <div className="flex items-center justify-center h-full">
    <Loader size={32} className="text-white animate-spin" />
  </div>
);

export default DocumentViewerModal;
