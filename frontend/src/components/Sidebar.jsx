import { useContext, useState, useEffect } from 'react';
import { Home, Users, Settings, UserCheck, Bell, CalendarClock, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, X, DollarSign, Zap, TrendingUp, ShieldCheck, CalendarDays, Fingerprint, Timer } from 'lucide-react';
import { NavLink, useLocation, matchPath } from 'react-router-dom';
import { Dialog } from 'radix-ui';
import SidebarTooltip from './SidebarTooltip';
import AuthContext from '../context/AuthContext';
import WorkspaceSwitcher from './Workspace/WorkspaceSwitcher';
import useAccessControl from '../hooks/useAccessControl';
import usePermissions from '../hooks/usePermissions';
import useJoinRequestsLive from '../hooks/useJoinRequestsLive';
import useRegularizationApprovalLive from '../hooks/useRegularizationApprovalLive';
import useLeavePendingLive from '../hooks/useLeavePendingLive';
import { getDefaultLeaveRouteForRole } from '../utils/leaveAccess';

// Icon color configuration for each nav item
const iconColors = {
  '/': { color: 'var(--color-primary)', bg: 'var(--color-primary-subtle)' }, // Theme Primary - Home
  '/my-shortcuts': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' }, // Cyan - My Shortcuts
  '/announcements': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }, // Amber - Announcements
  '/reminders': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' }, // Emerald - Reminders
  '/teams': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' }, // Cyan - Teams
  '/hr-panel': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' }, // Pink - HR Panel
  '/admin/settings': { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)' }, // Indigo - Settings
  '/pm-sheet': { color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.12)' }, // Teal - PM Sheet
  '/finance': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' }, // Emerald - Finance
  '/sales': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' }, // Purple - Sales
  '/access-control': { color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)' }, // Violet - Access & Permissions
  '/join-requests': { color: '#0891b2', bg: 'rgba(8, 145, 178, 0.12)' }, // Cyan - Join Requests
  '/leave': { color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' }, // Orange - Leave
  '/leave/my': { color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' }, // Orange - Leave (Employee default)
  '/attendance': { color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.12)' }, // Sky - Attendance
  '/time-tracking': { color: 'var(--color-primary)', bg: 'var(--color-primary-subtle)' }, // Theme Primary - Time Tracking
};

const Sidebar = ({ isMobile = false, collapsed = false, onToggleCollapse, onClose }) => {
  const leavePendingCount = useLeavePendingLive();
  const { user } = useContext(AuthContext);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [pmSheetExpanded, setPmSheetExpanded] = useState(false);
  const location = useLocation();

  // Single source of truth for "can this user see module X" — replaces two
  // separate ad hoc fetches (Sales, Finance) that each called their own
  // permission endpoint directly.
  const { can, isAdmin: isAccessControlAdmin, canManageAccessControl } = useAccessControl();
  const salesVisible = can('sales', 'view');
  const financeVisible = can('finance', 'view');
  const accessControlVisible = isAccessControlAdmin || canManageAccessControl;
  // Centralized Invite Member system's Approval Dashboard — permission
  // check, not a role check, so a custom role granted canApproveJoinRequests
  // sees this regardless of which role branch below applies to them.
  const { can: canWorkspace } = usePermissions();
  const joinRequestsVisible = canWorkspace('canApproveJoinRequests');
  // Live pending count for the currently active workspace — the hook itself
  // re-gates on canApproveJoinRequests and re-fetches on workspace switch,
  // so this always matches exactly what joinRequestsVisible above governs.
  const { pendingCount: joinRequestsPendingCount } = useJoinRequestsLive();
  const { pendingCount: regularizationPendingCount } = useRegularizationApprovalLive();

  // Check if current path is under PM Sheet
  const isPMSheetActive = location.pathname.startsWith('/pm-sheet');

  // Auto-expand PM Sheet when on a PM Sheet page
  useEffect(() => {
    if (isPMSheetActive) {
      setPmSheetExpanded(true);
    }
  }, [isPMSheetActive]);

  // Sales/Finance visibility now comes from useAccessControl() above, which
  // already stays live via the shared socket-driven refresh — no per-module
  // fetch/listener pair needed here anymore.

  // PM Sheet child pages
  const pmSheetChildren = [
    { path: '/pm-sheet', label: 'Dashboard' },
    { path: '/pm-sheet/month-wise', label: 'Month Wise Report' },
    { path: '/pm-sheet/coordinator', label: 'Coordinator Report' },
    { path: '/pm-sheet/approach', label: 'Approach Page' },
  ];

  const getNavItems = () => {
    const userRole = (user?.role || '').toLowerCase();
    const leavePath = getDefaultLeaveRouteForRole(userRole);

    // Base navigation visible to all authenticated users
    const baseItems = [
      { path: '/', icon: Home, label: 'Home' },
      { path: '/my-shortcuts', icon: Zap, label: 'My Shortcuts' },
      { path: '/announcements', icon: Bell, label: 'Announcements' },
      { path: leavePath, icon: CalendarDays, label: 'Leave', matchPrefix: '/leave', iconKey: '/leave', badge: leavePendingCount || null },
      {
        path: '/attendance',
        icon: Fingerprint,
        label: 'Attendance',
        badge: (['admin', 'manager', 'hr'].includes(userRole) && regularizationPendingCount > 0)
          ? regularizationPendingCount
          : null,
      },
      { path: '/time-tracking', icon: Timer, label: 'Time Tracking' },
    ];

    // If no user yet, return base
    if (!user) return baseItems;

    // Start with base and conditionally add other items
    const items = [...baseItems];

    // Finance - Admin always, other users only when explicitly granted
    if (userRole === 'admin' || financeVisible) {
      // items.push({ path: '/pm-sheet', icon: FileSpreadsheet, label: 'PM Sheet', hasChildren: true });
      items.push({ path: '/finance', icon: DollarSign, label: 'Finance' });
    }
    
    // Sales visible only for admin or explicitly granted users
    if (userRole === 'admin') {
      items.push({ path: '/sales', icon: TrendingUp, label: 'Sales' });
      items.push({ path: '/reminders', icon: CalendarClock, label: 'Client Reminders' });
      items.push({ path: '/teams', icon: Users, label: 'Teams' });
      items.push({
        path: '/hr-panel',
        icon: UserCheck,
        label: 'HR Panel',
        badge: (joinRequestsVisible && joinRequestsPendingCount > 0) ? joinRequestsPendingCount : null,
      });
      items.push({ path: '/admin/settings', icon: Settings, label: 'Admin Settings' });
    } else if (userRole === 'hr') {
      if (salesVisible) {
        items.push({ path: '/sales', icon: TrendingUp, label: 'Sales' });
      }
      items.push({ path: '/teams', icon: Users, label: 'Teams' });
      items.push({
        path: '/hr-panel',
        icon: UserCheck,
        label: 'HR Panel',
        badge: (joinRequestsVisible && joinRequestsPendingCount > 0) ? joinRequestsPendingCount : null,
      });
    } else if (userRole === 'manager') {
      if (salesVisible) {
        items.push({ path: '/sales', icon: TrendingUp, label: 'Sales' });
      }
      items.push({ path: '/reminders', icon: CalendarClock, label: 'Client Reminders' });
      items.push({ path: '/teams', icon: Users, label: 'Teams' });
    } else if (salesVisible) {
      // Non-admin user explicitly granted sales access — only show Sales link
      items.push({ path: '/sales', icon: TrendingUp, label: 'Sales' });
    }

    // Admin, or anyone delegated access_control.manage — one nav item,
    // regardless of role branch above, since this is a permission check,
    // not a role check. (Admin already gets it via /admin/settings' sibling
    // block above too, but this covers delegated non-admins.)
    if (accessControlVisible && !items.some((item) => item.path === '/access-control')) {
      items.push({ path: '/access-control', icon: ShieldCheck, label: 'Access & Permissions' });
    }

    return items;
  };

  const navItems = getNavItems();

  // Theme-aware styles using CSS variables
  const sidebarStyles = {
    backgroundColor: 'var(--color-sidebar-bg)',
    borderColor: 'var(--color-sidebar-border)',
  };


  // Get icon color configuration
  const getIconConfig = (path) => {
    if (path && path.startsWith('/leave')) return iconColors['/leave'];
    return iconColors[path] || { color: 'var(--color-text-secondary)', bg: 'transparent' };
  };

  const renderPMSheetChildren = () => (
    <div id="sidebar-pm-sheet-pages" className="ml-6 mt-1 space-y-1 border-l-2 pl-3" style={{ borderColor: getIconConfig('/pm-sheet').bg }}>
      {pmSheetChildren.map((child) => (
        <NavLink key={child.path} to={child.path} end onClick={isMobile ? onClose : undefined}
          className="sidebar-child-link block truncate rounded-lg px-3 py-2 text-sm"
          style={({ isActive }) => ({
            color: isActive ? getIconConfig('/pm-sheet').color : 'var(--color-text-secondary)',
            backgroundColor: isActive ? getIconConfig('/pm-sheet').bg : 'transparent',
            fontWeight: isActive ? 600 : 500,
          })}>
          {child.label}
        </NavLink>
      ))}
    </div>
  );

  const renderNavItem = (item) => {
    const { path, icon: Icon, label, badge, matchPrefix, iconKey, hasChildren } = item;
    const iconConfig = getIconConfig(iconKey || path);
    const isHovered = hoveredItem === path;
    const isItemActive = (routerActive) => hasChildren ? isPMSheetActive
      : matchPrefix ? location.pathname.startsWith(matchPrefix) : routerActive;
    // Tooltip's slot merges style objects, so resolve route styling before
    // passing the link through it (a NavLink style callback would be lost).
    const active = isItemActive(Boolean(matchPath({ path, end: path === '/' }, location.pathname)));
    const itemStyle = (isActive) => ({
      backgroundColor: isActive ? iconConfig.bg : isHovered ? 'var(--color-sidebar-item-hover)' : 'transparent',
      color: isActive ? iconConfig.color : isHovered ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
      borderLeftColor: isActive ? iconConfig.color : 'transparent',
    });
    const contents = (isActive) => (
      <>
        <span className="sidebar-item-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: isActive || isHovered ? iconConfig.bg : 'transparent' }}>
          <Icon aria-hidden="true" className="h-[18px] w-[18px]"
            style={{ color: isActive || isHovered ? iconConfig.color : 'var(--color-text-muted)', strokeWidth: isActive ? 2.5 : 2 }} />
        </span>
        <span className="sidebar-item-label flex-1 truncate text-left" style={{ fontWeight: isActive ? 600 : 500 }}>{label}</span>
        {!!badge && (
          <span aria-hidden="true" className="sidebar-item-badge flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #ef4444, #ec4899)' }}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
        {hasChildren && <span className="sidebar-item-label" aria-hidden="true">
          {pmSheetExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>}
      </>
    );
    const shared = {
      className: 'sidebar-nav-item relative flex min-h-[44px] w-full items-center gap-3 rounded-lg border-l-[3px] px-3 py-3 text-sm font-medium',
      onMouseEnter: () => setHoveredItem(path),
      onMouseLeave: () => setHoveredItem(null),
      'aria-label': badge ? label + ', ' + badge + ' pending requests' : label,
    };
    return (
      <div key={path}>
        <SidebarTooltip enabled={collapsed} label={badge ? label + ' (' + badge + ')' : label}>
          {hasChildren ? (
            <button {...shared} type="button" aria-expanded={!collapsed && pmSheetExpanded} aria-controls="sidebar-pm-sheet-pages"
              onClick={() => {
                if (collapsed) { onToggleCollapse(); setPmSheetExpanded(true); }
                else setPmSheetExpanded((value) => !value);
              }} style={itemStyle(isPMSheetActive)}>
              {contents(isPMSheetActive)}
            </button>
          ) : (
            <NavLink {...shared} to={path} end={path === '/'} onClick={isMobile ? onClose : undefined}
              style={itemStyle(active)}>
              {contents(active)}
            </NavLink>
          )}
        </SidebarTooltip>
        {hasChildren && pmSheetExpanded && !collapsed && renderPMSheetChildren()}
      </div>
    );
  };

  const sidebarContent = (
    <>
      <div className={'sidebar-workspace-header relative flex h-[var(--header-height)] shrink-0 items-center gap-1 border-b ' + (collapsed ? 'px-4' : 'px-3')}
        style={{ borderColor: 'var(--color-border-default)' }}>
        <WorkspaceSwitcher collapsed={collapsed} compact={isMobile} onNavigate={isMobile ? onClose : undefined} containModals={isMobile} />
        {isMobile ? (
          <Dialog.Close asChild>
            <button type="button" aria-label="Close menu" className="sidebar-control h-11 w-11 shrink-0"><X size={20} /></button>
          </Dialog.Close>
        ) : (
          <SidebarTooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <button type="button" className={'sidebar-control shrink-0 ' + (collapsed ? 'sidebar-rail-toggle' : 'h-8 w-8')}
              onClick={onToggleCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed} aria-controls="sidebar-navigation">
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </SidebarTooltip>
        )}
      </div>
      <nav id="sidebar-navigation" aria-label="Main navigation" className={'min-h-0 flex-1 overflow-y-auto overflow-x-hidden space-y-1 ' + (collapsed ? 'px-2 pb-4 pt-6' : 'px-3 py-5')}>
        {navItems.map(renderNavItem)}
      </nav>
      <div className={'sidebar-footer shrink-0 border-t ' + (collapsed ? 'p-3' : 'p-4')} style={{ borderColor: 'var(--color-border-subtle)' }}>
        <div className={'flex items-center gap-2 ' + (collapsed ? 'justify-center' : 'justify-end')}>
          {!collapsed && <span className="whitespace-nowrap text-xs" style={{ color: 'var(--color-text-muted)' }}>Powered by</span>}
          <SidebarTooltip enabled={collapsed} label="Powered by StarkEdge">
            <a href="https://www.starkedge.com/" target="_blank" rel="noopener noreferrer" aria-label="Powered by StarkEdge" className="rounded-md">
              <img src={collapsed ? '/footer-logo-new.webp' : '/starkedge.logo.webp'} alt="StarkEdge" className={collapsed ? 'h-8 w-8 object-contain' : 'h-4 w-auto object-contain'} />
            </a>
          </SidebarTooltip>
        </div>
      </div>
    </>
  );

  if (isMobile) return (
    <Dialog.Portal>
      <Dialog.Overlay className="sidebar-drawer-backdrop fixed inset-0 z-50 bg-black/45 backdrop-blur-sm" />
      <Dialog.Content aria-modal="true" aria-describedby={undefined} className="flowtask-sidebar sidebar-drawer fixed inset-y-0 left-0 z-[60] flex h-dvh w-[min(300px,calc(100vw-2rem))] flex-col border-r shadow-2xl" style={sidebarStyles}
        onEscapeKeyDown={(event) => {
          // Workspace dialogs share this focus scope; let their own close controls act first.
          if (event.target.closest('[data-workspace-modal]')) event.preventDefault();
        }}>
        <Dialog.Title className="sr-only">Main navigation</Dialog.Title>
        {sidebarContent}
      </Dialog.Content>
    </Dialog.Portal>
  );

  return (
    <aside aria-label="Sidebar" data-collapsed={collapsed} className="flowtask-sidebar hidden md:flex fixed inset-y-0 left-0 z-40 h-dvh w-[var(--sidebar-width)] flex-col border-r" style={sidebarStyles}>
      {sidebarContent}
    </aside>
  );
};

export default Sidebar;
