import nodemailer from 'nodemailer';
import config from '../config/index.js';

let transporter;

// Initialize transporter
const initTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    // Throw an error if email service is not configured
    throw new Error('Email service not configured. Please set EMAIL_USER and EMAIL_PASS environment variables.');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    pool: true,                   // reuse connections
    maxConnections: 3,            // limit pool size
    maxMessages: 50,              // recycle connection after 50 msgs
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 10000,     // 10s to establish connection
    greetingTimeout: 10000,       // 10s for SMTP greeting
    socketTimeout: 15000,         // 15s for socket inactivity
    tls: {
      rejectUnauthorized: false,  // accept self-signed certs (common on cloud)
    },
  });
};

export const sendEmail = async (options) => {
  try {
    if (!transporter) {
      transporter = initTransporter();
    }

    const message = {
      from: `${process.env.EMAIL_USER || 'FlowTask'} <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments || undefined
    };

    await transporter.sendMail(message);
    if (process.env.NODE_ENV !== 'production') console.log('Email sent successfully to:', options.to);
  } catch (error) {
    console.error('Email sending failed:', error.message);
    // Reset transporter on connection errors so next attempt creates a fresh one
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNECTION' || error.code === 'ESOCKET') {
      transporter = null;
    }
    throw error;
  }
};

// Send welcome email to new users
export const sendWelcomeEmail = async (user) => {
  const welcomeHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to FlowTask</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 15px 0; font-weight: bold; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to FlowTask!</h1>
            <p>Your journey to better project management starts here</p>
          </div>
          <div class="content">
            <h2>Hello ${user.name}!</h2>
            <p>Thank you for joining FlowTask. Your account has been created successfully.</p>
            <p>Here's what you can do to get started:</p>
            <ul>
              <li>Complete your profile in settings</li>
              <li>Join or create your first project</li>
              <li>Explore the dashboard to see your tasks</li>
              <li>Customize your notification preferences</li>
            </ul>
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL }/" class="button" target="_blank" rel="noopener noreferrer">Get Started</a>
            </div>
            <p>If you have any questions, feel free to reach out to our support team.</p>
          </div>
          <div class="footer">
            <p>This email was sent to ${user.email}. If you didn't create this account, please ignore this email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: user.email,
    subject: 'Welcome to FlowTask - Your Account is Ready!',
    html: welcomeHtml
  });
};

// Send verification email
export const sendVerificationEmail = async (user) => {
  const verificationHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Account Verified</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 15px 0; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Account Verified!</h1>
          </div>
          <div class="content">
            <h2>Congratulations ${user.name}!</h2>
            <p>Your account has been verified by an administrator.</p>
            <p>You now have full access to all FlowTask features:</p>
            <ul>
              <li>Create and manage projects</li>
              <li>Assign and track tasks</li>
              <li>Collaborate with your team</li>
              <li>Receive real-time notifications</li>
            </ul>
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/" class="button" target="_blank" rel="noopener noreferrer">Start Exploring</a>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: user.email,
    subject: 'Your FlowTask Account is Now Verified!',
    html: verificationHtml
  });
};

// Send password reset email
export const sendPasswordResetEmail = async (user, resetUrl) => {
  const resetHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset your FlowTask password</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; }
          .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 40px 30px; text-align: center; }
          .header h1 { margin: 0 0 8px 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; color: #ffffff; }
          .header p { margin: 0; font-size: 16px; color: #ffffff; font-weight: 500; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #475569; margin-bottom: 16px; }
          .cta-wrapper { text-align: center; margin: 32px 0; }
          .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
          .link-fallback { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin: 24px 0; word-break: break-all; font-size: 13px; color: #64748b; }
          .link-fallback a { color: #6366f1; text-decoration: none; }
          .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 24px 0; font-size: 14px; color: #92400e; }
          .security-note { font-size: 13px; color: #94a3b8; margin-top: 24px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Reset Your Password</h1>
            <p>FlowTask Account Recovery</p>
          </div>
          <div class="content">
            <p class="message">Hi <strong>${user.name}</strong>,</p>
            <p class="message">
              We received a request to reset the password for your FlowTask account. Click the button below to set a new password:
            </p>
            <div class="cta-wrapper">
              <a href="${resetUrl}" class="button" target="_blank" rel="noopener noreferrer">Reset Password</a>
            </div>
            <div class="warning">
              <strong>⏱ This link expires in 15 minutes.</strong> After that, you'll need to request a new password reset.
            </div>
            <div class="security-note">
              <strong>Didn't request this?</strong> If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged. If you're concerned about your account security, please contact your administrator.
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} FlowTask. All rights reserved.</p>
            <p>This is an automated security email — please do not reply.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: user.email,
    subject: 'Reset your FlowTask password',
    html: resetHtml
  });
};

// Send a workspace invite to an email with no existing platform account.
// No token/acceptance flow — this is a plain notification pointing at
// registration; the inviting admin re-adds them as a member by hand once
// they sign up (see workspaceController.inviteWorkspaceMembers).
// Builds the { to, subject, html } payload without sending it — the bulk
// invite path needs this shape to hand off to the BullMQ email queue
// (see modules/workspaces/invitationService.js#dispatchInvitationEmail)
// instead of awaiting a direct SMTP send per row.
export const buildWorkspaceInviteEmail = (email, { workspaceName, inviterName, token, personalMessage }) => {
  const inviteUrl = `${process.env.FRONTEND_URL}/invite/${token}`;
  const messageBlock = personalMessage
    ? `<div style="background:#f8fafc;border-left:4px solid #10b981;padding:12px 16px;border-radius:0 8px 8px 0;margin:20px 0;font-size:14px;color:#475569;font-style:italic;">"${personalMessage}"</div>`
    : '';
  const inviteHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>You've been invited to ${workspaceName} on FlowTask</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; }
          .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 40px 30px; text-align: center; }
          .header h1 { margin: 0 0 8px 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; color: #ffffff; }
          .header p { margin: 0; font-size: 16px; color: #ffffff; font-weight: 500; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #475569; margin-bottom: 16px; }
          .cta-wrapper { text-align: center; margin: 32px 0; }
          .button { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You're invited!</h1>
            <p>Join ${workspaceName} on FlowTask</p>
          </div>
          <div class="content">
            <p class="message">Hi,</p>
            <p class="message">
              <strong>${inviterName || 'A workspace admin'}</strong> has invited you to join <strong>${workspaceName}</strong> on FlowTask.
            </p>
            <p class="message">
              Click below to accept the invitation. If you don't have a FlowTask account yet, you'll be able to create one with this same email address — you'll land in this workspace automatically.
            </p>
            ${messageBlock}
            <div class="cta-wrapper">
              <a href="${inviteUrl}" class="button" target="_blank" rel="noopener noreferrer">Accept invitation</a>
            </div>
            <p class="message" style="font-size: 13px; color: #94a3b8;">This invitation expires in 7 days.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} FlowTask. All rights reserved.</p>
            <p>This email was sent to ${email}. If you weren't expecting this, you can safely ignore it.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    to: email,
    subject: `${inviterName || 'Someone'} invited you to join ${workspaceName} on FlowTask`,
    html: inviteHtml
  };
};

export const sendWorkspaceInviteEmail = async (email, opts) => {
  await sendEmail(buildWorkspaceInviteEmail(email, opts));
};

// Sent by the centralized Invite Member modal's Method A ("Create Account &
// Send Login Access") when the invited email has no existing platform
// account — contains the admin-set temporary password, so this is the one
// email in this file that should never be logged/retried carelessly.
export const sendDirectAddNewUserEmail = async (user, { workspaceName, temporaryPassword }) => {
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to ${workspaceName} on FlowTask</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; }
          .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 40px 30px; text-align: center; }
          .header h1 { margin: 0 0 8px 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; color: #ffffff; }
          .header p { margin: 0; font-size: 15px; color: #ffffff; font-weight: 500; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #475569; margin-bottom: 16px; }
          .credentials { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0; }
          .credentials-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
          .credentials-label { color: #64748b; }
          .credentials-value { color: #0f172a; font-weight: 600; font-family: monospace; }
          .cta-wrapper { text-align: center; margin: 32px 0; }
          .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
          .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 24px 0; font-size: 14px; color: #92400e; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #ffffff; margin: 0 0 8px 0;">Welcome to ${workspaceName}</h1>
            <p style="color: #ffffff; margin: 0; font-size: 15px; font-weight: 500;">Your account has been created</p>
          </div>
          <div class="content">
            <p class="message">Hi <strong>${user.name}</strong>,</p>
            <p class="message">An administrator has created your FlowTask account for <strong>${workspaceName}</strong>. Here are your login details:</p>
            <div class="credentials">
              <div class="credentials-row"><span class="credentials-label">Workspace</span><span class="credentials-value">${workspaceName}</span></div>
              <div class="credentials-row"><span class="credentials-label">Email</span><span class="credentials-value">${user.email}</span></div>
              <div class="credentials-row"><span class="credentials-label">Temporary Password</span><span class="credentials-value">${temporaryPassword}</span></div>
            </div>
            <div class="cta-wrapper">
              <a href="${loginUrl}" class="button" target="_blank" rel="noopener noreferrer">Log in to FlowTask</a>
            </div>
            <div class="warning"><strong>Please change your password after your first login.</strong></div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} FlowTask. All rights reserved.</p>
            <p>This email was sent to ${user.email}.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: user.email,
    subject: `Welcome to ${workspaceName} — your FlowTask account is ready`,
    html
  });
};

// Sent by Method A when the invited email already belongs to an existing
// global User — no password to show, they log in with what they already have.
export const sendDirectAddExistingUserEmail = async (user, { workspaceName }) => {
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>You've been added to ${workspaceName} on FlowTask</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; }
          .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 40px 30px; text-align: center; }
          .header h1 { margin: 0 0 8px 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; color: #ffffff; }
          .header p { margin: 0; font-size: 15px; color: #ffffff; font-weight: 500; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #475569; margin-bottom: 16px; }
          .cta-wrapper { text-align: center; margin: 32px 0; }
          .button { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #ffffff; margin: 0 0 8px 0;">You're in!</h1>
            <p style="color: #ffffff; margin: 0; font-size: 15px; font-weight: 500;">Added to ${workspaceName}</p>
          </div>
          <div class="content">
            <p class="message">Hi <strong>${user.name}</strong>,</p>
            <p class="message">You've been added to <strong>${workspaceName}</strong> on FlowTask. Log in with your existing FlowTask account to get started — no new password needed.</p>
            <div class="cta-wrapper">
              <a href="${loginUrl}" class="button" target="_blank" rel="noopener noreferrer">Log in to FlowTask</a>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} FlowTask. All rights reserved.</p>
            <p>This email was sent to ${user.email}.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: user.email,
    subject: `You've been added to ${workspaceName} on FlowTask`,
    html
  });
};

