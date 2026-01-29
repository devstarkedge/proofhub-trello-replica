import React, { useState, useEffect, useContext } from 'react';
import { Search, Users, DollarSign, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import AuthContext from '../../context/AuthContext';
import api from '../../services/api';
import Avatar from '../Avatar';
import { updateUserPermissions, getUserPermissions } from '../../services/salesApi';

const PERMISSIONS_CONFIG = [
  { key: 'moduleVisible', label: 'Module Access', description: 'Can view Sales module' },
  { key: 'canCreate', label: 'Create', description: 'Can add new rows' },
  { key: 'canUpdate', label: 'Update', description: 'Can edit existing rows' },
  { key: 'canDelete', label: 'Delete', description: 'Can delete rows' },
  { key: 'canExport', label: 'Export', description: 'Can export data' },
  { key: 'canImport', label: 'Import', description: 'Can import data' },
  { key: 'canManageDropdowns', label: 'Manage Options', description: 'Can manage dropdown values' },
  { key: 'canViewActivityLog', label: 'View Logs', description: 'Can view activity history' },
];

const ModuleAccessPanel = () => {
  const { token } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [savingUserId, setSavingUserId] = useState(null);
  const [userPermissions, setUserPermissions] = useState({});

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Access response.data.data because axios wraps body in .data, and backend wraps result in .data
      const usersData = response.data.data || [];
      const allUsers = usersData.filter(u => 
        u.role?.toLowerCase() !== 'admin'
      );
      setUsers(allUsers);

      // Fetch permissions for each user
      const permsMap = {};
      await Promise.all(allUsers.map(async (user) => {
        try {
          const response = await getUserPermissions(user._id);
          permsMap[user._id] = response.data;
        } catch (err) {
          permsMap[user._id] = {
            moduleVisible: false,
            canCreate: false,
            canUpdate: false,
            canDelete: false,
            canExport: false,
            canImport: false,
            canManageDropdowns: false,
            canViewActivityLog: false,
          };
        }
      }));
      setUserPermissions(permsMap);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = async (userId, permKey, value) => {
    const currentPerms = userPermissions[userId] || {};
    const newPerms = { ...currentPerms, [permKey]: value };
    
    // If turning off module access, turn off all other permissions
    if (permKey === 'moduleVisible' && !value) {
      Object.keys(newPerms).forEach(key => {
        if (key !== 'moduleVisible') newPerms[key] = false;
      });
    }
    
    // Optimistically update UI
    setUserPermissions(prev => ({
      ...prev,
      [userId]: newPerms
    }));
    
    // Sanitize permissions to remove immutable fields
    const { _id, __v, createdAt, updatedAt, user, ...sanitizedPerms } = newPerms;
    
    setSavingUserId(userId);
    
    try {
      await updateUserPermissions(userId, sanitizedPerms);
      // Notify other parts of the app that permissions changed
      try {
        window.dispatchEvent(new CustomEvent('sales-permissions-updated', { detail: { userId, permissions: sanitizedPerms } }));
      } catch (e) {
        // ignore
      }
    } catch (error) {
      // Rollback on error
      setUserPermissions(prev => ({
        ...prev,
        [userId]: currentPerms
      }));
      toast.error('Failed to update permissions');
    } finally {
      setSavingUserId(null);
    }
  };

  const filteredUsers = users.filter(user => 
    user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Loading users...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-emerald-100 p-2 rounded-lg">
          <DollarSign className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sales Module Access</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Control which users can access the Sales module and their permissions
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>Note:</strong> Configure permissions below for other users.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search users by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {/* Users List */}
      <div className="space-y-4">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No users found</p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const perms = userPermissions[user._id] || {};
            const isSaving = savingUserId === user._id;
            
            return (
              <div
                key={user._id}
                className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
              >
                <div className="flex items-start gap-4">
                  {/* User Info */}
                  <Avatar
                    src={user.avatar}
                    name={user.name}
                    role={user.role}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {user.name}
                      </h3>
                      {isSaving && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </p>
                    <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
                      {user.role || 'User'}
                    </span>
                  </div>
                </div>

                {/* Permissions Grid */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {PERMISSIONS_CONFIG.map(({ key, label }) => {
                    const isEnabled = perms[key] || false;
                    const isModuleAccess = key === 'moduleVisible';
                    const isDisabled = !isModuleAccess && !perms.moduleVisible;
                    
                    return (
                      <button
                        key={key}
                        onClick={() => !isDisabled && handlePermissionChange(user._id, key, !isEnabled)}
                        disabled={isDisabled || isSaving}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          isDisabled
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                            : isEnabled
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        {isEnabled ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ModuleAccessPanel;
