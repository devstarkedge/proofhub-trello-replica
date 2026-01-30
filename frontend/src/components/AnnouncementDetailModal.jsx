import React, { useState, useContext, useMemo } from "react";
import {
  X,
  MessageCircle,
  Send,
  Trash2,
  Clock,
  Calendar,
  Share2,
  Download,
  ExternalLink,
  FileText,
  Image,
  File,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { formatDistanceToNow, format as formatDate } from "date-fns";
import { toast } from "react-toastify";
import AuthContext from "../context/AuthContext";
import announcementService from "../services/announcementService";

const REACTIONS = ["👍", "❤️", "🎉", "🔥", "👀"];

// Image Gallery Modal Component
const ImageGalleryModal = ({ images, currentIndex, onClose, onNavigate }) => {
  const [zoom, setZoom] = useState(1);
  const currentImage = images[currentIndex];

  const handleKeyDown = (e) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
    if (e.key === "ArrowRight" && currentIndex < images.length - 1) onNavigate(currentIndex + 1);
  };

  React.useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex]);

  return (
    <div 
      className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition z-10"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Zoom controls */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.5, z - 0.25)); }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition"
        >
          <ZoomOut className="w-5 h-5 text-white" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(3, z + 0.25)); }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition"
        >
          <ZoomIn className="w-5 h-5 text-white" />
        </button>
        <span className="text-white text-sm self-center px-2">{Math.round(zoom * 100)}%</span>
      </div>

      {/* Navigation arrows */}
      {currentIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1); }}
          className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition"
        >
          <ChevronLeft className="w-8 h-8 text-white" />
        </button>
      )}
      {currentIndex < images.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1); }}
          className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition"
        >
          <ChevronRight className="w-8 h-8 text-white" />
        </button>
      )}

      {/* Image */}
      <div 
        className="max-w-[90vw] max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={currentImage.url}
          alt={currentImage.original_name}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          className="max-w-full max-h-[85vh] object-contain transition-transform duration-200"
          loading="lazy"
        />
      </div>

      {/* Image info */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm">
        <p className="font-medium">{currentImage.original_name}</p>
        <p className="text-gray-300 text-xs">
          {currentIndex + 1} of {images.length} • {(currentImage.file_size / 1024).toFixed(1)} KB
        </p>
      </div>
    </div>
  );
};

