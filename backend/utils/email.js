import nodemailer from 'nodemailer';

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
      html: options.html
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
              <a href="${process.env.FRONTEND_URL }/" class="button">Get Started</a>
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
              <a href="${process.env.FRONTEND_URL}/" class="button">Start Exploring</a>
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
              <a href="${process.env.FRONTEND_URL}/" class="button">Back to Dashboard</a>
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
