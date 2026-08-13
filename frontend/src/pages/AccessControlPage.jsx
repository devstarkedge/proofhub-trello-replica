import React, { Suspense, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Ban, Blocks, Clock, Loader2, Search, Shield, ShieldCheck, UserCog, Users, X } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import api from '../services/api';
import useRoleStore from '../store/roleStore';
import useAccessControl from '../hooks/useAccessControl';
import * as accessControlApi from '../services/accessControlApi';
import Avatar from '../components/Avatar';
import RoleManagementPanel from '../components/TeamManagement/RoleManagementPanel';
import ResourceAccessPanel from '../components/AccessControl/ResourceAccessPanel';
import UserAccessEditor from '../components/AccessControl/UserAccessEditor';
import AuditLogViewer from '../components/AccessControl/AuditLogViewer';

const CreateRoleModal = lazy(() => import('../components/TeamManagement/modals/CreateRoleModal'));
const EditRoleModal = lazy(() => import('../components/TeamManagement/modals/EditRoleModal'));

const TABS = [
  { key: 'users', label: 'Users', icon: Users },
  { key: 'roles', label: 'Roles & Permissions', icon: Shield },
  { key: 'modules', label: 'Modules', icon: Blocks },
  { key: 'activity', label: 'Activity Log', icon: Clock }
];

/**
 * The centralized Access & Permissions module.
 *
 * This is now the ONE place Admins (or anyone delegated the
 * access_control.manage permission) manage users, roles, role permissions,
 * per-user overrides, and module/page/action access. Finance, Sales, HR,
 * and Teams no longer host their own permission-editing UI — they only
 * consume the centralized service (useAccessControl / accessControlApi)
 * to decide what to render, exactly like any other page in the app does.
 */
const AccessControlPage = () => {
  const { user: currentUser } = useContext(AuthContext);
  const { isAdmin } = useAccessControl();
  const [activeTab, setActiveTab] = useState('users');

  return (
    <div className="min-h-full" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <main className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <div className="p-2.5 rounded-xl" style={{ backgroundColor: 'rgba(124, 58, 237, 0.12)' }}>
            <ShieldCheck className="w-7 h-7" style={{ color: '#7c3aed' }} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Access & Permissions
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Manage users, roles, and module access from one place — every other page reads from this.
            </p>
          </div>
        </div>

        <div className="mb-6 border-b flex gap-1" style={{ borderColor: 'var(--color-border-subtle)' }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2"
              style={{
                borderColor: activeTab === key ? '#7c3aed' : 'transparent',
                color: activeTab === key ? '#7c3aed' : 'var(--color-text-secondary)'
              }}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'users' && <UsersTab currentUserId={currentUser?._id} />}
        {activeTab === 'roles' && <RolesTab isAdmin={isAdmin} />}
        {activeTab === 'modules' && <ModulesTab />}
        {activeTab === 'activity' && <ActivityLogPanel />}
      </main>
    </div>
  );
};

// ─── Users tab — list every user, open UserAccessEditor for the selected one ──

