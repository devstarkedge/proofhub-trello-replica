import React from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { TeamProvider } from "./context/TeamContext";
import { NotificationProvider } from "./context/NotificationContext";
import WorkFlow from "./pages/WorkFlow";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import TeamManagement from "./pages/TeamManagement";
import Dashboard from "./pages/Dashboard";
import Search from "./pages/Search";
import ListView from "./pages/ListView";
import CalendarView from "./pages/CalendarView";
import GanttView from "./pages/GanttView";
import PrivateRoute from "./components/PrivateRoute";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <TeamProvider>
        <NotificationProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Dashboard />
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
                <PrivateRoute requiredRole={["Manager", "Admin"]}>
                  <TeamManagement />
                </PrivateRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute requiredRole={["Manager", "Admin"]}>
                  <Dashboard />
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
