import React, { useState, useEffect, useContext } from 'react';
import { Bell, Plus, Search, Filter, Archive } from 'lucide-react';
import { toast } from 'react-toastify';
import AuthContext from '../context/AuthContext';
import announcementService from '../services/announcementService.js';
import AnnouncementCard from '../components/AnnouncementCard';
import CreateAnnouncementModal from '../components/CreateAnnouncementModal';
import AnnouncementDetailModal from '../components/AnnouncementDetailModal';
import Loading from '../components/Loading';

const Announcements = () => {
  const { user } = useContext(AuthContext);
  const [announcements, setAnnouncements] = useState([]);
  const [filteredAnnouncements, setFilteredAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('latest');
  const [showArchived, setShowArchived] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'hr';

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

  useEffect(() => {
    fetchAnnouncements(showArchived);
  }, [showArchived, sortBy, categoryFilter, searchTerm]);

  // Create announcement
  const handleCreateAnnouncement = async (formData, files) => {
    try {
      setIsCreating(true);
      const response = await announcementService.createAnnouncement(formData, files);

      if (response.success) {
        toast.success(response.message || 'Announcement created successfully');
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

  // Delete announcement
  const handleDeleteAnnouncement = async (announcementId) => {
    if (window.confirm('Are you sure you want to delete this announcement?')) {
      try {
        await announcementService.deleteAnnouncement(announcementId);
        toast.success('Announcement deleted successfully');
        setAnnouncements(prev => prev.filter(a => a._id !== announcementId));
      } catch (error) {
        console.error('Error deleting announcement:', error);
        toast.error('Failed to delete announcement');
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
      toast.error('Failed to load announcement');
    }
  };

  // Add comment
  const handleAddComment = async (announcementId, text) => {
    try {
      await announcementService.addComment(announcementId, text);
      toast.success('Comment added');

      // Update selected announcement
      const response = await announcementService.getAnnouncement(announcementId);
      if (response.success) {
        setSelectedAnnouncement(response.data);
      }

      // Refresh list
      fetchAnnouncements(showArchived);
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
    }
  };

  // Delete comment
  const handleDeleteComment = async (announcementId, commentId) => {
    try {
      await announcementService.deleteComment(announcementId, commentId);
      toast.success('Comment deleted');

      // Update selected announcement
      const response = await announcementService.getAnnouncement(announcementId);
      if (response.success) {
        setSelectedAnnouncement(response.data);
      }

      // Refresh list
      fetchAnnouncements(showArchived);
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
    }
  };

  // Add reaction
  const handleAddReaction = async (announcementId, emoji) => {
    try {
      await announcementService.addReaction(announcementId, emoji);

      // Update selected announcement
      const response = await announcementService.getAnnouncement(announcementId);
      if (response.success) {
        setSelectedAnnouncement(response.data);
      }

      // Refresh list
      fetchAnnouncements(showArchived);
    } catch (error) {
      console.error('Error adding reaction:', error);
      toast.error('Failed to add reaction');
    }
  };

  // Remove reaction
  const handleRemoveReaction = async (announcementId, emoji) => {
    try {
      await announcementService.removeReaction(announcementId, emoji);

      // Update selected announcement
      const response = await announcementService.getAnnouncement(announcementId);
      if (response.success) {
        setSelectedAnnouncement(response.data);
      }

      // Refresh list
      fetchAnnouncements(showArchived);
    } catch (error) {
      console.error('Error removing reaction:', error);
      toast.error('Failed to remove reaction');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Bell className="w-8 h-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">Announcements</h1>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                <Plus className="w-5 h-5" />
                Make Announcement
              </button>
            )}
          </div>

          {/* Filters and Search */}
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search announcements..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap gap-4 items-center">
              {/* Sort */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-600" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="latest">Latest First</option>
                  <option value="pinned">Pinned First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="category">By Category</option>
                </select>
              </div>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                <option value="General">General</option>
                <option value="HR">HR</option>
                <option value="Urgent">Urgent</option>
                <option value="System Update">System Update</option>
                <option value="Events">Events</option>
              </select>

              {/* Archive Toggle */}
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                  showArchived
                    ? 'bg-gray-200 text-gray-900'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Archive className="w-4 h-4" />
                {showArchived ? 'Archived' : 'Active'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {isLoading ? (
          <Loading text="Loading announcements..." />
        ) : announcements.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-xl text-gray-600 mb-2">No announcements yet</p>
            <p className="text-gray-500">
              {showArchived
                ? 'No archived announcements to show'
                : isAdmin
                ? 'Start by creating a new announcement'
                : 'Check back later for important updates'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {announcements.map(announcement => (
              <AnnouncementCard
                key={announcement._id}
                announcement={announcement}
                onOpen={handleOpenAnnouncement}
                onPin={() => handleArchiveAnnouncement(announcement._id)}
                onArchive={handleArchiveAnnouncement}
                onDelete={handleDeleteAnnouncement}
                userRole={user?.role}
                userId={user?._id}
                isUserAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </div>

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
        onAddComment={handleAddComment}
        onDeleteComment={handleDeleteComment}
        onAddReaction={handleAddReaction}
        onRemoveReaction={handleRemoveReaction}
        isLoading={false}
      />
    </div>
  );
};

export default Announcements;
