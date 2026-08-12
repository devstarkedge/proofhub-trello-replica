import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Briefcase, Users, MessageSquare, BarChart3, ShieldCheck, Zap,
  ListTodo, ArrowRight, Check, Star, Menu, X
} from 'lucide-react';
import useThemeStore from '../store/themeStore';

const FEATURES = [
  {
    icon: Briefcase,
    label: 'Project Management',
    description: 'Kanban boards, Gantt charts, and project tracking in one place.',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    icon: ListTodo,
    label: 'Task Management',
    description: 'Assign, track, and complete tasks with subtasks and deadlines.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Users,
    label: 'HR & Teams',
    description: 'Manage departments, members, roles and team performance.',
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: MessageSquare,
    label: 'Chat & Messaging',
    description: 'Real-time team communication and announcements.',
    color: 'from-pink-500 to-rose-500',
  },
  {
    icon: BarChart3,
    label: 'Reports & Finance',
    description: 'Analytics, finance pages, and PM sheet reporting.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: ShieldCheck,
    label: 'Workspace Isolation',
    description: 'Complete data isolation between workspaces. Enterprise-grade security.',
    color: 'from-lime-500 to-green-500',
  },
];



/**
 * Public marketing landing page — shown at `/` for unauthenticated visitors.
 * Premium Slack-inspired design with navigation, hero, features, and footer.
 */
