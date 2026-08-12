import React, { useState, useEffect, useContext, useMemo, useCallback, memo } from 'react';
import {
  Users,
  Filter,
  Search,
  UserCheck,
  UserCog,
  UserPlus,
  UserMinus,
  X,
  CheckCircle,
  XCircle,
  Building2,
  Shield,
  Briefcase,
  User,
  ChevronDown,
  Loader2,
  Ban
} from 'lucide-react';
import { HRPanelSkeleton } from '../components/LoadingSkeleton';
import api from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import useDepartmentStore from '../store/departmentStore';
import useRoleStore from '../store/roleStore';
import Avatar from '../components/Avatar';
import UserAccessEditor from '../components/AccessControl/UserAccessEditor';
import InviteMemberModal from '../components/Workspace/InviteMemberModal/InviteMemberModal';
import PermissionGate from '../components/PermissionGate';
import { getWorkspaceMembers, removeWorkspaceMember } from '../services/workspaceMembersApi';

// Membership rows from GET /api/workspaces/:id/members come shaped as
// { _id: membershipId, user: {...}, role, department, isOwner, joinedAt } —
// flattened here into one per-row object so the rest of this page (built
// around a flat "user" shape) didn't need a wider rewrite.
const flattenMember = (m) => ({
  membershipId: m._id,
  _id: m.user._id,
  name: m.user.name,
  email: m.user.email,
  avatar: m.user.avatar,
  isVerified: m.user.isVerified,
  isActive: m.user.isActive,
  role: m.role,
  department: m.department || [],
  isOwner: m.isOwner,
});