// Sent when a canApproveJoinRequests holder approves a pending
// WorkspaceJoinRequest — the moment the requester's membership actually
// becomes usable.
export const sendJoinRequestApprovedEmail = async (user, { workspaceName }) => {
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>You're in! Welcome to ${workspaceName}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; }
          .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 40px 30px; text-align: center; }
          .header h1 { margin: 0 0 8px 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; color: #ffffff; }
          .header p { margin: 0; font-size: 15px; color: #ffffff; font-weight: 500; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #475569; margin-bottom: 16px; }
          .cta-wrapper { text-align: center; margin: 32px 0; }
          .button { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #ffffff; margin: 0 0 8px 0;">Congratulations!</h1>
            <p style="color: #ffffff; margin: 0; font-size: 15px; font-weight: 500;">Your request has been approved</p>
          </div>
          <div class="content">
            <p class="message">Hi <strong>${user.name}</strong>,</p>
            <p class="message">Your request to join <strong>${workspaceName}</strong> has been approved. You now have access — welcome aboard.</p>
            <div class="cta-wrapper">
              <a href="${loginUrl}" class="button" target="_blank" rel="noopener noreferrer">Log in to FlowTask</a>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} FlowTask. All rights reserved.</p>
            <p>This email was sent to ${user.email}.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: user.email,
    subject: `You're in! Welcome to ${workspaceName}`,
    html
  });
};