const LandingPage = () => {
  const { effectiveMode } = useThemeStore();
  const isDark = effectiveMode === 'dark';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const textPrimary = isDark ? '#f8fafc' : '#0f172a';
  const textSecondary = isDark ? '#94a3b8' : '#475569';
  const bgDefault = isDark ? '#0f1117' : '#ffffff';
  const bgCard = isDark ? '#1e2433' : '#f8fafc';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <div style={{ backgroundColor: bgDefault, color: textPrimary, minHeight: '100vh' }}>
      {/* ─── NAVIGATION ─────────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: scrolled
            ? isDark ? 'rgba(15,17,23,0.92)' : 'rgba(255,255,255,0.92)'
            : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? `1px solid ${borderColor}` : 'none',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex-shrink-0">
              <img
                src={isDark ? '/LogoDark.svg' : '/Logo.svg'}
                alt="FlowTask"
                className="h-8 w-auto object-contain"
              />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-8">
              {['Features', 'Pricing', 'About', 'Contact'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className="text-sm font-medium transition-colors hover:text-emerald-500"
                  style={{ color: textSecondary }}
                >
                  {item}
                </a>
              ))}
            </nav>

            {/* CTA buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Link
                to="/login"
                className="text-sm font-semibold px-4 py-2 rounded-xl transition-colors hover:bg-gray-500/10"
                style={{ color: textPrimary }}
              >
                Sign In
              </Link>
              <Link
                to="/create-workspace"
                className="text-sm font-semibold px-4 py-2 rounded-xl text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg shadow-emerald-600/20"
              >
                Get Started
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg transition-colors hover:bg-gray-500/10"
              style={{ color: textPrimary }}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden border-t"
            style={{
              backgroundColor: bgDefault,
              borderColor,
            }}
          >
            <div className="px-4 py-4 space-y-2">
              {['Features', 'Pricing', 'About', 'Contact'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-sm font-medium py-2 px-3 rounded-lg transition-colors hover:bg-gray-500/10"
                  style={{ color: textSecondary }}
                >
                  {item}
                </a>
              ))}
              <div className="pt-2 border-t space-y-2" style={{ borderColor }}>
                <Link
                  to="/login"
                  className="block text-sm font-semibold py-2.5 px-3 rounded-xl text-center transition-colors border"
                  style={{ color: textPrimary, borderColor }}
                >
                  Sign In
                </Link>
                <Link
                  to="/create-workspace"
                  className="block text-sm font-semibold py-2.5 px-3 rounded-xl text-center text-white bg-gradient-to-r from-emerald-600 to-teal-600"
                >
                  Create Workspace
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </header>

      {/* ─── HERO ────────────────────────────────────────────────────────────── */}
      <section className="pt-28 pb-20 sm:pt-36 sm:pb-28 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border mb-6"
            style={{
              borderColor: 'rgba(16,185,129,0.4)',
              backgroundColor: 'rgba(16,185,129,0.08)',
              color: '#10b981',
            }}
          >
            <Zap size={11} />
            Enterprise-ready workspace management
            <Zap size={11} />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight mb-6"
            style={{ color: textPrimary }}
          >
            Manage your team, projects,{' '}
            <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
              HR &amp; workflows
            </span>{' '}
            from one powerful workspace.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="text-lg sm:text-xl max-w-2xl mx-auto mb-10"
            style={{ color: textSecondary }}
          >
            FlowTask brings everything your organization needs into a single, isolated workspace —
            with room for every team you run. Invite your team, ship faster.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8"
          >
            <Link
              to="/create-workspace"
              id="hero-create-workspace-btn"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all shadow-xl shadow-emerald-600/25 hover:shadow-emerald-600/40 hover:-translate-y-0.5"
            >
              <Zap size={18} />
              Create Workspace
              <ArrowRight size={16} />
            </Link>
          </motion.div>

          {/* Already have account */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="text-sm"
            style={{ color: textSecondary }}
          >
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-emerald-500 hover:text-emerald-400 transition-colors">
              Sign in &rarr;
            </Link>
          </motion.p>
        </div>
      </section>

      {/* ─── FEATURES ────────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 sm:py-28 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-14">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border mb-4"
              style={{ borderColor, color: textSecondary, backgroundColor: bgCard }}
            >
              <Star size={11} />
              Everything you need
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl sm:text-4xl font-extrabold mb-4"
              style={{ color: textPrimary }}
            >
              One workspace, infinite possibilities
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.05 }}
              className="text-base max-w-2xl mx-auto"
              style={{ color: textSecondary }}
            >
              Replace the chaos of multiple tools with a single, unified platform that
              grows with your team.
            </motion.p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.06 * i }}
                  className="group relative p-6 rounded-2xl border transition-all hover:-translate-y-1 hover:shadow-xl"
                  style={{
                    backgroundColor: bgCard,
                    borderColor,
                    boxShadow: isDark ? '0 0 0 0 transparent' : undefined,
                  }}
                >
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <h3 className="text-base font-bold mb-2" style={{ color: textPrimary }}>
                    {feature.label}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: textSecondary }}>
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── PRICING SECTION (placeholder) ───────────────────────────────────── */}
      <section id="pricing" className="py-16 px-4" style={{ backgroundColor: bgCard }}>
        <div className="max-w-3xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-extrabold mb-4"
            style={{ color: textPrimary }}
          >
            Simple, transparent pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-8 text-base"
            style={{ color: textSecondary }}
          >
            Start free. No credit card required. Upgrade when you're ready.
          </motion.p>
          <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl border text-sm font-semibold"
            style={{ borderColor, color: textPrimary, backgroundColor: isDark ? '#1e2433' : '#ffffff' }}>
            <Check size={16} className="text-emerald-500" />
            Free during beta — unlimited workspaces, unlimited members
          </div>
        </div>
      </section>

      {/* ─── BOTTOM CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl font-extrabold mb-5"
            style={{ color: textPrimary }}
          >
            Ready to get started?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
            className="mb-8 text-lg"
            style={{ color: textSecondary }}
          >
            Create your workspace in under a minute. No credit card required.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Link
              to="/create-workspace"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl text-base font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all shadow-xl shadow-emerald-600/25"
            >
              <Zap size={17} />
              Create Your Workspace
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ─── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="border-t py-10 px-4" style={{ borderColor }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src={isDark ? '/LogoDark.svg' : '/Logo.svg'}
                alt="FlowTask"
                className="h-7 w-auto object-contain opacity-70"
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-sm" style={{ color: textSecondary }}>
              <a href="#features" className="hover:text-emerald-500 transition-colors">Features</a>
              <a href="#pricing" className="hover:text-emerald-500 transition-colors">Pricing</a>
              <Link to="/create-workspace" className="hover:text-emerald-500 transition-colors">Create Workspace</Link>
              <Link to="/login" className="hover:text-emerald-500 transition-colors">Sign In</Link>
            </div>

            <p className="text-xs" style={{ color: textSecondary }}>
              &copy; {new Date().getFullYear()} FlowTask. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