// Memoized User Row Component for better performance
const UserRow = memo(({
  member,
  currentUserId,
  loadingStates,
  onVerify,
  onDecline,
  onAssign,
  onRemove,
  getRoleBadge,
  getStatusBadge
}) => {
  const isSelf = currentUserId && String(currentUserId) === String(member._id);
  const canManageMembership = !isSelf && !member.isOwner;
  return (
    <tr className="hover:bg-gray-50 transition-colors duration-150">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <Avatar
            src={member.avatar}
            name={member.name}
            role={member.role}
            isVerified={member.isVerified}
            size="md"
            showBadge={true}
          />
          <div className="ml-4">
            <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              {member.name}
              {member.isOwner && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                  Owner
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500">{member.email}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {getRoleBadge(member.role)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {member.department && member.department.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {member.department.map((dept) => (
              <span key={dept._id} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
                <Building2 className="w-3 h-3" />
                {dept.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-sm text-gray-400 italic">Not Assigned</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {getStatusBadge(member)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
        <div className="flex items-center gap-2">
          {!member.isVerified && member.role !== 'admin' && (
            <>
              <button
                onClick={() => onVerify(member._id)}
                disabled={loadingStates[member._id]}
                className="inline-flex items-center gap-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingStates[member._id] ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {loadingStates[member._id] ? 'Verifying...' : 'Verify'}
              </button>
              <button
                onClick={() => onDecline(member._id)}
                disabled={loadingStates[member._id]}
                className="inline-flex items-center gap-1 px-3 py-2 bg-red-300 text-red-800 rounded-lg hover:bg-red-200 transition-colors duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingStates[member._id] ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {loadingStates[member._id] ? 'Declining...' : 'Decline'}
              </button>
            </>
          )}
          {member.isVerified && (
            <>
              {isSelf ? (
                <span
                  className="inline-flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-400 rounded-lg font-semibold cursor-not-allowed"
                  title="You cannot manage your own access"
                >
                  <Ban className="w-4 h-4" />
                  That's you
                </span>
              ) : (
                <button
                  onClick={() => onAssign(member)}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors duration-200 font-semibold"
                >
                  <UserCog className="w-4 h-4" />
                  Assign
                </button>
              )}
              {canManageMembership && (
                <button
                  onClick={() => onRemove(member)}
                  disabled={loadingStates[member._id]}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserMinus className="w-4 h-4" />
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
});
UserRow.displayName = 'UserRow';

const HRPanel = () => {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const loggedInUserId = user?._id;
  const departmentStore = useDepartmentStore();
  const { roles, loadRoles, initialized: rolesInitialized } = useRoleStore();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState({
    role: '',
    department: '',
    search: ''
  });
  const [debouncedFilters] = useDebounce(filters, 200);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [loadingStates, setLoadingStates] = useState({});

  const activeRoles = useMemo(() => (roles || []).filter((r) => r.isActive !== false), [roles]);

  const loadData = useCallback(async () => {
    if (!currentWorkspace?._id) return;
    try {
      setLoading(true);
      const [membersData] = await Promise.all([
        getWorkspaceMembers(currentWorkspace._id),
        departmentStore.loadDepartments(),
      ]);
      setMembers(membersData.map(flattenMember));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
    // departmentStore is a stable zustand reference; only re-run when the
    // active workspace actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?._id]);

  useEffect(() => {
    loadData();

    // Initialize socket listeners for department assignments
    const cleanup = departmentStore.initializeSocketListeners();

    // Listen for real-time user verification updates
    const handleUserVerified = (event) => {
      const { userId, isVerified, role } = event.detail;
      setMembers(prev => prev.map(m => (m._id === userId ? { ...m, isVerified, role } : m)));
    };

    // Listen for real-time role change updates
    const handleRoleChanged = (event) => {
      const { userId, newRole } = event.detail;
      setMembers(prev => prev.map(m => (m._id === userId ? { ...m, role: newRole } : m)));
    };

    window.addEventListener('socket-user-verified', handleUserVerified);
    window.addEventListener('socket-user-role-changed', handleRoleChanged);

    return () => {
      cleanup();
      window.removeEventListener('socket-user-verified', handleUserVerified);
      window.removeEventListener('socket-user-role-changed', handleRoleChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData]);

  useEffect(() => {
    if (!rolesInitialized) {
      loadRoles().catch(() => {});
    }
  }, [rolesInitialized, loadRoles]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleVerifyUser = async (userId) => {
    setLoadingStates(prev => ({ ...prev, [userId]: true }));
    try {
      await api.put(`/api/users/${userId}/verify`, {
        role: 'employee',
        department: null
      });
      setMembers(prev => prev.map(m => (m._id === userId ? { ...m, isVerified: true, role: 'employee', department: [] } : m)));
    } catch (error) {
      console.error('Error verifying user:', error);
      showToast('error', error.response?.data?.message || 'Failed to verify user');
    } finally {
      setLoadingStates(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleDeclineUser = async (userId) => {
    setLoadingStates(prev => ({ ...prev, [userId]: true }));
    try {
      await api.delete(`/api/users/${userId}/decline`);
      setMembers(prev => prev.filter(m => m._id !== userId));
    } catch (error) {
      console.error('Error declining user:', error);
      showToast('error', error.response?.data?.message || 'Failed to decline user');
    } finally {
      setLoadingStates(prev => ({ ...prev, [userId]: false }));
    }
  };

  const openRemoveModal = (member) => {
    setMemberToRemove(member);
    setShowRemoveModal(true);
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove || !currentWorkspace?._id) return;
    const uid = memberToRemove._id;
    setLoadingStates(prev => ({ ...prev, [uid]: true }));
    try {
      await removeWorkspaceMember(currentWorkspace._id, uid);
      setMembers(prev => prev.filter(m => m._id !== uid));
      showToast('success', `${memberToRemove.name} removed from ${currentWorkspace.name}`);
      setShowRemoveModal(false);
      setMemberToRemove(null);
    } catch (error) {
      console.error('Error removing member:', error);
      showToast('error', error.response?.data?.message || 'Failed to remove member');
    } finally {
      setLoadingStates(prev => ({ ...prev, [uid]: false }));
    }
  };

  const closeAssignModal = () => {
    setShowModal(false);
    setSelectedUser(null);
  };

  const openAssignModal = (member) => {
    setSelectedUser(member);
    setShowModal(true);
  };

  // OPTIMIZED: Memoize filtered members to prevent recalculation on every render
  // Uses debouncedFilters to prevent filtering on every keystroke
  const filteredMembers = useMemo(() => {
    if (!members.length) return [];

    const searchLower = debouncedFilters.search?.toLowerCase() || '';

    return members.filter(member => {
      if (debouncedFilters.role && member.role !== debouncedFilters.role) return false;

      if (debouncedFilters.department) {
        const hasDept = member.department?.some(d => d._id === debouncedFilters.department);
        if (!hasDept) return false;
      }

      if (searchLower) {
        const nameMatch = member.name.toLowerCase().includes(searchLower);
        const emailMatch = member.email.toLowerCase().includes(searchLower);
        if (!nameMatch && !emailMatch) return false;
      }

      return true;
    });
  }, [members, debouncedFilters.role, debouncedFilters.department, debouncedFilters.search]);

  // Memoize badge generators to prevent recreating functions
  const getStatusBadge = useCallback((member) => {
    if (!member.isVerified) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full">
          <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
          Pending
        </span>
      );
    }
    if (!member.isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded-full">
          <span className="w-2 h-2 bg-red-500 rounded-full"></span>
          Inactive
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
        Active
      </span>
    );
  }, []);

  // Memoize role badge generator
  const getRoleBadge = useCallback((role) => {
    const roleConfig = {
      admin: { color: 'bg-red-100 text-red-800', icon: Shield },
      manager: { color: 'bg-blue-100 text-blue-800', icon: Briefcase },
      hr: { color: 'bg-purple-100 text-purple-800', icon: UserCog },
      employee: { color: 'bg-gray-100 text-gray-800', icon: User }
    };
    const config = roleConfig[role] || roleConfig.employee;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full ${config.color}`}>
        <Icon className="w-3 h-3" />
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  }, []);

  // Memoize stats to prevent recalculation
  const stats = useMemo(() => ({
    total: members.length,
    pending: members.filter(m => !m.isVerified).length,
    active: members.filter(m => m.isVerified && m.isActive).length,
    departments: departmentStore.departments.length
  }), [members, departmentStore.departments.length]);

  if (loading || !currentWorkspace) {
    return <HRPanelSkeleton />;
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="p-6">
          {/* Header */}
          <div className="mb-8 animate-fade-in">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-blue-100 p-3 rounded-xl">
                  <Users className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-gray-900">HR Management Panel</h1>
                  <p className="text-gray-600 mt-1">Manage {currentWorkspace.name}&apos;s members, departments, and assignments</p>
                </div>
              </div>
              <PermissionGate permission="canInviteMembers">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors duration-200 font-semibold shadow-md"
                >
                  <UserPlus className="w-5 h-5" />
                  Invite Member
                </button>
              </PermissionGate>
            </div>
          </div>

          {/* Stats Cards - Using memoized stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Total Users</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Pending</p>
                  <p className="text-3xl font-bold text-yellow-600 mt-1">
                    {stats.pending}
                  </p>
                </div>
                <div className="bg-yellow-100 p-3 rounded-lg">
                  <UserCheck className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Active</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">
                    {stats.active}
                  </p>
                </div>
                <div className="bg-green-100 p-3 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Departments</p>
                  <p className="text-3xl font-bold text-purple-600 mt-1">{stats.departments}</p>
                </div>
                <div className="bg-purple-100 p-3 rounded-lg">
                  <Building2 className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-5 h-5 text-gray-600" />
              <h2 className="text-xl font-semibold text-gray-900">Filters</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Role</label>
                <div className="relative">
                  <select
                    value={filters.role}
                    onChange={(e) => setFilters({...filters, role: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white transition-all duration-200"
                  >
                    <option value="">All Roles</option>
                    {activeRoles.map((r) => (
                      <option key={r._id} value={r.slug}>{r.name}</option>
                    ))}
                  </select>
                  <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Department</label>
                <div className="relative">
                  <select
                    value={filters.department}
                    onChange={(e) => setFilters({...filters, department: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white transition-all duration-200"
                  >
                    <option value="">All Departments</option>
                    {departmentStore.departments.map((dept, index) => (
                      <option key={`${dept._id}-${index}`} value={dept._id}>{dept.name}</option>
                    ))}
                  </select>
                  <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Search</label>
                <div className="relative">
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => setFilters({...filters, search: e.target.value})}
                    placeholder="Name or email..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Users Directory</h2>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                  {filteredMembers.length} {filteredMembers.length === 1 ? 'User' : 'Users'}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Department</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredMembers.map((member) => (
                    <UserRow
                      key={member._id}
                      member={member}
                      currentUserId={loggedInUserId}
                      loadingStates={loadingStates}
                      getRoleBadge={getRoleBadge}
                      getStatusBadge={getStatusBadge}
                      onVerify={handleVerifyUser}
                      onDecline={handleDeclineUser}
                      onAssign={openAssignModal}
                      onRemove={openRemoveModal}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Assignment Modal */}
          {showModal && selectedUser && (
            <div className="fixed inset-0 backdrop-blur-sm bg-black/30 overflow-y-auto h-full w-full z-50 flex items-center justify-center animate-fade-in p-4">
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-slide-up">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-2 rounded-lg">
                        <UserCog className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">Assign Department & Access</h3>
                        <p className="text-blue-100 text-sm">{selectedUser.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={closeAssignModal}
                      className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors duration-200"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Modal Body — role, department, and access scope, plus
                    every module's resource overrides for this user, all
                    from the centralized Access & Permissions module's
                    editor. HRPanel only opens it; it doesn't implement its
                    own copy, and the Role column is read-only display only —
                    this modal is the one place role changes happen. */}
                <div className="p-6 max-h-[70vh] overflow-y-auto">
                  <UserAccessEditor
                    userId={selectedUser._id}
                    currentUserId={user?._id}
                    onUserUpdated={loadData}
                  />
                </div>

                {/* Modal Footer */}
                <div className="flex justify-end gap-3 p-6 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                  <button
                    onClick={closeAssignModal}
                    className="px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors duration-200 font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Remove-from-Workspace Confirmation Modal — this only ever drops
              the WorkspaceMembership row for the active workspace; it never
              touches the global User account or the user's membership in
              any other workspace. */}
          {showRemoveModal && memberToRemove && (
            <div className="fixed inset-0 backdrop-blur-sm bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center animate-fade-in">
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slide-up">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-6 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-2 rounded-lg">
                        <UserMinus className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">Remove User from Workspace</h3>
                        <p className="text-orange-100 text-sm">{memberToRemove.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowRemoveModal(false);
                        setMemberToRemove(null);
                      }}
                      className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors duration-200"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="p-6">
                  <div className="text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 mb-4">
                      <UserMinus className="h-6 w-6 text-orange-600" />
                    </div>
                    <p className="text-sm text-gray-700 mb-3">
                      Are you sure you want to remove <strong>{memberToRemove.name}</strong> from Workspace: <strong>{currentWorkspace.name}</strong>?
                    </p>
                    <p className="text-sm text-gray-500">
                      The user will lose access to this workspace.
                    </p>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="flex justify-end gap-3 p-6 bg-gray-50 rounded-b-2xl border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowRemoveModal(false);
                      setMemberToRemove(null);
                    }}
                    className="px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors duration-200 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRemoveMember}
                    disabled={loadingStates[memberToRemove._id]}
                    aria-disabled={loadingStates[memberToRemove._id] ? 'true' : 'false'}
                    aria-busy={loadingStates[memberToRemove._id] ? 'true' : 'false'}
                    className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-lg hover:from-orange-600 hover:to-red-700 transition-all duration-200 font-semibold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loadingStates[memberToRemove._id] ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Removing...</span>
                      </>
                    ) : (
                      'Remove from Workspace'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <InviteMemberModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            workspaceId={currentWorkspace._id}
            departmentOptions={departmentStore.departments}
            roleOptions={activeRoles}
            onInvited={() => loadData()}
          />

          {/* Toast Notification */}
          {toast && (
            <div className={`fixed top-4 right-4 z-50 animate-fade-in`}>
              <div className={`px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 ${
                toast.type === 'success'
                  ? 'bg-green-100 border border-green-200 text-green-800'
                  : 'bg-red-100 border border-red-200 text-red-800'
              }`}>
                {toast.type === 'success' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
                <span className="font-semibold">{toast.message}</span>
              </div>
            </div>
          )}
      </main>

      <style jsx="true">{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }

        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
};

export default HRPanel;
