import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  Briefcase, Loader, AlertCircle, LogIn, UserPlus, CheckCircle,
  Eye, EyeOff, User, Lock, Clock, Shield
} from 'lucide-react';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import { getInvitation, acceptInvitation } from '../services/invitationApi';
import { validateForm } from '../utils/validationUtils';

const formatExpiry = (expiresAt) => {
  const diffMs = new Date(expiresAt) - new Date();
  if (diffMs <= 0) return 'Expired';
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days >= 1) return `Expires in ${days} day${days > 1 ? 's' : ''}`;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours >= 1) return `Expires in ${hours} hour${hours > 1 ? 's' : ''}`;
  return 'Expires soon';
};

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Minimal workspace icon renderer, matching WorkspaceSwitcher.jsx's own
// SVG-vs-raster handling — kept local since that one isn't exported.
const WorkspaceIcon = ({ icon, name }) => {
  if (!icon?.url) {
    return (
      <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
        <Briefcase className="text-white" size={28} />
      </div>
    );
  }
  return (
    <div className="w-16 h-16 rounded-2xl mx-auto mb-5 shadow-lg overflow-hidden bg-white flex items-center justify-center">
      <img src={icon.mediumUrl || icon.url} alt={name} className="w-full h-full object-contain" />
    </div>
  );
};

/**
 * The universal, and only, invitation-accept entry point — /invite/:token.
 * Account creation and sign-in for an invited user both happen inline here
 * (no navigation to a separate /register or /login page) — there is no
 * public self-registration path in this app; every account comes from
 * either this flow or /create-workspace.
 */
