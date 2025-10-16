import React, { useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

const PrivateRoute = ({ children, requiredRole }) => {
  const { user, isAuthenticated, loading } = useContext(AuthContext);
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
