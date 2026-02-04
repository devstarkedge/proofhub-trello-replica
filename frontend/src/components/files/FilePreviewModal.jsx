"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader,
  Share2,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Video,
  Music,
  File,
  FileArchive,
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Expand
} from 'lucide-react';
import { toast } from 'react-toastify';

// File type detection utilities
const getFileExtension = (filename) => {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

const inferFileType = (file) => {
  const type = file?.fileType || file?.mimeType || file?.type || '';
  const ext = getFileExtension(file?.name || file?.fileName || file?.originalName || '');
  
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'image';
  if (type.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv'].includes(ext)) return 'video';
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (['xlsx', 'xls', 'csv', 'ods', 'numbers'].includes(ext) || type.includes('spreadsheet') || type.includes('excel')) return 'spreadsheet';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'pages'].includes(ext) || type.includes('word') || type.includes('document') || type.includes('text/plain')) return 'document';
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext) || type.includes('presentation') || type.includes('powerpoint')) return 'presentation';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  
  return 'other';
};

// File type icon mapping
const FILE_TYPE_ICONS = {
  image: { icon: ImageIcon, color: 'from-pink-500 to-rose-500', bgColor: 'bg-pink-100' },
  video: { icon: Video, color: 'from-purple-500 to-violet-500', bgColor: 'bg-purple-100' },
  audio: { icon: Music, color: 'from-indigo-500 to-blue-500', bgColor: 'bg-indigo-100' },
  pdf: { icon: FileText, color: 'from-red-500 to-orange-500', bgColor: 'bg-red-100' },
  spreadsheet: { icon: FileSpreadsheet, color: 'from-green-500 to-emerald-500', bgColor: 'bg-green-100' },
  document: { icon: FileText, color: 'from-blue-500 to-cyan-500', bgColor: 'bg-blue-100' },
  presentation: { icon: FileText, color: 'from-orange-500 to-amber-500', bgColor: 'bg-orange-100' },
  archive: { icon: FileArchive, color: 'from-yellow-500 to-lime-500', bgColor: 'bg-yellow-100' },
  other: { icon: File, color: 'from-gray-500 to-slate-500', bgColor: 'bg-gray-100' }
};

// Format file size
const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '—';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
};

