import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, Loader, Search, Check } from 'lucide-react';
import { toast } from 'react-toastify';
import { getAvailableUsers, addWorkspaceMember } from '../../services/workspaceMembersApi';
import Avatar from '../Avatar';

const AddWorkspaceMemberModal = ({ isOpen, onClose, workspaceId, roleOptions, onMembersAdded }) => {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  const defaultRole = roleOptions?.find((r) => r.slug === 'employee')?.slug || roleOptions?.[0]?.slug || '';

  const fetchUsers = useCallback(async (term) => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const results = await getAvailableUsers(workspaceId, term);
      setUsers(results);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setSelectedIds([]);
    setRole(defaultRole);
    fetchUsers('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceId]);

  // roleOptions can still be loading (async) at the moment the modal opens —
  // back-fill the default once it arrives, but only while nothing has been
  // selected yet so this never clobbers a user's own in-progress choice.
  useEffect(() => {
    if (isOpen && !role && defaultRole) {
      setRole(defaultRole);
    }
  }, [isOpen, role, defaultRole]);

  useEffect(() => {
    if (!isOpen) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchUsers(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, isOpen, fetchUsers]);

  const toggleUser = (userId) => {
    setSelectedIds((prev) => (
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    ));
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      toast.warning('Select at least one user to add');
      return;
    }
    if (!role) {
      toast.warning('Select a role');
      return;
    }
    setSaving(true);
    const added = [];
    const failed = [];
    for (const userId of selectedIds) {
      try {
        const member = await addWorkspaceMember(workspaceId, userId, role);
        added.push(member);
      } catch (error) {
        const user = users.find((u) => u._id === userId);
        failed.push(user?.name || userId);
      }
    }
    setSaving(false);
    if (added.length > 0) {
      toast.success(`Added ${added.length} member${added.length > 1 ? 's' : ''}`);
      onMembersAdded?.(added);
    }
    if (failed.length > 0) {
      toast.error(`Failed to add: ${failed.join(', ')}`);
    }
    if (added.length > 0) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          style={{ backgroundColor: 'var(--color-card-bg)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                <UserPlus size={18} className="text-white" />
              </div>
              <h2 className="text-lg font-bold text-white">Add Members</h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-5 flex-shrink-0 space-y-3 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
                style={{
                  backgroundColor: 'var(--color-bg-muted)',
                  borderColor: 'var(--color-border-default)',
                  color: 'var(--color-text-primary)',
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                Assign role:
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none capitalize"
                style={{
                  backgroundColor: 'var(--color-bg-muted)',
                  borderColor: 'var(--color-border-default)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {(roleOptions || []).map((r) => (
                  <option key={r._id} value={r.slug}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader size={22} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
              </div>
            ) : users.length === 0 ? (
              <p className="text-center text-sm py-10" style={{ color: 'var(--color-text-muted)' }}>
                No matching users to add — everyone found is already a member.
              </p>
            ) : (
              <div className="space-y-1">
                {users.map((u) => {
                  const selected = selectedIds.includes(u._id);
                  return (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => toggleUser(u._id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                      style={{ backgroundColor: selected ? 'rgba(16, 185, 129, 0.1)' : 'transparent' }}
                    >
                      <Avatar src={u.avatar} name={u.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{u.name}</div>
                        <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{u.email}</div>
                      </div>
                      <div
                        className="w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0"
                        style={{
                          borderColor: selected ? '#10b981' : 'var(--color-border-default)',
                          backgroundColor: selected ? '#10b981' : 'transparent',
                        }}
                      >
                        {selected && <Check size={13} className="text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {selectedIds.length} selected
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-xl border transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || selectedIds.length === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 transition-all"
              >
                {saving ? <Loader size={16} className="animate-spin" /> : <UserPlus size={16} />}
                {saving ? 'Adding...' : `Add ${selectedIds.length || ''}`.trim()}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default AddWorkspaceMemberModal;
