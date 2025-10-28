import React, { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  Target,
  Calendar
} from 'lucide-react';
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
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';
import Header from '../components/Header';
import AuthContext from '../context/AuthContext';
import TeamContext from '../context/TeamContext';
import api from '../services/api';

const Analytics = () => {
  const { user } = useContext(AuthContext);
  const { currentTeam, currentDepartment } = useContext(TeamContext);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (currentTeam) {
      loadAnalytics();
    }
  }, [currentTeam]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/analytics/team/${currentTeam._id}`);
      setAnalyticsData(response.data.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const priorityColors = {
    low: '#10B981',
    medium: '#F59E0B',
    high: '#EF4444',
    critical: '#7C3AED'
  };

  const statusColors = {
    todo: '#6B7280',
    'in-progress': '#3B82F6',
    review: '#F59E0B',
    done: '#10B981'
  };

  const priorityData = analyticsData ? [
    { name: 'Low', value: analyticsData.priorityBreakdown.low, color: priorityColors.low },
    { name: 'Medium', value: analyticsData.priorityBreakdown.medium, color: priorityColors.medium },
    { name: 'High', value: analyticsData.priorityBreakdown.high, color: priorityColors.high },
    { name: 'Critical', value: analyticsData.priorityBreakdown.critical, color: priorityColors.critical }
  ] : [];

  const statusData = analyticsData ? [
    { name: 'To Do', value: analyticsData.todoTasks, color: statusColors.todo },
    { name: 'In Progress', value: analyticsData.inProgressTasks, color: statusColors['in-progress'] },
    { name: 'Review', value: analyticsData.reviewTasks, color: statusColors.review },
    { name: 'Done', value: analyticsData.completedTasks, color: statusColors.done }
  ] : [];

  const StatCard = ({ icon: Icon, title, value, subtitle, color = 'blue' }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl shadow-lg p-6 border-l-4 ${color === 'blue' ? 'border-blue-500' : color === 'green' ? 'border-green-500' : color === 'yellow' ? 'border-yellow-500' : 'border-red-500'}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-full ${color === 'blue' ? 'bg-blue-100' : color === 'green' ? 'bg-green-100' : color === 'yellow' ? 'bg-yellow-100' : 'bg-red-100'}`}>
          <Icon className={`w-6 h-6 ${color === 'blue' ? 'text-blue-600' : color === 'green' ? 'text-green-600' : color === 'yellow' ? 'text-yellow-600' : 'text-red-600'}`} />
        </div>
      </div>
    </motion.div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics Dashboard</h1>
          <p className="text-gray-600">
            Insights for {currentTeam?.name} • {currentDepartment?.name}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Priority Breakdown */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Priority Breakdown</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {priorityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {priorityData.map((item) => (
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

          {/* Status Distribution */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-lg p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Status Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Additional Metrics */}
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

        {/* Overdue Tasks List */}
        {analyticsData?.overdueTasksList?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8 bg-white rounded-xl shadow-lg p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Overdue Tasks ({analyticsData.overdueTasksList.length})
            </h3>
            <div className="space-y-3">
              {analyticsData.overdueTasksList.slice(0, 5).map((task) => (
                <div key={task.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div>
                    <p className="font-medium text-gray-900">{task.title}</p>
                    <p className="text-sm text-gray-600">Due: {new Date(task.dueDate).toLocaleDateString()}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    task.priority === 'critical' ? 'bg-red-100 text-red-800' :
                    task.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                    task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Analytics;
