import React, { useContext } from 'react';
import { Home, Folder, Users, BarChart3, Settings, LayoutDashboard, UserCheck } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

const Sidebar = () => {
  const { user } = useContext(AuthContext);

  const getNavItems = () => {
    const baseItems = [
      { path: '/', icon: Home, label: 'Home' },
      { path: '/dashboard', icon: BarChart3, label: 'Dashboard' },
    ];

    // Role-based navigation items
    if (user) {
      const userRole = user.role.toLowerCase();

      if (userRole === 'admin') {
        return [
          ...baseItems,
          { path: '/teams', icon: Users, label: 'Teams' },
          { path: '/hr-panel', icon: UserCheck, label: 'HR Panel' },
          { path: '/admin/settings', icon: Settings, label: 'Admin Settings' },
        ];
      } else if (userRole === 'hr') {
        return [
          ...baseItems,
          { path: '/teams', icon: Users, label: 'Teams' },
          { path: '/hr-panel', icon: UserCheck, label: 'HR Panel' },
        ];
      } else if (userRole === 'manager') {
        return [
          ...baseItems,
          { path: '/teams', icon: Users, label: 'Teams' },
        ];
      } else {
        // Employee
        return baseItems;
      }
    }

    return baseItems;
  };

  const navItems = getNavItems();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-0 overflow-y-auto">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">FlowTask</h1>
      </div>
      <nav className="mt-6 px-3 space-y-1">
        {navItems.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon className="mr-3 h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
