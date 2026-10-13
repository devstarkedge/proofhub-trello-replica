import { useState, useCallback, useRef, useEffect } from 'react';

export function useFileUploadSimulation() {
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadErrors, setUploadErrors] = useState([]);
  const uploadProgressTimers = useRef(new Map());

  // Cleanup progress timers on unmount
  useEffect(() => {
    return () => {
      uploadProgressTimers.current.forEach((timer) => clearInterval(timer));
      uploadProgressTimers.current.clear();
    };
  }, []);

  const updatePendingFile = useCallback((id, updates) => {
    setPendingFiles((prev) => prev.map((fileItem) => (
      fileItem.id === id ? { ...fileItem, ...updates } : fileItem
    )));
  }, []);

  const startProgressSimulation = useCallback((id) => {
    if (uploadProgressTimers.current.has(id)) return;
    const timer = setInterval(() => {
      setPendingFiles(prev => prev.map(fileItem => {
        if (fileItem.id !== id || fileItem.status !== 'uploading') return fileItem;
        const current = Number(fileItem.progress) || 0;
        if (current >= 90) {
          // Stop at 90%, mark as ready for actual upload
          clearInterval(uploadProgressTimers.current.get(id));
          uploadProgressTimers.current.delete(id);
          return { ...fileItem, progress: 90, status: 'ready' };
        }
        const increment = 3 + Math.round(Math.random() * 5);
        return { ...fileItem, progress: Math.min(90, current + increment) };
      }));
    }, 300);
    uploadProgressTimers.current.set(id, timer);
  }, []);

  const stopProgressSimulation = useCallback((id) => {
    const timer = uploadProgressTimers.current.get(id);
    if (timer) {
      clearInterval(timer);
      uploadProgressTimers.current.delete(id);
    }
  }, []);

  const handleFilesAdded = useCallback((files, initialStatus = 'uploading') => {
    const newItems = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: initialStatus 
    }));
    setPendingFiles((prev) => [...prev, ...newItems]);
    setUploadErrors([]);

    // Only start simulation if status is uploading
    if (initialStatus === 'uploading') {
      newItems.forEach(item => startProgressSimulation(item.id));
    }
  }, [startProgressSimulation]);

  const handleRemovePendingFile = useCallback((item) => {
    stopProgressSimulation(item.id);
    setPendingFiles((prev) => prev.filter((f) => f.id !== item.id));
  }, [stopProgressSimulation]);

  const handleRetryUpload = useCallback((item) => {
    updatePendingFile(item.id, { status: 'uploading', progress: 0, error: null });
    startProgressSimulation(item.id);
  }, [updatePendingFile, startProgressSimulation]);

  return {
    pendingFiles,
    setPendingFiles,
    uploadErrors,
    setUploadErrors,
    handleFilesAdded,
    handleRemovePendingFile,
    handleRetryUpload,
    updatePendingFile,
    startProgressSimulation,
    stopProgressSimulation,
  };
}
