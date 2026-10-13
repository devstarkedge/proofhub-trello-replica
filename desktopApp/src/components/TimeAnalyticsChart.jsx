import React, { memo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend
} from 'recharts';

const TimeAnalyticsChart = memo(({ timeAnalytics }) => {
  // Prepare data for estimated vs logged time comparison
  const timeComparisonData = [
    {
      name: 'Estimated Hours',
      estimated: timeAnalytics.totalEstimatedHours,
      logged: 0
    },
    {
      name: 'Logged Hours',
      estimated: 0,
      logged: timeAnalytics.totalLoggedHours
    }
  ];

  // Prepare data for time variance
  const varianceData = [
    {
      name: 'Time Variance',
      variance: timeAnalytics.timeVariance,
      type: timeAnalytics.timeVariance >= 0 ? 'Under Budget' : 'Over Budget'
    }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
      {/* Estimated vs Logged Time */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Time Tracking Overview</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={timeComparisonData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => [`${value.toFixed(2)} hours`, '']} />
            <Legend />
            <Bar dataKey="estimated" fill="#3B82F6" name="Estimated" />
            <Bar dataKey="logged" fill="#10B981" name="Logged" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-sm text-gray-600">Total Estimated</p>
            <p className="text-xl font-bold text-blue-600">{timeAnalytics.totalEstimatedHours.toFixed(2)}h</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600">Total Logged</p>
            <p className="text-xl font-bold text-green-600">{timeAnalytics.totalLoggedHours.toFixed(2)}h</p>
          </div>
        </div>
      </motion.div>

      {/* Time Variance */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Time Variance</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={varianceData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip
              formatter={(value) => [`${Math.abs(value).toFixed(2)} hours`, 'Variance']}
              labelFormatter={() => 'Time Variance'}
            />
            <Bar
              dataKey="variance"
              fill={timeAnalytics.timeVariance >= 0 ? '#10B981' : '#EF4444'}
            />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600">Variance Status</p>
          <p className={`text-xl font-bold ${timeAnalytics.timeVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {timeAnalytics.timeVariance >= 0 ? 'Under Budget' : 'Over Budget'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {Math.abs(timeAnalytics.timeVariance).toFixed(2)} hours {timeAnalytics.timeVariance >= 0 ? 'saved' : 'over'}
          </p>
        </div>
      </motion.div>
    </div>
  );
});

export default TimeAnalyticsChart;
