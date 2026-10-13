import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, AlertCircle } from 'lucide-react';

/**
 * Reusable shortcut card component with count animation
 */
const ShortcutCard = ({
  title,
  count,
  icon: Icon,
  color = 'blue',
  loading = false,
  error = null,
  onClick,
  subtitle,
  badge,
  isTime = false
}) => {
  const colorClasses = {
    blue: {
      bg: 'from-blue-500 to-blue-600',
      bgLight: 'bg-blue-50',
      text: 'text-blue-600',
      border: 'border-blue-100'
    },
    green: {
      bg: 'from-emerald-500 to-emerald-600',
      bgLight: 'bg-emerald-50',
      text: 'text-emerald-600',
      border: 'border-emerald-100'
    },
    purple: {
      bg: 'from-purple-500 to-purple-600',
      bgLight: 'bg-purple-50',
      text: 'text-purple-600',
      border: 'border-purple-100'
    },
    orange: {
      bg: 'from-orange-500 to-orange-600',
      bgLight: 'bg-orange-50',
      text: 'text-orange-600',
      border: 'border-orange-100'
    }
  };

  const colors = colorClasses[color] || colorClasses.blue;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 animate-pulse">
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 bg-gray-200 rounded-xl"></div>
          <div className="w-16 h-6 bg-gray-200 rounded"></div>
        </div>
        <div className="mt-4">
          <div className="w-24 h-4 bg-gray-200 rounded mb-2"></div>
          <div className="w-16 h-3 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-red-100">
        <div className="flex items-center gap-3 text-red-500">
          <AlertCircle size={20} />
          <span className="text-sm">Failed to load</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`bg-white rounded-2xl p-6 shadow-lg border ${colors.border} cursor-pointer transition-all hover:shadow-xl relative overflow-hidden group`}
    >
      {/* Background decoration */}
      <div className={`absolute -right-8 -top-8 w-24 h-24 ${colors.bgLight} rounded-full opacity-50 group-hover:opacity-70 transition-opacity`}></div>
      
      <div className="flex items-start justify-between relative">
        <div className={`w-12 h-12 bg-gradient-to-br ${colors.bg} rounded-xl flex items-center justify-center shadow-lg`}>
          <Icon className="text-white" size={24} />
        </div>
        
        <div className="text-right">
          {/* Count with animation */}
          <motion.div
            key={count}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-3xl font-bold ${colors.text}`}
          >
            {isTime ? count : (
              <span className="tabular-nums">{count}</span>
            )}
          </motion.div>
          
          {badge && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="inline-block mt-1 px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full"
            >
              {badge}
            </motion.span>
          )}
        </div>
      </div>

      <div className="mt-4 relative">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          {title}
          <ChevronRight size={18} className="text-gray-400 group-hover:translate-x-1 transition-transform" />
        </h3>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>
    </motion.div>
  );
};

export default memo(ShortcutCard);
