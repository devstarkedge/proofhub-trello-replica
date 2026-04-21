import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Search,
  ShieldCheck,
  UserCog,
  X
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { getUserPagePermissions, patchUserPagePermissions } from '../../services/userPermissionsApi';
import Avatar from '../Avatar';

const EMPTY_PERMISSIONS = {
  hasAccess: false
};

const PERMISSION_TOGGLES = [
  {
    key: 'hasAccess',
    label: 'Finance Page access',
    description: 'Controls whether the Finance route appears and loads.',
    icon: Eye
  }
];

const normalizeRole = (role) => {
  const normalized = String(role || '').toLowerCase().trim();
  return normalized === 'member' ? 'employee' : normalized;
};

const formatRole = (role) => {
  const normalized = normalizeRole(role);
  if (normalized === 'employee') return 'Member';
  if (normalized === 'hr') return 'HR';
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Member';
};

const getEffectivePermissions = (permissions) => {
  return {
    ...EMPTY_PERMISSIONS,
    ...(permissions || {}),
    locked: false
  };
};

const FinanceStatusPill = ({ isOn }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
    style={{
      backgroundColor: isOn ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.10)',
      borderColor: isOn ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.24)',
      color: isOn ? '#047857' : '#dc2626'
    }}
  >
    {isOn ? <CheckCircle2 className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
    Finance: {isOn ? 'On' : 'Off'}
  </span>
);

