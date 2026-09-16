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
    <div className="space-y-7">
      <LeavePageHeader
        title="Leave Calendar"
        description="Plan around approved leave, workspace holidays, and weekly days off."
        icon={CalendarRange}
      />
      <div className="rounded-2xl border p-3 shadow-sm sm:p-5 lg:p-6" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)' }}>
        <LeaveCalendarGrid key={currentWorkspace?._id} userId={userId} employeeName={user?.name} />
      </div>
    </div>
  );
};

export default LeaveCalendarPage;
