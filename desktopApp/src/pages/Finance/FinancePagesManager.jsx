import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus,
  FileText,
  Settings,
  Trash2,
  Edit3,
  Check,
  X,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  FolderKanban,
  Eye,
  ChevronRight
} from 'lucide-react';
import api from '../../services/api';
import AuthContext from '../../context/AuthContext';
import { toast } from 'react-toastify';

/**
 * FinancePagesManager - Admin view to manage custom finance pages
 * Shows all pages, pending approvals, and allows CRUD operations
 */
const FinancePagesManager = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [pages, setPages] = useState([]);
  const [pendingPages, setPendingPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const isAdmin = user?.role?.toLowerCase() === 'admin';

  // Fetch pages
  const fetchPages = async () => {
    try {
      setLoading(true);
      const [allPagesRes, pendingRes] = await Promise.all([
        api.get('/api/finance/pages'),
        isAdmin ? api.get('/api/finance/pages/pending') : Promise.resolve({ data: { data: [] } })
      ]);
      
      if (allPagesRes.data.success) {
        setPages(allPagesRes.data.data || []);
      }
      if (pendingRes.data.success) {
        setPendingPages(pendingRes.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching pages:', err);
      toast.error('Failed to load pages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
  }, [isAdmin]);

  // Handle page approval
  const handleApproval = async (pageId, action) => {
    try {
      const response = await api.put(`/api/finance/pages/${pageId}/approve`, { action });
      if (response.data.success) {
        toast.success(action === 'approve' ? 'Page approved successfully' : 'Page rejected');
        fetchPages();
      }
    } catch (err) {
      console.error('Approval error:', err);
      toast.error('Failed to process approval');
    }
  };

  // Handle page deletion
  const handleDelete = async (pageId) => {
    if (!confirm('Are you sure you want to delete this page?')) return;
    
    try {
      const response = await api.delete(`/api/finance/pages/${pageId}`);
      if (response.data.success) {
        toast.success('Page deleted successfully');
        fetchPages();
      }
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete page');
    }
  };

  // Get status badge
  const getStatusBadge = (status) => {
    const configs = {
      pending: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', icon: Clock, text: 'Pending' },
      approved: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', icon: CheckCircle, text: 'Approved' },
      rejected: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', icon: XCircle, text: 'Rejected' }
    };
    const config = configs[status] || configs.pending;
    const Icon = config.icon;
    
    return (
      <span 
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
        style={{ backgroundColor: config.bg, color: config.color }}
      >
        <Icon className="w-3 h-3" />
        {config.text}
      </span>
    );
  };

  // Page card component
  const PageCard = ({ page, showActions = true }) => (
    <div 
      className="p-4 rounded-xl border transition-all duration-200 hover:shadow-md"
      style={{ 
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-subtle)'
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div 
            className="p-2 rounded-lg"
            style={{ 
              backgroundColor: page.pageType === 'users' 
                ? 'rgba(59, 130, 246, 0.12)' 
                : 'rgba(139, 92, 246, 0.12)'
            }}
          >
            {page.pageType === 'users' ? (
              <Users className="w-5 h-5" style={{ color: '#3b82f6' }} />
            ) : (
              <FolderKanban className="w-5 h-5" style={{ color: '#8b5cf6' }} />
            )}
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {page.name}
            </h3>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Added by {page.createdBy?.name || 'Unknown'}
            </p>
          </div>
        </div>
        {getStatusBadge(page.status)}
      </div>
      
      {page.description && (
        <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          {page.description}
        </p>
      )}
      
      <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span>{page.pageType === 'users' ? 'Users View' : 'Projects View'}</span>
          <span>•</span>
          <span>{page.columns?.length || 0} columns</span>
        </div>
        
        {showActions && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/finance/pages/${page._id}`)}
              className="p-1.5 rounded-lg transition-colors hover:bg-opacity-80"
              style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}
              title="View page"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigate(`/finance/pages/${page._id}/edit`)}
              className="p-1.5 rounded-lg transition-colors hover:bg-opacity-80"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}
              title="Edit page"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDelete(page._id)}
              className="p-1.5 rounded-lg transition-colors hover:bg-opacity-80"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}
              title="Delete page"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Pending approval card
  const PendingCard = ({ page }) => (
    <div 
      className="p-4 rounded-xl border"
      style={{ 
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'rgba(245, 158, 11, 0.3)'
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div 
            className="p-2 rounded-lg"
            style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)' }}
          >
            <FileText className="w-5 h-5" style={{ color: '#f59e0b' }} />
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {page.name}
            </h3>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Created by {page.createdBy?.name || 'Unknown'} • {new Date(page.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
      
      {page.description && (
        <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          {page.description}
        </p>
      )}
      
      <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
        <button
          onClick={() => navigate(`/finance/pages/${page._id}`)}
          className="flex items-center gap-1 text-xs font-medium hover:underline"
          style={{ color: '#10b981' }}
        >
          Preview <ChevronRight className="w-3 h-3" />
        </button>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleApproval(page._id, 'reject')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ 
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444'
            }}
          >
            <X className="w-4 h-4" />
            Reject
          </button>
          <button
            onClick={() => handleApproval(page._id, 'approve')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ 
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981'
            }}
          >
            <Check className="w-4 h-4" />
            Approve
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="p-2.5 rounded-xl"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)' }}
          >
            <FileText className="w-5 h-5" style={{ color: '#10b981' }} />
          </div>
          <div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Custom Pages
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {isAdmin ? 'Manage and approve custom finance pages' : 'Your custom finance pages'}
            </p>
          </div>
        </div>
        
        <button
          onClick={() => navigate('/finance/pages/new')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
          style={{ 
            backgroundColor: '#10b981',
            color: 'white'
          }}
        >
          <Plus className="w-4 h-4" />
          Create Page
        </button>
      </div>

      {/* Tabs (Admin only) */}
      {isAdmin && (
        <div 
          className="flex items-center gap-1 p-1 rounded-xl"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <button
            onClick={() => setActiveTab('all')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              backgroundColor: activeTab === 'all' ? 'var(--color-bg-primary)' : 'transparent',
              color: activeTab === 'all' ? '#10b981' : 'var(--color-text-secondary)',
              boxShadow: activeTab === 'all' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none'
            }}
          >
            All Pages ({pages.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2"
            style={{
              backgroundColor: activeTab === 'pending' ? 'var(--color-bg-primary)' : 'transparent',
              color: activeTab === 'pending' ? '#f59e0b' : 'var(--color-text-secondary)',
              boxShadow: activeTab === 'pending' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none'
            }}
          >
            Pending Approval
            {pendingPages.length > 0 && (
              <span 
                className="px-1.5 py-0.5 rounded-full text-xs"
                style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}
              >
                {pendingPages.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i}
              className="p-4 rounded-xl border animate-pulse"
              style={{ 
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border-subtle)'
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                <div className="flex-1">
                  <div className="h-5 w-32 rounded mb-1" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                  <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
                </div>
              </div>
              <div className="h-4 w-full rounded" style={{ backgroundColor: 'var(--color-bg-muted)' }} />
            </div>
          ))}
        </div>
      ) : activeTab === 'pending' && isAdmin ? (
        pendingPages.length > 0 ? (
          <div className="space-y-4">
            {pendingPages.map(page => (
              <PendingCard key={page._id} page={page} />
            ))}
          </div>
        ) : (
          <div 
            className="p-12 rounded-xl border text-center"
            style={{ 
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border-subtle)'
            }}
          >
            <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#10b981' }} />
            <h3 className="font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
              All caught up!
            </h3>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No pages pending approval
            </p>
          </div>
        )
      ) : pages.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map(page => (
            <PageCard key={page._id} page={page} />
          ))}
        </div>
      ) : (
        <div 
          className="p-12 rounded-xl border text-center"
          style={{ 
            backgroundColor: 'var(--color-bg-secondary)',
            borderColor: 'var(--color-border-subtle)'
          }}
        >
          <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
          <h3 className="font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
            No custom pages yet
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
            Create your first custom finance page to get started
          </p>
          <button
            onClick={() => navigate('/finance/pages/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: '#10b981', color: 'white' }}
          >
            <Plus className="w-4 h-4" />
            Create Page
          </button>
        </div>
      )}
    </div>
  );
};

export default FinancePagesManager;
