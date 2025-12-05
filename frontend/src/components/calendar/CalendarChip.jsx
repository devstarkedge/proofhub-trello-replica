import React, { memo } from 'react';
import { motion } from 'framer-motion';

/**
 * CalendarChip - A small colored pill for project/reminder tags
 * Used inside calendar date cells to show project names
 */
const CalendarChip = memo(({ 
  label, 
  color = 'indigo',
  size = 'sm',
  onClick,
  className = '' 
}) => {
  // Color variants for chips based on project category or status
  const colorVariants = {
    indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    green: 'bg-green-100 text-green-700 border-green-200',
    yellow: 'bg-amber-100 text-amber-700 border-amber-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    pink: 'bg-pink-100 text-pink-700 border-pink-200',
    teal: 'bg-teal-100 text-teal-700 border-teal-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  const sizeVariants = {
    xs: 'text-[9px] px-1.5 py-0.5 max-w-[50px]',
    sm: 'text-[10px] px-2 py-0.5 max-w-[70px]',
    md: 'text-xs px-2.5 py-1 max-w-[100px]',
  };

  return (
    <motion.span
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`
        inline-flex items-center justify-center
        rounded-full font-medium truncate
        border backdrop-blur-sm
        cursor-pointer select-none
        transition-all duration-200
        hover:shadow-sm
        ${colorVariants[color] || colorVariants.indigo}
        ${sizeVariants[size] || sizeVariants.sm}
        ${className}
      `}
      title={label}
    >
      {label}
    </motion.span>
  );
});

CalendarChip.displayName = 'CalendarChip';

export default CalendarChip;
