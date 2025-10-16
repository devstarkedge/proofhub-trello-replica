import nodemailer from 'nodemailer';

let transporter;

// Initialize transporter
const initTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('Email service not configured - emails will not be sent');
    return null;
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
  if (!transporter) {
    transporter = initTransporter();
  }

  if (!transporter) {
    console.log('Email not sent - transporter not configured');
    return;
  }

  const message = {
    from: `${process.env.EMAIL_USER || 'Project Management'} <${process.env.SMTP_USER}>`,
    to: options.to,
    subject: options.subject,
    html: options.html
  };

  try {
    await transporter.sendMail(message);
    console.log('Email sent successfully to:', options.to);
  } catch (error) {
    console.error('Email sending failed:', error.message);
    throw error;
  }
};