import React, { useContext, useState, useEffect } from 'react';
import { Home, Folder, Users, Settings, UserCheck, Bell, CalendarClock, X, FileSpreadsheet, ChevronDown, ChevronRight, DollarSign, Zap } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import AuthContext from '../context/AuthContext';
import useThemeStore from '../store/themeStore';

// Icon color configuration for each nav item
const iconColors = {
  '/': { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }, // Blue - Home
  '/my-shortcuts': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' }, // Cyan - My Shortcuts
  '/announcements': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }, // Amber - Announcements
  '/reminders': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' }, // Emerald - Reminders
  '/teams': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' }, // Cyan - Teams
  '/hr-panel': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' }, // Pink - HR Panel
  '/admin/settings': { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)' }, // Indigo - Settings
  '/pm-sheet': { color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.12)' }, // Teal - PM Sheet
  '/finance': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' }, // Emerald - Finance
};

const Sidebar = ({ isMobile = false, onClose = () => {} }) => {
  const { user } = useContext(AuthContext);
  const effectiveMode = useThemeStore((state) => state.effectiveMode);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [pmSheetExpanded, setPmSheetExpanded] = useState(false);
  const location = useLocation();

  // Check if current path is under PM Sheet
  const isPMSheetActive = location.pathname.startsWith('/pm-sheet');

  // Auto-expand PM Sheet when on a PM Sheet page
  useEffect(() => {
    if (isPMSheetActive) {
      setPmSheetExpanded(true);
    }
  }, [isPMSheetActive]);

  // PM Sheet child pages
  const pmSheetChildren = [
    { path: '/pm-sheet', label: 'Dashboard' },
    { path: '/pm-sheet/month-wise', label: 'Month Wise Report' },
    { path: '/pm-sheet/coordinator', label: 'Coordinator Report' },
    { path: '/pm-sheet/approach', label: 'Approach Page' },
  ];

  const getNavItems = () => {
    // Base navigation visible to all authenticated users
    const baseItems = [
      { path: '/', icon: Home, label: 'Home' },
      { path: '/my-shortcuts', icon: Zap, label: 'My Shortcuts' },
      { path: '/announcements', icon: Bell, label: 'Announcements' },
    ];

    // If no user yet, return base
    if (!user) return baseItems;

    const userRole = (user.role || '').toLowerCase();

    // Start with base and conditionally add other items
    const items = [...baseItems];

    // PM Sheet - Admin and Manager only
    if (userRole === 'admin' || userRole === 'manager') {
      // items.push({ path: '/pm-sheet', icon: FileSpreadsheet, label: 'PM Sheet', hasChildren: true });
      items.push({ path: '/finance', icon: DollarSign, label: 'Finance' });
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



  // Get icon color configuration
  const getIconConfig = (path) => iconColors[path] || { color: 'var(--color-text-secondary)', bg: 'transparent' };

  // Render PM Sheet children
  const renderPMSheetChildren = (isDesktop = true) => {
    const iconConfig = getIconConfig('/pm-sheet');
    
    return (
      <div className="ml-6 mt-1 space-y-1 border-l-2 pl-3" style={{ borderColor: iconConfig.bg }}>
        {pmSheetChildren.map((child) => {
          const isChildActive = location.pathname === child.path;
          const isChildHovered = hoveredItem === child.path;
          
          return (
            <NavLink
              key={child.path}
              to={child.path}
              onClick={!isDesktop ? onClose : undefined}
              className="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200"
              onMouseEnter={() => setHoveredItem(child.path)}
              onMouseLeave={() => setHoveredItem(null)}
              style={{
                backgroundColor: isChildActive ? iconConfig.bg : isChildHovered ? 'var(--color-sidebar-item-hover)' : 'transparent',
                color: isChildActive ? iconConfig.color : isChildHovered ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}
            >
              <span style={{ fontWeight: isChildActive ? 600 : 500 }}>{child.label}</span>
            </NavLink>
          );
        })}
      </div>
    );
  };

  // Render PM Sheet parent with expandable children
  const renderPMSheetItem = (item, isDesktop = true) => {
    const { icon: Icon, label } = item;
    const iconConfig = getIconConfig('/pm-sheet');
    const isHovered = hoveredItem === '/pm-sheet-parent';
    const isActive = isPMSheetActive;

    return (
      <div key="/pm-sheet">
        <button
          onClick={() => setPmSheetExpanded(!pmSheetExpanded)}
          className="w-full sidebar-nav-item flex items-center px-3 py-2.5 text-sm font-medium rounded-lg group relative overflow-hidden"
          onMouseEnter={() => setHoveredItem('/pm-sheet-parent')}
          onMouseLeave={() => setHoveredItem(null)}
          style={{
            backgroundColor: isActive ? iconConfig.bg : isHovered ? 'var(--color-sidebar-item-hover)' : 'transparent',
            color: isActive ? iconConfig.color : isHovered ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            borderLeft: isActive ? `3px solid ${iconConfig.color}` : '3px solid transparent',
            marginLeft: '-3px',
            paddingLeft: 'calc(0.75rem + 3px)',
            transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Icon container with colored background */}
          <div 
            className="flex items-center justify-center w-8 h-8 rounded-lg mr-3 transition-all duration-200"
            style={{
              backgroundColor: isActive || isHovered ? iconConfig.bg : 'transparent',
              transform: isHovered ? 'scale(1.1)' : 'scale(1)',
            }}
          >
            <Icon 
              className="h-[18px] w-[18px] transition-all duration-200" 
              style={{ 
                color: isActive || isHovered ? iconConfig.color : 'var(--color-text-muted)',
                strokeWidth: isActive ? 2.5 : 2,
              }}
            />
          </div>
          
          {/* Label */}
          <span className="transition-all duration-200 flex-1 text-left" style={{
            fontWeight: isActive ? 600 : 500,
          }}>
            {label}
          </span>

          {/* Expand/Collapse chevron */}
          {pmSheetExpanded ? (
            <ChevronDown className="h-4 w-4 transition-transform duration-200" style={{ color: isActive ? iconConfig.color : 'var(--color-text-muted)' }} />
          ) : (
            <ChevronRight className="h-4 w-4 transition-transform duration-200" style={{ color: isActive ? iconConfig.color : 'var(--color-text-muted)' }} />
          )}
        </button>

        {/* Children */}
        {pmSheetExpanded && renderPMSheetChildren(isDesktop)}
      </div>
    );
  };

  // Render nav item with colored icon
  const renderNavItem = (item, isDesktop = true) => {
    // Handle PM Sheet with children separately
    if (item.hasChildren) {
      return renderPMSheetItem(item, isDesktop);
    }

    const { path, icon: Icon, label } = item;
    const iconConfig = getIconConfig(path);
    const isHovered = hoveredItem === path;

    return (
      <NavLink
        key={path}
        to={path}
        onClick={!isDesktop ? onClose : undefined}
        className="sidebar-nav-item flex items-center px-3 py-2.5 text-sm font-medium rounded-lg group relative overflow-hidden"
        onMouseEnter={() => setHoveredItem(path)}
        onMouseLeave={() => setHoveredItem(null)}
        style={({ isActive }) => ({
          backgroundColor: isActive ? iconConfig.bg : isHovered ? 'var(--color-sidebar-item-hover)' : 'transparent',
          color: isActive ? iconConfig.color : isHovered ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          borderLeft: isActive ? `3px solid ${iconConfig.color}` : '3px solid transparent',
          marginLeft: '-3px',
          paddingLeft: 'calc(0.75rem + 3px)',
          transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isHovered && !isActive ? 'translateX(4px)' : 'translateX(0)',
        })}
      >
        {({ isActive }) => (
          <>
            {/* Icon container with colored background */}
            <div 
              className="flex items-center justify-center w-8 h-8 rounded-lg mr-3 transition-all duration-200"
              style={{
                backgroundColor: isActive || isHovered ? iconConfig.bg : 'transparent',
                transform: isHovered ? 'scale(1.1)' : 'scale(1)',
              }}
            >
              <Icon 
                className="h-[18px] w-[18px] transition-all duration-200" 
                style={{ 
                  color: isActive || isHovered ? iconConfig.color : 'var(--color-text-muted)',
                  strokeWidth: isActive ? 2.5 : 2,
                }}
              />
            </div>
            
            {/* Label */}
            <span className="transition-all duration-200" style={{
              fontWeight: isActive ? 600 : 500,
            }}>
              {label}
            </span>

            {/* Hover glow effect */}
            {isHovered && !isActive && (
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{
                  background: `linear-gradient(90deg, ${iconConfig.bg} 0%, transparent 100%)`,
                  opacity: 0.5,
                }}
              />
            )}
          </>
        )}
      </NavLink>
    );
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
              className="px-4 py-2 border-b"
              style={{ borderColor: 'var(--color-border-default)' }}
            >
              <div className="flex items-center">
                <img 
                  src={effectiveMode === 'dark' ? '/LogoDark.svg' : '/Logo.svg'}
                  alt="FlowTask" 
                  className="h-15 w-auto object-contain"
                  style={{
                    filter: effectiveMode === 'dark' ? 'brightness(1.1)' : 'none',
                  }}
                />
              </div>
            </div>

            <nav className="mt-5 px-3 space-y-1">
              {navItems.map((item) => renderNavItem(item, true))}
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
                    transition: 'transform 200ms ease, filter 200ms ease',
                    transform: logoHover ? 'scale(1.1)' : 'scale(1)',
                    filter: logoHover ? 'drop-shadow(0 0 12px var(--color-primary))' : 'none',
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
            className="fixed inset-0 z-40 backdrop-blur-sm" 
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
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
              className="px-4 py-2 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--color-border-default)' }}
            >
              <div className="flex items-center">
                <img 
                  src={effectiveMode === 'dark' ? '/LogoDark.svg' : '/Logo.svg'}
                  alt="FlowTask" 
                  className="h-25 w-auto object-contain"
                  style={{
                    filter: effectiveMode === 'dark' ? 'brightness(1.1)' : 'none',
                  }}
                />
              </div>
              <button 
                onClick={onClose} 
                className="p-2 rounded-lg transition-all duration-200 hover:scale-105"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-muted)';
                  e.currentTarget.style.color = 'var(--color-error)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="mt-5 px-3 space-y-1 flex-1">
              {navItems.map((item) => renderNavItem(item, false))}
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
                    className="h-4 w-auto object-contain hover:scale-110 transition-transform duration-200"
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
