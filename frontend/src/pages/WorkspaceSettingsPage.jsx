import React, { useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase, Users, Crown, Shield, LogOut, Trash2,
  Pencil, Check, X, Loader, AlertTriangle, ArrowLeftRight, Mail,
  ImagePlus, RotateCcw, UserPlus
} from 'lucide-react';
import { toast } from 'react-toastify';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import useThemeStore from '../store/themeStore';
import useDepartmentStore from '../store/departmentStore';
import useRoleStore from '../store/roleStore';
import Avatar from '../components/Avatar';
import WorkspaceSetupBanner from '../components/Workspace/WorkspaceSetupBanner';
import PermissionGate from '../components/PermissionGate';
import InviteMemberModal from '../components/Workspace/InviteMemberModal/InviteMemberModal';
import { validateWorkspaceIconFile } from '../utils/workspaceIcon';
import { getWorkspaceMembers } from '../services/workspaceMembersApi';

const roleBadgeIcon = (role) => {
  if (role === 'admin') return Crown;
  if (role === 'manager') return Shield;
  return null;
};

const WorkspaceSettingsPage = () => {
  const { user } = useContext(AuthContext);
  const {
    currentWorkspace, renameWorkspace, leaveWorkspace,
    deactivateWorkspace, transferOwnership, workspaces,
    uploadWorkspaceIcon, removeWorkspaceIcon,
  } = useContext(WorkspaceContext);
  const { effectiveMode } = useThemeStore();
  const isDarkMode = effectiveMode === 'dark';

  const [members, setMembers] = useState([]);
  const [ownerId, setOwnerId] = useState(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const departmentStore = useDepartmentStore();
  const { roles, loadRoles } = useRoleStore();
  const activeRoles = useMemo(() => (roles || []).filter((r) => r.isActive !== false), [roles]);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferring, setTransferring] = useState(false);

  const [showDeactivate, setShowDeactivate] = useState(false);
  const [deactivateInput, setDeactivateInput] = useState('');
  const [deactivating, setDeactivating] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [removingIcon, setRemovingIcon] = useState(false);
  const iconInputRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const isOwner = ownerId && user && String(ownerId) === String(user.id);

  const loadMembers = useCallback(async () => {
    if (!currentWorkspace?._id) return;
    setLoadingMembers(true);
    try {
      const data = await getWorkspaceMembers(currentWorkspace._id);
      setMembers(data);
      const owner = data.find((m) => m.isOwner);
      setOwnerId(owner?.user?._id || null);
    } catch (error) {
      toast.error('Failed to load workspace members');
    } finally {
      setLoadingMembers(false);
    }
  }, [currentWorkspace?._id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Departments/roles for the Invite Member modal's dropdowns — this page
  // never needed either before now.
  useEffect(() => {
    if (!currentWorkspace?._id) return;
    departmentStore.loadDepartments();
    loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?._id]);

  useEffect(() => {
    setNameInput(currentWorkspace?.name || '');
  }, [currentWorkspace?.name]);

  const otherMembers = useMemo(() => members.filter((m) => m.user._id !== user?.id), [members, user?.id]);

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === currentWorkspace?.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await renameWorkspace(currentWorkspace._id, trimmed);
      toast.success('Workspace renamed');
      setEditingName(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to rename workspace');
    } finally {
      setSavingName(false);
    }
  };

  const handleIconFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (iconInputRef.current) iconInputRef.current.value = '';
    if (!file) return;

    const validationError = validateWorkspaceIconFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setUploadingIcon(true);
    try {
      await uploadWorkspaceIcon(currentWorkspace._id, file);
      toast.success('Workspace icon updated');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload icon');
    } finally {
      setUploadingIcon(false);
    }
  };

  const handleRemoveIcon = async () => {
    setRemovingIcon(true);
    try {
      await removeWorkspaceIcon(currentWorkspace._id);
      toast.success('Restored the default workspace icon');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove icon');
    } finally {
      setRemovingIcon(false);
    }
  };

  const handleLeave = async () => {
    if (!window.confirm(`Leave "${currentWorkspace?.name}"? You'll need to be re-added to rejoin.`)) return;
    setLeaving(true);
    try {
      await leaveWorkspace(currentWorkspace._id);
      toast.success('You left the workspace');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to leave workspace');
    } finally {
      setLeaving(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferTarget) return;
    setTransferring(true);
    try {
      await transferOwnership(currentWorkspace._id, transferTarget);
      toast.success('Ownership transferred');
      setShowTransfer(false);
      setTransferTarget('');
      await loadMembers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to transfer ownership');
    } finally {
      setTransferring(false);
    }
  };

  const handleDeactivate = async () => {
    if (deactivateInput.trim() !== currentWorkspace?.name) return;
    setDeactivating(true);
    try {
      await deactivateWorkspace(currentWorkspace._id);
      toast.success('Workspace deactivated');
      setShowDeactivate(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to deactivate workspace');
    } finally {
      setDeactivating(false);
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} />
      </div>
    );
  }

  return (
    <div className={`min-h-full ${isDarkMode ? 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black' : 'bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-100'}`}>
      <main className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="relative group flex-shrink-0">
              {currentWorkspace.icon?.url ? (
                <img
                  src={currentWorkspace.icon.mediumUrl || currentWorkspace.icon.url}
                  srcSet={!currentWorkspace.icon.isSvg ? [
                    currentWorkspace.icon.smallUrl && `${currentWorkspace.icon.smallUrl} 64w`,
                    currentWorkspace.icon.mediumUrl && `${currentWorkspace.icon.mediumUrl} 128w`,
                    currentWorkspace.icon.largeUrl && `${currentWorkspace.icon.largeUrl} 256w`,
                  ].filter(Boolean).join(', ') : undefined}
                  sizes="48px"
                  alt={currentWorkspace.name}
                  loading="lazy"
                  className="w-12 h-12 rounded-xl object-contain shadow-lg"
                  style={{ backgroundColor: 'var(--color-bg-muted)' }}
                />
              ) : (
                <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg w-12 h-12 flex items-center justify-center">
                  <Briefcase className="text-white" size={22} />
                </div>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => iconInputRef.current?.click()}
                  disabled={uploadingIcon}
                  title="Change workspace icon"
                  className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                >
                  {uploadingIcon ? <Loader size={16} className="animate-spin text-white" /> : <ImagePlus size={16} className="text-white" />}
                </button>
              )}
              {isAdmin && (
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  onChange={handleIconFileChange}
                  className="hidden"
                />
              )}
            </div>
            {editingName ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  maxLength={100}
                  className={`text-2xl font-bold px-2 py-1 rounded-lg border outline-none focus:ring-2 focus:ring-emerald-500/30 ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                />
                <button onClick={handleSaveName} disabled={savingName} className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60">
                  {savingName ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}
                </button>
                <button onClick={() => { setEditingName(false); setNameInput(currentWorkspace.name); }} className="p-2 rounded-lg border" style={{ borderColor: 'var(--color-border-default)' }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className={`text-2xl sm:text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{currentWorkspace.name}</h1>
                {isAdmin && (
                  <button
                    onClick={() => setEditingName(true)}
                    className="p-1.5 rounded-lg hover:bg-gray-500/10 transition-colors"
                    title="Rename workspace"
                  >
                    <Pencil size={16} style={{ color: 'var(--color-text-muted)' }} />
                  </button>
                )}
              </div>
            )}
          </div>
          <p className={`text-sm ml-1 capitalize ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {members.length} member{members.length !== 1 ? 's' : ''} · Your role: {isOwner ? 'Owner' : user?.role}
          </p>
          {isAdmin && currentWorkspace.icon?.url && (
            <button
              type="button"
              onClick={handleRemoveIcon}
              disabled={removingIcon}
              className="text-xs ml-1 mt-1.5 flex items-center gap-1 hover:underline disabled:opacity-60"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {removingIcon ? <Loader size={11} className="animate-spin" /> : <RotateCcw size={11} />}
              Restore default icon
            </button>
          )}
        </motion.div>

        <WorkspaceSetupBanner variant="full" />

        {/* Members */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border shadow-sm mb-6 ${isDarkMode ? 'bg-gray-800/80 border-gray-700' : 'bg-white border-gray-100'}`}
        >
          <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <h2 className={`font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              <Users size={18} className="text-emerald-500" />
              Members
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-xs hidden sm:inline" style={{ color: 'var(--color-text-muted)' }}>
                Role changes & removal: HR Panel
              </span>
              <PermissionGate permission="canInviteMembers">
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-emerald-600 hover:bg-emerald-700 transition-colors"
                >
                  <UserPlus size={14} />
                  Invite Member
                </button>
              </PermissionGate>
            </div>
          </div>

          {/* Adding members is available here too now (see InviteMemberModal
              above) — but role changes and removal still live exclusively
              in HR Panel, so there's exactly one place for those instead of
              two that could drift apart. */}
          <div className="p-2">
            {loadingMembers ? (
              <div className="flex justify-center py-10">
                <Loader size={20} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
              </div>
            ) : (
              members.map((m) => {
                const BadgeIcon = roleBadgeIcon(m.role);
                const isSelf = m.user._id === user?.id;
                return (
                  <div key={m._id} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-500/5 transition-colors">
                    <Avatar src={m.user.avatar} name={m.user.name} size="md" role={m.role} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold flex items-center gap-1.5 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {m.user.name} {isSelf && <span className="text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>(you)</span>}
                        {m.isOwner && (
                          <span className="flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                            <Crown size={10} /> Owner
                          </span>
                        )}
                      </div>
                      <div className="text-xs truncate flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                        <Mail size={11} /> {m.user.email}
                      </div>
                    </div>

                    <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg capitalize" style={{ backgroundColor: 'var(--color-bg-muted)', color: 'var(--color-text-secondary)' }}>
                      {BadgeIcon && <BadgeIcon size={12} />}
                      {m.role}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* Danger Zone */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border-2 border-red-500/20 shadow-sm ${isDarkMode ? 'bg-red-500/5' : 'bg-red-50/50'}`}
        >
          <div className="p-5 border-b border-red-500/10">
            <h2 className="font-bold flex items-center gap-2 text-red-500">
              <AlertTriangle size={18} />
              Exit
            </h2>
          </div>

          <div className="p-5 space-y-4">
            {isOwner ? (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Transfer ownership</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Hand this workspace to another member. They'll be promoted to admin.</p>
                  </div>
                  <button
                    onClick={() => setShowTransfer((v) => !v)}
                    disabled={otherMembers.length === 0}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
                  >
                    <ArrowLeftRight size={15} />
                    Transfer
                  </button>
                </div>
                {showTransfer && (
                  <div className="flex items-center gap-2 pl-1">
                    <select
                      value={transferTarget}
                      onChange={(e) => setTransferTarget(e.target.value)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm outline-none ${isDarkMode ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}
                    >
                      <option value="">Select a member...</option>
                      {otherMembers.map((m) => (
                        <option key={m._id} value={m.user._id}>{m.user.name} ({m.role})</option>
                      ))}
                    </select>
                    <button
                      onClick={handleTransfer}
                      disabled={!transferTarget || transferring}
                      className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50"
                    >
                      {transferring ? <Loader size={14} className="animate-spin" /> : 'Confirm'}
                    </button>
                  </div>
                )}

                <div className="h-px" style={{ backgroundColor: 'var(--color-border-subtle)' }} />

                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Deactivate workspace</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Hides it from every member's switcher. Reversible only by an administrator.</p>
                  </div>
                  <button
                    onClick={() => setShowDeactivate((v) => !v)}
                    disabled={workspaces.length <= 1}
                    title={workspaces.length <= 1 ? 'You cannot deactivate your only workspace' : ''}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    <Trash2 size={15} />
                    Deactivate
                  </button>
                </div>
                {showDeactivate && (
                  <div className="pl-1 space-y-2">
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Type <span className="font-mono font-bold">{currentWorkspace.name}</span> to confirm.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        value={deactivateInput}
                        onChange={(e) => setDeactivateInput(e.target.value)}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm outline-none ${isDarkMode ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}
                      />
                      <button
                        onClick={handleDeactivate}
                        disabled={deactivateInput.trim() !== currentWorkspace.name || deactivating}
                        className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50"
                      >
                        {deactivating ? <Loader size={14} className="animate-spin" /> : 'Deactivate'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Leave workspace</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>You'll lose access until an admin adds you back.</p>
                </div>
                <button
                  onClick={handleLeave}
                  disabled={leaving || workspaces.length <= 1}
                  title={workspaces.length <= 1 ? 'You cannot leave your only workspace' : ''}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {leaving ? <Loader size={15} className="animate-spin" /> : <LogOut size={15} />}
                  Leave
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </main>

      <InviteMemberModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        workspaceId={currentWorkspace?._id}
        departmentOptions={departmentStore.departments}
        roleOptions={activeRoles}
        onInvited={() => loadMembers()}
      />
    </div>
  );
};

export default WorkspaceSettingsPage;
