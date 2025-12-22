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

  // Theme-aware styles using CSS variables
  const sidebarStyles = {
    backgroundColor: 'var(--color-sidebar-bg)',
    borderColor: 'var(--color-sidebar-border)',
  };

  const logoContainerStyles = {
    backgroundColor: 'var(--color-primary-subtle)',
  };

  return (
    <>
      {/* Desktop sidebar (hidden on small screens) */}
      {!isMobile && (
        <aside 
          className="hidden lg:flex w-64 h-screen fixed left-0 top-0 overflow-y-auto flex-col justify-between border-r"
          style={sidebarStyles}
          aria-hidden={isMobile}
        >
          <div>
            <div 
              className="p-4 border-b"
              style={{ borderColor: 'var(--color-border-default)' }}
            >
              <div className="flex items-center gap-3">
                <div 
                  className="flex items-center justify-center h-10 w-10 rounded-lg"
                  style={logoContainerStyles}
                >
                  <LayoutDashboard 
                    className="h-5 w-5" 
                    style={{ color: 'var(--color-primary)' }}
                  />
                </div>
                <div>
                  <h1 
                    className="text-lg font-semibold tracking-tight"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    FlowTask
                  </h1>
                  <p 
                    className="text-xs -mt-0.5"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    Team Productivity Suite
                  </p>
                </div>
              </div>
            </div>

            <nav className="mt-6 px-3 space-y-1">
            {navItems.map(({ path, icon: Icon, label }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors`
                }
                style={({ isActive }) => ({
                  backgroundColor: isActive ? 'var(--color-sidebar-item-active)' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                })}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.classList.contains('active')) {
                    e.currentTarget.style.backgroundColor = 'var(--color-sidebar-item-hover)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  const isActive = e.currentTarget.getAttribute('aria-current') === 'page';
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }
                }}
              >
                <Icon className="mr-3 h-5 w-5" />
                {label}
              </NavLink>
            ))}
            </nav>
          </div>

          <div 
            className="p-4 border-t"
            style={{ borderColor: 'var(--color-border-subtle)' }}
          >
            <div className="flex items-center justify-end gap-2">
              <span 
                className="text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Powered by
              </span>
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
                    filter: logoHover ? 'drop-shadow(0 0 10px var(--color-primary))' : 'none',
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
          <div 
            className="fixed inset-0 z-40" 
            style={{ backgroundColor: 'var(--color-modal-overlay)' }}
            onClick={onClose} 
            aria-hidden="true" 
          />
          <aside 
            className="fixed inset-y-0 left-0 w-64 z-50 overflow-y-auto flex flex-col justify-between shadow-2xl"
            style={sidebarStyles}
            role="dialog" 
            aria-modal="true"
          >
            <div 
              className="p-4 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--color-border-default)' }}
            >
              <div className="flex items-center gap-3">
                <div 
                  className="flex items-center justify-center h-10 w-10 rounded-lg"
                  style={logoContainerStyles}
                >
                  <LayoutDashboard 
                    className="h-5 w-5" 
                    style={{ color: 'var(--color-primary)' }}
                  />
                </div>
                <div>
                  <h1 
                    className="text-lg font-semibold tracking-tight"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    FlowTask
                  </h1>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-2 rounded-md transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X />
              </button>
            </div>

            <nav className="mt-6 px-3 space-y-1 flex-1">
            {navItems.map(({ path, icon: Icon, label }) => (
              <NavLink
                key={path}
                to={path}
                onClick={onClose}
                className="flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
                style={({ isActive }) => ({
                  backgroundColor: isActive ? 'var(--color-sidebar-item-active)' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                })}
              >
                <Icon className="mr-3 h-5 w-5" />
                {label}
              </NavLink>
            ))}
            </nav>

            <div 
              className="p-4 border-t mt-auto"
              style={{ borderColor: 'var(--color-border-subtle)' }}
            >
              <div className="flex items-center justify-end gap-2">
                <span 
                  className="text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Powered by
                </span>
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
