import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle, Award, Target,
  Lightbulb, AlertCircle, CheckCircle2, XCircle, Clock, Users,
  Zap, Activity, BarChart3, Info, ChevronRight, X, Flame,
  Heart, Coffee, Sparkles
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

// AI Analysis Card
const AICard = memo(({ icon: Icon, title, children, color = 'blue', delay = 0 }) => {
  const colorClasses = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', title: 'text-blue-900' },
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', title: 'text-emerald-900' },
    yellow: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600', title: 'text-amber-900' },
    red: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600', title: 'text-red-900' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-600', title: 'text-purple-900' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-600', title: 'text-orange-900' }
  };

  const colors = colorClasses[color] || colorClasses.blue;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`${colors.bg} ${colors.border} border rounded-xl p-4`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-lg ${colors.bg}`}>
          <Icon className={`w-5 h-5 ${colors.icon}`} />
        </div>
        <h4 className={`font-semibold ${colors.title}`}>{title}</h4>
      </div>
      {children}
    </motion.div>
  );
});

// Alert Item Component
const AlertItem = memo(({ alert }) => {
  const typeStyles = {
    critical: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle },
    warning: { bg: 'bg-amber-100', text: 'text-amber-700', icon: AlertCircle },
    info: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Info },
    success: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 }
  };

  const style = typeStyles[alert.type] || typeStyles.info;
  const IconComponent = style.icon;

  return (
    <div className={`${style.bg} rounded-lg p-3 mb-2`}>
      <div className="flex items-start gap-2">
        <IconComponent className={`w-5 h-5 ${style.text} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <h5 className={`font-medium ${style.text} text-sm`}>{alert.title}</h5>
          <p className="text-xs text-gray-600 mt-1">{alert.message}</p>
          {alert.action && (
            <p className="text-xs text-gray-500 mt-2 italic">💡 {alert.action}</p>
          )}
        </div>
      </div>
    </div>
  );
});

