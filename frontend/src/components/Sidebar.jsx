import React, { useContext, useState } from 'react';
import { Home, Folder, Users, BarChart3, Settings, LayoutDashboard, UserCheck, Bell, CalendarClock, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

const Sidebar = ({ isMobile = false, onClose = () => {} }) => {
  const { user } = useContext(AuthContext);

  const getNavItems = () => {
    // Base navigation visible to all authenticated users
    const baseItems = [
      { path: '/', icon: Home, label: 'Home' },
      { path: '/announcements', icon: Bell, label: 'Announcements' },
    ];

    // If no user yet, return base
    if (!user) return baseItems;

    const userRole = (user.role || '').toLowerCase();

    // Roles that should see the Dashboard
    const dashboardRoles = ['admin', 'manager'];

    // Start with base and conditionally add dashboard and other items
    const items = [...baseItems];

    if (dashboardRoles.includes(userRole)) {
      items.splice(1, 0, { path: '/dashboard', icon: BarChart3, label: 'Dashboard' });
    }

    if (userRole === 'admin') {
      items.push({ path: '/reminders', icon: CalendarClock, label: 'Client Reminders' });
      items.push({ path: '/teams', icon: Users, label: 'Teams' });
      items.push({ path: '/hr-panel', icon: UserCheck, label: 'HR Panel' });
      items.push({ path: '/admin/settings', icon: Settings, label: 'Admin Settings' });
    } else if (userRole === 'hr') {
      items.push({ path: '/teams', icon: Users, label: 'Teams' });
      items.push({ path: '/hr-panel', icon: UserCheck, label: 'HR Panel' });
    } else if (userRole === 'manager') {
      items.push({ path: '/reminders', icon: CalendarClock, label: 'Client Reminders' });
      items.push({ path: '/teams', icon: Users, label: 'Teams' });
    }

    return items;
  };

  const navItems = getNavItems();
  const [logoHover, setLogoHover] = useState(false);

  const desktopClass = 'w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-0 overflow-y-auto flex flex-col justify-between';
  const mobileClass = 'fixed inset-y-0 left-0 w-64 bg-white z-50 overflow-y-auto flex flex-col justify-between shadow-2xl';

  return (
    <>
      {/* Desktop sidebar (hidden on small screens) */}
      {!isMobile && (
        <aside className={`hidden lg:flex ${desktopClass}`} aria-hidden={isMobile}>
          <div>
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-50">
                  <LayoutDashboard className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900 tracking-tight">FlowTask</h1>
                  <p className="text-xs text-gray-500 -mt-0.5">Team Productivity Suite</p>
                </div>
              </div>
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
          </div>

          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-gray-400">Powered by</span>
              <a href="https://www.starkedge.com/" target="_blank" rel="noopener noreferrer">
                <img
                  src="/starkedge.logo.webp"
                  alt="StarkEdge"
                  className="h-4 w-auto object-contain"
                  onMouseEnter={() => setLogoHover(true)}
                  onMouseLeave={() => setLogoHover(false)}
                  style={{
                    transition: 'transform 160ms ease, filter 160ms ease',
                    transform: logoHover ? 'scale(1.08)' : 'scale(1)',
                    filter: logoHover ? 'drop-shadow(0 0 10px rgba(59,130,246,0.85))' : 'none',
                    cursor: 'pointer'
                  }}
                />
              </a>
            </div>
          </div>
        </aside>
      )}

      {/* Mobile drawer sidebar (visible only when isMobile=true) */}
      {isMobile && (
        <div className="lg:hidden">
          <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden="true" />
          <aside className={mobileClass} role="dialog" aria-modal="true">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-50">
                  <LayoutDashboard className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900 tracking-tight">FlowTask</h1>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-md text-gray-600 hover:bg-gray-100">
                <X />
              </button>
            </div>

            <nav className="mt-6 px-3 space-y-1">
            {navItems.map(({ path, icon: Icon, label }) => (
              <NavLink
                key={path}
                to={path}
                onClick={onClose}
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

            <div className="p-4 border-t border-gray-100 mt-auto">
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-gray-400">Powered by</span>
                <a href="https://www.starkedge.com/" target="_blank" rel="noopener noreferrer">
                  <img
                    src="/starkedge.logo.webp"
                    alt="StarkEdge"
                    className="h-4 w-auto object-contain"
                  />
                </a>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
