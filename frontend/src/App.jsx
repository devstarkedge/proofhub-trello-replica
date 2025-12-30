import React from "react";
import { Routes, Route } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from "./context/AuthContext";
import { MeProvider } from "./context/MeContext";
import { TeamProvider } from "./context/DepartmentContext";
import { NotificationProvider } from "./context/NotificationContext";
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
import Dashboard from "./pages/Dashboard";
import Search from "./pages/Search";
import ListView from "./pages/ListView";
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

function App() {
  return (
    <AuthProvider>
      <MeProvider>
        <TeamProvider>
          <NotificationProvider>
              <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-pending" element={<VerifyPending />} />
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <ErrorBoundary>
                      <HomePage />
                  </ErrorBoundary>
                </PrivateRoute>
              }
            />
            <Route
              path="/workflow/:deptId/:projectId"
              element={
                <PrivateRoute>
                  <WorkFlow />
                </PrivateRoute>
              }
            />
            <Route
              path="/workflow/:deptId/:projectId/trash"
              element={
                <PrivateRoute>
                  <ProjectTrash />
                </PrivateRoute>
              }
            />
            <Route
              path="/project/:projectId/task/:taskId"
              element={
                <PrivateRoute>
                  <WorkFlow />
                </PrivateRoute>
              }
            />
            <Route
              path="/project/:projectId/task/:taskId/subtask/:subtaskId"
              element={
                <PrivateRoute>
                  <WorkFlow />
                </PrivateRoute>
              }
            />
            <Route
              path="/project/:projectId/task/:taskId/subtask/:subtaskId/neno/:nenoId"
              element={
                <PrivateRoute>
                  <WorkFlow />
                </PrivateRoute>
              }
            />
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
            <Route
              path="/dashboard"
              element={
                <PrivateRoute requiredRole={["Manager", "Admin", "HR"]}>
                  <Dashboard />
                </PrivateRoute>
              }
            />
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
              path="/search"
              element={
                <PrivateRoute>
                  <Search />
                </PrivateRoute>
              }
            />
            <Route
              path="/list-view"
              element={
                <PrivateRoute>
                  <ListView />
                </PrivateRoute>
              }
            />
            <Route
              path="/calendar"
              element={
                <PrivateRoute>
                  <CalendarView />
                </PrivateRoute>
              }
            />
            <Route
              path="/gantt"
              element={
                <PrivateRoute>
                  <GanttView />
                </PrivateRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <PrivateRoute>
                  <Analytics />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <PrivateRoute>
                  <Settings />
                </PrivateRoute>
              }
            />
            <Route
              path="/announcements"
              element={
                <PrivateRoute>
                  <Announcements />
                </PrivateRoute>
              }
            />
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
            <Route path="*" element={<GlobalFallback type="404" />} />
              </Routes>
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
