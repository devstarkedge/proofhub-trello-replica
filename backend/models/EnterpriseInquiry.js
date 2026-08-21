import mongoose from 'mongoose';

/**
 * A submission from the Enterprise "Contact Sales" page. Deliberately NOT a
 * workspace-creation trigger — Enterprise selection during workspace
 * creation routes here instead of calling POST /api/workspaces (see
 * CreateWorkspaceWizard's Plan step) — a Super Admin follows up manually
 * (via the existing changeSubscription flow) once sales has qualified the
 * lead, there is no automatic workspace provisioning from this model.
 *
 * `idempotencyKey` is a client-generated token (minted once per page-load,
 * see ContactSalesPage.jsx) — the primary defense against a duplicate
 * inquiry/duplicate emails on a network retry of the same submit click.
 * `status`/`*EmailSentAt` are a secondary idempotency layer (mirrors
 * WorkspaceInvitation.emailSentAt's precedent) guarding against a crash
 * between the DB insert and the email dispatch: a retry that lands on an
 * already-`emails_sent` row is a pure no-op read, never a re-send.
 */
const enterpriseInquirySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  membersInTeam: { type: String, required: true, trim: true, maxlength: 50 },
  companyType: { type: String, required: true, trim: true, maxlength: 100 },
  location: { type: String, required: true, trim: true, maxlength: 100 },
  message: { type: String, trim: true, maxlength: 2000, default: '' },
  // Set when the submitter was signed in at the time of submission — the
  // Contact Sales page is reachable both from the logged-out marketing
  // pricing section and from the logged-in workspace-creation wizard.
  submittedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  submittedFromWorkspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null },
  idempotencyKey: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'emails_sent', 'failed'], default: 'pending' },
  salesEmailSentAt: { type: Date, default: null },
  userEmailSentAt: { type: Date, default: null },
  lastEmailError: { type: String, default: null },
}, { timestamps: true });

enterpriseInquirySchema.index({ idempotencyKey: 1 }, { unique: true });
enterpriseInquirySchema.index({ createdAt: -1 });

export default mongoose.model('EnterpriseInquiry', enterpriseInquirySchema);
