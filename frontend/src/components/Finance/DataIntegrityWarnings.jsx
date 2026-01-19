import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Clock,
  FileQuestion,
  X
} from 'lucide-react';

/**
 * DataIntegrityWarnings - Non-blocking warnings for finance data issues
 * Shows warnings for:
 * - Projects with logged time but no billing type
 * - Hourly projects missing hourly rate
 * - Fixed projects where logged time exceeds limit
 * - Users without department assignment
 */
const DataIntegrityWarnings = ({ 
  data = [], 
  type = 'projects', // 'projects' or 'users'
  onDismiss 
}) => {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState([]);

  const warnings = useMemo(() => {
    const issues = [];

    if (type === 'projects') {
      data.forEach(project => {
        const projectName = project.projectName || project.boardName || project.name || project.title || 'Unknown Project';
        const totalLoggedMinutes = (project.loggedTime?.hours || 0) * 60 + (project.loggedTime?.minutes || 0);
        const totalBilledMinutes = (project.billedTime?.hours || 0) * 60 + (project.billedTime?.minutes || 0);

        // Warning: Has logged time but no billing type
        const billingType = project.billingType || project.billingCycle;
        if (totalLoggedMinutes > 0 && !billingType) {
          issues.push({
            id: `${project.projectId || project.boardId || project._id}-no-billing`,
            type: 'warning',
            icon: FileQuestion,
            message: `"${projectName}" has ${Math.floor(totalLoggedMinutes / 60)}h ${totalLoggedMinutes % 60}m logged but no billing type set`,
            suggestion: 'Set billing type in project settings',
            projectId: project.projectId || project.boardId || project._id
          });
        }

        // Warning: Hourly project without rate
        if ((billingType === 'hourly' || billingType === 'hr') && (!project.hourlyRate && !project.hourlyPrice || (project.hourlyRate || project.hourlyPrice) <= 0)) {
          issues.push({
            id: `${project.projectId || project.boardId || project._id}-no-rate`,
            type: 'warning',
            icon: DollarSign,
            message: `"${projectName}" is hourly billing but missing hourly rate`,
            suggestion: 'Set hourly rate in project settings',
            projectId: project.projectId || project.boardId || project._id
          });
        }

        // Warning: Fixed project exceeding limit
        if ((billingType === 'fixed') && project.fixedHours) {
          const fixedMinutes = project.fixedHours * 60;
          if (totalLoggedMinutes > fixedMinutes) {
            const excessMinutes = totalLoggedMinutes - fixedMinutes;
            issues.push({
              id: `${project.projectId || project.boardId || project._id}-exceeded`,
              type: 'critical',
              icon: AlertCircle,
              message: `"${projectName}" exceeded fixed hours limit by ${Math.floor(excessMinutes / 60)}h ${excessMinutes % 60}m`,
              suggestion: 'Review and adjust time entries or update fixed hours limit',
              projectId: project.projectId || project.boardId || project._id
            });
          }
        }

        // Info: Large difference between logged and billed
        if (totalLoggedMinutes > 0 && totalBilledMinutes > 0) {
          const difference = Math.abs(totalLoggedMinutes - totalBilledMinutes);
          const percentage = (difference / totalLoggedMinutes) * 100;
          if (percentage > 30 && difference > 60) { // More than 30% difference and over 1 hour
            issues.push({
              id: `${project.projectId || project.boardId || project._id}-discrepancy`,
              type: 'info',
              icon: Clock,
              message: `"${projectName}" has ${Math.round(percentage)}% discrepancy between logged and billed time`,
              suggestion: 'Review time entries for accuracy',
              projectId: project.projectId || project.boardId || project._id
            });
          }
        }
      });
    }

    if (type === 'users') {
      data.forEach(user => {
        const userName = user.userName || user.name || user.email || 'Unknown User';
        const totalLoggedMinutes = (user.loggedTime?.hours || 0) * 60 + (user.loggedTime?.minutes || 0);

        // Warning: User without department
        if (totalLoggedMinutes > 0 && !user.department && !user.departmentName) {
          issues.push({
            id: `${user.userId || user._id}-no-dept`,
            type: 'info',
            icon: Info,
            message: `"${userName}" has logged time but no department assigned`,
            suggestion: 'Assign department in user settings',
            userId: user.userId || user._id
          });
        }
      });
    }

    // Filter out dismissed warnings
    return issues.filter(issue => !dismissed.includes(issue.id));
  }, [data, type, dismissed]);

  const handleDismiss = (warningId) => {
    setDismissed(prev => [...prev, warningId]);
  };

  const handleDismissAll = () => {
    setDismissed(warnings.map(w => w.id));
    if (onDismiss) onDismiss();
  };

  if (warnings.length === 0) return null;

  const criticalCount = warnings.filter(w => w.type === 'critical').length;
  const warningCount = warnings.filter(w => w.type === 'warning').length;
  const infoCount = warnings.filter(w => w.type === 'info').length;

  const getTypeStyles = (type) => {
    switch (type) {
      case 'critical':
        return {
          bg: 'rgba(239, 68, 68, 0.1)',
          border: 'rgba(239, 68, 68, 0.3)',
          text: '#ef4444'
        };
      case 'warning':
        return {
          bg: 'rgba(245, 158, 11, 0.1)',
          border: 'rgba(245, 158, 11, 0.3)',
          text: '#f59e0b'
        };
      default:
        return {
          bg: 'rgba(59, 130, 246, 0.1)',
          border: 'rgba(59, 130, 246, 0.3)',
          text: '#3b82f6'
        };
    }
  };

  return (
    <div 
      className="mb-4 rounded-xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-subtle)'
      }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
            Data Integrity Warnings
          </span>
          <div className="flex gap-2">
            {criticalCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-500">
                {criticalCount} Critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-500">
                {warningCount} Warning
              </span>
            )}
            {infoCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-500">
                {infoCount} Info
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismissAll();
            }}
            className="text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Dismiss All
          </button>
          {expanded ? (
            <ChevronUp className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
          ) : (
            <ChevronDown className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
          {warnings.map(warning => {
            const styles = getTypeStyles(warning.type);
            const IconComponent = warning.icon;
            
            return (
              <div
                key={warning.id}
                className="flex items-start gap-3 p-3 rounded-lg border"
                style={{
                  backgroundColor: styles.bg,
                  borderColor: styles.border
                }}
              >
                <IconComponent className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: styles.text }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {warning.message}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    💡 {warning.suggestion}
                  </p>
                </div>
                <button
                  onClick={() => handleDismiss(warning.id)}
                  className="p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DataIntegrityWarnings;
