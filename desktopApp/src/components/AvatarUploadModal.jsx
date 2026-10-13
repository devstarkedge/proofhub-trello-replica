import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { 
  X, Upload, Loader2, ZoomIn, ZoomOut, RotateCcw, 
  Check, HardDrive, AlertCircle
} from 'lucide-react';
import useAvatar from '../hooks/useAvatar';
import useGoogleDrivePicker from '../hooks/useGoogleDrivePicker';
import Avatar from './Avatar';

// Google Drive SVG Icon component
const GoogleDriveIcon = ({ size = 16, className = '' }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 87.3 78" 
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA"/>
    <path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 52.35c-.8 1.4-1.2 2.95-1.2 4.5h27.5L43.65 25z" fill="#00AC47"/>
    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.85L73.55 76.8z" fill="#EA4335"/>
    <path d="M43.65 25L57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2H34.15c-1.55 0-3.1.45-4.5 1.2L43.65 25z" fill="#00832D"/>
    <path d="M59.85 53H27.5l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.55 0 3.1-.45 4.5-1.2L59.85 53z" fill="#2684FC"/>
    <path d="M73.4 26.5L60.75 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.2 28h27.45c0-1.55-.4-3.1-1.2-4.5l-12.7-22z" fill="#FFBA00"/>
  </svg>
);

/**
 * Center crop helper
 */
