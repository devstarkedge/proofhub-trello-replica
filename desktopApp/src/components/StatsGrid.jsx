import React, { memo } from 'react';
import { motion } from 'framer-motion';
import {
  Target,
  CheckCircle,
  Clock,
  AlertTriangle,
  Timer,
  TrendingUp
} from 'lucide-react';

const StatCard = ({ icon: Icon, title, value, subtitle, color = 'blue' }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`bg-white rounded-xl shadow-lg p-6 border-l-4 ${color === 'blue' ? 'border-blue-500' : color === 'green' ? 'border-green-500' : color === 'yellow' ? 'border-yellow-500' : color === 'red' ? 'border-red-500' : color === 'purple' ? 'border-purple-500' : 'border-indigo-500'}`}
  >
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      <div className={`p-3 rounded-full ${color === 'blue' ? 'bg-blue-100' : color === 'green' ? 'bg-green-100' : color === 'yellow' ? 'bg-yellow-100' : color === 'red' ? 'bg-red-100' : color === 'purple' ? 'bg-purple-100' : 'bg-indigo-100'}`}>
        <Icon className={`w-6 h-6 ${color === 'blue' ? 'text-blue-600' : color === 'green' ? 'text-green-600' : color === 'yellow' ? 'text-yellow-600' : color === 'red' ? 'text-red-600' : color === 'purple' ? 'text-purple-600' : 'text-indigo-600'}`} />
      </div>
    </div>
  </motion.div>
);

const StatsGrid = memo(({ analyticsData }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-6 mb-8">
      <StatCard
        icon={Target}
        title="Total Tasks"
        value={analyticsData?.totalTasks || 0}
        color="blue"
      />
      <StatCard
        icon={CheckCircle}
        title="Completed"
        value={analyticsData?.completedTasks || 0}
        subtitle={`${analyticsData?.completionRate || 0}% completion rate`}
        color="green"
      />
      <StatCard
        icon={Clock}
        title="In Progress"
        value={analyticsData?.inProgressTasks || 0}
        color="yellow"
      />
      <StatCard
        icon={AlertTriangle}
        title="Overdue"
        value={analyticsData?.overdueTasks || 0}
        color="red"
      />
      {analyticsData?.timeAnalytics && (
        <>
          <StatCard
            icon={Timer}
            title="Est. Hours"
            value={analyticsData.timeAnalytics.totalEstimatedHours.toFixed(1)}
            subtitle="Total estimated time"
            color="purple"
          />
          <StatCard
            icon={TrendingUp}
            title="Logged Hours"
            value={analyticsData.timeAnalytics.totalLoggedHours.toFixed(1)}
            subtitle={`${analyticsData.timeAnalytics.timeVariance >= 0 ? '+' : ''}${analyticsData.timeAnalytics.timeVariance.toFixed(1)}h variance`}
            color="indigo"
          />
        </>
      )}
    </div>
  );
});

export default StatsGrid;
