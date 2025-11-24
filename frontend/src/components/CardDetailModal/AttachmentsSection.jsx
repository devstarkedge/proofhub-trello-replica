import React from "react";
import { Paperclip, Download, Trash2, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

const AttachmentsSection = ({ attachments, onDeleteAttachment }) => {
  if (attachments.length === 0) return null;

  const handleDownload = (attachment) => {
    const url = attachment.url || `/uploads/card-images/${attachment.filename}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.originalName || attachment.name || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
    >
      <div className="flex items-center gap-3 mb-3">
        <Paperclip size={20} className="text-gray-600" />
        <h4 className="font-semibold text-gray-800 text-lg">
          Attachments
        </h4>
        {attachments.length > 0 && (
          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full font-medium">
            {attachments.length}
          </span>
        )}
      </div>
      <div className="ml-8 space-y-2">
        {attachments.map((attachment, index) => {
          const safeKey = String(attachment.name || attachment._id || `attachment-${index}`).trim() || `attachment-${index}`;
          return (
            <motion.div
              key={safeKey}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300 transition-all bg-white hover:bg-blue-50 shadow-sm hover:shadow-md"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Paperclip size={16} className="text-gray-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate font-medium">
                    {attachment.originalName || attachment.name}
                  </p>
                  {attachment.size && (
                    <p className="text-xs text-gray-500">
                      {(attachment.size / 1024).toFixed(2)} KB
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleDownload(attachment)}
                  className="p-1.5 hover:bg-blue-100 text-gray-600 hover:text-blue-600 rounded transition-colors"
                  title="Download"
                >
                  <Download size={16} />
                </motion.button>
                {attachment.url && (
                  <motion.a
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 hover:bg-blue-100 text-gray-600 hover:text-blue-600 rounded transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink size={16} />
                  </motion.a>
                )}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (window.confirm(`Delete "${attachment.originalName || attachment.name}"?`)) {
                      // Pass index as it's the most reliable identifier
                      onDeleteAttachment && onDeleteAttachment(index);
                    }
                  }}
                  className="p-1.5 hover:bg-red-100 text-gray-600 hover:text-red-600 rounded transition-colors"
                  title="Delete attachment"
                >
                  <Trash2 size={16} />
                </motion.button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default AttachmentsSection;