function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
  return centerCrop(
    makeAspectCrop(
      { unit: '%', width: 90 },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

/**
 * AvatarUploadModal Component
 * Full-featured modal for avatar upload with cropping
 */
const AvatarUploadModal = ({ isOpen, onClose }) => {
  const { 
    avatar: currentAvatar, 
    userName, 
    uploadFromDevice, 
    uploadFromGoogleDrive,
    uploading, 
    progress, 
    error: uploadError 
  } = useAvatar();

  const { openPicker, isLoading: isPickerLoading, isAvailable: isDriveAvailable } = useGoogleDrivePicker();

  const [step, setStep] = useState('select'); // 'select' | 'crop' | 'uploading'
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('select');
      setSelectedFile(null);
      setPreviewUrl('');
      setCrop(undefined);
      setCompletedCrop(null);
      setScale(1);
      setError('');
    }
  }, [isOpen]);

  // Cleanup preview URL
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Handle file selection from device
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Please select JPG, PNG, or WEBP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum size is 5MB.');
      return;
    }

    setError('');
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStep('crop');
    // Reset input for re-selection
    e.target.value = '';
  }, []);

  // Handle image load for cropping
  const onImageLoad = useCallback((e) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }, []);

  // Generate cropped image blob
  const getCroppedImage = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!completedCrop || !imgRef.current || !canvasRef.current) {
        reject(new Error('Crop not complete'));
        return;
      }

      const image = imgRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      // Set canvas size to 512x512 for consistent output
      const outputSize = 512;
      canvas.width = outputSize;
      canvas.height = outputSize;

      ctx.imageSmoothingQuality = 'high';

      const cropX = completedCrop.x * scaleX;
      const cropY = completedCrop.y * scaleY;
      const cropWidth = completedCrop.width * scaleX;
      const cropHeight = completedCrop.height * scaleY;

      ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        outputSize,
        outputSize
      );

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], selectedFile?.name || 'avatar.jpg', { 
              type: 'image/jpeg' 
            }));
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/jpeg',
        0.9
      );
    });
  }, [completedCrop, selectedFile]);

  // Handle crop upload
  const handleCropUpload = useCallback(async () => {
    try {
      setStep('uploading');
      const croppedFile = await getCroppedImage();
      const result = await uploadFromDevice(croppedFile);
      
      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Upload failed');
        setStep('crop');
      }
    } catch (err) {
      setError(err.message || 'Failed to process image');
      setStep('crop');
    }
  }, [getCroppedImage, uploadFromDevice, onClose]);

  // Handle Google Drive selection
  const handleGoogleDriveClick = useCallback(() => {
    openPicker({
      onSelect: async ({ files, accessToken }) => {
        if (files && files.length > 0) {
          setStep('uploading');
          const result = await uploadFromGoogleDrive({ files, accessToken });
          
          if (result.success) {
            onClose();
          } else {
            setError(result.error || 'Upload failed');
            setStep('select');
          }
        }
      },
      onCancel: () => {},
      onError: (err) => {
        setError(err || 'Failed to open Google Drive');
      }
    });
  }, [openPicker, uploadFromGoogleDrive, onClose]);

  // Handle zoom
  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.1, 0.5));
  const handleResetZoom = () => setScale(1);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-purple-600">
            <h2 className="text-lg font-semibold text-white">
              {step === 'select' && 'Update Profile Photo'}
              {step === 'crop' && 'Crop Photo'}
              {step === 'uploading' && 'Uploading...'}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-white/20 transition-colors"
              aria-label="Close modal"
            >
              <X size={20} className="text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Error Display */}
            {(error || uploadError) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-600"
              >
                <AlertCircle size={18} />
                <span className="text-sm">{error || uploadError}</span>
              </motion.div>
            )}

            {/* Step: Select Source */}
            {step === 'select' && (
              <div className="space-y-4">
                {/* Current Avatar Preview */}
                <div className="flex justify-center mb-6">
                  <Avatar 
                    src={currentAvatar} 
                    name={userName} 
                    size="2xl"
                  />
                </div>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* Upload Options */}
                <div className="space-y-3">
                  {/* Device Upload */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 
                               border-2 border-gray-200 hover:border-blue-300 rounded-xl 
                               transition-all group"
                  >
                    <div className="p-3 bg-white rounded-lg shadow-sm group-hover:shadow">
                      <HardDrive size={24} className="text-gray-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-gray-800">Upload from Device</div>
                      <div className="text-sm text-gray-500">JPG, PNG, or WEBP up to 5MB</div>
                    </div>
                  </motion.button>

                  {/* Google Drive */}
                  {isDriveAvailable && (
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={handleGoogleDriveClick}
                      disabled={isPickerLoading}
                      className="w-full flex items-center gap-4 p-4 bg-blue-50 hover:bg-blue-100 
                                 border-2 border-blue-200 hover:border-blue-400 rounded-xl 
                                 transition-all group disabled:opacity-50"
                    >
                      <div className="p-3 bg-white rounded-lg shadow-sm group-hover:shadow">
                        {isPickerLoading ? (
                          <Loader2 size={24} className="text-blue-600 animate-spin" />
                        ) : (
                          <GoogleDriveIcon size={24} />
                        )}
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-blue-700">Add from Google Drive</div>
                        <div className="text-sm text-blue-500">Pick from your Drive</div>
                      </div>
                    </motion.button>
                  )}
                </div>
              </div>
            )}

            {/* Step: Crop Image */}
            {step === 'crop' && previewUrl && (
              <div className="space-y-4">
                {/* Crop Area */}
                <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ minHeight: 300 }}>
                  <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={1}
                    circularCrop
                    className="max-h-[400px]"
                  >
                    <img
                      ref={imgRef}
                      src={previewUrl}
                      alt="Crop preview"
                      onLoad={onImageLoad}
                      style={{ transform: `scale(${scale})` }}
                      className="max-w-full transition-transform"
                    />
                  </ReactCrop>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={handleZoomOut}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                    title="Zoom out"
                  >
                    <ZoomOut size={18} />
                  </button>
                  <span className="text-sm text-gray-600 w-16 text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    onClick={handleZoomIn}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                    title="Zoom in"
                  >
                    <ZoomIn size={18} />
                  </button>
                  <button
                    onClick={handleResetZoom}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors ml-2"
                    title="Reset zoom"
                  >
                    <RotateCcw size={18} />
                  </button>
                </div>

                {/* Hidden canvas for cropping */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('select')}
                    className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                  >
                    Back
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCropUpload}
                    disabled={!completedCrop}
                    className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white 
                               rounded-lg font-medium transition-colors flex items-center 
                               justify-center gap-2 disabled:opacity-50"
                  >
                    <Check size={18} />
                    Apply
                  </motion.button>
                </div>
              </div>
            )}

            {/* Step: Uploading */}
            {step === 'uploading' && (
              <div className="py-8 text-center">
                <Loader2 size={48} className="mx-auto text-blue-600 animate-spin mb-4" />
                <p className="text-gray-600 mb-2">Uploading your photo...</p>
                {progress > 0 && (
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
                    <motion.div
                      className="bg-blue-600 h-2 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AvatarUploadModal;
