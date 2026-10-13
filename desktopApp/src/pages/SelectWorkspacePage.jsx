import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, ChevronRight, Plus, LogIn, Loader, LogOut, Sparkles } from "lucide-react";
import AuthContext from "../context/AuthContext";
import WorkspaceContext from "../context/WorkspaceContext";

/**
 * Shown only when an authenticated user belongs to 2+ workspaces and none
 * is yet active — single-workspace users are auto-selected in
 * WorkspaceContext.loadWorkspaces() and never see this page.
 *
 * Premium redesign with workspace cards, role badges, and CTA buttons.
 */
const SelectWorkspacePage = () => {
  const { isAuthenticated, loading: authLoading, user, logoutUser } = useContext(AuthContext);
  const { workspaces, loadWorkspaces, switchWorkspace, loading } = useContext(WorkspaceContext);
  const [switching, setSwitching] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }
    if (isAuthenticated) {
      loadWorkspaces();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated]);

  const handleSelect = async (workspace) => {
    setSwitching(workspace._id);
    try {
      await switchWorkspace(workspace);
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Error selecting workspace:", error);
      setSwitching(null);
    }
  };

  const handleLogout = () => {
    logoutUser();
    navigate("/login", { replace: true });
  };

  // Role badge color
  const roleBadge = (role) => {
    const map = {
      admin: { bg: 'bg-purple-500/20', text: 'text-purple-300', label: 'Admin' },
      owner: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', label: 'Owner' },
      manager: { bg: 'bg-blue-500/20', text: 'text-blue-300', label: 'Manager' },
      hr: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: 'HR' },
    };
    return map[role?.toLowerCase()] || { bg: 'bg-white/10', text: 'text-white/60', label: role || 'Member' };
  };

  // Generate initials for workspace avatar
  const getInitials = (name) => {
    return (name || '')
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  };

  // Avatar gradient based on name
  const getAvatarGradient = (name) => {
    const gradients = [
      'from-emerald-500 to-teal-600',
      'from-blue-500 to-cyan-600',
      'from-purple-500 to-violet-600',
      'from-rose-500 to-pink-600',
      'from-amber-500 to-orange-600',
      'from-lime-500 to-green-600',
    ];
    const hash = (name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return gradients[hash % gradients.length];
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10" />
        <div className="absolute bottom-10 right-10 w-64 h-64 bg-teal-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* Card */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
          {/* Gradient top bar */}
          <div className="h-1.5 bg-gradient-to-r from-purple-500 via-violet-500 to-blue-500" />

          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-purple-600/25">
                <Sparkles size={26} className="text-white" />
              </div>
              <h1 className="text-2xl font-extrabold text-white mb-2">Choose a Workspace</h1>
              <p className="text-white/60 text-sm">
                {user?.name && `Hi ${user.name}! `}Select the workspace you'd like to work in.
              </p>
            </div>

            {/* Workspace list */}
            {loading && workspaces.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-3">
                <Loader className="animate-spin text-white/50" size={24} />
                <p className="text-white/50 text-sm">Loading your workspaces...</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {workspaces.map((workspace, idx) => {
                  const badge = roleBadge(workspace.role);
                  const isSwitching = switching === workspace._id;
                  return (
                    <motion.button
                      key={workspace._id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * idx }}
                      onClick={() => handleSelect(workspace)}
                      disabled={!!switching}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group ${
                        isSwitching
                          ? 'border-white/30 bg-white/15'
                          : 'border-white/15 bg-white/5 hover:bg-white/15 hover:border-white/30 hover:-translate-y-0.5'
                      } disabled:cursor-wait`}
                    >
                      {/* Workspace icon or initials */}
                      {workspace.icon?.url ? (
                        <img
                          src={workspace.icon.smallUrl || workspace.icon.url}
                          alt={workspace.name}
                          className="w-12 h-12 rounded-xl object-contain flex-shrink-0"
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getAvatarGradient(workspace.name)} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                          <span className="text-white font-bold text-base">
                            {getInitials(workspace.name)}
                          </span>
                        </div>
                      )}

                      {/* Name and role */}
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold truncate text-sm sm:text-base">
                          {workspace.name}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                          {workspace.slug && (
                            <span className="text-white/30 text-xs truncate">{workspace.slug}</span>
                          )}
                        </div>
                      </div>

                      {/* Arrow / Loader */}
                      <div className="flex-shrink-0">
                        {isSwitching ? (
                          <Loader size={18} className="animate-spin text-white/70" />
                        ) : (
                          <ChevronRight size={18} className="text-white/30 group-hover:text-white/70 transition-colors" />
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-6 pt-5 border-t border-white/10 space-y-2.5">
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate('/no-workspace')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-white/15 text-white/70 text-sm font-medium hover:bg-white/10 hover:border-white/30 transition-all"
                >
                  <Plus size={15} />
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/join')}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-white/15 text-white/70 text-sm font-medium hover:bg-white/10 hover:border-white/30 transition-all"
                >
                  <LogIn size={15} />
                  Join
                </button>
              </div>

              <div className="text-center pt-1">
                <p className="text-white/30 text-xs mb-1.5">Signed in as {user?.email}</p>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mx-auto"
                >
                  <LogOut size={12} />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SelectWorkspacePage;
