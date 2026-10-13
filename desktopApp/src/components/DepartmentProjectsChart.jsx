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
  PieChart,
  Pie,
  Cell
} from 'recharts';

const DepartmentProjectsChart = memo(({ projectBreakdown }) => {
  // Prepare data for project progress
  const progressData = projectBreakdown.map(project => ({
    name: project.name.length > 15 ? project.name.substring(0, 15) + '...' : project.name,
    progress: project.progress,
    totalTasks: project.totalTasks,
    completedTasks: project.completedTasks
  }));

  // Prepare data for project status distribution
  const statusCounts = projectBreakdown.reduce((acc, project) => {
    const status = project.status || 'planning';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const statusData = Object.entries(statusCounts).map(([status, count]) => {
    let color = '#6B7280'; // planning
    if (status === 'in-progress') color = '#3B82F6';
    else if (status === 'completed') color = '#10B981';
    else if (status === 'on-hold') color = '#F59E0B';

    return {
      name: status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' '),
      value: count,
      color
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
      {/* Project Progress */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Progress Overview</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={progressData} margin={{ bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={80}
              fontSize={12}
            />
            <YAxis />
            <Tooltip
              formatter={(value, name) => [
                name === 'progress' ? `${value}%` : value,
                name === 'progress' ? 'Progress' : name === 'totalTasks' ? 'Total Tasks' : 'Completed Tasks'
              ]}
            />
            <Bar dataKey="progress" fill="#3B82F6" name="progress" />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Project Status Distribution */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Status Distribution</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={statusData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={5}
              dataKey="value"
            >
              {statusData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap justify-center gap-4 mt-4">
          {statusData.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
              ></div>
              <span className="text-sm text-gray-600">{item.name}: {item.value}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
});

export default DepartmentProjectsChart;
