import React from 'react';
import { motion } from 'framer-motion';

/**
 * Skeleton loader for department cards
 */
export const DepartmentSkeleton = () => (
  <motion.div
    initial={{ opacity: 0.6 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 1.5, repeat: Infinity }}
    className="p-5 border-b border-gray-100 space-y-4"
  >
    <div className="space-y-2">
      <div className="h-4 bg-gray-200 rounded-lg w-3/4" />
      <div className="h-3 bg-gray-200 rounded-lg w-2/3" />
    </div>
    <div className="flex gap-2">
      <div className="h-6 bg-gray-200 rounded-full w-24" />
      <div className="h-6 bg-gray-200 rounded-full w-24" />
    </div>
  </motion.div>
);

/**
 * Skeleton loader for employee list items
 */
export const EmployeeSkeleton = () => (
  <motion.div
    initial={{ opacity: 0.6 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 1.5, repeat: Infinity }}
    className="flex items-center p-4 border-b border-gray-100 gap-4"
  >
    <div className="w-5 h-5 bg-gray-200 rounded" />
    <div className="w-12 h-12 bg-gray-200 rounded-full flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-gray-200 rounded-lg w-2/3" />
      <div className="h-3 bg-gray-200 rounded-lg w-1/2" />
    </div>
    <div className="h-6 bg-gray-200 rounded-full w-20" />
  </motion.div>
);

/**
 * Skeleton loader for stats cards
 */
export const StatSkeleton = () => (
  <motion.div
    initial={{ opacity: 0.6 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 1.5, repeat: Infinity }}
    className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 space-y-3"
  >
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-6 bg-gray-200 rounded-lg w-12" />
        <div className="h-3 bg-gray-200 rounded-lg w-16" />
      </div>
    </div>
  </motion.div>
);

/**
 * Skeleton loader for the main employee list section
 */
export const EmployeeListSkeleton = ({ count = 5 }) => (
  <div className="border border-gray-200 rounded-xl overflow-hidden">
    <div className="max-h-96 overflow-y-auto">
      {Array(count)
        .fill(0)
        .map((_, i) => (
          <EmployeeSkeleton key={i} />
        ))}
    </div>
  </div>
);

/**
 * Skeleton loader for departments list section
 */
export const DepartmentListSkeleton = ({ count = 4 }) => (
  <div className="max-h-[600px] overflow-y-auto space-y-0">
    {Array(count)
      .fill(0)
      .map((_, i) => (
        <DepartmentSkeleton key={i} />
      ))}
  </div>
);
