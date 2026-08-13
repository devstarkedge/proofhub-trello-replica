import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  Building2, User, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft,
  Briefcase, Globe, AlertCircle, CheckCircle, Check, Loader,
  Sparkles, Users, ChevronDown
} from 'lucide-react';
import api from '../services/api';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import useThemeStore from '../store/themeStore';
import { validateField } from '../utils/validationUtils';

// Workspace type options
const WORKSPACE_TYPES = [
  { value: 'company', label: 'Company', description: 'For businesses and organizations', icon: Building2 },
  { value: 'team', label: 'Team', description: 'For a group or department', icon: Users },
];

const INDUSTRY_OPTIONS = [
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'retail_ecommerce', label: 'Retail & E-commerce' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'marketing_advertising', label: 'Marketing & Advertising' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'media_entertainment', label: 'Media & Entertainment' },
  { value: 'nonprofit', label: 'Nonprofit' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
];

const COMPANY_SIZE_OPTIONS = [
  { value: 'solo', label: 'Just me' },
  { value: '2-10', label: '2-10 people' },
  { value: '11-50', label: '11-50 people' },
  { value: '51-200', label: '51-200 people' },
  { value: '201-500', label: '201-500 people' },
  { value: '501-1000', label: '501-1000 people' },
  { value: '1000+', label: '1000+ people' },
];