// Sent when a canApproveJoinRequests holder rejects a pending
// WorkspaceJoinRequest. No membership was ever created for this request.
export const sendJoinRequestRejectedEmail = async (user, { workspaceName, reason }) => {
  const reasonBlock = reason
    ? `<div style="background:#f8fafc;border-left:4px solid #94a3b8;padding:12px 16px;border-radius:0 8px 8px 0;margin:20px 0;font-size:14px;color:#475569;">${reason}</div>`
    : '';
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Update on your request to join ${workspaceName}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; }
          .header { background: linear-gradient(135deg, #64748b, #475569); color: white; padding: 40px 30px; text-align: center; }
          .header h1 { margin: 0 0 8px 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #475569; margin-bottom: 16px; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Request declined</h1>
          </div>
          <div class="content">
            <p class="message">Hi <strong>${user.name}</strong>,</p>
            <p class="message">Your request to join <strong>${workspaceName}</strong> was declined.</p>
            ${reasonBlock}
            <p class="message" style="font-size: 13px; color: #94a3b8;">If you believe this was a mistake, please reach out to whoever invited you.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} FlowTask. All rights reserved.</p>
            <p>This email was sent to ${user.email}.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: user.email,
    subject: `Update on your request to join ${workspaceName}`,
    html
  });
};

