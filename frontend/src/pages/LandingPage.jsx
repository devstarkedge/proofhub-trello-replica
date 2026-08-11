import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Briefcase, Users, MessageSquare, BarChart3, ShieldCheck, Zap } from 'lucide-react';
import useThemeStore from '../store/themeStore';

const FEATURES = [
  { icon: Briefcase, label: 'Projects & Tasks' },
  { icon: Users, label: 'HR & Teams' },
  { icon: MessageSquare, label: 'Chat' },
  { icon: BarChart3, label: 'Finance & Reports' },
  { icon: ShieldCheck, label: 'Workspace Isolation' },
  { icon: Zap, label: 'Real-time Everything' },
];

/**
 * Public marketing landing page — shown at `/` for unauthenticated
 * visitors (see PrivateRoute.jsx, which renders this instead of
 * redirecting to /login specifically for path "/"). Every other protected
 * route still redirects unauthenticated visitors to /login as before.
 */
const LandingPage = () => {
  const { effectiveMode } = useThemeStore();
  const isDark = effectiveMode === 'dark';

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--color-bg-default, var(--color-card-bg))' }}
    >
      <header className="flex items-center justify-between px-6 sm:px-10 py-5">
        <img
          src={isDark ? '/LogoDark.svg' : '/Logo.svg'}
          alt="FlowTask"
          className="h-9 w-auto object-contain"
        />
        <Link
          to="/login"
          className="text-sm font-semibold px-4 py-2 rounded-xl border transition-colors hover:bg-gray-500/5"
          style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
        >
          Sign In
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <h1
            className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Manage your team, projects, HR, chat and workflows from one powerful workspace.
          </h1>
          <p className="mt-5 text-base sm:text-lg" style={{ color: 'var(--color-text-secondary)' }}>
            FlowTask brings everything your organization needs into a single, isolated workspace —
            with room for every team you run.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register?intent=create-workspace"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg shadow-emerald-600/20"
            >
              Create Workspace
            </Link>
            <Link
              to="/join"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl text-sm font-semibold border transition-colors hover:bg-gray-500/5"
              style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}
            >
              Join Workspace
            </Link>
          </div>

          <p className="mt-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-emerald-500 hover:text-emerald-600">
              Sign In
            </Link>
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-16 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 max-w-3xl w-full"
        >
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
            <div
              key={feature.label}
              className="flex items-center gap-2.5 px-4 py-3.5 rounded-xl border text-left"
              style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-muted)' }}
            >
              <Icon size={18} className="text-emerald-500 flex-shrink-0" />
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{feature.label}</span>
            </div>
            );
          })}
        </motion.div>
      </main>

      <footer className="text-center text-xs pb-8" style={{ color: 'var(--color-text-muted)' }}>
        &copy; {new Date().getFullYear()} FlowTask. All rights reserved.
      </footer>
    </div>
  );
};

export default LandingPage;
