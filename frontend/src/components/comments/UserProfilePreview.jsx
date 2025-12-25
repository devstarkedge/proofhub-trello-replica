import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Briefcase, MapPin, Phone, MessageSquare } from 'lucide-react';
import Avatar from '../Avatar';

/**
 * UserProfilePreview - Hover card showing user details
 * Features: Avatar, name, role, department, contact options
 */
const UserProfilePreview = ({
  isOpen,
  onClose,
  user,
  position = 'bottom', // 'top' | 'bottom' | 'left' | 'right'
  theme = 'light',
  anchorEl = null,
}) => {
  const isDark = theme === 'dark';

  if (!isOpen || !user) return null;

  // Calculate position styles based on anchor element
  const getPositionStyles = () => {
    if (!anchorEl?.current) {
      return { bottom: '100%', left: '50%', transform: 'translateX(-50%)' };
    }

    const rect = anchorEl.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Default to bottom if there's room, otherwise top
    if (position === 'bottom' || (position === 'auto' && rect.bottom + 200 < viewportHeight)) {
      return { top: '100%', left: '50%', marginTop: '8px' };
    }
    return { bottom: '100%', left: '50%', marginBottom: '8px' };
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: position.includes('bottom') ? -10 : 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: position.includes('bottom') ? -10 : 10, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className={`absolute z-50 w-72 rounded-xl shadow-2xl overflow-hidden ${
          isDark 
            ? 'bg-gray-800 border border-gray-700' 
            : 'bg-white border border-gray-200'
        }`}
        style={getPositionStyles()}
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={onClose}
      >
        {/* Header with gradient */}
        <div className={`h-16 bg-gradient-to-r ${
          isDark 
            ? 'from-indigo-600 to-purple-600' 
            : 'from-indigo-500 to-purple-500'
        }`} />
        
        {/* Avatar overlapping header */}
        <div className="relative px-4 -mt-10">
          <div className={`w-20 h-20 rounded-xl overflow-hidden border-4 shadow-lg ${
            isDark ? 'border-gray-800 bg-gray-700' : 'border-white bg-gray-100'
          }`}>
            <Avatar 
              src={user.avatar} 
              name={user.name} 
              size="xl"
              showBadge={false}
              className="w-full h-full"
            />
          </div>
        </div>

        {/* User Info */}
        <div className="px-4 pb-4 pt-2">
          <h3 className={`font-semibold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {user.name || 'Unknown User'}
          </h3>
          
          {user.title && (
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {user.title}
            </p>
          )}
          
          {/* Details */}
          <div className="mt-3 space-y-2">
            {user.role && (
              <div className="flex items-center gap-2">
                <Briefcase size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                <span className={`text-sm capitalize ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {typeof user.role === 'object' ? user.role.name : user.role}
                </span>
              </div>
            )}
            
            {user.department && (
              <div className="flex items-center gap-2">
                <MapPin size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {Array.isArray(user.department) 
                    ? user.department.map(d => d.name || d).join(', ')
                    : user.department.name || user.department}
                </span>
              </div>
            )}
            
            {user.email && (
              <div className="flex items-center gap-2">
                <Mail size={14} className={isDark ? 'text-gray-500' : 'text-gray-400'} />
                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {user.email}
                </span>
              </div>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            {user.email && (
              <a
                href={`mailto:${user.email}`}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isDark
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <Mail size={14} />
                Email
              </a>
            )}
            
            <button
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-indigo-500 hover:bg-indigo-600 text-white'
              }`}
            >
              <MessageSquare size={14} />
              Message
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default UserProfilePreview;
