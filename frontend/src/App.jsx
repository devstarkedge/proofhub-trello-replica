import React from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { TeamProvider } from "./context/TeamContext";
import { NotificationProvider } from "./context/NotificationContext";
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
import PrivateRoute from "./components/PrivateRoute";
import HomePage from "./pages/HomePage";
import "./App.css";

function App() {
  return (
    <AuthProvider>
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
                  <HomePage />
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
          </Routes>
        </NotificationProvider>
      </TeamProvider>
    </AuthProvider>
  );
}

export default App;