// Send Coming Soon Subscription Email
export const sendComingSoonSubscriptionEmail = async (email, feature) => {
  const subscriptionHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>You're on the list!</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; }
          .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 40px 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #475569; margin-bottom: 24px; }
          .feature-badge { display: inline-block; background: #eff6ff; color: #3b82f6; padding: 4px 12px; border-radius: 9999px; font-size: 14px; font-weight: 600; margin-bottom: 20px; border: 1px solid #dbeafe; }
          .button { display: inline-block; background: #0f172a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: 600; transition: background 0.2s; }
          .button:hover { background: #1e293b; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✨ You're on the list!</h1>
          </div>
          <div class="content">
            <div style="text-align: center;">
              <span class="feature-badge">Coming Soon: ${feature || 'New Features'}</span>
            </div>
            <p class="message">Hi there,</p>
            <p class="message">
              Thank you for showing interest! We're thrilled that you're excited about what we're building.
            </p>
            <p class="message">
              Our team is working hard to bring this feature to life. We've added <strong>${email}</strong> to our notification list, and you'll be the first to know as soon as it's ready for launch.
            </p>
            <div style="text-align: center; margin-top: 32px;">
              <a href="${process.env.FRONTEND_URL}/" class="button" target="_blank" rel="noopener noreferrer">Back to Dashboard</a>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} FlowTask System. All rights reserved.</p>
            <p>You received this email because you signed up for notifications on our website.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject: `You're on the list! ✨ ${feature ? '- ' + feature : ''}`,
    html: subscriptionHtml
  });
};

// Sent to a Free workspace's owner the first time it hits the 10-member
// cap — entitlementService.js#notifyFreeLimitReachedIfNeeded guarantees
// this fires at most once per limit-hit (idempotent via
// Workspace.planLimitNotifiedAt), so this function itself never needs to
// worry about being called repeatedly for the same still-over-limit state.
export const sendFreeLimitReachedEmail = async (owner, { workspaceName, currentCount, limit }) => {
  const upgradeUrl = `${process.env.FRONTEND_URL}/settings?tab=plan`;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${workspaceName} has reached its Free plan member limit</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; }
          .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 40px 30px; text-align: center; }
          .header h1 { margin: 0 0 8px 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; color: #ffffff; }
          .header p { margin: 0; font-size: 15px; color: #ffffff; font-weight: 500; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #475569; margin-bottom: 16px; }
          .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center; }
          .stat-value { font-size: 32px; font-weight: 800; color: #d97706; }
          .stat-label { font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
          .cta-wrapper { text-align: center; margin: 32px 0; }
          .button { display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>You've reached your member limit</h1>
            <p>${workspaceName} is on the Free plan</p>
          </div>
          <div class="content">
            <p class="message">Hi <strong>${owner.name}</strong>,</p>
            <p class="message">
              Your workspace <strong>${workspaceName}</strong> has reached the Free plan's member limit,
              so new invitations and additions can't go through until you upgrade or free up a seat.
            </p>
            <div class="stat-box">
              <div class="stat-value">${currentCount} / ${limit}</div>
              <div class="stat-label">Members on the Free plan</div>
            </div>
            <p class="message">
              Upgrade to Pro to raise your limit to 20 members and unlock ChatApp for your whole team.
            </p>
            <div class="cta-wrapper">
              <a href="${upgradeUrl}" class="button" target="_blank" rel="noopener noreferrer">Upgrade to Pro</a>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} FlowTask. All rights reserved.</p>
            <p>This email was sent to ${owner.email} because you own this workspace.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: owner.email,
    subject: `${workspaceName} has reached its Free plan member limit`,
    html
  });
};

