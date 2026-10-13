import React, { useContext, useEffect, lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, LogOut, Plus } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';

const CreateWorkspaceWizard = lazy(() =>
  import('../components/Workspace/CreateWorkspaceWizard/CreateWorkspaceWizard')
);

/**
 * Shown when an authenticated user has no workspace memberships yet — per
 * the enterprise-invite-only model this should almost never happen (every
 * membership normally comes from creating a workspace or accepting an
 * invitation). There is no self-service "join" affordance here — joining
 * an existing workspace always requires an emailed /invite/:token link, so
 * this page only offers creating a new one, plus guidance to contact an
 * admin. Also auto-opens the CreateWorkspaceWizard if the user comes from
 * the WorkspaceSwitcher "Create Workspace" flow (via sessionStorage flag).
 */
const NoWorkspacePage = () => {
  const navigate = useNavigate();
  const { user, logoutUser } = useContext(AuthContext);
  const { workspaces, loadWorkspaces } = useContext(WorkspaceContext);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // If user already has workspaces (e.g. after creation), redirect them
  useEffect(() => {
    if (workspaces && workspaces.length > 0) {
      navigate('/', { replace: true });
    }
  }, [workspaces, navigate]);

  // Handle flowtask_pending_action from a previous "Create Workspace" CTA
  useEffect(() => {
    if (sessionStorage.getItem('flowtask_pending_action') === 'create-workspace') {
      sessionStorage.removeItem('flowtask_pending_action');
      setShowCreateModal(true);
    }
  }, []);

  const handleLogout = () => {
    logoutUser();
    navigate('/login', { replace: true });
  };

  const handleCreated = async () => {
    setShowCreateModal(false);
    await loadWorkspaces();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2" />
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
          <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500" />

          <div className="p-8 text-center">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.5, delay: 0.1, type: 'spring' }}
              className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-600/30"
            >
              <Building2 size={36} className="text-white" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {user?.name && (
                <p className="text-emerald-400 text-sm font-semibold mb-2">
                  Welcome, {user.name}! 👋
                </p>
              )}
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">
                You're not in any workspace yet
              </h1>
              <p className="text-white/60 text-sm sm:text-base leading-relaxed mb-8">
                If you were expecting to join a team, check your email for an invitation link,
                or contact your workspace administrator. Otherwise, you can create your own
                workspace below.
              </p>
            </motion.div>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-3"
            >
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                id="no-workspace-create-btn"
                className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/35 hover:-translate-y-0.5"
              >
                <Plus size={18} />
                Create a New Workspace
              </button>
            </motion.div>

            {/* Divider */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="text-white/40 text-xs mb-3">
                Signed in as <span className="text-white/60">{user?.email}</span>
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mx-auto"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          </div>
        </div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-2"
        >
          {['Project Management', 'Team Collaboration', 'HR & Roles', 'Chat & Reports'].map((feat) => (
            <span
              key={feat}
              className="px-3 py-1 text-xs font-medium rounded-full border border-white/15 text-white/50 backdrop-blur-sm"
            >
              {feat}
            </span>
          ))}
        </motion.div>
      </motion.div>

      {/* Create Workspace Wizard modal */}
      <Suspense fallback={null}>
        <CreateWorkspaceWizard
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      </Suspense>

      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2 { animation-delay: 2s; }
      `}</style>
    </div>
  );
};

export default NoWorkspacePage;