const AnnouncementDetailModal = ({
  isOpen,
  announcement,
  onClose,
  onAddComment = () => console.warn("onAddComment missing"),
  onDeleteComment = () => console.warn("onDeleteComment missing"),
  onAddReaction = () => console.warn("onAddReaction missing"),
  onRemoveReaction = () => console.warn("onRemoveReaction missing"),
  onAttachmentDeleted = () => {},
  isLoading,
}) => {
  const { user } = useContext(AuthContext);
  const [commentText, setCommentText] = useState("");
  const [hoveredReaction, setHoveredReaction] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [copiedLink, setCopiedLink] = useState(null);
  const [deletingAttachment, setDeletingAttachment] = useState(null);
  const commentsEndRef = React.useRef(null);

  // Auto-scroll to bottom of comments when new ones are added
  React.useEffect(() => {
    if (announcement?.comments?.length) {
      commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [announcement?.comments]);

  // Separate images and documents
  const { images, documents } = useMemo(() => {
    if (!announcement?.attachments) return { images: [], documents: [] };
    
    const activeAttachments = announcement.attachments.filter(att => !att.isDeleted);
    
    return {
      images: activeAttachments.filter(att => att.resource_type === 'image'),
      documents: activeAttachments.filter(att => att.resource_type === 'raw')
    };
  }, [announcement?.attachments]);

  if (!isOpen || !announcement) return null;

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) {
      toast.error("Comment cannot be empty");
      return;
    }
    await onAddComment(announcement._id, commentText);
    setCommentText("");
  };

  const handleReactionClick = async (emoji) => {
    const userReacted = announcement.reactions
      ?.find((r) => r.emoji === emoji)
      ?.users?.some((u) => u._id === user._id || u === user._id);

    if (userReacted) {
      await onRemoveReaction(announcement._id, emoji);
    } else {
      await onAddReaction(announcement._id, emoji);
    }
  };

  const openGallery = (index) => {
    setCurrentImageIndex(index);
    setGalleryOpen(true);
  };

  const copyAttachmentLink = async (url, id) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(id);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm("Are you sure you want to delete this attachment?")) return;
    
    setDeletingAttachment(attachmentId);
    try {
      await announcementService.deleteAttachment(announcement._id, attachmentId);
      toast.success("Attachment deleted successfully");
      if (onAttachmentDeleted) {
        onAttachmentDeleted(attachmentId);
      }
    } catch (error) {
      toast.error(error.message || "Failed to delete attachment");
    } finally {
      setDeletingAttachment(null);
    }
  };

  const canDeleteAttachment = (attachment) => {
    return (
      user?.role === 'admin' ||
      announcement.createdBy?._id === user?._id ||
      attachment.uploadedBy === user?._id
    );
  };

  const getDocumentIcon = (mimetype) => {
    if (mimetype === 'application/pdf') {
      return <FileText className="w-8 h-8 text-red-500" />;
    }
    if (mimetype?.includes('word') || mimetype?.includes('document')) {
      return <FileText className="w-8 h-8 text-blue-500" />;
    }
    return <File className="w-8 h-8 text-gray-500" />;
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex">
        {/* Left Section - Announcement Content */}
        <div className="flex-1 overflow-y-auto p-6 border-r border-gray-200">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {announcement.title}
              </h2>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    announcement.category === "HR"
                      ? "bg-purple-100 text-purple-700"
                      : announcement.category === "Urgent"
                      ? "bg-red-100 text-red-700"
                      : announcement.category === "System Update"
                      ? "bg-blue-100 text-blue-700"
                      : announcement.category === "Events"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {announcement.category}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <X className="w-6 h-6 text-gray-600" />
            </button>
          </div>

          {/* Author and Dates */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
            <div className="flex items-center gap-2">
              {announcement.createdBy?.avatar ? (
                <img
                  src={announcement.createdBy?.avatar}
                  alt={announcement.createdBy?.name}
                  className="w-10 h-10 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm border border-white/20 ${(() => {
                    const colors = [
                      "bg-gradient-to-br from-red-500 to-red-600",
                      "bg-gradient-to-br from-orange-500 to-orange-600",
                      "bg-gradient-to-br from-amber-500 to-amber-600",
                      "bg-gradient-to-br from-green-500 to-green-600",
                      "bg-gradient-to-br from-emerald-500 to-emerald-600",
                      "bg-gradient-to-br from-teal-500 to-teal-600",
                      "bg-gradient-to-br from-cyan-500 to-cyan-600",
                      "bg-gradient-to-br from-blue-500 to-blue-600",
                      "bg-gradient-to-br from-indigo-500 to-indigo-600",
                      "bg-gradient-to-br from-violet-500 to-violet-600",
                      "bg-gradient-to-br from-purple-500 to-purple-600",
                      "bg-gradient-to-br from-fuchsia-500 to-fuchsia-600",
                      "bg-gradient-to-br from-pink-500 to-pink-600",
                      "bg-gradient-to-br from-rose-500 to-rose-600",
                    ];
                    let hash = 0;
                    const name = announcement.createdBy?.name || "User";
                    for (let i = 0; i < name.length; i++) {
                      hash = name.charCodeAt(i) + ((hash << 5) - hash);
                    }
                    return colors[Math.abs(hash) % colors.length];
                  })()}`}
                >
                  {(announcement.createdBy?.name || "User")
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900">
                  {announcement.createdBy?.name}
                </p>
                <p className="text-xs text-gray-600">
                  {announcement.createdBy?.title}
                </p>
              </div>
            </div>
            <div className="text-xs text-gray-600 space-y-1 ml-12">
              <p>
                <Calendar className="w-3 h-3 inline mr-1" />
                Created: {formatDate(new Date(announcement.createdAt), "PPp")}
              </p>
              <p>
                <Clock className="w-3 h-3 inline mr-1" />
                Expires: {formatDate(new Date(announcement.expiresAt), "PPp")}
              </p>
              {announcement.scheduledFor && (
                <p>
                  <Clock className="w-3 h-3 inline mr-1" />
                  Scheduled:{" "}
                  {formatDate(new Date(announcement.scheduledFor), "PPp")}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="mb-6">
            <p className="text-gray-700 whitespace-pre-wrap">
              {announcement.description}
            </p>
          </div>

          {/* Attachments Section */}
          {(images.length > 0 || documents.length > 0) && (
            <div className="mb-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                Attachments
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                  {images.length + documents.length}
                </span>
              </h3>

              {/* Image Gallery */}
              {images.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Image className="w-3 h-3" />
                    Images ({images.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((attachment, idx) => (
                      <div
                        key={attachment._id || idx}
                        className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:border-blue-400 transition-all"
                        onClick={() => openGallery(idx)}
                      >
                        <img
                          src={attachment.thumbnail_url || attachment.url}
                          alt={attachment.original_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {/* Overlay on hover */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Maximize2 className="w-6 h-6 text-white" />
                        </div>
                        {/* Action buttons */}
                        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyAttachmentLink(attachment.url, attachment._id); }}
                            className="p-1 bg-white/90 rounded-full hover:bg-white shadow-sm"
                            title="Copy link"
                          >
                            {copiedLink === attachment._id ? (
                              <Check className="w-3 h-3 text-green-500" />
                            ) : (
                              <Copy className="w-3 h-3 text-gray-600" />
                            )}
                          </button>
                          {canDeleteAttachment(attachment) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(attachment._id); }}
                              className="p-1 bg-white/90 rounded-full hover:bg-red-50 shadow-sm"
                              title="Delete"
                              disabled={deletingAttachment === attachment._id}
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents List */}
              {documents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Documents ({documents.length})
                  </p>
                  <div className="space-y-2">
                    {documents.map((attachment, idx) => (
                      <div
                        key={attachment._id || idx}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition group"
                      >
                        <div className="flex items-center gap-3">
                          {getDocumentIcon(attachment.mimetype)}
                          <div>
                            <p className="text-sm font-medium text-gray-700 truncate max-w-[180px]" title={attachment.original_name}>
                              {attachment.original_name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {(attachment.file_size / 1024).toFixed(1)} KB
                              {attachment.tag && attachment.tag !== 'general' && (
                                <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] uppercase">
                                  {attachment.tag}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => copyAttachmentLink(attachment.url, attachment._id)}
                            className="p-1.5 hover:bg-white rounded-lg transition opacity-0 group-hover:opacity-100"
                            title="Copy link"
                          >
                            {copiedLink === attachment._id ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-white rounded-lg transition opacity-0 group-hover:opacity-100"
                            title="Open in new tab"
                          >
                            <ExternalLink className="w-4 h-4 text-gray-500" />
                          </a>
                          <a
                            href={attachment.url}
                            download={attachment.original_name}
                            className="p-1.5 hover:bg-white rounded-lg transition opacity-0 group-hover:opacity-100"
                            title="Download"
                          >
                            <Download className="w-4 h-4 text-gray-500" />
                          </a>
                          {canDeleteAttachment(attachment) && (
                            <button
                              onClick={() => handleDeleteAttachment(attachment._id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                              title="Delete"
                              disabled={deletingAttachment === attachment._id}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Image Gallery Modal */}
          {galleryOpen && images.length > 0 && (
            <ImageGalleryModal
              images={images}
              currentIndex={currentImageIndex}
              onClose={() => setGalleryOpen(false)}
              onNavigate={setCurrentImageIndex}
            />
          )}

          {/* Reactions */}
          <div className="mb-6 border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Reactions
            </h3>
            <div className="flex flex-wrap gap-2">
              {REACTIONS.map((emoji) => {
                const reaction = announcement.reactions?.find(
                  (r) => r.emoji === emoji
                );
                const userReacted = reaction?.users?.some(
                  (u) => u._id === user._id || u === user._id
                );

                return (
                  <button
                    key={emoji}
                    onClick={() => handleReactionClick(emoji)}
                    onMouseEnter={() => setHoveredReaction(emoji)}
                    onMouseLeave={() => setHoveredReaction(null)}
                    className={`px-3 py-1 rounded-lg transition ${
                      userReacted
                        ? "bg-blue-100 border-2 border-blue-500"
                        : "bg-gray-100 border-2 border-transparent hover:bg-gray-200"
                    }`}
                    title={reaction?.users?.map((u) => u.name).join(", ")}
                  >
                    <span className="mr-1">{emoji}</span>
                    <span className="text-sm font-medium">
                      {reaction?.count || 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Section - Comments */}
        <div className="w-96 flex flex-col bg-gray-50 border-l border-gray-200">
          {/* Comments Header */}
          <div className="flex items-center gap-2 p-4 border-b border-gray-200 bg-white">
            <MessageCircle className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">Comments</h3>
            {announcement.commentsCount > 0 && (
              <span className="ml-auto bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                {announcement.commentsCount}
              </span>
            )}
          </div>

          {/* Comments List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {announcement.comments && announcement.comments.length > 0 ? (
              announcement.comments.map((comment) => (
                <div key={comment._id} className="bg-white rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {comment.author?.avatar ? (
                        <img
                          src={comment.author?.avatar}
                          alt={comment.author?.name}
                          className="w-8 h-8 rounded-full object-cover border border-gray-200"
                        />
                      ) : (
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm border border-white/20 ${(() => {
                            const colors = [
                              "bg-gradient-to-br from-red-500 to-red-600",
                              "bg-gradient-to-br from-orange-500 to-orange-600",
                              "bg-gradient-to-br from-amber-500 to-amber-600",
                              "bg-gradient-to-br from-green-500 to-green-600",
                              "bg-gradient-to-br from-emerald-500 to-emerald-600",
                              "bg-gradient-to-br from-teal-500 to-teal-600",
                              "bg-gradient-to-br from-cyan-500 to-cyan-600",
                              "bg-gradient-to-br from-blue-500 to-blue-600",
                              "bg-gradient-to-br from-indigo-500 to-indigo-600",
                              "bg-gradient-to-br from-violet-500 to-violet-600",
                              "bg-gradient-to-br from-purple-500 to-purple-600",
                              "bg-gradient-to-br from-fuchsia-500 to-fuchsia-600",
                              "bg-gradient-to-br from-pink-500 to-pink-600",
                              "bg-gradient-to-br from-rose-500 to-rose-600",
                            ];
                            let hash = 0;
                            const name = comment.author?.name || "User";
                            for (let i = 0; i < name.length; i++) {
                              hash = name.charCodeAt(i) + ((hash << 5) - hash);
                            }
                            return colors[Math.abs(hash) % colors.length];
                          })()}`}
                        >
                          {(comment.author?.name || "User")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {comment.author?.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(comment.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                    {(user._id === comment.author?._id ||
                      user.role === "admin") && (
                      <button
                        onClick={() =>
                          onDeleteComment(announcement._id, comment._id)
                        }
                        className="p-1 hover:bg-red-100 rounded text-red-600 transition"
                        title="Delete comment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{comment.text}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No comments yet</p>
              </div>
            )}

            <div ref={commentsEndRef} />
          </div>

          {/* Comment Input */}
          {announcement.allowComments && (
            <form
              onSubmit={handleAddComment}
              className="p-4 border-t border-gray-200 bg-white"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={isLoading || !commentText.trim()}
                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnnouncementDetailModal;
