import React, { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, ChevronRight } from "lucide-react";
import AuthContext from "../context/AuthContext";
import WorkspaceContext from "../context/WorkspaceContext";

/**
 * Shown only when an authenticated user belongs to 2+ workspaces and none
 * is yet active — single-workspace users (everyone immediately after the
 * workspace migration ships) never see this page; they're auto-selected in
 * WorkspaceContext.loadWorkspaces() instead.
 */
const SelectWorkspacePage = () => {
  const { isAuthenticated, loading: authLoading } = useContext(AuthContext);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-6 sm:p-8"
      >
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Select a Workspace</h2>
        <p className="text-white/70 text-center mb-6">
          Choose which workspace you'd like to work in.
        </p>

        {loading && workspaces.length === 0 ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {workspaces.map((workspace) => (
              <button
                key={workspace._id}
                onClick={() => handleSelect(workspace)}
                disabled={switching === workspace._id}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-left transition-all disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/30 flex items-center justify-center">
                    <Building2 size={18} className="text-white" />
                  </div>
                  <div>
                    <div className="text-white font-medium">{workspace.name}</div>
                    <div className="text-white/50 text-sm capitalize">{workspace.role}</div>
                  </div>
                </div>
                {switching === workspace._id ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <ChevronRight size={18} className="text-white/50" />
                )}
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default SelectWorkspacePage;