const UsersTab = ({ currentUserId }) => {
  const { currentWorkspace } = useContext(WorkspaceContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  // Monotonically-increasing request id — the same "only the latest request
  // may apply its response" guard as ResourceAccessPanel.jsx's `mounted`
  // flag, but usable from a function that (unlike that component's fetch)
  // must also stay externally callable as onUserUpdated below. Any call to
  // loadUsers — from the workspace-switch effect below, or from
  // UserAccessEditor after an edit — bumps the counter, so a slower,
  // superseded response can never overwrite a newer one (which is exactly
  // what let a previous workspace's user list linger after a fast switch).
  const usersRequestIdRef = useRef(0);

  const loadUsers = useCallback(async () => {
    const requestId = ++usersRequestIdRef.current;
    try {
      setLoading(true);
      const res = await api.get('/api/users');
      if (usersRequestIdRef.current !== requestId) return;
      setUsers(res.data?.data || []);
    } catch (error) {
      if (usersRequestIdRef.current !== requestId) return;
      console.error('Failed to load users:', error);
      toast.error('Failed to load users');
    } finally {
      if (usersRequestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  // Re-fetch whenever the active workspace changes — otherwise the list
  // fetched for the previous workspace would keep rendering until this tab
  // unmounts/remounts.
  useEffect(() => {
    setSelectedUser(null);
    loadUsers();
  }, [loadUsers, currentWorkspace?._id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [users, search]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
        <input
          type="text"
          placeholder="Search users by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm outline-none"
          style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border-subtle)', color: 'var(--color-text-primary)' }}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-12 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading users...
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <div className="divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
            {filtered.map((u) => {
              const isSelf = currentUserId && String(currentUserId) === String(u._id);
              return (
                <div key={u._id} className="flex items-center justify-between gap-3 px-4 py-3" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={u.avatar} name={u.name} role={u.role} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{u.name}</h3>
                        <span className="px-2 py-0.5 text-xs font-medium rounded" style={{ backgroundColor: 'var(--color-bg-muted)', color: 'var(--color-text-secondary)' }}>
                          {u.role}
                        </span>
                        {!u.isVerified && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800">Pending</span>
                        )}
                      </div>
                      <p className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>{u.email}</p>
                    </div>
                  </div>
                  {isSelf ? (
                    <span
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold shrink-0"
                      style={{ backgroundColor: 'var(--color-bg-muted)', color: 'var(--color-text-muted)' }}
                      title="You cannot manage your own access"
                    >
                      <Ban className="w-4 h-4" />
                      That's you
                    </span>
                  ) : (
                    <button
                      onClick={() => setSelectedUser(u)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold shrink-0"
                      style={{ backgroundColor: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}
                    >
                      <UserCog className="w-4 h-4" />
                      Manage Access
                    </button>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-8" style={{ color: 'var(--color-text-muted)' }}>No users found</div>
            )}
          </div>
        </div>
      )}

      {selectedUser && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.target === e.currentTarget && setSelectedUser(null)}
        >
          <div className="absolute inset-0 bg-gray-900/45 backdrop-blur-sm" />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-white shadow-2xl dark:bg-gray-900" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
              <div className="flex items-center gap-3">
                <Avatar src={selectedUser.avatar} name={selectedUser.name} role={selectedUser.role} size="lg" />
                <div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{selectedUser.name}</h3>
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{selectedUser.email}</p>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="p-2 rounded-lg" style={{ color: 'var(--color-text-secondary)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <UserAccessEditor
                userId={selectedUser._id}
                currentUserId={currentUserId}
                onUserUpdated={loadUsers}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Roles & Permissions tab — moved wholesale out of Team Management ──

const RolesTab = ({ isAdmin }) => {
  const { createRole, updateRole, deleteRole, roles } = useRoleStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [roleToEdit, setRoleToEdit] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const handleCreateRole = async (roleData) => {
    setCreateLoading(true);
    try {
      await createRole(roleData);
      setShowCreateModal(false);
      toast.success(`Role "${roleData.name}" created successfully!`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create role');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUpdateRole = async (roleId, roleData) => {
    setEditLoading(true);
    try {
      await updateRole(roleId, roleData);
      setShowEditModal(false);
      setRoleToEdit(null);
      toast.success(`Role "${roleData.name}" updated successfully!`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update role');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteRole = async (role) => {
    if (!role) return;
    try {
      await deleteRole(role._id);
      setShowEditModal(false);
      setRoleToEdit(null);
      toast.success(`Role "${role.name}" deleted successfully!`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete role');
    }
  };

  return (
    <div className="space-y-8">
      <RoleManagementPanel
        onCreateRole={() => setShowCreateModal(true)}
        onEditRole={(role) => {
          setRoleToEdit(role);
          setShowEditModal(true);
        }}
        onDeleteRole={handleDeleteRole}
        isLoading={false}
      />

      {/* Delegated administration: grant a specific user — not just a whole
          role — the ability to manage this module, without making them Admin. */}
      <ResourceAccessPanel
        resource="access_control"
        title="Delegate Access & Permissions Management"
        description="Grant a specific user (any role) the ability to manage roles and per-user access, without making them an Admin."
        icon={Shield}
        accentColor="#7c3aed"
        userFilter={(u) => u.role?.toLowerCase() !== 'admin'}
      />

      <Suspense fallback={null}>
        <CreateRoleModal
          isOpen={showCreateModal}
          isLoading={createLoading}
          onSubmit={handleCreateRole}
          onClose={() => setShowCreateModal(false)}
          existingRoleNames={roles.map((r) => r.name)}
        />
        <EditRoleModal
          isOpen={showEditModal}
          isLoading={editLoading}
          role={roleToEdit}
          onSubmit={handleUpdateRole}
          onDelete={handleDeleteRole}
          onClose={() => {
            setShowEditModal(false);
            setRoleToEdit(null);
          }}
        />
      </Suspense>
    </div>
  );
};

// ─── Modules tab — bulk "who has access to X" view, one resource at a time ──

const ModulesTab = () => {
  const { registry } = useAccessControl();
  const resourceKeys = Object.keys(registry?.resources || { sales: {}, finance: {} }).filter((k) => k !== 'access_control');
  const [activeResource, setActiveResource] = useState('sales');

  useEffect(() => {
    if (resourceKeys.length && !resourceKeys.includes(activeResource)) {
      setActiveResource(resourceKeys[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry]);

  const accent = { sales: '#10b981', finance: '#0ea5e9' };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {resourceKeys.map((key) => (
          <button
            key={key}
            onClick={() => setActiveResource(key)}
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
            style={{
              backgroundColor: activeResource === key ? `${accent[key] || '#7c3aed'}18` : 'var(--color-bg-secondary)',
              borderColor: activeResource === key ? accent[key] || '#7c3aed' : 'var(--color-border-subtle)',
              color: activeResource === key ? accent[key] || '#7c3aed' : 'var(--color-text-secondary)'
            }}
          >
            {registry?.resources?.[key]?.label || key}
          </button>
        ))}
      </div>

      <ResourceAccessPanel
        resource={activeResource}
        title={`${registry?.resources?.[activeResource]?.label || ''} Module Access`}
        description={registry?.resources?.[activeResource]?.description}
        icon={Blocks}
        accentColor={accent[activeResource] || '#7c3aed'}
        userFilter={(u) => u.role?.toLowerCase() !== 'admin'}
      />
    </div>
  );
};

// ─── Activity Log tab — enterprise audit log ─────────────────────────────────

const ActivityLogPanel = () => {
  const { registry } = useAccessControl();

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        Every grant, revoke, and update made through this module — who did what, to whom, and when.
      </p>
      <AuditLogViewer registry={registry} />
    </div>
  );
};

export default AccessControlPage;
