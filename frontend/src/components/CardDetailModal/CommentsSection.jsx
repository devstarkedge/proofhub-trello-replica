import React, { useContext, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Loader, ChevronRight, ChevronDown } from "lucide-react";
import RichTextEditor from "../RichTextEditor";
import AuthContext from "../../context/AuthContext";

const CommentsSection = ({
  comments,
  newComment,
  teamMembers,
  onCommentChange,
  onAddComment,
  onImageUpload,
  modalContainerRef,
}) => {
  const { user } = useContext(AuthContext);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const editorContainerRef = useRef(null);

  // Handle clicking outside to collapse editor (scoped to modal)
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't collapse if clicking inside the editor container
      if (editorContainerRef.current && editorContainerRef.current.contains(event.target)) {
        return;
      }
      
      // If modal container is provided, only collapse if click is within the modal
      if (modalContainerRef?.current) {
        if (modalContainerRef.current.contains(event.target)) {
          setIsEditorExpanded(false);
        }
      }
    };

    if (isEditorExpanded) {
      // Use a small delay to prevent immediate collapse
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditorExpanded, modalContainerRef]);

  const handleSubmit = async () => {
    if (!newComment?.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddComment();
      setIsEditorExpanded(false); // Collapse after successful submit
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <MessageSquare size={20} className="text-gray-600" />
        <h4 className="font-semibold text-gray-800 text-lg">
          Activity
        </h4>
        {comments.length > 0 && (
          <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full font-medium">
            {comments.length}
          </span>
        )}
      </div>

      <div className="ml-8 space-y-4">
        {/* Add Comment */}
        <motion.div
          ref={editorContainerRef}
          className="flex gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold shadow-md flex-shrink-0">
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1">
            <AnimatePresence mode="wait">
              {isEditorExpanded ? (
                <motion.div
                  key="expanded"
                  initial={{ opacity: 0, height: "auto" }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 50 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <div className="border border-gray-300 rounded-lg overflow-hidden hover:border-gray-400 transition-colors shadow-sm hover:shadow-md">
                    <RichTextEditor
                      content={newComment}
                      onChange={onCommentChange}
                      placeholder="Write a comment..."
                      users={teamMembers}
                      isComment={true}
                      allowMentions={true}
                      startExpanded={true}
                      className="min-h-[80px]"
                      onImageUpload={onImageUpload}
                      mentionContainer={document.querySelector('.fixed.inset-0.bg-black.bg-opacity-50.flex.items-start.justify-center.z-60')}
                    />
                  </div>
                  <div className="flex justify-end mt-2 gap-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setIsEditorExpanded(false)}
                      className="px-4 py-2 text-gray-600 hover:text-gray-800 rounded-lg transition-colors font-medium"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSubmit}
                      disabled={isSubmitting || !newComment?.trim()}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:shadow-lg transition-all font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting && <Loader size={16} className="animate-spin" />}
                      {isSubmitting ? "Posting..." : "Comment"}
                    </motion.button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="collapsed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setIsEditorExpanded(true)}
                  className="p-3 bg-white rounded-lg cursor-pointer hover:bg-gray-50 border border-gray-200 hover:border-gray-300 transition-all shadow-sm flex items-center gap-2"
                >
                  <ChevronRight size={16} className="text-gray-400" />
                  <span className="text-gray-500 text-sm">Write a comment...</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Comments List with Scrollbar */}
        <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar">
          <AnimatePresence>
            {comments.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8 text-gray-400"
              >
                <MessageSquare size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No comments yet. Be the first to comment!</p>
              </motion.div>
            ) : (
              comments.map((comment, index) => {
                const safeKey = String(comment._id || comment.id || `comment-${index}`).trim() || `comment-${index}`;
                return (
                  <motion.div
                    key={safeKey}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex gap-3 mb-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white font-semibold shadow-md flex-shrink-0">
                      {comment.user?.name?.[0]?.toUpperCase() || "U"}
                    </div>
                    <div className="flex-1">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-sm text-gray-900">
                            {comment.user?.name || "User"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none prose-img:max-w-full prose-img:h-auto prose-img:rounded-md prose-img:shadow-sm" dangerouslySetInnerHTML={{ __html: comment.htmlContent || comment.text }} />
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      <style jsx="true">{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
    </motion.div>
  );
};

export default CommentsSection;
