import React, { useRef, useState } from 'react';
import { ArrowLeft, Rocket, Settings } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Button } from '../components/ui/button';
import LeaveContentContainer from '../components/Leave/LeaveContentContainer';
import * as attendanceApi from '../services/attendanceApi';

const SETTINGS_TABS = [
  { label: 'Policy', to: '/attendance/settings/policy' },
  { label: 'Shifts', to: '/attendance/settings/shifts' },
  { label: 'Locations', to: '/attendance/settings/locations' },
  { label: 'Work Mode Overrides', to: '/attendance/settings/work-modes' }
];

const isSafeAttendanceReturn = (path) => (
  typeof path === 'string'
  && /^\/attendance(?:\/my|\/approvals)?$/.test(path)
  && !path.startsWith('/attendance/settings')
);

const AttendanceSettingsLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [settingUp, setSettingUp] = useState(false);
  const backTargetRef = useRef((() => {
    const stateTarget = location.state?.fromAttendance;
    const storedTarget = sessionStorage.getItem('flowtask.attendance.lastRoute');
    if (isSafeAttendanceReturn(stateTarget)) return stateTarget;
    if (isSafeAttendanceReturn(storedTarget)) return storedTarget;
    return '/attendance/my';
  })());

  const runSetup = async () => {
    setSettingUp(true);
    try {
      await attendanceApi.setupAttendanceModule();
      toast.success('Attendance module enabled for this workspace');
    } catch {
      // The API interceptor owns error notifications.
    } finally {
      setSettingUp(false);
    }
  };

  return (
    <div className="min-h-full w-full">
      <div
        className="sticky top-0 z-30 border-b"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-bg-base) 96%, transparent)', borderColor: 'var(--color-border-subtle)' }}
      >
        <LeaveContentContainer className="!py-0">
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(backTargetRef.current)}
                className="flex flex-none items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-muted)]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <ArrowLeft className="h-4 w-4" /> Back to Attendance
              </button>
              <span className="hidden h-7 w-px sm:block" style={{ backgroundColor: 'var(--color-border-subtle)' }} />
              <div className="flex min-w-0 items-center gap-2">
                <Settings className="h-5 w-5 flex-none" style={{ color: 'var(--color-primary-600)' }} />
                <h1 className="truncate text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Attendance Settings</h1>
              </div>
            </div>
            <Button variant="outline" onClick={runSetup} disabled={settingUp} className="flex items-center gap-2 self-start sm:self-auto">
              <Rocket className="h-4 w-4" /> {settingUp ? 'Setting up…' : 'Enable Attendance Module'}
            </Button>
          </div>

          <nav className="flex max-w-full gap-1 overflow-x-auto pb-2" aria-label="Attendance settings navigation">
            {SETTINGS_TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                state={{ fromAttendance: backTargetRef.current }}
                className="flex-none whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={({ isActive }) => isActive
                  ? { backgroundColor: 'var(--color-primary-600)', color: 'var(--color-text-on-primary)' }
                  : { color: 'var(--color-text-secondary)' }}
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </LeaveContentContainer>
      </div>

      <LeaveContentContainer><Outlet /></LeaveContentContainer>
    </div>
  );
};

export default AttendanceSettingsLayout;
