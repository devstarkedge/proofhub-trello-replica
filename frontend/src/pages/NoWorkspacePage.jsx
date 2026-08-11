import React, { useContext, useEffect, useState, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, UserPlus } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';

const CreateWorkspaceWizard = lazy(() => import('../components/Workspace/CreateWorkspaceWizard/CreateWorkspaceWizard'));

/**
 * Shown when an authenticated user belongs to zero workspaces — a state a
 * plain self-registration never produces today (it always auto-joins the
 * default workspace), but a removed/left-every-workspace user, or a future
 * registration path, legitimately can. Mirrors SelectWorkspacePage.jsx's
 * own-auth-check pattern since, like that page, it must render outside
 * MainLayout (a sidebar full of workspace-scoped links makes no sense here).
 */
const NoWorkspacePage = () => {
  const { isAuthenticated, loading: authLoading } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const [showWizard, setShowWizard] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }
    // Landed here stale (e.g. back-button after joining) — leave immediately.
    if (currentWorkspace) {
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, currentWorkspace]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-6 sm:p-8 text-center"
      >
        <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
          <Building2 className="text-white" size={28} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Welcome!</h2>
        <p className="text-white/70 mb-8">
          You don&apos;t belong to any workspace yet. Create a workspace or join one using an invitation.
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all"
          >
            <Building2 size={17} />
            Create Workspace
          </button>
          <button
            type="button"
            onClick={() => navigate('/join')}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-semibold border border-white/20 text-white hover:bg-white/10 transition-colors"
          >
            <UserPlus size={17} />
            Join Workspace
          </button>
        </div>
      </motion.div>

      <Suspense fallback={null}>
        <CreateWorkspaceWizard
          isOpen={showWizard}
          onClose={() => setShowWizard(false)}
          onCreated={() => navigate('/', { replace: true })}
        />
      </Suspense>
    </div>
  );
};

export default NoWorkspacePage;
