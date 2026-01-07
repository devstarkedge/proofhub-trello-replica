import React, { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { Clock, Calendar, TrendingUp, Award, AlertTriangle } from 'lucide-react';

// Helper to get color intensity based on hours logged
const getHeatColor = (minutes, maxMinutes) => {
  if (minutes === 0) return 'bg-gray-100';
  
  const intensity = minutes / Math.max(maxMinutes, 480);
  
  if (intensity >= 1) return 'bg-emerald-600';
  if (intensity >= 0.75) return 'bg-emerald-500';
  if (intensity >= 0.5) return 'bg-emerald-400';
  if (intensity >= 0.25) return 'bg-amber-400';
  return 'bg-red-400';
};

const getTextColor = (minutes, maxMinutes) => {
  if (minutes === 0) return 'text-gray-400';
  const intensity = minutes / Math.max(maxMinutes, 480);
  return intensity >= 0.5 ? 'text-white' : 'text-gray-700';
};

// Single cell component
const HeatmapCell = memo(({ date, minutes, maxMinutes, userName }) => {
  const bgColor = getHeatColor(minutes, maxMinutes);
  const textColor = getTextColor(minutes, maxMinutes);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
  const dateStr = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            whileHover={{ scale: 1.1, zIndex: 10 }}
            className={`w-12 h-12 rounded-lg ${bgColor} flex items-center justify-center cursor-pointer transition-shadow hover:shadow-lg border border-white/50`}
          >
            {minutes > 0 && (
              <span className={`text-xs font-semibold ${textColor}`}>
                {hours}h
              </span>
            )}
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-gray-900 text-white p-3 rounded-lg shadow-xl max-w-xs">
          <div className="text-center">
            <div className="font-semibold mb-1">{userName}</div>
            <div className="text-sm text-gray-300 mb-2">{dayName}, {dateStr}</div>
            {minutes > 0 ? (
              <div className="text-lg font-bold text-emerald-400">
                {hours}h {mins}m
              </div>
            ) : (
              <div className="text-gray-400">No time logged</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

// Legend Component
const HeatmapLegend = memo(() => (
  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-200">
    <span className="text-sm text-gray-600">Intensity:</span>
    <div className="flex items-center gap-1">
      <div className="w-6 h-6 rounded bg-gray-100 border border-gray-200" />
      <span className="text-xs text-gray-500">0h</span>
    </div>
    <div className="flex items-center gap-1">
      <div className="w-6 h-6 rounded bg-red-400" />
      <span className="text-xs text-gray-500">&lt;2h</span>
    </div>
    <div className="flex items-center gap-1">
      <div className="w-6 h-6 rounded bg-amber-400" />
      <span className="text-xs text-gray-500">2-4h</span>
    </div>
    <div className="flex items-center gap-1">
      <div className="w-6 h-6 rounded bg-emerald-400" />
      <span className="text-xs text-gray-500">4-6h</span>
    </div>
    <div className="flex items-center gap-1">
      <div className="w-6 h-6 rounded bg-emerald-500" />
      <span className="text-xs text-gray-500">6-8h</span>
    </div>
    <div className="flex items-center gap-1">
      <div className="w-6 h-6 rounded bg-emerald-600" />
      <span className="text-xs text-gray-500">8h+</span>
    </div>
  </div>
));

// Summary Row Component
const SummaryRow = memo(({ dateRange, teamData }) => {
  const dailySummary = useMemo(() => {
    if (!dateRange || !teamData) return [];
    
    return dateRange.map(date => {
      const totalMinutes = teamData.reduce((sum, member) => {
        const dayData = member.dailyTimeline.find(d => d.date === date);
        return sum + (dayData?.totalMinutes || 0);
      }, 0);
      
      const activeMembers = teamData.filter(member => {
        const dayData = member.dailyTimeline.find(d => d.date === date);
        return dayData?.hasData;
      }).length;

      return {
        date,
        totalMinutes,
        activeMembers,
        avgMinutes: activeMembers > 0 ? Math.round(totalMinutes / activeMembers) : 0
      };
    });
  }, [dateRange, teamData]);

  const maxTotal = Math.max(...dailySummary.map(d => d.totalMinutes), 1);

  return (
    <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
      <div className="w-40 pr-3 flex items-center gap-2">
        <div className="p-1.5 bg-blue-100 rounded-lg">
          <TrendingUp className="w-4 h-4 text-blue-600" />
        </div>
        <span className="text-sm font-semibold text-gray-700">Daily Total</span>
      </div>
      <div className="flex gap-2 overflow-x-auto overflow-y-hidden">
        {dailySummary.map((day) => {
          const intensity = day.totalMinutes / maxTotal;
          const hours = Math.floor(day.totalMinutes / 60);
          
          return (
            <TooltipProvider key={day.date}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all
                      ${intensity >= 0.75 ? 'bg-blue-500 text-white' : 
                        intensity >= 0.5 ? 'bg-blue-400 text-white' : 
                        intensity >= 0.25 ? 'bg-blue-300 text-blue-800' : 
                        'bg-blue-100 text-blue-600'}`}
                  >
                    <span className="text-xs font-bold">{hours}h</span>
                    <span className="text-[10px]">{day.activeMembers}👤</span>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-gray-900 text-white p-3 rounded-lg">
                  <div className="text-center">
                    <div className="font-semibold">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                    <div className="text-emerald-400">{hours}h {day.totalMinutes % 60}m total</div>
                    <div className="text-sm text-gray-300">{day.activeMembers} active members</div>
                    <div className="text-xs text-gray-400">Avg: {Math.floor(day.avgMinutes / 60)}h {day.avgMinutes % 60}m</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    </div>
  );
});

// User Row Component
const UserHeatmapRow = memo(({ member, maxMinutes }) => {
  const statusEmoji = member.summary.productivityStatus?.emoji || '❓';
  const productivity = member.summary.productivityScore;
  
  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-2"
    >
      {/* User Info */}
      <div className="w-40 pr-3 flex items-center gap-2 flex-shrink-0">
        <div className="relative">
          {member.user.avatar ? (
            <img 
              src={member.user.avatar} 
              alt={member.user.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-sm">
              {member.user.name?.charAt(0)?.toUpperCase()}
            </div>
          )}
          <span className="absolute -bottom-1 -right-1 text-sm">{statusEmoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{member.user.name}</p>
          <p className="text-xs text-gray-500">{productivity}%</p>
        </div>
      </div>

      {/* Heatmap Cells */}
      <div className="flex gap-1 pb-2">
        {member.dailyTimeline.map((day) => (
          <HeatmapCell 
            key={day.date}
            date={day.date}
            minutes={day.totalMinutes}
            maxMinutes={maxMinutes}
            userName={member.user.name}
          />
        ))}
      </div>

      {/* Summary */}
      <div className="w-24 pl-3 text-right flex-shrink-0">
        <p className="text-sm font-bold text-gray-900">{member.summary.formattedTotal}</p>
        <p className="text-xs text-gray-500">{member.summary.daysWithLogs}d logged</p>
      </div>
    </motion.div>
  );
});

// Date Header Row
const DateHeaderRow = memo(({ dateRange }) => (
  <div className="flex items-center gap-1 mb-2">
    <div className="w-40 pr-3 flex-shrink-0">
      <span className="text-xs font-semibold text-gray-500 uppercase">Team Member</span>
    </div>
    <div className="flex gap-1 flex-1">
      {dateRange.map((date) => (
        <div key={date} className="w-12 text-center flex-shrink-0">
          <div className="text-[11px] font-semibold text-gray-600">
            {new Date(date).toLocaleDateString('en-US', { weekday: 'short' })}
          </div>
          <div className="text-[11px] text-gray-400">
            {new Date(date).toLocaleDateString('en-US', { day: 'numeric' })}
          </div>
        </div>
      ))}
    </div>
    <div className="w-24 pl-3 text-right flex-shrink-0">
      <span className="text-xs font-semibold text-gray-500 uppercase">Total</span>
    </div>
  </div>
));

// Main TeamHeatmap Component
const TeamHeatmap = memo(({ teamData, filteredMembers }) => {
  const maxMinutes = useMemo(() => {
    if (!filteredMembers) return 480;
    
    let max = 480; // Default to 8 hours
    filteredMembers.forEach(member => {
      member.dailyTimeline.forEach(day => {
        if (day.totalMinutes > max) max = day.totalMinutes;
      });
    });
    
    return max;
  }, [filteredMembers]);

  const dateRange = teamData?.dateRange || [];

  if (!filteredMembers || filteredMembers.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Calendar className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Data Available</h3>
        <p className="text-gray-500">Select a date range to view the heatmap</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-lg p-6 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl shadow-lg">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Time Tracking Heatmap</h3>
            <p className="text-sm text-gray-500">
              {dateRange.length} days • {filteredMembers.length} members
            </p>
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg">
            <Award className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700">
              {filteredMembers.filter(m => m.summary.productivityScore >= 80).length} high performers
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-red-700">
              {filteredMembers.filter(m => m.summary.productivityScore < 50 && m.summary.productivityScore > 0).length} need attention
            </span>
          </div>
        </div>
      </div>

      {/* Date Header + Grid with single horizontal scroll */}
      <div className="overflow-x-auto">
        <div className="min-w-max">
          <DateHeaderRow dateRange={dateRange} />

          <div className="space-y-2 pr-2">
            {filteredMembers.map((member, index) => (
              <motion.div
                key={member.user._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <UserHeatmapRow member={member} maxMinutes={maxMinutes} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Row */}
      <SummaryRow dateRange={dateRange} teamData={filteredMembers} />

      {/* Legend */}
      <HeatmapLegend />

      {/* Scroll styling */}
      <style jsx="true">{`
        .custom-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
        .custom-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 9999px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </motion.div>
  );
});

TeamHeatmap.displayName = 'TeamHeatmap';

export default TeamHeatmap;
