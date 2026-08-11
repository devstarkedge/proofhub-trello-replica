import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, AlertCircle } from 'lucide-react';

// A raw 64-char hex token (crypto.randomBytes(32).toString('hex') — see
// backend/modules/workspaces/invitationService.js) or a full /invite/<token> URL.
const extractToken = (input) => {
  const trimmed = input.trim();
  const match = trimmed.match(/invite\/([a-f0-9]{32,})/i);
  if (match) return match[1];
  if (/^[a-f0-9]{32,}$/i.test(trimmed)) return trimmed;
  return null;
};

/**
 * "Join via Invitation Link" — the only join method Phase 1 supports (an
 * invite-code entry point is explicitly a future enhancement per spec).
 * Just extracts the token from whatever the user pastes and hands off to
 * InvitePage, which does the actual validation.
 */
const JoinWorkspacePage = () => {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    const token = extractToken(value);
    if (!token) {
      setError("That doesn't look like a valid invitation link. Paste the full link from your invite email.");
      return;
    }
    navigate(`/invite/${token}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-6 sm:p-8"
      >
        <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg">
          <LogIn className="text-white" size={28} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Join a Workspace</h2>
        <p className="text-white/70 text-center mb-6">
          Paste the invitation link you received by email.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            placeholder="https://app.flowtask.com/invite/..."
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
          />
          {error && (
            <p className="text-sm text-red-300 flex items-center gap-1.5">
              <AlertCircle size={14} /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!value.trim()}
            className="w-full py-3.5 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Continue
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-white/70">
          Don&apos;t have an invitation?{' '}
          <Link to="/register?intent=create-workspace" className="font-semibold text-emerald-300 hover:text-emerald-200">
            Create a workspace
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default JoinWorkspacePage;
