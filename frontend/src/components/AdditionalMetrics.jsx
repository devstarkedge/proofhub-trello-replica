import React, { memo } from 'react';
import { motion } from 'framer-motion';

const AdditionalMetrics = memo(({ analyticsData }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Average Completion Time</h3>
        <div className="text-3xl font-bold text-blue-600">
          {analyticsData?.avgCompletionTime || 0} days
        </div>
        <p className="text-sm text-gray-500 mt-2">Average time to complete tasks</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Efficiency</h3>
        <div className="text-3xl font-bold text-green-600">
          {analyticsData?.completionRate || 0}%
        </div>
        <p className="text-sm text-gray-500 mt-2">Overall completion rate</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Tasks</h3>
        <div className="text-3xl font-bold text-purple-600">
          {(analyticsData?.inProgressTasks || 0) + (analyticsData?.reviewTasks || 0)}
        </div>
        <p className="text-sm text-gray-500 mt-2">Tasks currently in progress</p>
      </motion.div>
    </div>
  );
});

export default AdditionalMetrics;
