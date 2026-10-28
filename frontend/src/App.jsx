
import { lazy, Suspense } from "react";
import { Navigate, Routes, Route } from "react-router-dom";
import Loading from "./components/Loading";
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from "./context/AuthContext";
import { MeProvider } from "./context/MeContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import { TeamProvider } from "./context/DepartmentContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ClientInfoProvider } from "./context/ClientInfoContext";
import NetworkStatusToast from "./components/NetworkStatusToast";
import ErrorBoundary from "./components/ErrorBoundary";
import GlobalFallback from "./components/GlobalFallback";
import GlobalPushPrompt from "./components/GlobalPushPrompt";
import useThemeStore from "./store/themeStore";
import "./App.css";

// Direct imports for instant navigation (no lazy loading)
const WorkFlow = lazy(() => import('./pages/WorkFlow'));
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ConfirmEmailChange from './pages/ConfirmEmailChange';
import VerifyPending from "./pages/VerifyPending";
const TeamManagement = lazy(() => import('./pages/TeamManagement'));
const Search = lazy(() => import('./pages/Search'));
import ListViewLayout from "./layouts/ListViewLayout";
import MainLayout from "./layouts/MainLayout";
const ListViewTasks = lazy(() => import('./pages/ListViewTasks'));
const ListViewTeams = lazy(() => import('./pages/ListViewTeams'));
const CalendarView = lazy(() => import('./pages/CalendarView'));
const GanttView = lazy(() => import('./pages/GanttView'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const HRPanel = lazy(() => import('./pages/HRPanel'));
const Analytics = lazy(() => import('./pages/Analytics'));
const HomePage = lazy(() => import('./pages/HomePage'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const Announcements = lazy(() => import('./pages/Announcements'));
const RemindersPage = lazy(() => import('./pages/RemindersPage'));
const ClientReminderCalendarPage = lazy(() => import('./pages/ClientReminderCalendarPage'));
import PrivateRoute from "./components/PrivateRoute";
import FinanceRouteGuard from "./components/FinanceRouteGuard";
import AccessControlRouteGuard from "./components/AccessControlRouteGuard";
const AccessControlPage = lazy(() => import('./pages/AccessControlPage'));
import JoinRequestsRouteGuard from "./components/JoinRequestsRouteGuard";
const JoinRequestsPage = lazy(() => import('./pages/JoinRequestsPage'));
const LeaveDashboardPage = lazy(() => import('./pages/Leave/LeaveDashboardPage'));
const MyLeavePage = lazy(() => import('./pages/Leave/MyLeavePage'));
const ApprovalQueuePage = lazy(() => import('./pages/Leave/ApprovalQueuePage'));
const LeaveCalendarPage = lazy(() => import('./pages/Leave/LeaveCalendarPage'));
const LeaveReportsPage = lazy(() => import('./pages/Leave/LeaveReportsPage'));
const LeaveSettingsPage = lazy(() => import('./pages/Leave/LeaveSettingsPage'));
import LeaveLayout from "./layouts/LeaveLayout";
import LeaveSettingsLayout from "./layouts/LeaveSettingsLayout";
const MyAttendancePage = lazy(() => import('./pages/Attendance/MyAttendancePage'));
const TeamAttendancePage = lazy(() => import('./pages/Attendance/TeamAttendancePage'));
const AttendanceApprovalsPage = lazy(() => import('./pages/Attendance/AttendanceApprovalsPage'));
const AttendanceSettingsPage = lazy(() => import('./pages/Attendance/AttendanceSettingsPage'));
import AttendanceLayout from "./layouts/AttendanceLayout";
import AttendanceSettingsLayout from "./layouts/AttendanceSettingsLayout";
import PermissionConfirmModal from "./components/AccessControl/PermissionConfirmModal";
const ProjectTrash = lazy(() => import('./pages/ProjectTrash'));
import ProjectWorkspaceGate from "./components/ProjectWorkspaceGate";
import SelectWorkspacePage from "./pages/SelectWorkspacePage";
import NoWorkspacePage from "./pages/NoWorkspacePage";
import InvitePage from "./pages/InvitePage";
const TimeTrackingPage = lazy(() => import('./pages/TimeTrackingPage'));
const WorkspaceSettingsPage = lazy(() => import('./pages/WorkspaceSettingsPage'));
const WorkspaceConfigsPage = lazy(() => import('./pages/WorkspaceConfigsPage'));
import WorkspaceModuleGate from "./components/Workspace/WorkspaceModuleGate";
import CreateWorkspacePublicPage from './pages/CreateWorkspacePublicPage';
import ContactSalesPage from './pages/ContactSalesPage';

// Finance Module Pages
import FinanceLayout from "./pages/Finance/FinanceLayout";
const FinanceDashboard = lazy(() => import('./pages/Finance/FinanceDashboard'));
const UsersTab = lazy(() => import('./pages/Finance/UsersTab'));
const ProjectsTab = lazy(() => import('./pages/Finance/ProjectsTab'));
const WeeklyTab = lazy(() => import('./pages/Finance/WeeklyTab'));
const FinancePagesManager = lazy(() => import('./pages/Finance/FinancePagesManager'));
const CreateFinancePage = lazy(() => import('./pages/Finance/CreateFinancePage'));
const ViewFinancePage = lazy(() => import('./pages/Finance/ViewFinancePage'));
const MyShortcutsPage = lazy(() => import('./pages/MyShortcutsPage'));
const SalesPage = lazy(() => import('./pages/SalesPage'));

// Super Admin Dashboard — platform-level context, deliberately NOT nested
// inside MainLayout/PrivateRoute's workspace-scoped tree (see SuperAdminRouteGuard).
import SuperAdminRouteGuard from "./components/SuperAdminRouteGuard";
import SuperAdminLayout from "./pages/SuperAdmin/SuperAdminLayout";
const SuperAdminOverviewPage = lazy(() => import('./pages/SuperAdmin/SuperAdminOverviewPage'));
const SuperAdminWorkspacesPage = lazy(() => import('./pages/SuperAdmin/SuperAdminWorkspacesPage'));
const SuperAdminWorkspaceDetailPage = lazy(() => import('./pages/SuperAdmin/SuperAdminWorkspaceDetailPage'));
const SuperAdminAuditLogPage = lazy(() => import('./pages/SuperAdmin/SuperAdminAuditLogPage'));

const RouteLoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <Loading size="lg" text="Loading FlowTask..." />
  </div>
);

function App() {
  return (
    <AuthProvider>
      <MeProvider>
        <WorkspaceProvider>
        <TeamProvider>
          <NotificationProvider>
            <ClientInfoProvider>
              <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
        <Route path="/confirm-email-change" element={<ConfirmEmailChange />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/create-workspace" element={<CreateWorkspacePublicPage />} />
              <Route path="/contact-sales" element={<ContactSalesPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
              <Route path="/verify-pending" element={<VerifyPending />} />
              <Route path="/select-workspace" element={<SelectWorkspacePage />} />
              <Route path="/no-workspace" element={<NoWorkspacePage />} />
              <Route path="/invite/:token" element={<InvitePage />} />
              <Route
                element={
                  <PrivateRoute>
                    <MainLayout />
                  </PrivateRoute>
                }
              >
                <Route
                  path="/"
                  element={
                    <ErrorBoundary>
                      <HomePage />
                    </ErrorBoundary>
                  }
                />
                <Route path="/my-shortcuts" element={<MyShortcutsPage />} />
                <Route path="/time-tracking" element={<TimeTrackingPage />} />
                <Route path="/workspace-settings" element={<WorkspaceSettingsPage />} />
                <Route path="/workspace-settings/configs" element={<WorkspaceConfigsPage />} />
                <Route path="/workflow/:deptId/:projectId" element={<ProjectWorkspaceGate><WorkFlow /></ProjectWorkspaceGate>} />
                <Route path="/workflow/:deptId/:projectId/:taskId" element={<ProjectWorkspaceGate><WorkFlow /></ProjectWorkspaceGate>} />
                <Route path="/workflow/:deptId/:projectId/trash" element={<ProjectTrash />} />

                {/* Leave Management — self-service (dashboard/my-leave/calendar)
                    is open to every authenticated workspace member; only
                    /leave/settings is role-gated, matching how the backend
                    treats self-service as structural rather than
                    permission-gated (see modules/leave/leaveAuthorization.service.js). */}
                <Route path="/leave" element={<WorkspaceModuleGate module="leave"><LeaveLayout /></WorkspaceModuleGate>}>
                  <Route index element={<LeaveDashboardPage />} />
                  <Route path="my" element={<MyLeavePage />} />
                  <Route path="approvals" element={<ApprovalQueuePage />} />
                  <Route path="approvals/:requestId" element={<ApprovalQueuePage />} />
                  <Route path="calendar" element={<LeaveCalendarPage />} />
                  <Route
                    path="reports"
                    element={
                      <PrivateRoute requiredRole={["HR", "Admin"]}>
                        <LeaveReportsPage />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <PrivateRoute requiredRole={["HR", "Admin"]}>
                        <LeaveSettingsLayout />
                      </PrivateRoute>
                    }
                  >
                    <Route index element={<Navigate to="policies" replace />} />
                    <Route path=":section" element={<LeaveSettingsPage />} />
                  </Route>
                </Route>

                {/* Attendance — self-service (my attendance / approvals) is
                    open to every authenticated workspace member; only
                    /attendance/settings is role-gated, matching Leave's
                    own split (self-service is structural, not permission-
                    gated — see modules/attendance/attendanceEligibility.service.js). */}
                <Route path="/attendance" element={<WorkspaceModuleGate module="attendance"><AttendanceLayout /></WorkspaceModuleGate>}>
                  <Route index element={<Navigate to="my" replace />} />
                  <Route path="my" element={<MyAttendancePage />} />
                  <Route
                    path="team"
                    element={
                      <PrivateRoute requiredRole={["Manager", "HR", "Admin"]}>
                        <TeamAttendancePage />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="approvals"
                    element={
                      <PrivateRoute requiredRole={["Manager", "HR", "Admin"]}>
                        <AttendanceApprovalsPage />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <PrivateRoute requiredRole={["HR", "Admin"]}>
                        <AttendanceSettingsLayout />
                      </PrivateRoute>
                    }
                  >
                    <Route index element={<Navigate to="policy" replace />} />
                    <Route path=":section" element={<AttendanceSettingsPage />} />
                  </Route>
                </Route>

                <Route
                  path="/teams"
                  element={
                    <PrivateRoute requiredRole={["Manager", "Admin", "HR"]}>
                      <TeamManagement />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/team-management"
                  element={
                    <PrivateRoute requiredRole={["Manager", "Admin", "HR"]}>
                      <TeamManagement />
                    </PrivateRoute>
                  }
                />

                <Route path="/sales" element={<WorkspaceModuleGate module="sales"><SalesPage /></WorkspaceModuleGate>} />

                <Route
                  path="/admin/settings"
                  element={
                    <PrivateRoute requiredRole={["Admin"]}>
                      <AdminSettings />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/hr-panel"
                  element={
                    <PrivateRoute requiredRole={["Admin", "HR"]}>
                      <HRPanel />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/access-control"
                  element={
                    <AccessControlRouteGuard>
                      <AccessControlPage />
                    </AccessControlRouteGuard>
                  }
                />
                <Route
                  path="/join-requests"
                  element={
                    <JoinRequestsRouteGuard>
                      <JoinRequestsPage />
                    </JoinRequestsRouteGuard>
                  }
                />
                <Route path="/search" element={<Search />} />

                <Route path="/list-view" element={<ListViewLayout />}>
                  <Route index element={<ListViewTasks />} />
                  <Route path="teams" element={<ListViewTeams />} />
                </Route>

                <Route path="/calendar" element={<CalendarView />} />
                <Route path="/gantt" element={<GanttView />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/announcements" element={<Announcements />} />

                <Route
                  path="/reminders"
                  element={
                    <PrivateRoute requiredRole={["Manager", "Admin"]}>
                      <RemindersPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/reminder-calendar"
                  element={
                    <PrivateRoute requiredRole={["Manager", "Admin"]}>
                      <ClientReminderCalendarPage />
                    </PrivateRoute>
                  }
                />


                {/* Finance Module Routes - Admin and Manager only */}
                <Route
                  path="/finance"
                  element={
                    <FinanceRouteGuard>
                      <WorkspaceModuleGate module="finance"><FinanceLayout /></WorkspaceModuleGate>
                    </FinanceRouteGuard>
                  }
                >
                  <Route index element={<FinanceDashboard />} />
                  <Route path="users" element={<UsersTab />} />
                  <Route path="projects" element={<ProjectsTab />} />
                  <Route path="weekly" element={<WeeklyTab />} />
                  <Route path="pages" element={<FinancePagesManager />} />
                  <Route path="pages/new" element={<CreateFinancePage />} />
                  <Route path="pages/:id" element={<ViewFinancePage />} />
                  <Route path="pages/:id/edit" element={<CreateFinancePage />} />
                </Route>
              </Route>

              {/* Super Admin Dashboard — platform-level, sibling to the
                  workspace-scoped tree above (not nested in MainLayout), so
                  it never inherits or touches the active workspace context. */}
              <Route
                path="/super-admin"
                element={
                  <SuperAdminRouteGuard>
                    <SuperAdminLayout />
                  </SuperAdminRouteGuard>
                }
              >
                <Route index element={<SuperAdminOverviewPage />} />
                <Route path="workspaces" element={<SuperAdminWorkspacesPage />} />
                <Route path="workspaces/:workspaceId" element={<SuperAdminWorkspaceDetailPage />} />
                <Route path="audit-log" element={<SuperAdminAuditLogPage />} />
              </Route>

              <Route path="*" element={<GlobalFallback type="404" />} />
              </Routes>
              </Suspense>
            </ClientInfoProvider>
            <ToastContainer
              position="top-right"
              autoClose={5000}
              hideProgressBar={false}
              newestOnTop={false}
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme={useThemeStore.getState().effectiveMode === 'dark' ? 'dark' : 'light'}
            />
            <NetworkStatusToast />
            <GlobalPushPrompt />
            {/* The one confirmation modal for every permission change in the
                app — see components/AccessControl/PermissionConfirmModal.jsx */}
            <PermissionConfirmModal />
          </NotificationProvider>
        </TeamProvider>
        </WorkspaceProvider>
      </MeProvider>
    </AuthProvider>
  );
}

export default App;
