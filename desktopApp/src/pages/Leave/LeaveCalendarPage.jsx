import React, { useContext } from 'react';
import { CalendarRange } from 'lucide-react';
import AuthContext from '../../context/AuthContext';
import WorkspaceContext from '../../context/WorkspaceContext';
import LeaveCalendarGrid from '../../components/Leave/LeaveCalendarGrid';
import LeavePageHeader from '../../components/Leave/LeavePageHeader';

const LeaveCalendarPage = () => {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const userId = user?._id || user?.id;

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2 sm:gap-2.5">
      <div className="flex flex-none items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <div
            className="flex h-8 w-8 sm:h-9 sm:w-9 flex-none items-center justify-center rounded-lg sm:rounded-xl"
            style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary-600)' }}
          >
            <CalendarRange className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg lg:text-xl font-bold tracking-tight leading-tight" style={{ color: 'var(--color-text-primary)' }}>
              Leave Calendar
            </h1>
            <p className="text-[11px] sm:text-xs hidden sm:block leading-tight" style={{ color: 'var(--color-text-muted)' }}>
              View approved and pending leave alongside workspace holidays and weekly days off.
            </p>
          </div>
        </div>
      </div>
      <div
        className="flex-1 flex flex-col min-h-0 rounded-xl sm:rounded-2xl border p-2 sm:p-3 lg:p-3.5 shadow-sm"
        style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}
      >
        <LeaveCalendarGrid key={`${currentWorkspace?._id}:${userId}`} userId={userId} employeeName={user?.name} />
      </div>
    </div>
  );
};

export default LeaveCalendarPage;