const FinanceAccessControl = () => {
  const [users, setUsers] = useState([]);
  const [userPermissions, setUserPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_PERMISSIONS });

  useEffect(() => {
    let mounted = true;

    const fetchUsersAndPermissions = async () => {
      try {
        setLoading(true);
        const response = await api.get('/api/users');
        const usersData = response.data?.data || [];
        const accessUsers = usersData.filter((item) => (
          ['manager'].includes(normalizeRole(item.role))
        ));

        const permissionsEntries = await Promise.all(accessUsers.map(async (item) => {
          try {
            const permissionData = await getUserPagePermissions(item._id);
            return [item._id, permissionData?.permissions || getEffectivePermissions()];
          } catch {
            return [item._id, getEffectivePermissions()];
          }
        }));

        if (!mounted) return;
        setUsers(accessUsers);
        setUserPermissions(Object.fromEntries(permissionsEntries));
      } catch (error) {
        console.error('Failed to load finance access users:', error);
        toast.error(error.response?.data?.message || 'Failed to load finance access users');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchUsersAndPermissions();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return users;

    return users.filter((item) => (
      item.name?.toLowerCase().includes(query) ||
      item.email?.toLowerCase().includes(query) ||
      formatRole(item.role).toLowerCase().includes(query)
    ));
  }, [searchQuery, users]);

  const openModal = (item) => {
    const permissions = getEffectivePermissions(userPermissions[item._id]);

    setSelectedUser(item);
    setForm({
      hasAccess: permissions.hasAccess === true
    });
  };

  const closeModal = () => {
    if (saving) return;
    setSelectedUser(null);
  };

  const handleToggle = (key) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const savePermissions = async () => {
    if (!selectedUser) return;

    const optimisticPermissions = {
      hasAccess: form.hasAccess === true,
      revenueAnalytics: false,
      billingDetails: false,
      locked: false
    };

    const previousPermissions = userPermissions;

    setSaving(true);
    setUserPermissions((prev) => ({
      ...prev,
      [selectedUser._id]: optimisticPermissions
    }));

    try {
      const data = await patchUserPagePermissions(selectedUser._id, {
        hasAccess: optimisticPermissions.hasAccess,
        revenueAnalytics: false,
        billingDetails: false
      });

      const updatedPermissions = data?.permissions || optimisticPermissions;

      setUserPermissions((prev) => ({
        ...prev,
        [selectedUser._id]: updatedPermissions
      }));

      window.dispatchEvent(new CustomEvent('finance-permissions-updated', {
        detail: {
          userId: selectedUser._id,
          permissions: updatedPermissions
        }
      }));

      toast.success('Finance permissions saved');
      setSelectedUser(null);
    } catch (error) {
      setUserPermissions(previousPermissions);
      toast.error(error.response?.data?.message || 'Failed to save finance permissions');
    } finally {
      setSaving(false);
    }
  };

  const modalPermissions = form;

  return (
    <section
      className="rounded-lg border overflow-hidden"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border-subtle)'
      }}
    >
      <div
        className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between"
        style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              User Access Control - Finance Page
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              SaaS permission layer
            </p>
          </div>
        </div>

        <div className="relative w-full md:w-72">
          <Search
            className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2"
            style={{ color: 'var(--color-text-muted)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search users..."
            className="w-full h-10 rounded-lg border pl-9 pr-3 text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border-subtle)',
              color: 'var(--color-text-primary)'
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 p-8 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading finance access...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-8 text-center">
          <UserCog className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No users found
          </p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
          {filteredUsers.map((item) => {
            const permissions = getEffectivePermissions(userPermissions[item._id]);
            const financeOn = permissions.hasAccess === true;

            return (
              <div
                key={item._id}
                className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    src={item.avatar}
                    name={item.name}
                    role={item.role}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {item.name}
                      </h3>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor: 'var(--color-bg-muted)',
                          color: 'var(--color-text-secondary)'
                        }}
                      >
                        {formatRole(item.role)}
                      </span>
                    </div>
                    <p className="truncate text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      {item.email}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 md:justify-end">
                  <FinanceStatusPill isOn={financeOn} />
                  <button
                    type="button"
                    onClick={() => openModal(item)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border-subtle)',
                      color: 'var(--color-text-primary)'
                    }}
                  >
                    <UserCog className="w-4 h-4" />
                    Edit access
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedUser && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div className="absolute inset-0 bg-gray-900/45 backdrop-blur-sm" />
          <div
            className="relative z-10 flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border bg-white shadow-2xl dark:bg-gray-900"
            style={{
              borderColor: 'var(--color-border-subtle)'
            }}
          >
            <div
              className="flex items-start justify-between gap-4 px-5 py-4"
              style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  src={selectedUser.avatar}
                  name={selectedUser.name}
                  role={selectedUser.role}
                  size="lg"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                      {selectedUser.name}
                    </h3>
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{
                        backgroundColor: 'var(--color-bg-muted)',
                        color: 'var(--color-text-secondary)'
                      }}
                    >
                      {formatRole(selectedUser.role)}
                    </span>
                  </div>
                  <p className="truncate text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    {selectedUser.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--color-text-secondary)' }}
                aria-label="Close permissions modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5">
              <div
                className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold"
                style={{
                  backgroundColor: modalPermissions.hasAccess
                    ? 'rgba(16, 185, 129, 0.10)'
                    : 'rgba(239, 68, 68, 0.08)',
                  borderColor: modalPermissions.hasAccess
                    ? 'rgba(16, 185, 129, 0.28)'
                    : 'rgba(239, 68, 68, 0.24)',
                  color: modalPermissions.hasAccess ? '#047857' : '#dc2626'
                }}
              >
                {modalPermissions.hasAccess ? <CheckCircle2 className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                Finance Page will be {modalPermissions.hasAccess ? 'visible' : 'hidden'}
              </div>

              {!modalPermissions.hasAccess && (
                <div
                  className="flex items-start gap-2 rounded-lg border px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.10)',
                    borderColor: 'rgba(245, 158, 11, 0.28)',
                    color: '#b45309'
                  }}
                >
                  <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
                  <span>Finance is off, so this user cannot see the Finance page.</span>
                </div>
              )}

              <div className="space-y-3">
                {PERMISSION_TOGGLES.map(({ key, label, description, icon: Icon }) => {
                  const checked = modalPermissions[key] === true;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleToggle(key)}
                      disabled={saving}
                      className="flex w-full items-center justify-between gap-4 rounded-lg border p-4 text-left transition-colors hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                      style={{
                        backgroundColor: checked ? 'rgba(16, 185, 129, 0.08)' : 'var(--color-bg-secondary)',
                        borderColor: checked ? 'rgba(16, 185, 129, 0.30)' : 'var(--color-border-subtle)'
                      }}
                    >
                      <span className="flex min-w-0 items-start gap-3">
                        <span
                          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            backgroundColor: checked ? 'rgba(16, 185, 129, 0.14)' : 'var(--color-bg-muted)',
                            color: checked ? '#047857' : 'var(--color-text-secondary)'
                          }}
                        >
                          {React.createElement(Icon, { className: 'w-4 h-4' })}
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            {label}
                          </span>
                          <span className="mt-1 block text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            {description}
                          </span>
                        </span>
                      </span>

                      <span
                        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                        style={{ backgroundColor: checked ? '#10b981' : 'var(--color-bg-muted)' }}
                      >
                        <span
                          className="absolute top-1 h-4 w-4 rounded-full bg-white transition-transform"
                          style={{ transform: checked ? 'translateX(22px)' : 'translateX(4px)' }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className="flex items-center justify-end gap-3 bg-gray-50 px-5 py-4 dark:bg-gray-950"
              style={{ borderTop: '1px solid var(--color-border-subtle)' }}
            >
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="h-10 rounded-lg border px-4 text-sm font-semibold transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderColor: 'var(--color-border-subtle)',
                  color: 'var(--color-text-primary)'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePermissions}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-70"
                style={{ backgroundColor: '#10b981' }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save permissions
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default FinanceAccessControl;
