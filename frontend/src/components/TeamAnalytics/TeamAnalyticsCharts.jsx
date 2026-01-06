import React, { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Area, AreaChart, PieChart, Pie, Cell, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart
} from 'recharts';
import {
  TrendingUp, Clock, Users, Target, BarChart3, PieChart as PieChartIcon,
  Activity, Calendar
} from 'lucide-react';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

// Custom Tooltip
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 rounded-lg shadow-xl border border-gray-200">
        <p className="font-medium text-gray-900 mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}{entry.unit || ''}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Daily Activity Chart
const DailyActivityChart = memo(({ data }) => {
  const chartData = useMemo(() => {
    if (!data?.dailyTotals) return [];
    return data.dailyTotals.map(d => ({
      date: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      hours: d.totalHours,
      minutes: d.totalMinutes,
      members: d.activeMembers
    }));
  }, [data]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-lg p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Activity className="w-5 h-5 text-blue-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Daily Activity Trend</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar yAxisId="left" dataKey="hours" name="Hours Logged" fill="#3B82F6" radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="members" name="Active Members" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
});

// Productivity Distribution Chart
const ProductivityDistributionChart = memo(({ teamData }) => {
  const chartData = useMemo(() => {
    if (!teamData) return [];
    
    const distribution = [
      { name: 'Excellent (≥100%)', value: 0, color: '#10B981' },
      { name: 'Good (80-99%)', value: 0, color: '#22C55E' },
      { name: 'Normal (60-79%)', value: 0, color: '#F59E0B' },
      { name: 'Below Avg (40-59%)', value: 0, color: '#F97316' },
      { name: 'Low (<40%)', value: 0, color: '#EF4444' },
      { name: 'No Activity', value: 0, color: '#9CA3AF' }
    ];

    teamData.forEach(member => {
      const score = member.summary.productivityScore;
      if (score >= 100) distribution[0].value++;
      else if (score >= 80) distribution[1].value++;
      else if (score >= 60) distribution[2].value++;
      else if (score >= 40) distribution[3].value++;
      else if (score > 0) distribution[4].value++;
      else distribution[5].value++;
    });

    return distribution.filter(d => d.value > 0);
  }, [teamData]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-white rounded-xl shadow-lg p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-purple-100 rounded-lg">
          <PieChartIcon className="w-5 h-5 text-purple-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Productivity Distribution</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
            label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend 
            verticalAlign="bottom" 
            height={36}
            formatter={(value) => <span className="text-xs">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
});

// Team Member Comparison Chart
const TeamComparisonChart = memo(({ teamData }) => {
  const chartData = useMemo(() => {
    if (!teamData) return [];
    return teamData
      .slice(0, 10)
      .map(member => ({
        name: member.user.name?.split(' ')[0] || 'Unknown',
        productivity: member.summary.productivityScore,
        hours: Math.round(member.summary.totalMinutes / 60 * 10) / 10,
        avgDaily: Math.round(member.summary.avgDailyMinutes / 60 * 10) / 10
      }));
  }, [teamData]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-white rounded-xl shadow-lg p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-emerald-100 rounded-lg">
          <Users className="w-5 h-5 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Team Member Comparison</h3>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
          <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 11 }} />
          <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="productivity" name="Productivity %" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
          <Bar dataKey="hours" name="Total Hours" fill="#3B82F6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
});

// Weekly Hours Heatmap
const WeeklyHeatmap = memo(({ teamData, dateRange }) => {
  const heatmapData = useMemo(() => {
    if (!teamData || !dateRange) return [];
    
    // Get unique dates
    const dates = dateRange.slice(0, 7).map(date => ({
      date,
      day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' })
    }));

    // Get top 5 members
    const members = teamData.slice(0, 5);

    return members.map(member => {
      const row = {
        name: member.user.name?.split(' ')[0] || 'Unknown'
      };
      
      dates.forEach(({ date, day }) => {
        const dayData = member.dailyTimeline.find(d => d.date === date);
        row[day] = dayData?.totalMinutes || 0;
      });

      return row;
    });
  }, [teamData, dateRange]);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-white rounded-xl shadow-lg p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-amber-100 rounded-lg">
          <Calendar className="w-5 h-5 text-amber-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Weekly Hours Heatmap</h3>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={heatmapData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis dataKey="name" type="category" width={60} tick={{ fontSize: 11 }} />
          <Tooltip 
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-white p-3 rounded-lg shadow-xl border">
                    <p className="font-medium text-gray-900">{label}</p>
                    {payload.map((entry, i) => (
                      <p key={i} className="text-sm" style={{ color: entry.fill }}>
                        {entry.dataKey}: {Math.round(entry.value / 60)}h {entry.value % 60}m
                      </p>
                    ))}
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend />
          {days.map((day, index) => (
            <Bar 
              key={day} 
              dataKey={day} 
              stackId="a" 
              fill={COLORS[index % COLORS.length]} 
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
});

// Productivity Trend Line Chart
const ProductivityTrendChart = memo(({ data }) => {
  const chartData = useMemo(() => {
    if (!data?.dailyTotals) return [];
    
    const avgProductivity = data.summary?.avgProductivity || 0;
    
    return data.dailyTotals.map(d => ({
      date: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
      actual: Math.round((d.totalMinutes / (d.activeMembers * 480 || 1)) * 100),
      target: avgProductivity,
      members: d.activeMembers
    }));
  }, [data]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="bg-white rounded-xl shadow-lg p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-cyan-100 rounded-lg">
          <TrendingUp className="w-5 h-5 text-cyan-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Productivity Trend</h3>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 150]} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area 
            type="monotone" 
            dataKey="actual" 
            name="Daily Productivity %" 
            stroke="#3B82F6" 
            fillOpacity={1} 
            fill="url(#colorActual)" 
          />
          <Line 
            type="monotone" 
            dataKey="target" 
            name="Team Average" 
            stroke="#EF4444" 
            strokeDasharray="5 5" 
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
});

// Department Comparison (if insights available)
const DepartmentComparisonChart = memo(({ insights }) => {
  const chartData = useMemo(() => {
    if (!insights?.userDetails) return [];
    
    // Group by status
    const statusGroups = {};
    insights.userDetails.forEach(user => {
      const status = user.status?.label || 'Unknown';
      if (!statusGroups[status]) {
        statusGroups[status] = { name: status, count: 0, totalHours: 0 };
      }
      statusGroups[status].count++;
      statusGroups[status].totalHours += Math.round(user.totalMinutes / 60);
    });

    return Object.values(statusGroups);
  }, [insights]);

  if (chartData.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="bg-white rounded-xl shadow-lg p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-rose-100 rounded-lg">
          <Target className="w-5 h-5 text-rose-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Status Distribution</h3>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <RadarChart data={chartData}>
          <PolarGrid />
          <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis tick={{ fontSize: 10 }} />
          <Radar name="Members" dataKey="count" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.5} />
          <Tooltip />
        </RadarChart>
      </ResponsiveContainer>
    </motion.div>
  );
});

// Main Component
const TeamAnalyticsCharts = memo(({ teamData, insights }) => {
  return (
    <div className="space-y-6">
      {/* Top Row - Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DailyActivityChart data={teamData?.analytics} />
        <ProductivityDistributionChart teamData={teamData?.teamData} />
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProductivityTrendChart data={teamData?.analytics} />
        <TeamComparisonChart teamData={teamData?.teamData} />
      </div>

      {/* Third Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WeeklyHeatmap teamData={teamData?.teamData} dateRange={teamData?.dateRange} />
        {insights && <DepartmentComparisonChart insights={insights} />}
      </div>
    </div>
  );
});

TeamAnalyticsCharts.displayName = 'TeamAnalyticsCharts';

export default TeamAnalyticsCharts;
