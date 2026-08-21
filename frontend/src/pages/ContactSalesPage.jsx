import React, { useContext, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { ArrowLeft, Building2, CheckCircle2, Loader, Mail, MapPin, MessageSquare, Sparkles, User, Users } from 'lucide-react';
import AuthContext from '../context/AuthContext';
import enterpriseInquiryService from '../services/enterpriseInquiryService';

const COMPANY_TYPES = [
  'Startup', 'Small Business', 'Mid-Market', 'Enterprise', 'Agency', 'Nonprofit', 'Government', 'Other',
];

const inputCls =
  'w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent backdrop-blur-sm transition-all text-sm hover:border-white/30';

/**
 * The Enterprise "Contact Sales" page. Reachable both from a logged-out
 * visitor (marketing pricing) and from the CreateWorkspaceWizard's Plan
 * step (handleSelectEnterprise) — Enterprise is never created through the
 * normal workspace-creation flow, this is the only path for it.
 *
 * idempotencyKey is minted once per page-load (useRef, not state) so a
 * network retry of the same submit click reuses it — the backend's
 * EnterpriseInquiry.idempotencyKey unique index is what actually guarantees
 * no duplicate inquiry/emails, this is just what makes the retry carry the
 * same key in the first place.
 */
const ContactSalesPage = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext) || {};
  const idempotencyKeyRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    membersInTeam: '',
    companyType: '',
    location: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const isValid = form.name.trim() && form.email.trim() && form.membersInTeam.trim() && form.companyType.trim() && form.location.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await enterpriseInquiryService.submit({
        name: form.name.trim(),
        email: form.email.trim(),
        membersInTeam: form.membersInTeam.trim(),
        companyType: form.companyType.trim(),
        location: form.location.trim(),
        message: form.message.trim(),
        idempotencyKey: idempotencyKeyRef.current,
      });
      setSubmitted(true);
      toast.success("Thanks! We've received your inquiry.");
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.errors?.[0]?.message || 'Something went wrong — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950">
      <div className="w-full max-w-2xl">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm mb-6 transition-colors"
        >
          <ArrowLeft size={15} /> Back
        </button>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-10 shadow-2xl"
        >
          {!submitted ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
                  <Sparkles size={12} /> Enterprise
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Let's build the right plan for you</h1>
              <p className="text-white/60 text-sm sm:text-[15px] leading-relaxed mb-1 max-w-xl">
                Built for teams that need more flexibility, scale, and support. Our sales team is available 24/7 to
                help you find the right setup. Send us your requirements and we'll get back to you shortly.
              </p>
              <p className="text-emerald-300/90 text-sm font-semibold mt-3 mb-7">
                Scale without limits. We'll build the right plan with you.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      type="text"
                      placeholder="Your name"
                      value={form.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      maxLength={100}
                      className={inputCls}
                      required
                    />
                  </div>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      type="email"
                      placeholder="Work email"
                      value={form.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      maxLength={254}
                      className={inputCls}
                      required
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <Users size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      type="text"
                      placeholder="Members in your team (e.g. 50-100)"
                      value={form.membersInTeam}
                      onChange={(e) => updateField('membersInTeam', e.target.value)}
                      maxLength={50}
                      className={inputCls}
                      required
                    />
                  </div>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <select
                      value={form.companyType}
                      onChange={(e) => updateField('companyType', e.target.value)}
                      className={`${inputCls} appearance-none`}
                      required
                    >
                      <option value="" disabled className="text-slate-900">Company type</option>
                      {COMPANY_TYPES.map((t) => (
                        <option key={t} value={t} className="text-slate-900">{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="relative">
                  <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    placeholder="Location (city, country)"
                    value={form.location}
                    onChange={(e) => updateField('location', e.target.value)}
                    maxLength={100}
                    className={inputCls}
                    required
                  />
                </div>

                <div className="relative">
                  <MessageSquare size={16} className="absolute left-3.5 top-3.5 text-white/40" />
                  <textarea
                    placeholder="Tell us about your requirements (optional)"
                    value={form.message}
                    onChange={(e) => updateField('message', e.target.value)}
                    maxLength={2000}
                    rows={4}
                    className={`${inputCls} resize-none`}
                  />
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}

                <button
                  type="submit"
                  disabled={!isValid || submitting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20"
                >
                  {submitting ? <Loader size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {submitting ? 'Sending...' : 'Talk to Sales'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 size={28} className="text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Thanks for reaching out!</h2>
              <p className="text-white/60 text-sm max-w-md mx-auto leading-relaxed">
                Our sales team is available 24/7 and will review your requirements. We'll get in touch with you
                shortly at <span className="text-white/85 font-medium">{form.email}</span>.
              </p>
              <Link
                to="/"
                className="inline-block mt-7 px-5 py-2.5 rounded-xl text-sm font-semibold text-white border border-white/20 hover:bg-white/10 transition-colors"
              >
                Back to FlowTask
              </Link>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default ContactSalesPage;
