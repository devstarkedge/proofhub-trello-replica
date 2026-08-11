import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Briefcase, Loader, AlertCircle, LogIn, UserPlus, CheckCircle } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import { getInvitation, acceptInvitation } from '../services/invitationApi';

/**
 * The universal invitation-accept landing spot — /invite/:token. Covers
 * all three cases from the spec: already logged in (accept directly, email
 * must match), existing account not logged in (sign in first), brand new
 * user (register first) — registration/login both hand back off to this
 * exact URL to finish the accept.
 */
const InvitePage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useContext(AuthContext);
  const { loadWorkspaces, switchWorkspace } = useContext(WorkspaceContext);

  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInvitation(token)
      .then((data) => { if (!cancelled) setInvitation(data); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || 'This invitation is invalid or has expired'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const emailMatches = isAuthenticated && invitation &&
    String(user?.email || '').toLowerCase() === invitation.email.toLowerCase();

  const handleAccept = useCallback(async () => {
    setAccepting(true);
    try {
      const { workspace } = await acceptInvitation(token);
      await loadWorkspaces();
      await switchWorkspace(workspace);
      toast.success('Welcome! You have successfully joined the workspace.', {
        icon: <CheckCircle className="text-green-500" size={20} />,
      });
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to accept the invitation');
      setAccepting(false);
    }
  }, [token, loadWorkspaces, switchWorkspace, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-6 sm:p-8 text-center"
      >
        {loading ? (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader className="animate-spin text-white/70" size={28} />
            <p className="text-white/70 text-sm">Checking your invitation...</p>
          </div>
        ) : error || !invitation ? (
          <>
            <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <AlertCircle className="text-red-300" size={28} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Invitation Invalid</h2>
            <p className="text-white/70 mb-6">{error || 'This invitation is invalid or has expired.'}</p>
            <Link
              to="/join"
              className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold border border-white/20 text-white hover:bg-white/10 transition-colors"
            >
              Request a new invitation
            </Link>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Briefcase className="text-white" size={28} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Join {invitation.workspace.name}
            </h2>
            <p className="text-white/70 mb-8">
              You&apos;ve been invited to join <strong>{invitation.workspace.name}</strong> as <strong>{invitation.email}</strong>.
            </p>

            {isAuthenticated ? (
              emailMatches ? (
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 transition-all"
                >
                  {accepting ? <Loader size={16} className="animate-spin" /> : <CheckCircle size={17} />}
                  {accepting ? 'Joining...' : 'Accept Invitation'}
                </button>
              ) : (
                <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
                  This invitation was sent to <strong>{invitation.email}</strong>, but you&apos;re signed in as{' '}
                  <strong>{user?.email}</strong>. Sign out and sign in with the invited email to accept it.
                </p>
              )
            ) : invitation.accountExists ? (
              <button
                type="button"
                onClick={() => navigate(`/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all"
              >
                <LogIn size={17} />
                Sign In to Accept
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate(`/register?inviteToken=${token}`)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all"
              >
                <UserPlus size={17} />
                Create Account & Join
              </button>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
};

export default InvitePage;
