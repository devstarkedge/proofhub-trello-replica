import React, { useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Image, Video, Music, FileSpreadsheet, FileArchive, FileType2, X, AlertCircle } from 'lucide-react';

const FILE_TYPE_ICONS = {
  image: Image,
  video: Video,
  audio: Music,
  spreadsheet: FileSpreadsheet,
  pdf: FileText,
  document: FileType2,
  text: FileText,
  other: FileText,
};

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '—';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
};

const inferCategory = (file) => {
  const type = file?.type || '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf') return 'pdf';
  if (type.includes('spreadsheet') || type.includes('excel')) return 'spreadsheet';
  if (type.includes('word') || type.includes('document')) return 'document';
  if (type.startsWith('text/')) return 'text';
  return 'other';
};

const DragDropFileUploader = ({
  title = 'Attachments',
  description = 'Drag & drop files here, or click to browse',
  helperText = 'Supported: PDF, CSV, DOC/DOCX, PPT/PPTX, Images, Video, Audio',
  files = [],
  onFilesAdded,
  onRemove,
  disabled = false,
  isCompact = false,
  errors = [],
}) => {
  const accept = useMemo(() => ({
    'image/*': [],
    'video/*': [],
    'audio/*': [],
    'application/pdf': [],
    'text/plain': [],
    'text/csv': [],
    'application/msword': [],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
    'application/vnd.ms-powerpoint': [],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': [],
    'application/vnd.ms-excel': [],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [],
    'application/vnd.google-apps.document': [],
    'application/vnd.google-apps.spreadsheet': [],
    'application/vnd.google-apps.presentation': [],
    'application/vnd.oasis.opendocument.text': [],
    'application/vnd.oasis.opendocument.spreadsheet': [],
    'application/vnd.oasis.opendocument.presentation': [],
  }), []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (!onFilesAdded || disabled) return;
      onFilesAdded(acceptedFiles);
    },
    accept,
    disabled,
    maxSize: 25 * 1024 * 1024,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          <p className="text-xs text-gray-500 mt-1">{helperText}</p>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-blue-300 bg-white'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${
          isCompact ? 'p-4' : 'p-6'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center text-center gap-2">
          <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
            <Upload className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-gray-800">{description}</p>
          <p className="text-xs text-gray-500">Max 25MB per file</p>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="space-y-2">
          {errors.map((err, idx) => (
            <div key={`${err}-${idx}`} className="text-xs text-red-600 flex items-center gap-2">
              <AlertCircle size={14} /> {err}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((item, index) => {
            const file = item.file || item;
            const category = item.fileType || inferCategory(file);
            const Icon = FILE_TYPE_ICONS[category] || FileText;
            return (
              <div
                key={item.id || file.name + index}
                className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-xl bg-white"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.displayName || file.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(item.fileSize || file.size)} • {item.versionLabel || category}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {typeof item.progress === 'number' && (
                    <div className="w-24">
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${Math.min(100, item.progress)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {onRemove && (
                    <button
                      type="button"
                      onClick={() => onRemove(item, index)}
                      className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DragDropFileUploader;