// Sent to the configured sales/support address (config.sales.email) when an
// Enterprise Contact Sales form is submitted — see
// enterpriseInquiryController.js, which guarantees this fires at most once
// per inquiry via EnterpriseInquiry's idempotencyKey + status fields.
export const sendEnterpriseInquirySalesEmail = async (inquiry) => {
  const submittedAt = new Date(inquiry.createdAt || Date.now()).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const row = (label, value) => `
    <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e2e8f0;">
      <span style="color:#64748b;font-size:14px;">${label}</span>
      <span style="color:#0f172a;font-size:14px;font-weight:600;text-align:right;max-width:60%;">${value}</span>
    </div>`;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Enterprise inquiry from ${inquiry.name}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; }
          .header { background: linear-gradient(135deg, #0f172a, #1e293b); color: white; padding: 40px 30px; text-align: center; }
          .header h1 { margin: 0 0 8px 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; color: #ffffff; }
          .header p { margin: 0; font-size: 15px; color: #cbd5e1; font-weight: 500; }
          .content { padding: 40px 30px; }
          .details { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 20px; margin: 8px 0 24px; }
          .message-block { background: #f8fafc; border-left: 4px solid #6366f1; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0; font-size: 14px; color: #475569; white-space: pre-wrap; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Enterprise inquiry</h1>
            <p>Submitted ${submittedAt}</p>
          </div>
          <div class="content">
            <div class="details">
              ${row('Name', inquiry.name)}
              ${row('Email', `<a href="mailto:${inquiry.email}" style="color:#6366f1;">${inquiry.email}</a>`)}
              ${row('Members in Team', inquiry.membersInTeam)}
              ${row('Company Type', inquiry.companyType)}
              ${row('Location', inquiry.location)}
            </div>
            ${inquiry.message ? `<p style="font-size:14px;color:#64748b;margin:0 0 6px;font-weight:600;">Requirements / message</p><div class="message-block">${inquiry.message}</div>` : ''}
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} FlowTask. Enterprise Contact Sales submission.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: config.sales.email,
    subject: `New Enterprise inquiry from ${inquiry.name} (${inquiry.companyType})`,
    html
  });
};

// Polished confirmation sent back to the person who submitted the
// Enterprise Contact Sales form — see enterpriseInquiryController.js.
export const sendEnterpriseInquiryConfirmationEmail = async (inquiry) => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thanks for contacting FlowTask Sales</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden; }
          .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 40px 30px; text-align: center; }
          .header h1 { margin: 0 0 8px 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; color: #ffffff; }
          .header p { margin: 0; font-size: 15px; color: #ffffff; font-weight: 500; }
          .content { padding: 40px 30px; }
          .message { font-size: 16px; color: #475569; margin-bottom: 16px; }
          .tagline { text-align: center; font-size: 15px; font-weight: 600; color: #6366f1; margin: 24px 0; }
          .footer { background: #f8fafc; padding: 24px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Thanks for reaching out!</h1>
            <p>We've received your Enterprise inquiry</p>
          </div>
          <div class="content">
            <p class="message">Hi <strong>${inquiry.name}</strong>,</p>
            <p class="message">
              Thanks for contacting us about the Enterprise plan. Built for teams that need more flexibility,
              scale, and support — our sales team is available 24/7 to help you find the right setup.
              We've received your requirements and will get in touch with you shortly.
            </p>
            <p class="tagline">Scale without limits. We'll build the right plan with you.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} FlowTask. All rights reserved.</p>
            <p>This email was sent to ${inquiry.email}.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: inquiry.email,
    subject: 'Thanks for contacting FlowTask Sales — we\'ll be in touch shortly',
    html
  });
};