// Prediction Item Component
const PredictionItem = memo(({ prediction }) => {
  const typeStyles = {
    positive: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: TrendingUp, iconColor: 'text-emerald-500' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: TrendingDown, iconColor: 'text-amber-500' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: Activity, iconColor: 'text-blue-500' }
  };

  const style = typeStyles[prediction.type] || typeStyles.info;
  const IconComponent = style.icon;

  return (
    <div className={`${style.bg} ${style.border} border rounded-lg p-3 mb-2`}>
      <div className="flex items-start gap-3">
        <IconComponent className={`w-5 h-5 ${style.iconColor} flex-shrink-0`} />
        <div className="flex-1">
          <p className="text-sm text-gray-700">{prediction.message}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full ${prediction.type === 'positive' ? 'bg-emerald-500' : prediction.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'} transition-all`}
                style={{ width: `${prediction.confidence}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">{prediction.confidence}% confidence</span>
          </div>
        </div>
      </div>
    </div>
  );
});

// Suggestion Item Component
const SuggestionItem = memo(({ suggestion }) => (
  <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer mb-2">
    <span className="text-2xl">{suggestion.icon}</span>
    <div>
      <h5 className="font-medium text-gray-900 text-sm">{suggestion.title}</h5>
      <p className="text-xs text-gray-500 mt-0.5">{suggestion.description}</p>
    </div>
    <ChevronRight className="w-4 h-4 text-gray-400 ml-auto flex-shrink-0" />
  </div>
));

// User Badge Component
const UserBadge = memo(({ user, type }) => {
  const typeStyles = {
    top: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: Award },
    low: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle },
    idle: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Coffee },
    overworked: { bg: 'bg-orange-100', text: 'text-orange-700', icon: Flame }
  };

  const style = typeStyles[type] || typeStyles.low;

  return (
    <div className={`${style.bg} rounded-lg p-2 flex items-center gap-2`}>
      {user.avatar ? (
        <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
          {user.name?.charAt(0)?.toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${style.text} truncate`}>{user.name}</p>
      </div>
    </div>
  );
});

// Health Score Gauge
const HealthScoreGauge = memo(({ score }) => {
  const getColor = (s) => {
    if (s >= 80) return 'text-emerald-500';
    if (s >= 60) return 'text-amber-500';
    if (s >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getLabel = (s) => {
    if (s >= 80) return 'Excellent';
    if (s >= 60) return 'Good';
    if (s >= 40) return 'Fair';
    return 'Needs Improvement';
  };

  const getEmoji = (s) => {
    if (s >= 80) return '🌟';
    if (s >= 60) return '👍';
    if (s >= 40) return '😐';
    return '⚠️';
  };

  return (
    <div className="text-center">
      <div className="relative inline-block">
        <svg className="w-32 h-32 transform -rotate-90">
          <circle
            className="text-gray-200"
            strokeWidth="10"
            stroke="currentColor"
            fill="transparent"
            r="56"
            cx="64"
            cy="64"
          />
          <circle
            className={`${getColor(score)} transition-all duration-1000`}
            strokeWidth="10"
            strokeDasharray={352}
            strokeDashoffset={352 - (score / 100) * 352}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r="56"
            cx="64"
            cy="64"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-gray-900">{score}</span>
          <span className="text-xs text-gray-500">/ 100</span>
        </div>
      </div>
      <div className="mt-2">
        <span className="text-2xl">{getEmoji(score)}</span>
        <p className={`text-sm font-semibold ${getColor(score)}`}>{getLabel(score)}</p>
      </div>
    </div>
  );
});

// Main Smart Insights Panel
const SmartInsightsPanel = memo(({ insights, onClose }) => {
  if (!insights) return null;

  const { overview, insights: insightData, aiAnalysis, userDetails } = insights;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-gradient-to-br from-white to-purple-50/50 rounded-2xl shadow-xl border border-purple-100 p-6 mb-6 relative overflow-hidden"
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-100/50 to-blue-100/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl shadow-lg">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              AI Smart Insights
              <Sparkles className="w-5 h-5 text-purple-500" />
            </h3>
            <p className="text-sm text-gray-500">Intelligent analysis of team productivity</p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        {/* Column 1: Overview & Health Score */}
        <div className="space-y-4">
          {/* Team Health Score */}
          <AICard icon={Heart} title="Team Health Score" color="purple" delay={0}>
            <HealthScoreGauge score={aiAnalysis?.healthScore || 0} />
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="bg-white rounded-lg p-2">
                <p className="text-2xl font-bold text-gray-900">{overview?.totalUsers || 0}</p>
                <p className="text-xs text-gray-500">Team Size</p>
              </div>
              <div className="bg-white rounded-lg p-2">
                <p className="text-2xl font-bold text-gray-900">{overview?.avgTeamProductivity || 0}%</p>
                <p className="text-xs text-gray-500">Avg Productivity</p>
              </div>
            </div>
          </AICard>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center"
            >
              <Award className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-emerald-700">{insightData?.topPerformers?.length || 0}</p>
              <p className="text-xs text-emerald-600">Top Performers</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
              className="bg-red-50 border border-red-200 rounded-xl p-4 text-center"
            >
              <AlertTriangle className="w-6 h-6 text-red-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-red-700">{insightData?.lowPerformers?.length || 0}</p>
              <p className="text-xs text-red-600">Need Attention</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center"
            >
              <Flame className="w-6 h-6 text-orange-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-orange-700">{insightData?.overworkedUsers?.length || 0}</p>
              <p className="text-xs text-orange-600">Overworked</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25 }}
              className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center"
            >
              <Coffee className="w-6 h-6 text-gray-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-700">{insightData?.idleUsers?.length || 0}</p>
              <p className="text-xs text-gray-600">Idle Users</p>
            </motion.div>
          </div>
        </div>

        {/* Column 2: Alerts & Predictions */}
        <div className="space-y-4">
          {/* Alerts */}
          <AICard icon={AlertCircle} title="Active Alerts" color="red" delay={0.1}>
            <div className="max-h-48 overflow-y-auto pr-1">
              {aiAnalysis?.alerts?.length > 0 ? (
                aiAnalysis.alerts.map((alert, index) => (
                  <AlertItem key={index} alert={alert} />
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                  <p className="text-sm">No critical alerts</p>
                </div>
              )}
            </div>
          </AICard>

          {/* Predictions */}
          <AICard icon={TrendingUp} title="AI Predictions" color="blue" delay={0.2}>
            <div className="max-h-48 overflow-y-auto pr-1">
              {aiAnalysis?.predictions?.length > 0 ? (
                aiAnalysis.predictions.map((prediction, index) => (
                  <PredictionItem key={index} prediction={prediction} />
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-blue-400" />
                  <p className="text-sm">No predictions available</p>
                </div>
              )}
            </div>
          </AICard>
        </div>

        {/* Column 3: Suggestions & Performers */}
        <div className="space-y-4">
          {/* Smart Suggestions */}
          <AICard icon={Lightbulb} title="Smart Suggestions" color="yellow" delay={0.15}>
            <div className="max-h-48 overflow-y-auto pr-1">
              {aiAnalysis?.suggestions?.map((suggestion, index) => (
                <SuggestionItem key={index} suggestion={suggestion} />
              ))}
            </div>
          </AICard>

          {/* Top Performers */}
          <AICard icon={Award} title="Top Performers" color="green" delay={0.25}>
            <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
              {insightData?.topPerformers?.slice(0, 4).map((performer, index) => (
                <UserBadge key={index} user={performer.user} type="top" />
              ))}
              {(!insightData?.topPerformers || insightData.topPerformers.length === 0) && (
                <p className="text-sm text-gray-500 text-center py-2">No top performers yet</p>
              )}
            </div>
          </AICard>

          {/* Needs Attention */}
          {insightData?.lowPerformers?.length > 0 && (
            <AICard icon={AlertTriangle} title="Needs Attention" color="orange" delay={0.3}>
              <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                {insightData.lowPerformers.slice(0, 3).map((performer, index) => (
                  <UserBadge key={index} user={performer.user} type="low" />
                ))}
              </div>
            </AICard>
          )}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="mt-6 pt-4 border-t border-purple-100 flex items-center justify-between text-sm text-gray-500 relative z-10">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Total: {overview?.totalTeamHours || 0}h logged
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {overview?.totalUsers || 0} team members
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-purple-500" />
          <span>Powered by FlowTask AI</span>
        </div>
      </div>
    </motion.div>
  );
});

SmartInsightsPanel.displayName = 'SmartInsightsPanel';

export default SmartInsightsPanel;
