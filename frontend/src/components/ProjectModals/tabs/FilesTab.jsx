import React, { memo } from 'react';
import { Paperclip } from 'lucide-react';
import EnterpriseFileUploader from '../../EnterpriseFileUploader';

const FilesTab = memo(({
  pendingFiles,
  existingFiles = [],
  handleFilesAdded,
  handleRemovePendingFile,
  handleRemoveExisting = null,
  handleRetryUpload,
  uploadErrors
}) => {
  return (
    <div className="space-y-6">
      {/* Files info banner */}
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Paperclip size={20} className="text-blue-600" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-gray-900">Attach Project Files</h4>
          <p className="text-xs text-gray-600 mt-0.5">
            Upload documents, images, videos, and more. Files will be saved when you create the project.
          </p>
        </div>
        {(pendingFiles.length > 0 || existingFiles.length > 0) && (
          <span className="px-3 py-1.5 bg-white text-blue-700 text-sm font-medium rounded-lg border border-blue-200 shadow-sm">
            {pendingFiles.length + existingFiles.length} file{(pendingFiles.length + existingFiles.length) !== 1 ? 's' : ''} ready
          </span>
        )}
      </div>

      <EnterpriseFileUploader
        title="Project Attachments"
        description="Drag & drop files here, or click to browse"
        helperText="Supported: PDF, Docs, Images, Videos, Spreadsheets, Audio (Max 25MB each)"
        pendingFiles={pendingFiles}
        existingFiles={existingFiles}
        onFilesAdded={handleFilesAdded}
        onRemovePending={handleRemovePendingFile}
        onRemoveExisting={handleRemoveExisting}
        onRetryUpload={handleRetryUpload}
        errors={uploadErrors}
        showPreview={true}
      />
    </div>
  );
});

FilesTab.displayName = 'FilesTab';

export default FilesTab;
