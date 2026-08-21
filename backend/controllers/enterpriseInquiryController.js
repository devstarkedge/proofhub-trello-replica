import asyncHandler from '../middleware/asyncHandler.js';
import EnterpriseInquiry from '../models/EnterpriseInquiry.js';
import { sendEnterpriseInquirySalesEmail, sendEnterpriseInquiryConfirmationEmail } from '../utils/email.js';
import logger from '../utils/logger.js';

// @desc    Submit an Enterprise "Contact Sales" inquiry. Public — must work
//          for a signed-out visitor from the marketing pricing page as well
//          as a user routed here from the workspace-creation wizard's Plan
//          step. Never creates a workspace; a Super Admin follows up
//          manually via the existing plan-assignment flow once qualified.
// @route   POST /api/enterprise-inquiries
// @access  Public
export const submitEnterpriseInquiry = asyncHandler(async (req, res) => {
  const { name, email, membersInTeam, companyType, location, message, idempotencyKey } = req.body;
  const key = String(idempotencyKey).trim();

  let inquiry;
  try {
    inquiry = await EnterpriseInquiry.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      membersInTeam: String(membersInTeam).trim(),
      companyType: String(companyType).trim(),
      location: String(location).trim(),
      message: message ? String(message).trim() : '',
      idempotencyKey: key,
    });
  } catch (err) {
    if (err.code === 11000) {
      // The same submission was retried (network hiccup, double-click) —
      // adopt the existing row instead of creating a duplicate or erroring.
      inquiry = await EnterpriseInquiry.findOne({ idempotencyKey: key });
      if (!inquiry) throw err;
    } else {
      throw err;
    }
  }

  if (inquiry.status === 'emails_sent') {
    // Pure idempotent replay — emails already went out for this exact
    // submission, never re-send.
    return res.status(200).json({ success: true, data: { id: inquiry._id, status: inquiry.status } });
  }

  try {
    await Promise.all([
      sendEnterpriseInquirySalesEmail(inquiry),
      sendEnterpriseInquiryConfirmationEmail(inquiry),
    ]);
    inquiry.status = 'emails_sent';
    inquiry.salesEmailSentAt = new Date();
    inquiry.userEmailSentAt = new Date();
    inquiry.lastEmailError = null;
    await inquiry.save();
  } catch (err) {
    inquiry.status = 'failed';
    inquiry.lastEmailError = err.message;
    await inquiry.save();
    logger.error('Failed to send Enterprise inquiry emails', { error: err.message, inquiryId: String(inquiry._id) });
    // The inquiry itself was recorded — don't fail the request over an
    // email hiccup. A resubmit with the same idempotencyKey (the frontend
    // reuses one per page-load) retries the send without duplicating the row.
  }

  res.status(201).json({ success: true, data: { id: inquiry._id, status: inquiry.status } });
});
