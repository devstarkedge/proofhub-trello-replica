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
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
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
    // We re-throw the error to let the caller handle it.
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