const InvitePage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user, register, login, loginUser } = useContext(AuthContext);
  const { loadWorkspaces, switchWorkspace } = useContext(WorkspaceContext);

  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  // Set when this invitation's requiresApproval flag routed acceptance into
  // a pending WorkspaceJoinRequest instead of an immediate membership — see
  // invitationService.js#acceptInvitation. No workspace to switch into yet,
  // so this replaces the normal accept/signup UI instead of redirecting home.
  const [pendingApproval, setPendingApproval] = useState(false);

  // Brand-new user — inline signup
  const [signupForm, setSignupForm] = useState({ name: '', password: '', confirmPassword: '' });
  const [signupErrors, setSignupErrors] = useState({});
  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Existing account, not logged in — inline sign-in
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

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
      const result = await acceptInvitation(token);
      if (result.outcome === 'pending_approval') {
        // No membership exists yet — must NOT loadWorkspaces/switchWorkspace
        // (there's nothing there to switch into) or navigate home.
        setPendingApproval(true);
        setAccepting(false);
        return;
      }
      await loadWorkspaces();
      await switchWorkspace(result.workspace);
      toast.success('Welcome! You have successfully joined the workspace.', {
        icon: <CheckCircle className="text-green-500" size={20} />,
      });
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to accept the invitation');
      setAccepting(false);
    }
  }, [token, loadWorkspaces, switchWorkspace, navigate]);

  const handleSignupChange = (field, value) => {
    setSignupForm((prev) => ({ ...prev, [field]: value }));
    setSignupErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    const { isValid, errors } = validateForm(signupForm, ['name', 'password', 'confirmPassword']);
    setSignupErrors(errors);
    if (!isValid) return;

    setSignupSubmitting(true);
    try {
      // invitation.email is fixed, read-only, and sourced entirely from the
      // server-fetched invitation — there is no editable email field for a
      // user (or attacker) to redirect this account to a different address.
      // register()'s inviteToken branch creates the user AND accepts the
      // invitation server-side in one call — never call acceptInvitation()
      // again after this succeeds, the invite is already consumed.
      const result = await register(signupForm.name, invitation.email, signupForm.password, undefined, token);
      // A real session exists either way — they do have an account now —
      // but only navigate home when a membership actually exists.
      loginUser(result.user, result.token);
      if (result.outcome === 'pending_approval') {
        setPendingApproval(true);
        setSignupSubmitting(false);
        return;
      }
      toast.success('Welcome! You have successfully joined the workspace.', {
        icon: <CheckCircle className="text-green-500" size={20} />,
      });
      navigate('/', { replace: true });
    } catch (err) {
      let message = 'Failed to create your account. Please try again.';
      if (err.response?.data?.message) {
        message = err.response.data.message;
      }
      setSignupErrors((prev) => ({ ...prev, submit: message }));
      setSignupSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginPassword) {
      setLoginError('Password is required');
      return;
    }
    setLoginSubmitting(true);
    setLoginError('');
    try {
      // The real login() — bcrypt-checked against the actual account. Email
      // is always invitation.email (never a form field), so a successful
      // login here guarantees emailMatches by construction.
      await login(invitation.email, loginPassword);
      await handleAccept();
    } catch (err) {
      let message = 'Invalid password. Please try again.';
      const serverMessage = err.response?.data?.message?.toLowerCase() || '';
      if (serverMessage.includes('deactivated')) {
        message = 'Your account has been deactivated. Please contact support.';
      } else if (err.response?.data?.message && !serverMessage.includes('invalid credentials')) {
        message = err.response.data.message;
      }
      setLoginError(message);
      setLoginSubmitting(false);
    }
  };

  const inputCls = (hasError) =>
    `w-full pl-11 pr-11 py-3 bg-white/10 border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent backdrop-blur-sm transition-all text-sm ${
      hasError ? 'border-red-400/60 bg-red-500/10' : 'border-white/20 hover:border-white/30'
    }`;

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
        ) : pendingApproval ? (
          <>
            <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Clock className="text-amber-300" size={28} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Request Submitted</h2>
            <p className="text-white/70 mb-6">
              Your request to join <strong>{invitation.workspace.name}</strong> is pending approval.
              You&apos;ll be notified as soon as an admin reviews it.
            </p>
            <Link
              to="/login"
              className="inline-block text-sm font-semibold text-emerald-300 hover:text-emerald-200 transition-colors"
            >
              Back to sign in
            </Link>
          </>
        ) : error || !invitation ? (
          <>
            <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <AlertCircle className="text-red-300" size={28} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Invitation Invalid</h2>
            <p className="text-white/70 mb-6">{error || 'This invitation is invalid or has expired.'}</p>
            <p className="text-sm text-white/50 mb-4">
              Ask whoever invited you to send a new invitation link.
            </p>
            <Link
              to="/login"
              className="inline-block text-sm font-semibold text-emerald-300 hover:text-emerald-200 transition-colors"
            >
              Sign in instead
            </Link>
          </>
        ) : (
          <>
            <WorkspaceIcon icon={invitation.workspace.icon} name={invitation.workspace.name} />
            <h2 className="text-2xl font-bold text-white mb-2">
              Join {invitation.workspace.name}
            </h2>
            <p className="text-white/70 mb-3">
              {invitation.inviterName ? `${invitation.inviterName} invited` : "You've been invited to join"}{' '}
              <strong>{invitation.email}</strong> to <strong>{invitation.workspace.name}</strong>.
            </p>
            <div className="flex items-center justify-center gap-3 mb-7 text-xs text-white/50">
              {invitation.role && (
                <span className="flex items-center gap-1">
                  <Shield size={12} /> Role: <span className="text-white/70 font-medium">{capitalize(invitation.role)}</span>
                </span>
              )}
              {invitation.expiresAt && (
                <span className="flex items-center gap-1">
                  <Clock size={12} /> {formatExpiry(invitation.expiresAt)}
                </span>
              )}
            </div>
            {invitation.requiresApproval && (
              <p className="text-xs text-amber-200/80 -mt-4 mb-6">
                Joining requires approval from a workspace admin after you accept.
              </p>
            )}

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
              <form onSubmit={handleLoginSubmit} className="space-y-3.5 text-left">
                <p className="text-xs text-white/50 -mt-1 mb-1">Welcome back — sign in to accept.</p>
                <div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock size={16} className="text-white/40" />
                    </div>
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }}
                      className={inputCls(!!loginError)}
                      placeholder="Enter your password"
                      autoFocus
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-white/40 hover:text-white/70 transition-colors"
                    >
                      {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {loginError && (
                    <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle size={12} /> {loginError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loginSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 transition-all"
                >
                  {loginSubmitting ? <Loader size={16} className="animate-spin" /> : <LogIn size={17} />}
                  {loginSubmitting ? 'Signing in...' : 'Sign In & Join Workspace'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignupSubmit} className="space-y-3.5 text-left">
                <p className="text-xs text-white/50 -mt-1 mb-1">Create your account to join.</p>
                <div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User size={16} className="text-white/40" />
                    </div>
                    <input
                      type="text"
                      value={signupForm.name}
                      onChange={(e) => handleSignupChange('name', e.target.value)}
                      className={inputCls(!!signupErrors.name)}
                      placeholder="Full name"
                      autoFocus
                      autoComplete="name"
                    />
                  </div>
                  {signupErrors.name && (
                    <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle size={12} /> {signupErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock size={16} className="text-white/40" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={signupForm.password}
                      onChange={(e) => handleSignupChange('password', e.target.value)}
                      className={inputCls(!!signupErrors.password)}
                      placeholder="Create a password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-white/40 hover:text-white/70 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {signupErrors.password && (
                    <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle size={12} /> {signupErrors.password}
                    </p>
                  )}
                </div>

                <div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock size={16} className="text-white/40" />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={signupForm.confirmPassword}
                      onChange={(e) => handleSignupChange('confirmPassword', e.target.value)}
                      className={inputCls(!!signupErrors.confirmPassword)}
                      placeholder="Confirm password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-white/40 hover:text-white/70 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {signupErrors.confirmPassword && (
                    <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle size={12} /> {signupErrors.confirmPassword}
                    </p>
                  )}
                </div>

                {signupErrors.submit && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle size={12} /> {signupErrors.submit}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={signupSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 transition-all"
                >
                  {signupSubmitting ? <Loader size={16} className="animate-spin" /> : <UserPlus size={17} />}
                  {signupSubmitting ? 'Creating account...' : 'Join Workspace'}
                </button>
              </form>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
};

export default InvitePage;
