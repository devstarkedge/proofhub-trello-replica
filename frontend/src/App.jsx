import React from "react";
import { Routes, Route } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from "./context/AuthContext";
import { MeProvider } from "./context/MeContext";
import { TeamProvider } from "./context/DepartmentContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ClientInfoProvider } from "./context/ClientInfoContext";
import NetworkStatusToast from "./components/NetworkStatusToast";
import ErrorBoundary from "./components/ErrorBoundary";
import GlobalFallback from "./components/GlobalFallback";
import useThemeStore from "./store/themeStore";
import "./App.css";

// Direct imports for instant navigation (no lazy loading)
import WorkFlow from "./pages/WorkFlow";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import VerifyPending from "./pages/VerifyPending";
import TeamManagement from "./pages/TeamManagement";
import Search from "./pages/Search";
import ListViewLayout from "./layouts/ListViewLayout";
import MainLayout from "./layouts/MainLayout";
import ListViewTasks from "./pages/ListViewTasks";
import ListViewTeams from "./pages/ListViewTeams";
import CalendarView from "./pages/CalendarView";
import GanttView from "./pages/GanttView";
import AdminSettings from "./pages/AdminSettings";
import HRPanel from "./pages/HRPanel";
import Analytics from "./pages/Analytics";
import HomePage from "./pages/HomePage";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Announcements from "./pages/Announcements";
import RemindersPage from "./pages/RemindersPage";
import ClientReminderCalendarPage from "./pages/ClientReminderCalendarPage";
import PrivateRoute from "./components/PrivateRoute";
import ProjectTrash from "./pages/ProjectTrash";

// PM Sheet Pages
import PMSheetDashboard from "./pages/PMSheetDashboard";
import MonthWisePMReport from "./pages/MonthWisePMReport";
import ProjectCoordinatorReport from "./pages/ProjectCoordinatorReport";
import ApproachPage from "./pages/ApproachPage";
import PMSheetLayout from "./layouts/PMSheetLayout";

// Finance Module Pages
import FinanceLayout from "./pages/Finance/FinanceLayout";
import FinanceDashboard from "./pages/Finance/FinanceDashboard";
import UsersTab from "./pages/Finance/UsersTab";
import ProjectsTab from "./pages/Finance/ProjectsTab";
import WeeklyTab from "./pages/Finance/WeeklyTab";
import FinancePagesManager from "./pages/Finance/FinancePagesManager";
import CreateFinancePage from "./pages/Finance/CreateFinancePage";
import ViewFinancePage from "./pages/Finance/ViewFinancePage";
import MyShortcutsPage from "./pages/MyShortcutsPage";
import SalesPage from "./pages/SalesPage";

function App() {
  return (
    <AuthProvider>
      <MeProvider>
        <TeamProvider>
          <NotificationProvider>
            <ClientInfoProvider>
              <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-pending" element={<VerifyPending />} />
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
                <Route path="/workflow/:deptId/:projectId" element={<WorkFlow />} />
                <Route path="/workflow/:deptId/:projectId/:taskId" element={<WorkFlow />} />
                <Route path="/workflow/:deptId/:projectId/trash" element={<ProjectTrash />} />
                <Route path="/project/:projectId/task/:taskId" element={<WorkFlow />} />
                <Route path="/project/:projectId/task/:taskId/subtask/:subtaskId" element={<WorkFlow />} />
                <Route path="/project/:projectId/task/:taskId/subtask/:subtaskId/neno/:nenoId" element={<WorkFlow />} />

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

                <Route path="/sales" element={<SalesPage />} />

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

                {/* PM Sheet Routes - Admin and Manager only */}
                <Route
                  path="/pm-sheet"
                  element={
                    <PrivateRoute requiredRole={["Manager", "Admin"]}>
                      <PMSheetLayout />
                    </PrivateRoute>
                  }
                >
                  <Route index element={<PMSheetDashboard />} />
                  <Route path="month-wise" element={<MonthWisePMReport />} />
                  <Route path="coordinator" element={<ProjectCoordinatorReport />} />
                  <Route path="approach" element={<ApproachPage />} />
                </Route>

                {/* Finance Module Routes - Admin and Manager only */}
                <Route
                  path="/finance"
                  element={
                    <PrivateRoute requiredRole={["Manager", "Admin"]}>
                      <FinanceLayout />
                    </PrivateRoute>
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
              <Route path="*" element={<GlobalFallback type="404" />} />
              </Routes>
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
          </NotificationProvider>
        </TeamProvider>
      </MeProvider>
    </AuthProvider>
  );
}

export default App;
