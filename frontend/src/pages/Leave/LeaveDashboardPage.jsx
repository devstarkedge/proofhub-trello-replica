import React, { useContext } from 'react';
import { CalendarDays } from 'lucide-react';
import WorkspaceContext from '../../context/WorkspaceContext';
import AuthContext from '../../context/AuthContext';
import LeavePageHeader from '../../components/Leave/LeavePageHeader';
import LeaveRequestCenter from '../../components/Leave/LeaveRequestCenter';

export default function LeaveDashboardPage() {
  const { currentWorkspace } = useContext(WorkspaceContext);
  const { user } = useContext(AuthContext);
  return <div className="space-y-7">
    <LeavePageHeader title="Leave Dashboard" description="Review requests, track approval progress, and manage time off in one place." icon={CalendarDays} />
    <LeaveRequestCenter key={`${currentWorkspace?._id}:${user?._id || user?.id}`} workspaceId={currentWorkspace?._id} />
  </div>;
}