// Video Player Component
const VideoPlayer = ({ url, fileName }) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    if (videoRef.current) {
      videoRef.current.currentTime = percent * duration;
    }
  };

  const skip = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const formatTime = (time) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoRef.current?.parentElement?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-black rounded-xl overflow-hidden">
      <video
        ref={videoRef}
        src={url}
        className="flex-1 w-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        onClick={togglePlay}
      />
      
      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
        {/* Progress bar */}
        <div 
          className="w-full h-1.5 bg-white/30 rounded-full cursor-pointer mb-3 group"
          onClick={handleSeek}
        >
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full relative group-hover:h-2 transition-all"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <button onClick={() => skip(-10)} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
              <SkipBack size={18} />
            </button>
            <button onClick={togglePlay} className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors">
              {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
            </button>
            <button onClick={() => skip(10)} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
              <SkipForward size={18} />
            </button>
            
            <div className="flex items-center gap-2 ml-2">
              <button onClick={toggleMute} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>
            
            <span className="text-sm text-white/80 ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={toggleFullscreen} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
              <Expand size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Audio Player Component
const AudioPlayer = ({ url, fileName, fileConfig }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    if (audioRef.current) {
      audioRef.current.currentTime = percent * duration;
    }
  };

  const formatTime = (time) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const Icon = fileConfig?.icon || Music;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
      />
      
      {/* Animated icon */}
      <motion.div
        animate={{ 
          scale: isPlaying ? [1, 1.05, 1] : 1,
          rotate: isPlaying ? [0, 5, -5, 0] : 0
        }}
        transition={{ repeat: isPlaying ? Infinity : 0, duration: 1 }}
        className={`w-40 h-40 rounded-full bg-gradient-to-br ${fileConfig?.color || 'from-indigo-500 to-purple-500'} flex items-center justify-center shadow-2xl`}
      >
        <Icon className="w-20 h-20 text-white" />
      </motion.div>
      
      {/* Title */}
      <p className="text-xl font-semibold text-gray-800 max-w-md text-center truncate">
        {fileName}
      </p>
      
      {/* Progress bar */}
      <div className="w-full max-w-md">
        <div 
          className="w-full h-2 bg-gray-200 rounded-full cursor-pointer group"
          onClick={handleSeek}
        >
          <div 
            className={`h-full bg-gradient-to-r ${fileConfig?.color || 'from-indigo-500 to-purple-500'} rounded-full relative group-hover:h-3 transition-all`}
            style={{ width: `${(currentTime / duration) * 100}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex justify-between mt-2 text-sm text-gray-500">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      
      {/* Controls */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => { if (audioRef.current) audioRef.current.currentTime -= 10; }}
          className="p-3 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
        >
          <SkipBack size={24} className="text-gray-700" />
        </button>
        <button 
          onClick={togglePlay}
          className={`p-4 rounded-full bg-gradient-to-r ${fileConfig?.color || 'from-indigo-500 to-purple-500'} text-white shadow-lg hover:shadow-xl transition-all`}
        >
          {isPlaying ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
        </button>
        <button 
          onClick={() => { if (audioRef.current) audioRef.current.currentTime += 10; }}
          className="p-3 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
        >
          <SkipForward size={24} className="text-gray-700" />
        </button>
      </div>
    </div>
  );
};

// Main FilePreviewModal Component
const FilePreviewModal = ({
  isOpen,
  onClose,
  file,
  files = [],
  initialIndex = 0,
  onNavigate
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const currentFile = files.length > 0 ? files[currentIndex] : file;
  const fileType = inferFileType(currentFile);
  const fileConfig = FILE_TYPE_ICONS[fileType] || FILE_TYPE_ICONS.other;
  const Icon = fileConfig.icon;

  const fileName = currentFile?.displayName || currentFile?.fileName || currentFile?.originalName || currentFile?.name || 'Untitled';
  const fileSize = currentFile?.fileSize || currentFile?.size;
  const fileUrl = currentFile?.secureUrl || currentFile?.url || (currentFile?.file ? URL.createObjectURL(currentFile.file) : null);

  const canNavigate = files.length > 1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;

  // Reset state when file changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setLoading(true);
    setError(null);
  }, [currentIndex, file]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) handlePrev();
      if (e.key === 'ArrowRight' && hasNext) handleNext();
      if ((e.key === '+' || e.key === '=') && e.ctrlKey) { e.preventDefault(); handleZoomIn(); }
      if (e.key === '-' && e.ctrlKey) { e.preventDefault(); handleZoomOut(); }
      if (e.key === 'r' && e.ctrlKey) { e.preventDefault(); handleRotate(); }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, hasPrev, hasNext]);

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      onNavigate?.(files[newIndex], newIndex);
    }
  }, [currentIndex, hasPrev, files, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      onNavigate?.(files[newIndex], newIndex);
    }
  }, [currentIndex, hasNext, files, onNavigate]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!fileUrl) {
      toast.error('File URL not available');
      return;
    }
    
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      toast.success('Download started');
    } catch (err) {
      console.error('Download failed:', err);
      window.open(fileUrl, '_blank');
    }
  }, [fileUrl, fileName]);

  const handleOpenInNewTab = useCallback(() => {
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  }, [fileUrl]);

  const handleShare = useCallback(async () => {
    if (!fileUrl) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: fileName,
          url: fileUrl
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(fileUrl);
        toast.success('Link copied to clipboard');
      } catch {
        toast.error('Failed to copy link');
      }
    }
  }, [fileUrl, fileName]);

  const toggleFullScreen = useCallback(() => {
    setIsFullScreen(prev => !prev);
  }, []);

  // Render file preview based on type
  const renderPreview = () => {
    if (!currentFile) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
          <File size={64} />
          <p>No file to preview</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
          <div className={`p-6 rounded-2xl ${fileConfig.bgColor}`}>
            <Icon size={48} className="text-gray-600" />
          </div>
          <p className="text-lg font-medium">Failed to load preview</p>
          <p className="text-sm text-gray-400">{error}</p>
          <button
            onClick={handleDownload}
            className="mt-4 flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
          >
            <Download size={18} />
            Download File
          </button>
        </div>
      );
    }

    // Image preview
    if (fileType === 'image') {
      return (
        <div className="flex items-center justify-center h-full overflow-auto p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <Loader className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          )}
          <motion.img
            src={fileUrl}
            alt={fileName}
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s ease'
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

    // Video preview
    if (fileType === 'video') {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <VideoPlayer url={fileUrl} fileName={fileName} />
        </div>
      );
    }

    // Audio preview
    if (fileType === 'audio') {
      return <AudioPlayer url={fileUrl} fileName={fileName} fileConfig={fileConfig} />;
    }

    // PDF preview
    if (fileType === 'pdf') {
      const googleDocsViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
      
      return (
        <div className="w-full h-full flex flex-col p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <Loader className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          )}
          <iframe
            src={googleDocsViewerUrl}
            className="w-full h-full border-0 rounded-xl bg-white shadow-lg"
            title={fileName}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError('Failed to load PDF');
            }}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      );
    }

    // Document / Spreadsheet / Presentation preview - Use Office Online viewer for better compatibility
    if (['document', 'spreadsheet', 'presentation'].includes(fileType)) {
      // Try Microsoft Office Online viewer first (better for xlsx, docx, pptx)
      const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
      const googleDocsViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
      
      // For Cloudinary URLs, show direct download fallback since viewers often fail
      const isCloudinaryUrl = fileUrl?.includes('cloudinary.com');
      
      if (isCloudinaryUrl) {
        // Show a nice fallback UI for Cloudinary files
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`p-8 rounded-3xl bg-gradient-to-br ${fileConfig.color} shadow-2xl`}
            >
              <Icon size={64} className="text-white" />
            </motion.div>
            
            <div className="text-center max-w-md">
              <p className="text-xl font-semibold text-gray-800">{fileName}</p>
              <p className="text-sm text-gray-500 mt-1">{formatBytes(fileSize)} • {fileType.charAt(0).toUpperCase() + fileType.slice(1)}</p>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-md">
              <p className="text-sm text-amber-800 text-center">
                <span className="font-medium">Preview not available in browser.</span>
                <br />
                Download the file to view it in your preferred application.
              </p>
            </div>
            
            <div className="flex gap-3 mt-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/30 font-medium"
              >
                <Download size={20} />
                Download File
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleOpenInNewTab}
                className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
              >
                <ExternalLink size={20} />
                Open in New Tab
              </motion.button>
            </div>
          </div>
        );
      }
      
      return (
        <div className="w-full h-full flex flex-col p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <Loader className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          )}
          <iframe
            src={officeViewerUrl}
            className="w-full h-full border-0 rounded-xl bg-white shadow-lg"
            title={fileName}
            onLoad={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError('Preview not available for this file type');
            }}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      );
    }

    // Fallback for unsupported types
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-6 p-8">
        <div className={`p-8 rounded-3xl bg-gradient-to-br ${fileConfig.color} shadow-2xl`}>
          <Icon size={64} className="text-white" />
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold text-gray-800">{fileName}</p>
          <p className="text-sm text-gray-500 mt-1">{formatBytes(fileSize)}</p>
        </div>
        <p className="text-gray-400">Preview not available for this file type</p>
        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg"
          >
            <Download size={18} />
            Download
          </button>
          <button
            onClick={handleOpenInNewTab}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <ExternalLink size={18} />
            Open in New Tab
          </button>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  const modalWidth = isFullScreen ? 'w-full h-full' : 'w-[95vw] max-w-6xl h-[90vh]';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed inset-0 z-[101] flex items-center justify-center p-4 ${isFullScreen ? 'p-0' : ''}`}
          >
            <div className={`${modalWidth} bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden ${isFullScreen ? 'rounded-none' : ''}`}>
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${fileConfig.color}`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate max-w-md" title={fileName}>
                      {fileName}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {formatBytes(fileSize)} • {fileType.charAt(0).toUpperCase() + fileType.slice(1)}
                      {canNavigate && ` • ${currentIndex + 1} of ${files.length}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Zoom controls for images */}
                  {fileType === 'image' && (
                    <>
                      <button
                        onClick={handleZoomOut}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Zoom Out (Ctrl+-)"
                      >
                        <ZoomOut size={20} />
                      </button>
                      <span className="text-sm text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
                      <button
                        onClick={handleZoomIn}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Zoom In (Ctrl++)"
                      >
                        <ZoomIn size={20} />
                      </button>
                      <button
                        onClick={handleRotate}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Rotate (Ctrl+R)"
                      >
                        <RotateCw size={20} />
                      </button>
                      <div className="w-px h-6 bg-gray-200 mx-1" />
                    </>
                  )}

                  <button
                    onClick={handleShare}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Share"
                  >
                    <Share2 size={20} />
                  </button>
                  <button
                    onClick={handleOpenInNewTab}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Open in New Tab"
                  >
                    <ExternalLink size={20} />
                  </button>
                  <button
                    onClick={handleDownload}
                    className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Download"
                  >
                    <Download size={20} />
                  </button>
                  <button
                    onClick={toggleFullScreen}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    title={isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  >
                    {isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-2"
                    title="Close (Esc)"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 relative bg-gray-100 overflow-hidden">
                {/* Navigation arrows */}
                {canNavigate && (
                  <>
                    <button
                      onClick={handlePrev}
                      disabled={!hasPrev}
                      className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/90 shadow-lg transition-all ${
                        hasPrev ? 'hover:bg-white hover:scale-110 text-gray-700' : 'opacity-30 cursor-not-allowed text-gray-400'
                      }`}
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={!hasNext}
                      className={`absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/90 shadow-lg transition-all ${
                        hasNext ? 'hover:bg-white hover:scale-110 text-gray-700' : 'opacity-30 cursor-not-allowed text-gray-400'
                      }`}
                    >
                      <ChevronRight size={24} />
                    </button>
                  </>
                )}

                {renderPreview()}
              </div>

              {/* Footer with file list thumbnails */}
              {canNavigate && (
                <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-3">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {files.map((f, idx) => {
                      const fType = inferFileType(f);
                      const fConfig = FILE_TYPE_ICONS[fType] || FILE_TYPE_ICONS.other;
                      const FIcon = fConfig.icon;
                      const fUrl = f.secureUrl || f.url || (f.file ? URL.createObjectURL(f.file) : null);
                      const fName = f.displayName || f.fileName || f.originalName || f.name || 'File';
                      
                      return (
                        <button
                          key={f._id || f.id || idx}
                          onClick={() => {
                            setCurrentIndex(idx);
                            onNavigate?.(f, idx);
                          }}
                          className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                            idx === currentIndex 
                              ? 'border-indigo-500 ring-2 ring-indigo-500/30' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          title={fName}
                        >
                          {fType === 'image' && fUrl ? (
                            <img src={fUrl} alt={fName} className="w-full h-full object-cover" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${fConfig.bgColor}`}>
                              <FIcon size={24} className="text-gray-600" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default FilePreviewModal;
