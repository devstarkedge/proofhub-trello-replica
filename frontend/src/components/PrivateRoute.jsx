import React, { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import LandingPage from '../pages/LandingPage';
import logger from '../utils/logger';
import { getWorkspaceGateDecision } from '../utils/workspaceGate';

const PrivateRoute = ({ children, requiredRole }) => {
  const { user, isAuthenticated, loading } = useContext(AuthContext);
  const { workspaces, currentWorkspace, status: workspaceStatus, loadWorkspaces } = useContext(WorkspaceContext);
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 to-pink-400 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          <div className="text-white text-xl">Loading...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // "/" is the only route an unauthenticated visitor sees a public page
    // for — every other protected path still redirects to /login exactly
    // as before.
    if (location.pathname === '/') {
      return <LandingPage />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Force admin to change password if required
  if (user && user.role === 'admin' && user.forcePasswordChange && location.pathname !== '/admin/settings') {
    return <Navigate to="/admin/settings" replace />;
  }

  // Check verification status (admin is always verified)
  if (user && !user.isVerified && user.role !== 'admin') {
    return <Navigate to="/verify-pending" replace />;
  }

  // Single canonical decision for what a workspace-gated route should do —
  // see getWorkspaceGateDecision() in WorkspaceContext.jsx. Critically,
  // 'pending' covers BOTH "haven't started fetching yet" and "fetch in
  // flight" so this never mistakes a not-yet-resolved workspace list for a
  // confirmed-empty one, which is what a plain `loading` flag (false until
  // the first fetch actually starts) can't distinguish on the very first
  // render after auth resolves.
  const workspaceGate = getWorkspaceGateDecision({ status: workspaceStatus, workspaces, currentWorkspace });

  if (workspaceGate === 'pending') {
    logger.debug('WORKSPACE_GATE', { decision: 'pending', path: location.pathname });
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 to-pink-400 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          <div className="text-white text-xl">Loading your workspace...</div>
        </div>
      </div>
    );
  }

  if (workspaceGate === 'error') {
    logger.debug('WORKSPACE_GATE', { decision: 'error', path: location.pathname });
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-800 to-pink-400 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4 text-center px-4">
          <div className="text-white text-xl">Couldn't load your workspace</div>
          <p className="text-white/70 text-sm max-w-sm">Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => loadWorkspaces()}
            className="px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Only ever shown to a user with 2+ workspaces and none active yet —
  // single-workspace users (everyone today) are auto-selected in
  // WorkspaceContext and never see this gate.
  if (workspaceGate === 'select-required') {
    logger.debug('WORKSPACE_GATE', { decision: 'select-required', path: location.pathname });
    return <Navigate to="/select-workspace" replace />;
  }

  // Authenticated user with absolutely no workspace memberships — shown
  // the "create or join" landing screen instead of crashing the dashboard.
  // Reached only once resolution has genuinely completed with an empty
  // result, never as a stand-in for "still loading".
  if (workspaceGate === 'no-workspace') {
    logger.debug('WORKSPACE_GATE', { decision: 'no-workspace', path: location.pathname });
    return <Navigate to="/no-workspace" replace />;
  }

  // Role-based access control
  if (requiredRole && user) {
    const userRole = user.role.toLowerCase();
    const allowedRoles = Array.isArray(requiredRole)
      ? requiredRole.map(role => role.toLowerCase())
      : [requiredRole.toLowerCase()];

    if (!allowedRoles.includes(userRole)) {
      // Redirect based on user role
      if (userRole === 'admin') {
        return <Navigate to="/" replace />;
      } else if (userRole === 'manager' || userRole === 'hr') {
        return <Navigate to="/teams" replace />;
      } else {
        return <Navigate to="/" replace />;
      }
    }
  }

  return children;
};

export default PrivateRoute;
