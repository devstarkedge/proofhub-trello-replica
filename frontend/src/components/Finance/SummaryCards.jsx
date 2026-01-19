import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Clock, 
  FileCheck, 
  AlertCircle,
  User,
  FolderKanban,
  TrendingUp,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import api from '../../services/api';

/**
 * SummaryCards - Reactive summary cards for Finance Dashboard
 * Cards update instantly when filters change
 * Clicking a card applies related filters
 */
const SummaryCards = ({ filters = {}, onCardClick }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch summary data
  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.departmentId) params.append('departmentId', filters.departmentId);
      
      const response = await api.get(`/api/finance/summary?${params.toString()}`);
      
      if (response.data.success) {
        setSummary(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching finance summary:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [filters.startDate, filters.endDate, filters.departmentId]);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  // Format time
  const formatTime = (time) => {
    if (!time) return '0h 0m';
    return `${time.hours || 0}h ${time.minutes || 0}m`;
  };

  // Card configurations
  const cards = [
    {
      id: 'revenue',
      title: 'Total Revenue',
      value: summary ? formatCurrency(summary.totalRevenue) : '$0',
      icon: DollarSign,
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.12)',
      filterAction: 'revenue'
    },
    {
      id: 'logged',
      title: 'Total Logged Time',
      value: summary ? formatTime(summary.totalLoggedTime) : '0h 0m',
      icon: Clock,
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.12)',
      filterAction: 'logged'
    },
    {
      id: 'billed',
      title: 'Total Billed Time',
      value: summary ? formatTime(summary.totalBilledTime) : '0h 0m',
      icon: FileCheck,
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.12)',
      filterAction: 'billed'
    },
    {
      id: 'unbilled',
      title: 'Unbilled Time',
      value: summary ? formatTime(summary.unbilledTime) : '0h 0m',
      icon: AlertCircle,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.12)',
      filterAction: 'unbilled'
    },
    {
      id: 'topUser',
      title: 'Top Earning User',
      value: summary?.topEarningUser?.userName || 'N/A',
      subtitle: summary?.topEarningUser 
        ? formatTime({ 
            hours: Math.floor(summary.topEarningUser.billedMinutes / 60),
            minutes: summary.topEarningUser.billedMinutes % 60
          })
        : null,
      icon: User,
      color: '#ec4899',
      bg: 'rgba(236, 72, 153, 0.12)',
      filterAction: 'user',
      filterValue: summary?.topEarningUser?.userId
    },
    {
      id: 'topProject',
      title: 'Top Revenue Project',
      value: summary?.topRevenueProject?.name || 'N/A',
      subtitle: summary?.topRevenueProject 
        ? formatCurrency(summary.topRevenueProject.payment)
        : null,
      icon: FolderKanban,
      color: '#06b6d4',
      bg: 'rgba(6, 182, 212, 0.12)',
      filterAction: 'project',
      filterValue: summary?.topRevenueProject?.projectId
    }
  ];

  // Skeleton loader
  const SkeletonCard = () => (
    <div 
      className="p-5 rounded-xl border animate-pulse"
      style={{ 
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-subtle)'
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div 
            className="h-4 w-24 rounded mb-3"
            style={{ backgroundColor: 'var(--color-bg-muted)' }}
          />
          <div 
            className="h-8 w-32 rounded mb-2"
            style={{ backgroundColor: 'var(--color-bg-muted)' }}
          />
        </div>
        <div 
          className="w-10 h-10 rounded-lg"
          style={{ backgroundColor: 'var(--color-bg-muted)' }}
        />
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {[...Array(6)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className="p-4 rounded-xl border text-center mb-6"
        style={{ 
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderColor: 'rgba(239, 68, 68, 0.3)',
          color: '#ef4444'
        }}
      >
        <AlertCircle className="w-5 h-5 mx-auto mb-2" />
        <p className="text-sm">Failed to load summary: {error}</p>
        <button 
          onClick={fetchSummary}
          className="mt-2 text-xs flex items-center gap-1 mx-auto hover:underline"
        >
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        
        return (
          <button
            key={card.id}
            onClick={() => onCardClick?.(card.filterAction, card.filterValue)}
            className="p-5 rounded-xl border transition-all duration-200 text-left group hover:scale-[1.02]"
            style={{ 
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border-subtle)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = card.color;
              e.currentTarget.style.boxShadow = `0 4px 12px ${card.bg}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p 
                  className="text-xs font-medium mb-1 truncate"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {card.title}
                </p>
                <p 
                  className="text-xl font-bold truncate"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {card.value}
                </p>
                {card.subtitle && (
                  <p 
                    className="text-xs mt-1 truncate"
                    style={{ color: card.color }}
                  >
                    {card.subtitle}
                  </p>
                )}
              </div>
              <div 
                className="p-2.5 rounded-lg flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
                style={{ backgroundColor: card.bg }}
              >
                <Icon 
                  className="w-5 h-5" 
                  style={{ color: card.color }}
                />
              </div>
            </div>
            
            {/* Hover indicator */}
            <div 
              className="flex items-center gap-1 mt-3 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              style={{ color: card.color }}
            >
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default SummaryCards;
