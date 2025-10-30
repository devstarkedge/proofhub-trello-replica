import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from "./context/AuthContext";
import { TeamProvider } from "./context/TeamContext";
import { NotificationProvider } from "./context/NotificationContext";
import Loading from "./components/Loading";
import "./App.css";

// Lazy load components for code splitting
const WorkFlow = lazy(() => import("./pages/WorkFlow"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const VerifyPending = lazy(() => import("./pages/VerifyPending"));
const TeamManagement = lazy(() => import("./pages/TeamManagement"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Search = lazy(() => import("./pages/Search"));
const ListView = lazy(() => import("./pages/ListView"));
const CalendarView = lazy(() => import("./pages/CalendarView"));
const GanttView = lazy(() => import("./pages/GanttView"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const HRPanel = lazy(() => import("./pages/HRPanel"));
const Analytics = lazy(() => import("./pages/Analytics"));
const HomePage = lazy(() => import("./pages/HomePage"));
const PrivateRoute = lazy(() => import("./components/PrivateRoute"));

function App() {
  return (
    <AuthProvider>
      <TeamProvider>
        <NotificationProvider>
          <Suspense fallback={<Loading size="lg" text="Loading application..." />}>
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
            <Route
              path="/analytics"
              element={
                <PrivateRoute>
                  <Analytics />
                </PrivateRoute>
              }
            />
            </Routes>
          </Suspense>
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
            theme="light"
          />
        </NotificationProvider>
      </TeamProvider>
    </AuthProvider>
  );
}

export default App;