// Auto-generate a URL slug from workspace name
function slugify(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Input field component
const Field = ({ label, required, error, children, hint }) => (
  <div>
    <label className="block text-sm font-semibold text-white/90 mb-1.5">
      {label} {required && <span className="text-red-400">*</span>}
    </label>
    {children}
    {hint && !error && <p className="mt-1.5 text-xs text-white/50">{hint}</p>}
    {error && (
      <motion.p
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-1.5 text-xs text-red-400 flex items-center gap-1"
      >
        <AlertCircle size={12} /> {error}
      </motion.p>
    )}
  </div>
);

const inputCls = (hasError) =>
  `w-full pl-11 pr-4 py-3 bg-white/10 border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent backdrop-blur-sm transition-all text-sm ${
    hasError ? 'border-red-400/60 bg-red-500/10' : 'border-white/20 hover:border-white/30'
  }`;

/**
 * Public Create Workspace page — the primary CTA destination from the landing
 * page. Combines Step 1 (workspace info) + Step 2 (owner account) into one
 * seamless flow, then calls POST /api/auth/register-workspace to create both
 * atomically and auto-logs the user in, landing them directly on the dashboard.
 */
const CreateWorkspacePublicPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loginUser } = useContext(AuthContext);
  const { loadWorkspaces } = useContext(WorkspaceContext);
  const { effectiveMode } = useThemeStore();

  // This page registers a brand-new owner account — an already-logged-in
  // visitor landing here (bookmark, stray link) would otherwise be able to
  // submit and create a second, unrelated account while still signed in as
  // someone else. Send them to the in-app wizard's entry point instead.
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — workspace info
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [workspaceType, setWorkspaceType] = useState('');
  const [industry, setIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [departmentName, setDepartmentName] = useState('');

  // Step 2 — owner account
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [step1Errors, setStep1Errors] = useState({});
  const [step2Errors, setStep2Errors] = useState({});

  // Auto-generate slug from workspace name
  const handleWorkspaceNameChange = (val) => {
    setWorkspaceName(val);
    if (!slugEdited) {
      setWorkspaceSlug(slugify(val));
    }
  };

  const handleSlugChange = (val) => {
    setSlugEdited(true);
    setWorkspaceSlug(slugify(val));
  };

  const needsIndustry = workspaceType === 'company';
  const needsCompanySize = workspaceType === 'company';
  const needsDepartment = workspaceType === 'company' || workspaceType === 'team';

  const validateStep1 = () => {
    const errors = {};
    if (!workspaceName.trim()) errors.workspaceName = 'Workspace name is required';
    if (!workspaceSlug || workspaceSlug.length < 3) errors.workspaceSlug = 'Workspace URL must be at least 3 characters';
    if (!workspaceType) errors.workspaceType = 'Please select a workspace type';
    if (needsIndustry && !industry) errors.industry = 'Industry is required for a company workspace';
    if (needsCompanySize && !companySize) errors.companySize = 'Company size is required';
    if (needsDepartment && !departmentName.trim()) errors.departmentName = 'Department name is required';
    setStep1Errors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateStep2 = () => {
    const errors = {};
    if (!ownerName.trim() || ownerName.trim().length < 2) errors.ownerName = 'Full name must be at least 2 characters';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Please enter a valid email address';
    const passwordError = validateField('password', password);
    if (passwordError) errors.password = passwordError;
    if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
    setStep2Errors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleStep1Continue = () => {
    if (validateStep1()) setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep2()) return;

    setSubmitting(true);
    try {
      const res = await api.post('/api/auth/register-workspace', {
        name: ownerName.trim(),
        email: email.trim().toLowerCase(),
        password,
        workspaceName: workspaceName.trim(),
        workspaceSlug: workspaceSlug || undefined,
        workspaceType,
        industry: industry || undefined,
        companySize: companySize || undefined,
        departmentName: departmentName.trim() || undefined,
      });

      const { token, user, workspace } = res.data;

      // Store token + workspaceId before loginUser so api interceptor has them
      localStorage.setItem('token', token);
      localStorage.setItem('workspaceId', workspace._id);

      loginUser(user, token);

      // Load workspaces so context is populated
      await loadWorkspaces();

      toast.success(`Workspace "${workspace.name}" created! Welcome aboard.`, {
        icon: <CheckCircle className="text-green-500" size={20} />,
        autoClose: 3000,
      });

      navigate('/', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create workspace. Please try again.';
      if (msg.toLowerCase().includes('email')) {
        setStep2Errors((prev) => ({ ...prev, email: msg }));
        setStep(2);
      } else if (msg.toLowerCase().includes('url') || msg.toLowerCase().includes('slug')) {
        setStep1Errors((prev) => ({ ...prev, workspaceSlug: msg }));
        setStep(1);
      } else {
        toast.error(msg, { icon: <AlertCircle className="text-red-500" size={20} /> });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const stepVariants = {
    enter: (dir) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
    center: { opacity: 1, x: 0 },
    exit: (dir) => ({ opacity: 0, x: dir > 0 ? -40 : 40 }),
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-15 animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '4s' }} />
      </div>

      {/* Back to landing */}
      <div className="relative w-full max-w-lg mb-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-white/60 hover:text-white/90 transition-colors text-sm">
          <ArrowLeft size={16} />
          Back to home
        </Link>
        <img
          src={effectiveMode === 'dark' ? '/LogoDark.svg' : '/Logo.svg'}
          alt="FlowTask"
          className="h-7 w-auto object-contain opacity-80"
        />
      </div>

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-lg"
      >
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
                <Sparkles size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Create Your Workspace</h1>
                <p className="text-white/70 text-xs">Step {step} of 2 — {step === 1 ? 'Workspace Setup' : 'Your Account'}</p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-4 bg-white/20 rounded-full h-1.5">
              <motion.div
                className="bg-white rounded-full h-1.5"
                initial={{ width: '50%' }}
                animate={{ width: step === 1 ? '50%' : '100%' }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>

          {/* Step Content */}
          <div className="p-6">
            <AnimatePresence mode="wait" custom={step === 1 ? -1 : 1}>
              {step === 1 ? (
                <motion.div
                  key="step1"
                  custom={-1}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <Field label="Workspace Name" required error={step1Errors.workspaceName}>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Building2 size={16} className="text-white/50" />
                      </div>
                      <input
                        type="text"
                        value={workspaceName}
                        onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                        className={inputCls(!!step1Errors.workspaceName)}
                        placeholder="Acme Inc."
                        autoFocus
                      />
                    </div>
                  </Field>

                  <Field
                    label="Workspace URL"
                    required
                    error={step1Errors.workspaceSlug}
                    hint="This is your workspace's unique URL identifier"
                  >
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Globe size={16} className="text-white/50" />
                      </div>
                      <input
                        type="text"
                        value={workspaceSlug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                        className={inputCls(!!step1Errors.workspaceSlug)}
                        placeholder="acme-inc"
                      />
                    </div>
                  </Field>

                  {/* Workspace Type */}
                  <Field label="Workspace Type" required error={step1Errors.workspaceType}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      {WORKSPACE_TYPES.map((type) => {
                        const Icon = type.icon;
                        const isSelected = workspaceType === type.value;
                        return (
                          <button
                            key={type.value}
                            type="button"
                            onClick={() => setWorkspaceType(type.value)}
                            className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 relative group overflow-hidden flex flex-col justify-between ${
                              isSelected
                                ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg shadow-emerald-500/10'
                                : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/15 hover:border-white/40'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full mb-3">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                  isSelected
                                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30 scale-105'
                                    : 'bg-white/15 text-white/90 group-hover:bg-white/25'
                                }`}
                              >
                                <Icon size={20} />
                              </div>
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                  isSelected
                                    ? 'bg-emerald-400 text-slate-900 scale-100 opacity-100'
                                    : 'border-2 border-white/30 opacity-40 group-hover:opacity-70'
                                }`}
                              >
                                {isSelected && <Check size={12} strokeWidth={3} />}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
                                {type.label}
                              </div>
                              <div
                                className={`text-xs leading-normal transition-colors ${
                                  isSelected ? 'text-emerald-100 font-medium' : 'text-white/70'
                                }`}
                              >
                                {type.description}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  {/* Industry (company only) */}
                  <AnimatePresence>
                    {needsIndustry && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <Field label="Industry" required error={step1Errors.industry}>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <Briefcase size={16} className="text-white/50" />
                            </div>
                            <select
                              value={industry}
                              onChange={(e) => setIndustry(e.target.value)}
                              className={`${inputCls(!!step1Errors.industry)} appearance-none`}
                            >
                              <option value="" className="bg-slate-800">Select industry...</option>
                              {INDUSTRY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value} className="bg-slate-800">{opt.label}</option>
                              ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
                          </div>
                        </Field>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Company size (company only) */}
                  <AnimatePresence>
                    {needsCompanySize && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <Field label="Company Size" required error={step1Errors.companySize}>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <Users size={16} className="text-white/50" />
                            </div>
                            <select
                              value={companySize}
                              onChange={(e) => setCompanySize(e.target.value)}
                              className={`${inputCls(!!step1Errors.companySize)} appearance-none`}
                            >
                              <option value="" className="bg-slate-800">Select team size...</option>
                              {COMPANY_SIZE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value} className="bg-slate-800">{opt.label}</option>
                              ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
                          </div>
                        </Field>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Department name (company + team) */}
                  <AnimatePresence>
                    {needsDepartment && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <Field
                          label="First Department Name"
                          required
                          error={step1Errors.departmentName}
                          hint="You can add more departments after setup"
                        >
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <Users size={16} className="text-white/50" />
                            </div>
                            <input
                              type="text"
                              value={departmentName}
                              onChange={(e) => setDepartmentName(e.target.value)}
                              className={inputCls(!!step1Errors.departmentName)}
                              placeholder="Engineering, Marketing, Sales..."
                            />
                          </div>
                        </Field>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="button"
                    onClick={handleStep1Continue}
                    className="w-full py-3.5 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20 mt-2"
                  >
                    Continue
                    <ArrowRight size={18} />
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  custom={1}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3 }}
                >
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <p className="text-white/60 text-sm mb-4">
                      Create your owner account to manage <strong className="text-white">{workspaceName}</strong>.
                    </p>

                    <Field label="Full Name" required error={step2Errors.ownerName}>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <User size={16} className="text-white/50" />
                        </div>
                        <input
                          type="text"
                          value={ownerName}
                          onChange={(e) => setOwnerName(e.target.value)}
                          className={inputCls(!!step2Errors.ownerName)}
                          placeholder="Jane Smith"
                          autoFocus
                        />
                      </div>
                    </Field>

                    <Field label="Email Address" required error={step2Errors.email}>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Mail size={16} className="text-white/50" />
                        </div>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value.replace(/\s/g, '').toLowerCase())}
                          className={inputCls(!!step2Errors.email)}
                          placeholder="jane@acme.com"
                          autoComplete="off"
                        />
                      </div>
                    </Field>

                    <Field label="Password" required error={step2Errors.password} hint="Min 6 chars with uppercase, lowercase, and number">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Lock size={16} className="text-white/50" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value.replace(/\s/g, ''))}
                          className={`${inputCls(!!step2Errors.password)} pr-11`}
                          placeholder="Create a strong password"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/40 hover:text-white/70 transition-colors"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </Field>

                    <Field label="Confirm Password" required error={step2Errors.confirmPassword}>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Lock size={16} className="text-white/50" />
                        </div>
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value.replace(/\s/g, ''))}
                          className={`${inputCls(!!step2Errors.confirmPassword)} pr-11`}
                          placeholder="Confirm your password"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/40 hover:text-white/70 transition-colors"
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </Field>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors text-sm font-medium"
                      >
                        <ArrowLeft size={16} />
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 py-3 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
                      >
                        {submitting ? (
                          <>
                            <Loader size={16} className="animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} />
                            Create Workspace
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 text-center">
            <p className="text-white/70 text-sm sm:text-base font-medium">
              Already have an account?{' '}
              <Link to="/login" className="text-emerald-400 hover:text-emerald-300 font-bold underline decoration-2 underline-offset-4 hover:underline-offset-2 transition-all">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>

      {/* Background animation styles */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.08; transform: scale(1); }
          50% { opacity: 0.15; transform: scale(1.05); }
        }
        .animate-pulse { animation: pulse 6s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default CreateWorkspacePublicPage;
