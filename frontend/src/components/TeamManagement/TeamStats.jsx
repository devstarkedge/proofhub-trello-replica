import React, { memo } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  Shield,
  Users,
  TrendingUp
} from 'lucide-react';
import { StatSkeleton } from './SkeletonLoaders';

/**
 * TeamStats Component
 * Displays team and department statistics
 * Memoized to prevent unnecessary re-renders
 */
const TeamStats = memo(({ stats, isLoading }) => {
  const statItems = [
    {
      icon: Building2,
      label: 'Departments',
      value: stats.totalDepartments,
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-600',
      gradient: 'from-blue-500 to-blue-600'
    },
    {
      icon: Shield,
      label: 'Total Managers',
      value: stats.totalManagers,
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-600',
      gradient: 'from-purple-500 to-purple-600'
    },
    {
      icon: Users,
      label: 'Total Employees',
      value: stats.totalMembers,
      bgColor: 'bg-green-100',
      textColor: 'text-green-600',
      gradient: 'from-green-500 to-green-600'
    },
    {
      icon: TrendingUp,
      label: 'Avg Members/Dept',
      value: stats.avgMembersPerDept,
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-600',
      gradient: 'from-orange-500 to-orange-600'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 w-full">
      {statItems.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.1 }}
        >
          {isLoading ? (
            <StatSkeleton />
          ) : (
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="bg-white rounded-lg sm:rounded-xl shadow-sm p-2.5 sm:p-4 border border-gray-100"
            >
              <div className="flex flex-col items-center gap-1.5 sm:gap-2 text-center">
                <div className={`p-1.5 sm:p-2 ${stat.bgColor} rounded-lg`}>
                  <stat.icon className={stat.textColor} size={18} />
                </div>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-tight">{stat.value}</p>
                <p className="text-xs sm:text-sm text-gray-600 line-clamp-2">{stat.label}</p>
              </div>
            </motion.div>
          )}
        </motion.div>
      ))}
    </div>
  );
});

TeamStats.displayName = 'TeamStats';

export default TeamStats;
