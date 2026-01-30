import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { Bell, Plus, Search, Filter, Archive, Sparkles, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import AuthContext from '../context/AuthContext';
import announcementService from '../services/announcementService.js';
import AnnouncementCard from '../components/AnnouncementCard';
import CreateAnnouncementModal from '../components/CreateAnnouncementModal';
import AnnouncementDetailModal from '../components/AnnouncementDetailModal';
import Loading from '../components/Loading';
import { AnnouncementsListSkeleton } from '../components/LoadingSkeleton';
import { useAnnouncementActions } from '../hooks/useAnnouncementActions';
import socketService from '../services/socket';

const Announcements = () => {
  const { user } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  
  const [announcements, setAnnouncements] = useState([]);
  const [filteredAnnouncements, setFilteredAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('latest');
  const [showArchived, setShowArchived] = useState(false);


  const seenAnnouncementsRef = useRef(new Set()); // Track which announcements have been marked as seen

  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'hr';

  // Socket.io connection for real-time updates
  useEffect(() => {
    if (!user) return;

    // Join announcements room via shared service
    socketService.joinAnnouncements();

    // Listen for announcement events via window events (dispatched by socketService)
    const handleAnnouncementCreated = (e) => {
      const data = e.detail;
      console.log('New announcement received:', data);
      toast.info(`📢 ${data.notification?.title || 'New announcement!'}`);
      
      setAnnouncements(prev => {
        if (prev.some(a => a._id === data.announcement._id)) return prev;
        return [data.announcement, ...prev];
      });
      setUnreadCount(prev => prev + 1);
    };

    const handleAnnouncementUpdated = (e) => {
      const data = e.detail;
      console.log('Announcement updated:', data);
      setAnnouncements(prev =>
        prev.map(a => a._id === data.announcementId ? data.announcement : a)
      );
      if (selectedAnnouncement?._id === data.announcementId) {
        setSelectedAnnouncement(data.announcement);
      }
    };

    const handleAnnouncementDeleted = (e) => {
      const data = e.detail;
      console.log('Announcement deleted:', data);
      setAnnouncements(prev => prev.filter(a => a._id !== data.announcementId));
      if (selectedAnnouncement?._id === data.announcementId) {
        setShowDetailModal(false);
        setSelectedAnnouncement(null);
      }
      toast.info('An announcement removed');
    };

    const handleAnnouncementArchived = () => {
      fetchAnnouncements(showArchived);
    };

    const handleCommentAdded = (e) => {
      const data = e.detail;
      console.log('Comment added:', data);
      if (selectedAnnouncement?._id === data.announcementId) {
        fetchAnnouncementDetail(data.announcementId);
      }
      setAnnouncements(prev =>
        prev.map(a => 
          a._id === data.announcementId
            ? { ...a, commentsCount: (a.commentsCount || 0) + 1 }
            : a
        )
      );
    };

    const handleCommentDeleted = (e) => {
      const data = e.detail;
      console.log('Comment deleted:', data);
      if (selectedAnnouncement?._id === data.announcementId) {
        fetchAnnouncementDetail(data.announcementId);
      }
      setAnnouncements(prev =>
        prev.map(a => 
          a._id === data.announcementId
            ? { ...a, commentsCount: Math.max((a.commentsCount || 0) - 1, 0) }
            : a
        )
      );
    };

    const handleReactionAdded = (e) => {
      const data = e.detail;
      console.log('Reaction added:', data);
      if (selectedAnnouncement?._id === data.announcementId) {
        fetchAnnouncementDetail(data.announcementId);
      }
      fetchAnnouncements(showArchived);
    };

    const handleReactionRemoved = (e) => {
      const data = e.detail;
      console.log('Reaction removed:', data);
      if (selectedAnnouncement?._id === data.announcementId) {
        fetchAnnouncementDetail(data.announcementId);
      }
      fetchAnnouncements(showArchived);
    };

    const handlePinToggled = () => {
      fetchAnnouncements(showArchived);
    };

    window.addEventListener('socket-announcement-created', handleAnnouncementCreated);
    window.addEventListener('socket-announcement-updated', handleAnnouncementUpdated);
    window.addEventListener('socket-announcement-deleted', handleAnnouncementDeleted);
    window.addEventListener('socket-announcement-archived', handleAnnouncementArchived);
    window.addEventListener('socket-announcement-comment-added', handleCommentAdded);
    window.addEventListener('socket-announcement-comment-deleted', handleCommentDeleted);
    window.addEventListener('socket-announcement-reaction-added', handleReactionAdded);
    window.addEventListener('socket-announcement-reaction-removed', handleReactionRemoved);
    window.addEventListener('socket-announcement-pin-toggled', handlePinToggled);

    return () => {
      socketService.leaveAnnouncements();
      
      window.removeEventListener('socket-announcement-created', handleAnnouncementCreated);
      window.removeEventListener('socket-announcement-updated', handleAnnouncementUpdated);
      window.removeEventListener('socket-announcement-deleted', handleAnnouncementDeleted);
      window.removeEventListener('socket-announcement-archived', handleAnnouncementArchived);
      window.removeEventListener('socket-announcement-comment-added', handleCommentAdded);
      window.removeEventListener('socket-announcement-comment-deleted', handleCommentDeleted);
      window.removeEventListener('socket-announcement-reaction-added', handleReactionAdded);
      window.removeEventListener('socket-announcement-reaction-removed', handleReactionRemoved);
      window.removeEventListener('socket-announcement-pin-toggled', handlePinToggled);
    };
  }, [user, showArchived, selectedAnnouncement]);

  // Fetch announcements
  const fetchAnnouncements = async (isArchived = false) => {
    try {
      setIsLoading(true);
      const response = await announcementService.getAnnouncements({
        isArchived: isArchived ? 'true' : 'false',
        sort: sortBy,
        category: categoryFilter,
        search: searchTerm
      });

      if (response.success) {
        setAnnouncements(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
      toast.error('Failed to load announcements');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch single announcement detail
  const fetchAnnouncementDetail = async (announcementId) => {
    try {
      const response = await announcementService.getAnnouncement(announcementId);
      if (response.success) {
        setSelectedAnnouncement(response.data);
      }
    } catch (error) {
      console.error('Error fetching announcement detail:', error);
    }
  };

  // Fetch unread count on mount
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await announcementService.getUnreadCount();
        if (response.success) {
          setUnreadCount(response.count);
        }
      } catch (error) {
        console.error('Error fetching unread count:', error);
      }
    };
    
    if (user) fetchUnreadCount();
  }, [user]);

  // Handle deep linking from URL query parameter (push notification, Slack, email)
  useEffect(() => {
    const openAnnouncementId = searchParams.get('open');
    if (openAnnouncementId && announcements.length > 0) {
      const announcementToOpen = announcements.find(a => a._id === openAnnouncementId);
      if (announcementToOpen) {
        setSelectedAnnouncement(announcementToOpen);
        setShowDetailModal(true);
        // Clear the URL parameter after opening
        setSearchParams({}, { replace: true });
      } else {
        // Announcement not in list, try to fetch it directly
        fetchAnnouncementDetail(openAnnouncementId).then(() => {
          setShowDetailModal(true);
          setSearchParams({}, { replace: true });
        });
      }
    }
  }, [searchParams, announcements, setSearchParams]);

  // Callback to mark announcement as seen (for Intersection Observer in cards)
  const handleAnnouncementSeen = useCallback((announcementId) => {
    if (seenAnnouncementsRef.current.has(announcementId)) return;
    seenAnnouncementsRef.current.add(announcementId);
    
    // Mark as seen via API (non-blocking)
    announcementService.markAsSeen(announcementId).then(() => {
      setUnreadCount(prev => Math.max(0, prev - 1));
    });
  }, []);

  useEffect(() => {
    fetchAnnouncements(showArchived);
  }, [showArchived, sortBy, categoryFilter, searchTerm]);

  // Create announcement
  const handleCreateAnnouncement = async (formData, files, onProgress) => {
    try {
      setIsCreating(true);
      const response = await announcementService.createAnnouncement(formData, files, onProgress);

      if (response.success) {
        toast.success(response.message || 'Announcement created successfully');
        
        // Show upload errors if any
        if (response.uploadErrors && response.uploadErrors.length > 0) {
          response.uploadErrors.forEach(err => {
            toast.warning(`Failed to upload: ${err.originalName} - ${err.error}`);
          });
        }
        
        setShowCreateModal(false);
        fetchAnnouncements(showArchived);
      }
    } catch (error) {
      console.error('Error creating announcement:', error);
      toast.error(error.message || 'Failed to create announcement');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle attachment deleted in detail modal
  const handleAttachmentDeleted = (attachmentId) => {
    if (selectedAnnouncement) {
      setSelectedAnnouncement(prev => ({
        ...prev,
        attachments: prev.attachments.filter(att => att._id !== attachmentId)
      }));
      
      // Also update in the main list
      setAnnouncements(prev => prev.map(ann => {
        if (ann._id === selectedAnnouncement._id) {
          return {
            ...ann,
            attachments: ann.attachments.filter(att => att._id !== attachmentId)
          };
        }
        return ann;
      }));
    }
  };

  // Delete announcement
  const handleDeleteAnnouncement = async (announcementId) => {
    // Check if announcement still exists in state
    const announcementExists = announcements.find(a => a._id === announcementId);
    if (!announcementExists) {
      toast.info('Announcement has already been deleted');
      return;
    }

    if (window.confirm('Are you sure you want to delete this announcement?')) {
      // Optimistically remove from UI
      setAnnouncements(prev => prev.filter(a => a._id !== announcementId));
      
      try {
        await announcementService.deleteAnnouncement(announcementId);
      } catch (error) {
        console.error('Error deleting announcement:', error);
        // If it's a 404, it was already deleted, don't show error
        if (error.message?.includes('not found') || error.statusCode === 404) {
          toast.info('Announcement was already deleted');
        } else {
          toast.error(error.message || 'Failed to delete announcement');
          // Restore announcement to UI on error
          fetchAnnouncements(showArchived);
        }
      }
    }
  };

  // Archive announcement
  const handleArchiveAnnouncement = async (announcementId) => {
    try {
      const announcement = announcements.find(a => a._id === announcementId);
      await announcementService.toggleArchive(announcementId, !announcement.isArchived);
      toast.success(announcement.isArchived ? 'Announcement unarchived' : 'Announcement archived');
      fetchAnnouncements(showArchived);
    } catch (error) {
      console.error('Error archiving announcement:', error);
      toast.error('Failed to archive announcement');
    }
  };

  // Open announcement detail
  const handleOpenAnnouncement = async (announcementId) => {
    try {
      const response = await announcementService.getAnnouncement(announcementId);
      if (response.success) {
        setSelectedAnnouncement(response.data);
        setShowDetailModal(true);
      }
    } catch (error) {
      console.error('Error fetching announcement:', error);
    }
  };

  const handleAnnouncementActionSuccess = useCallback((action, announcementId, extraId) => {
      if (action === 'comment-added' || action === 'comment-deleted' || action === 'reaction-added' || action === 'reaction-removed') {
           // Socket usually handles this, but we can fetch detail to be sure if selected
           if (selectedAnnouncement && selectedAnnouncement._id === announcementId) {
               fetchAnnouncementDetail(announcementId);
           }
      }
      if (action === 'attachment-deleted') {
           handleAttachmentDeleted(extraId);
      }
      // Re-fetch list for good measure
      fetchAnnouncements(showArchived);
  }, [selectedAnnouncement, fetchAnnouncements, showArchived]);

  const {
      addComment,
      deleteComment,
      addReaction,
      removeReaction,
      deleteAttachment, // We can use the hook's deleteAttachment or the local one. The hook is better.
      loadingAction
  } = useAnnouncementActions(handleAnnouncementActionSuccess);






  return (
    <div className="min-h-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <main className="p-6 space-y-6">
          {/* Header Section */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-2xl p-8 text-white shadow-2xl"
          >
            <div className="absolute inset-0 bg-black/10 backdrop-blur-sm"></div>
            <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
              <div className="flex items-center gap-4">
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                  className="p-3 bg-white/20 rounded-full backdrop-blur-sm"
                >
                  <Bell className="w-8 h-8" />
                </motion.div>
                <div>
                  <h1 className="text-4xl font-bold flex items-center gap-3">
                    Announcements
                    <Sparkles className="w-6 h-6 text-yellow-300" />
                  </h1>
                  <p className="text-blue-100 mt-2 text-lg">Stay updated with the latest announcements and important updates</p>
                </div>
              </div>
              {isAdmin && (
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-3 px-6 py-3 bg-white text-blue-600 rounded-xl font-semibold hover:bg-blue-50 transition-all duration-300 shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                  Create Announcement
                  <TrendingUp className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          </motion.div>

          {/* Stats Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <motion.div
              whileHover={{ y: -5 }}
              className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Total Announcements</p>
                  <p className="text-3xl font-bold">{announcements.length}</p>
                </div>
                <Bell className="w-8 h-8 text-green-200" />
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -5 }}
              className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl p-6 text-white shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Active</p>
                  <p className="text-3xl font-bold">{announcements.filter(a => !a.isArchived).length}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-200" />
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -5 }}
              className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl p-6 text-white shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Categories</p>
                  <p className="text-3xl font-bold">{new Set(announcements.map(a => a.category)).size}</p>
                </div>
                <Filter className="w-8 h-8 text-purple-200" />
              </div>
            </motion.div>
          </motion.div>

          {/* Filters and Search */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-6"
          >
            <div className="space-y-6">
              {/* Search Bar */}
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-red-800" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search announcements..."
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/50 backdrop-blur-sm"
                  />
                </div>
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap gap-4 items-center">
                {/* Sort */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="flex items-center gap-2 bg-gray-50 rounded-lg p-2"
                >
                  <Filter className="w-4 h-4 text-gray-600" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 bg-transparent border-none focus:outline-none text-sm font-medium"
                  >
                    <option value="latest">Latest First</option>
                    <option value="pinned">Pinned First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="category">By Category</option>
                  </select>
                </motion.div>

                {/* Category Filter */}
                <motion.select
                  whileHover={{ scale: 1.02 }}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="all">All Categories</option>
                  <option value="General">General</option>
                  <option value="HR">HR</option>
                  <option value="Urgent">Urgent</option>
                  <option value="System Update">System Update</option>
                  <option value="Events">Events</option>
                </motion.select>

                {/* Archive Toggle */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowArchived(!showArchived)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                    showArchived
                      ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Archive className="w-4 h-4" />
                  {showArchived ? 'Archived' : 'Active'}
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Main Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-6"
          >
            <AnimatePresence mode="wait">
              {isLoading ? (
                 <motion.div
                   key="loading"
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   exit={{ opacity: 0 }}
                 >
                   <AnnouncementsListSkeleton />
                 </motion.div>
              ) : announcements.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="text-center py-16"
                >
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full mx-auto mb-6 flex items-center justify-center"
                  >
                    <Bell className="w-10 h-10 text-gray-400" />
                  </motion.div>
                  <h3 className="text-2xl font-bold text-gray-700 mb-2">No announcements yet</h3>
                  <p className="text-gray-500 text-lg">
                    {showArchived
                      ? 'No archived announcements to show'
                      : isAdmin
                      ? 'Start by creating a new announcement to keep everyone informed'
                      : 'Check back later for important updates'}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="announcements"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <AnimatePresence>
                    {announcements.map((announcement, index) => (
                      <motion.div
                        key={announcement._id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.4, delay: index * 0.1 }}
                        whileHover={{ scale: 1.02 }}
                        className="transform transition-all duration-300"
                      >
                        <AnnouncementCard
                          announcement={announcement}
                          onOpen={handleOpenAnnouncement}
                          onPin={() => handleArchiveAnnouncement(announcement._id)}
                          onArchive={handleArchiveAnnouncement}
                          onDelete={handleDeleteAnnouncement}
                          onSeen={handleAnnouncementSeen}
                          userRole={user?.role}
                          userId={user?._id}
                          isUserAdmin={isAdmin}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
      </main>

      {/* Create Modal */}
      <CreateAnnouncementModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateAnnouncement}
        isLoading={isCreating}
      />

      {/* Detail Modal */}
      <AnnouncementDetailModal
        isOpen={showDetailModal}
        announcement={selectedAnnouncement}
        onClose={() => setShowDetailModal(false)}
        onAddComment={addComment}
        onDeleteComment={deleteComment}
        onAddReaction={addReaction}
        onRemoveReaction={removeReaction}
        onAttachmentDeleted={deleteAttachment}
        isLoading={loadingAction}
      />
    </div>
  );
};

export default Announcements;
