import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  FolderKanban,
  Calendar,
  DollarSign,
  Plus,
  ChevronDown,
  Settings,
  FileText,
  Bell
} from 'lucide-react';
import Header from '../../components/Header';
import Sidebar from '../../components/Sidebar';
import AuthContext from '../../context/AuthContext';
import api from '../../services/api';
import socketService from '../../services/socket';
import { toast } from 'react-toastify';

/**
 * FinanceLayout - Main layout wrapper for the Finance module
 * Provides consistent navigation and structure across all Finance pages
 * Includes real-time socket updates for finance data
 */
const FinanceLayout = () => {
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [customPages, setCustomPages] = useState([]);
  const [pendingPagesCount, setPendingPagesCount] = useState(0);
  const [showPagesMenu, setShowPagesMenu] = useState(false);
  
  // Determine active tab from URL
  const getActiveTab = () => {
    if (location.pathname === '/finance' || location.pathname === '/finance/') {
      return 'dashboard';
    }
    if (location.pathname === '/finance/users') return 'users';
    if (location.pathname.includes('/projects')) return 'projects';
    if (location.pathname.includes('/weekly')) return 'weekly';
    if (location.pathname.includes('/pages')) return 'pages';
    return 'dashboard';
  };
  
  const activeTab = getActiveTab();
  const isAdmin = user?.role?.toLowerCase() === 'admin';

  // Fetch custom pages
  const fetchPages = useCallback(async () => {
    try {
      const response = await api.get('/api/finance/pages');
      if (response.data.success) {
        setCustomPages(response.data.data || []);
      }
      
      // Fetch pending count for Admin
      if (isAdmin) {
        const pendingRes = await api.get('/api/finance/pages/pending');
        if (pendingRes.data.success) {
          setPendingPagesCount(pendingRes.data.data?.length || 0);
        }
      }
    } catch (err) {
      console.error('Error fetching finance pages:', err);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  // Socket event handlers for real-time updates
  useEffect(() => {
    // Join finance room when component mounts
    socketService.joinFinance();

    // Handle page pending (new page created by manager)
    const handlePagePending = (e) => {
      const { page, message } = e.detail;
      if (isAdmin) {
        setPendingPagesCount(prev => prev + 1);
        toast.info(message || 'New finance page pending approval');
      }
    };

    // Handle page published (admin created or approved)
    const handlePagePublished = (e) => {
      const { page, message } = e.detail;
      setCustomPages(prev => [...prev, page]);
      toast.success(message || 'New finance page available');
    };

    // Handle page status change (approved/rejected)
    const handlePageStatus = (e) => {
      const { page, action, message } = e.detail;
      if (action === 'approve') {
        // Add to custom pages if not creator
        setCustomPages(prev => {
          const exists = prev.some(p => p._id === page._id);
          if (!exists) return [...prev, page];
          return prev.map(p => p._id === page._id ? page : p);
        });
        if (isAdmin) {
          setPendingPagesCount(prev => Math.max(0, prev - 1));
        }
      } else if (action === 'reject') {
        if (isAdmin) {
          setPendingPagesCount(prev => Math.max(0, prev - 1));
        }
      }
      toast.info(message);
    };

    // Handle page update
    const handlePageUpdated = (e) => {
      const { page } = e.detail;
      setCustomPages(prev => prev.map(p => p._id === page._id ? page : p));
    };

    // Handle page deletion
    const handlePageDeleted = (e) => {
      const { pageId, message } = e.detail;
      setCustomPages(prev => prev.filter(p => p._id !== pageId));
      toast.info(message || 'Finance page deleted');
    };

    // Register event listeners
    window.addEventListener('socket-finance-page-pending', handlePagePending);
    window.addEventListener('socket-finance-page-published', handlePagePublished);
    window.addEventListener('socket-finance-page-status', handlePageStatus);
    window.addEventListener('socket-finance-page-updated', handlePageUpdated);
    window.addEventListener('socket-finance-page-deleted', handlePageDeleted);

    // Cleanup on unmount
    return () => {
      socketService.leaveFinance();
      window.removeEventListener('socket-finance-page-pending', handlePagePending);
      window.removeEventListener('socket-finance-page-published', handlePagePublished);
      window.removeEventListener('socket-finance-page-status', handlePageStatus);
      window.removeEventListener('socket-finance-page-updated', handlePageUpdated);
      window.removeEventListener('socket-finance-page-deleted', handlePageDeleted);
    };
  }, [isAdmin]);

  // Tab configuration
  const tabs = [
    { 
      id: 'dashboard', 
      label: 'Dashboard', 
      path: '/finance',
      icon: LayoutDashboard,
      description: 'Overview & key metrics'
    },
    { 
      id: 'users', 
      label: 'Users', 
      path: '/finance/users',
      icon: Users,
      description: 'User-centric finance view'
    },
    { 
      id: 'projects', 
      label: 'Projects', 
      path: '/finance/projects',
      icon: FolderKanban,
      description: 'Project-centric finance view'
    },
    { 
      id: 'weekly', 
      label: 'Weekly', 
      path: '/finance/weekly',
      icon: Calendar,
      description: 'Week-wise reports'
    }
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <div className="lg:ml-64">
        {/* Header */}
        <Header />
        
        <main className="p-6">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div 
                className="p-2.5 rounded-xl"
                style={{ 
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                }}
              >
                <DollarSign 
                  className="w-6 h-6" 
                  style={{ color: '#10b981' }}
                />
              </div>
              <div>
                <h1 
                  className="text-2xl font-bold"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  Finance
                </h1>
                <p 
                  className="text-sm"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Track revenue, billing, and team performance
                </p>
              </div>
            </div>

            {/* Admin: Pending Pages Notification */}
            {isAdmin && pendingPagesCount > 0 && (
              <NavLink
                to="/finance/pages"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#f59e0b'
                }}
              >
                <Bell className="w-4 h-4" />
                {pendingPagesCount} pending approval{pendingPagesCount > 1 ? 's' : ''}
              </NavLink>
            )}
          </div>

          {/* Tab Navigation */}
          <div 
            className="flex items-center gap-1 p-1 rounded-xl mb-6"
            style={{ backgroundColor: 'var(--color-bg-secondary)' }}
          >
            {/* Main Tabs */}
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <NavLink
                  key={tab.id}
                  to={tab.path}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? 'var(--color-bg-primary)' : 'transparent',
                    color: isActive ? '#10b981' : 'var(--color-text-secondary)',
                    boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
                  }}
                >
                  <Icon 
                    className="w-4 h-4" 
                    style={{ 
                      color: isActive ? '#10b981' : 'var(--color-text-muted)' 
                    }}
                  />
                  <span>{tab.label}</span>
                </NavLink>
              );
            })}

            {/* Approved Custom Pages as Individual Tabs */}
            {customPages
              .filter(page => page.status === 'approved')
              .map(page => {
                const isPageActive = location.pathname.includes(`/pages/${page._id}`);
                return (
                  <NavLink
                    key={page._id}
                    to={`/finance/pages/${page._id}`}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                    style={{
                      backgroundColor: isPageActive ? 'var(--color-bg-primary)' : 'transparent',
                      color: isPageActive ? '#10b981' : 'var(--color-text-secondary)',
                      boxShadow: isPageActive ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
                    }}
                  >
                    <FileText 
                      className="w-4 h-4" 
                      style={{ 
                        color: isPageActive ? '#10b981' : 'var(--color-text-muted)' 
                      }}
                    />
                    <span>{page.name}</span>
                  </NavLink>
                );
              })}

            {/* Divider */}
            <div 
              className="w-px h-6 mx-2"
              style={{ backgroundColor: 'var(--color-border-subtle)' }}
            />

            {/* Custom Pages Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowPagesMenu(!showPagesMenu)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  backgroundColor: activeTab === 'pages' ? 'var(--color-bg-primary)' : 'transparent',
                  color: activeTab === 'pages' ? '#10b981' : 'var(--color-text-secondary)',
                  boxShadow: activeTab === 'pages' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
                  border: showPagesMenu ? '1px solid #10b981' : '1px solid transparent'
                }}
              >
                <FileText className="w-4 h-4" />
                <span>Pages</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showPagesMenu ? 'rotate-180' : ''}`} />
              </button>

              {showPagesMenu && (
                <div 
                  className="absolute top-full left-0 mt-2 py-2 rounded-xl border z-[100] min-w-52"
                  style={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e5e7eb',
                    boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)'
                  }}
                >
                  {/* Custom Pages List */}
                  {customPages.length > 0 ? (
                    <>
                      <div className="px-3 py-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          Custom Pages
                        </span>
                      </div>
                      {customPages.map(page => (
                        <NavLink
                          key={page._id}
                          to={`/finance/pages/${page._id}`}
                          onClick={() => setShowPagesMenu(false)}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 mx-1.5 rounded-lg text-sm transition-all duration-150"
                          style={{ color: 'var(--color-text-primary)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f3f4f6';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <span className="truncate">{page.name}</span>
                          {page.status === 'pending' && (
                            <span 
                              className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                              style={{ 
                                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                color: '#f59e0b'
                              }}
                            >
                              Pending
                            </span>
                          )}
                        </NavLink>
                      ))}
                      <div 
                        className="my-2 mx-3"
                        style={{ borderTop: '1px solid var(--color-border-subtle)' }}
                      />
                    </>
                  ) : (
                    <div 
                      className="px-3 py-3 text-sm text-center"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      No custom pages yet
                    </div>
                  )}

                  {/* Create New Page */}
                  <NavLink
                    to="/finance/pages/new"
                    onClick={() => setShowPagesMenu(false)}
                    className="flex items-center gap-2 px-3 py-2.5 mx-1.5 rounded-lg text-sm font-medium transition-all duration-150"
                    style={{ color: '#10b981' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create New Page</span>
                  </NavLink>

                  {/* Manage Pages (Admin) */}
                  {isAdmin && (
                    <NavLink
                      to="/finance/pages"
                      onClick={() => setShowPagesMenu(false)}
                      className="flex items-center gap-2 px-3 py-2.5 mx-1.5 rounded-lg text-sm transition-all duration-150"
                      style={{ color: 'var(--color-text-secondary)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <Settings className="w-4 h-4" />
                      <span>Manage Pages</span>
                    </NavLink>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Page Content - Rendered via Outlet */}
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default FinanceLayout;
