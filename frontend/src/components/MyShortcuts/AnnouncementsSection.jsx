import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Pin, ChevronRight, RefreshCw, AlertCircle, Calendar } from 'lucide-react';
import useMyShortcutsStore from '../../store/myShortcutsStore';
import Avatar from '../Avatar';

const AnnouncementsSection = ({ onAnnouncementClick }) => {
  const { announcements, loading, errors, announcementPagination, fetchAnnouncements } = useMyShortcutsStore();

  const formatDate = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  if (loading.announcements && announcements.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="w-32 h-5 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (errors.announcements) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-red-100">
        <div className="flex items-center gap-3 text-red-500 mb-4">
          <AlertCircle size={20} />
          <span>Failed to load announcements</span>
        </div>
        <button 
          onClick={() => fetchAnnouncements(1)}
          className="text-sm text-blue-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 shadow-lg border border-amber-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
            <Megaphone className="text-white" size={18} />
          </div>
          Announcements
          <span className="text-sm font-normal text-gray-500">({announcementPagination.total})</span>
        </h2>
        <button
          onClick={() => fetchAnnouncements(1)}
          disabled={loading.announcements}
          className="p-2 hover:bg-amber-100 rounded-lg transition-colors"
        >
          <RefreshCw size={16} className={loading.announcements ? 'animate-spin text-gray-400' : 'text-gray-500'} />
        </button>
      </div>

      {announcements.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Megaphone size={40} className="mx-auto mb-3 opacity-50" />
          <p>No announcements for you</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((announcement, index) => (
            <motion.div
              key={announcement._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onAnnouncementClick?.(announcement)}
              className="bg-white/80 backdrop-blur-sm p-4 rounded-xl cursor-pointer transition-all hover:bg-white hover:shadow-md group relative"
            >
              {announcement.isPinned && (
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center shadow-lg">
                  <Pin size={12} className="text-white" />
                </div>
              )}
              
              <div className="flex items-start gap-3">
                <Avatar
                  src={announcement.createdBy?.avatar}
                  name={announcement.createdBy?.name}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate group-hover:text-amber-600 transition-colors">
                    {announcement.title}
                  </h3>
                  <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                    {announcement.content?.replace(/<[^>]+>/g, '').slice(0, 100)}...
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <Calendar size={12} />
                    <span>{formatDate(announcement.createdAt)}</span>
                    {announcement.project?.name && (
                      <>
                        <span>•</span>
                        <span className="text-amber-600">{announcement.project.name}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-400 group-hover:text-amber-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
              </div>
            </motion.div>
          ))}

          {announcementPagination.page < announcementPagination.pages && (
            <button
              onClick={() => fetchAnnouncements(announcementPagination.page + 1)}
              disabled={loading.announcements}
              className="w-full py-3 text-sm text-amber-600 hover:bg-amber-100 rounded-xl transition-colors"
            >
              {loading.announcements ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(AnnouncementsSection);
