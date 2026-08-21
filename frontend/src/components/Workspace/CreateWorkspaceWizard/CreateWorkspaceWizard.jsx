import React, { useState, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Briefcase, Loader, ChevronLeft } from 'lucide-react';
import { toast } from 'react-toastify';
import WorkspaceContext from '../../../context/WorkspaceContext';
import { inviteWorkspaceMembers } from '../../../services/workspaceSetupApi';
import WizardStepper from './shared/WizardStepper';
import WizardExitConfirm from './shared/WizardExitConfirm';
import StepBasics from './StepBasics';
import StepPlan from './StepPlan';
import StepSetup from './StepSetup';

const INITIAL_FORM = {
  name: '', slug: '', type: '', industry: '', companySize: '', departmentName: '', inviteEmails: [], plan: ''
};

/**
 * 3-step workspace creation wizard (Basics -> Plan -> Setup), replacing
 * the single-field CreateWorkspaceModal. Owns the submission sequencing
 * that closes the x-workspace-id header race: icon upload and invite
 * follow-up calls only ever fire after the full createWorkspace() promise
 * chain (which internally awaits switchWorkspace(), the thing that actually
 * persists the new active-workspace header) has resolved.
 *
 * Enterprise is never created through this wizard — selecting it on the
 * Plan step exits the wizard entirely and hands off to /contact-sales
 * instead of advancing to Setup (see handleSelectEnterprise).
 */
const CreateWorkspaceWizard = ({ isOpen, onClose, onCreated }) => {
  const { createWorkspace, uploadWorkspaceIcon } = useContext(WorkspaceContext);
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [logoError, setLogoError] = useState('');
  const [step1Valid, setStep1Valid] = useState(false);
  const [planValid, setPlanValid] = useState(false);
  const [setupValid, setSetupValid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleLogoFileChange = (file, validationError) => {
    if (validationError) {
      setLogoError(validationError);
      return;
    }
    setLogoError('');
    setLogoFile(file);
    setLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleLogoRemove = () => {
    setLogoFile(null);
    setLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setLogoError('');
  };

  const resetState = () => {
    setStep(1);
    setFormData(INITIAL_FORM);
    setLogoFile(null);
    setLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setLogoError('');
    setError('');
    setStep1Valid(false);
    setPlanValid(false);
    setSetupValid(false);
  };

  const hasEnteredData = !!(
    formData.name.trim() || formData.slug || formData.type || logoFile ||
    formData.industry || formData.companySize || formData.departmentName.trim() ||
    formData.inviteEmails.length > 0 || formData.plan
  );

  const handleCloseAttempt = () => {
    if (saving) return;
    if (hasEnteredData) {
      setShowExitConfirm(true);
    } else {
      resetState();
      onClose();
    }
  };

  const handleDiscard = () => {
    setShowExitConfirm(false);
    resetState();
    onClose();
  };

  // Enterprise is never created through this wizard — hand off to Contact
  // Sales instead of ever calling POST /api/workspaces.
  const handleSelectEnterprise = () => {
    resetState();
    onClose();
    navigate('/contact-sales');
  };

  const handleCreate = async () => {
    if (saving || !setupValid) return;
    setSaving(true);
    setError('');

    try {
      const payload = {
        name: formData.name.trim(),
        slug: formData.slug,
        type: formData.type,
        industry: formData.industry || undefined,
        companySize: formData.companySize || undefined,
        department: { name: formData.departmentName.trim() || undefined },
        plan: formData.plan === 'pro' ? 'pro' : 'free'
      };

      // Awaits the FULL chain (create -> loadWorkspaces -> switchWorkspace)
      // before any follow-up call fires — switchWorkspace is what persists
      // the new workspaceId that api.js's interceptor reads for every
      // subsequent request's x-workspace-id header. Firing icon upload or
      // invites any earlier risks them landing against the previous
      // workspace instead of the one just created.
      const created = await createWorkspace(payload);

      if (logoFile) {
        try {
          await uploadWorkspaceIcon(created._id, logoFile);
        } catch {
          toast.warning('Workspace created, but the logo failed to upload. You can add it from Workspace Settings.');
        }
      }

      if (formData.inviteEmails.length > 0) {
        try {
          await inviteWorkspaceMembers(created._id, formData.inviteEmails);
        } catch {
          toast.warning('Workspace created, but sending invites failed. You can invite members from Workspace Settings.');
        }
      }

      toast.success(`Workspace "${created.name}" created`);
      resetState();
      onCreated?.(created);
      onClose();
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || 'Failed to create workspace. Please try again.';
      if (status === 409) {
        // Slug was taken between the live check and submission — send them
        // back to Step 1 so they can pick another one, per spec.
        setStep(1);
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleCloseAttempt}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            style={{ backgroundColor: 'var(--color-card-bg)' }}
          >
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                  <Briefcase size={18} className="text-white" />
                </div>
                <h2 className="text-lg font-bold text-white">Create a Workspace</h2>
              </div>
              <button
                type="button"
                onClick={handleCloseAttempt}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="border-b flex-shrink-0" style={{ borderColor: 'var(--color-border-subtle)' }}>
              <WizardStepper steps={['Basics', 'Plan', 'Setup']} currentStep={step} />
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {step === 1 && (
                <StepBasics
                  formData={formData}
                  updateField={updateField}
                  logoPreviewUrl={logoPreviewUrl}
                  onLogoFileChange={handleLogoFileChange}
                  onLogoRemove={handleLogoRemove}
                  logoError={logoError}
                  onValidityChange={setStep1Valid}
                />
              )}
              {step === 2 && (
                <StepPlan
                  formData={formData}
                  updateField={updateField}
                  onValidityChange={setPlanValid}
                  onSelectEnterprise={handleSelectEnterprise}
                />
              )}
              {step === 3 && (
                <StepSetup
                  formData={formData}
                  updateField={updateField}
                  onValidityChange={setSetupValid}
                />
              )}
              {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t flex-shrink-0" style={{ borderColor: 'var(--color-border-subtle)' }}>
              {step === 1 ? (
                <button
                  type="button"
                  onClick={handleCloseAttempt}
                  className="px-4 py-2 text-sm font-medium rounded-xl border transition-colors"
                  style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  disabled={saving}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-xl border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                >
                  <ChevronLeft size={15} /> Back
                </button>
              )}

              {step === 1 && (
                <button
                  type="button"
                  onClick={() => step1Valid && setStep(2)}
                  disabled={!step1Valid}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Continue
                </button>
              )}
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => planValid && setStep(3)}
                  disabled={!planValid}
                  className="px-5 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Continue
                </button>
              )}
              {step === 3 && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving || !setupValid}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 transition-all"
                >
                  {saving ? <Loader size={16} className="animate-spin" /> : <Briefcase size={16} />}
                  {saving ? 'Creating...' : 'Create Workspace'}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <WizardExitConfirm
        isOpen={showExitConfirm}
        onDiscard={handleDiscard}
        onContinueEditing={() => setShowExitConfirm(false)}
      />
    </>,
    document.body
  );
};

export default CreateWorkspaceWizard;
