import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from './logger.js';

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    const { emailHost, emailPort, emailUser, emailPass } = config;
    if (!emailHost || !emailUser || !emailPass) {
        logger.warn('Email not configured: EMAIL_HOST, EMAIL_USER, EMAIL_PASS required');
        return null;
    }
    transporter = nodemailer.createTransport({
        host: emailHost,
        port: emailPort || 587,
        secure: emailPort === 465,
        auth: {
            user: emailUser,
            pass: emailPass
        }
    });
    return transporter;
}

/**
 * Send OTP email for admin forgot password.
 * @param {string} to - Recipient email
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<boolean>} true if sent, false if skipped/failed
 */
export async function sendAdminResetOtpEmail(to, otp) {
    const trans = getTransporter();
    if (!trans) {
        logger.warn('Admin OTP email skipped: SMTP not configured');
        return false;
    }
    const from = config.emailFrom || config.emailUser;
    const subject = 'Your password reset code – Appzeto Admin';
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 480px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #111;">Password reset code</h2>
  <p>Use the code below to reset your admin password. It is valid for 10 minutes.</p>
  <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; background: #f5f5f5; padding: 12px 16px; border-radius: 8px;">${otp}</p>
  <p style="color: #666; font-size: 14px;">If you did not request this, you can ignore this email.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">Appzeto Admin</p>
</body>
</html>`;
    const text = `Your password reset code is: ${otp}. It is valid for 10 minutes. If you did not request this, ignore this email.`;

    try {
        await trans.sendMail({
            from: typeof from === 'string' && from.includes('<') ? from : `Appzeto <${from}>`,
            to,
            subject,
            text,
            html
        });
        logger.info(`Admin reset OTP email sent to ${to}`);
        return true;
    } catch (err) {
        logger.error(`Failed to send admin OTP email to ${to}:`, err.message);
        return false;
    }
}

/**
 * Send welcome email with T&C PDF to new restaurant owner.
 * @param {string} to - Recipient email
 * @param {string} restaurantName - Name of the restaurant
 * @param {string} pdfUrl - URL to the T&C PDF
 * @returns {Promise<boolean>} true if sent, false if skipped/failed
 */
export async function sendRestaurantOnboardingEmail(to, restaurantName, pdfUrl) {
    const trans = getTransporter();
    if (!trans) {
        logger.warn('Restaurant onboarding email skipped: SMTP not configured');
        return false;
    }
    const from = config.emailFrom || config.emailUser;
    const subject = `Welcome to Appzeto, ${restaurantName}!`;
    
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #111;">Welcome aboard, ${restaurantName}!</h2>
  <p>Your restaurant has been successfully onboarded to Appzeto.</p>
  <p>Please find attached the official Terms and Conditions regarding our partnership.</p>
  <p>We look forward to growing together!</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">Appzeto Team</p>
</body>
</html>`;
    
    const text = `Welcome aboard, ${restaurantName}!\n\nYour restaurant has been successfully onboarded to Appzeto.\nPlease find attached the official Terms and Conditions regarding our partnership.\n\nWe look forward to growing together!\n\nAppzeto Team`;

    const mailOptions = {
        from: typeof from === 'string' && from.includes('<') ? from : `Appzeto <${from}>`,
        to,
        subject,
        text,
        html,
    };

    if (pdfUrl) {
        mailOptions.attachments = [
            {
                filename: 'Terms_and_Conditions.pdf',
                path: pdfUrl // Nodemailer supports fetching directly from a URL
            }
        ];
    }

    try {
        await trans.sendMail(mailOptions);
        logger.info(`Restaurant onboarding email sent to ${to} (${restaurantName})`);
        return true;
    } catch (err) {
        logger.error(`Failed to send onboarding email to ${to}:`, err.message);
        return false;
    }
}

/**
 * Send OTP email for Office Panel registration verification.
 * @param {string} to - Recipient email
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<boolean>} true if sent, false if failed/skipped
 */
export async function sendOfficeSignupOtpEmail(to, otp) {
    const trans = getTransporter();
    if (!trans) {
        logger.warn('Office signup OTP email skipped: SMTP not configured');
        return false;
    }
    const from = config.emailFrom || config.emailUser;
    const subject = `Your DailyMealBox Verification Code: ${otp}`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1a1c1e; max-width: 520px; margin: 0 auto; padding: 24px; background-color: #f8f9fa;">
  <div style="background-color: #ffffff; border-radius: 16px; padding: 36px; border: 1px solid #e9ecef; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
    <div style="text-align: center; margin-bottom: 28px;">
      <h2 style="color: #287965; font-size: 26px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">DailyMealBox</h2>
      <p style="color: #6c7278; font-size: 13px; margin-top: 4px;">Office Meal Subscription Management</p>
    </div>
    <div style="text-align: center; margin-bottom: 24px;">
      <h3 style="color: #1a1c1e; font-size: 20px; font-weight: 700; margin: 0 0 8px 0;">Verify your email address</h3>
      <p style="color: #4a4c56; font-size: 14px; margin: 0;">Use the 6-digit code below to complete your corporate office registration:</p>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <div style="display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #287965; background: #eaf5f2; padding: 16px 28px; border-radius: 12px; border: 1.5px dashed #287965;">
        ${otp}
      </div>
      <p style="color: #8b909a; font-size: 13px; margin-top: 14px;">This code will expire in <strong>10 minutes</strong>.</p>
    </div>
    <p style="color: #6c7278; font-size: 13px; text-align: center; margin: 24px 0 0 0;">
      If you did not initiate this request, you can safely disregard this email.
    </p>
    <hr style="border: none; border-top: 1px solid #f1f3f5; margin: 28px 0 20px 0;">
    <p style="color: #adb5bd; font-size: 12px; text-align: center; margin: 0;">
      &copy; ${new Date().getFullYear()} DailyMealBox. All rights reserved.
    </p>
  </div>
</body>
</html>`;
    const text = `Your DailyMealBox verification code is: ${otp}. It is valid for 10 minutes. If you did not request this, you can ignore this email.`;

    try {
        await trans.sendMail({
            from: typeof from === 'string' && from.includes('<') ? from : `DailyMealBox <${from}>`,
            to,
            subject,
            text,
            html
        });
        logger.info(`Office signup OTP email sent to ${to}`);
        return true;
    } catch (err) {
        logger.error(`Failed to send office signup OTP email to ${to}:`, err.message);
        return false;
    }
}



const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Small branded notification email for the Office panel / admins (password reset, approval result, new request).
 * `lines` is an array of plain-text paragraphs (escaped here). Returns true when sent.
 */
export async function sendOfficeNotificationEmail({ to, subject, heading, lines = [], code = '' }) {
    const trans = getTransporter();
    if (!trans) {
        logger.warn(`Office notification email "${subject}" skipped: SMTP not configured`);
        return false;
    }
    if (!to) return false;
    const from = config.emailFrom || config.emailUser;
    const paragraphs = lines.map((l) => `<p style="color:#4a4c56;font-size:14px;margin:0 0 12px 0;">${escapeHtml(l)}</p>`).join('');
    const codeBlock = code
        ? `<div style="text-align:center;margin:24px 0;"><div style="display:inline-block;font-size:30px;font-weight:800;letter-spacing:8px;color:#287965;background:#eaf5f2;padding:14px 26px;border-radius:12px;border:1.5px dashed #287965;">${escapeHtml(code)}</div></div>`
        : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:'Segoe UI',Tahoma,Verdana,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8f9fa;">
<div style="background:#fff;border-radius:16px;padding:32px;border:1px solid #e9ecef;">
<h2 style="color:#287965;font-size:24px;margin:0 0 4px 0;text-align:center;">DailyMealBox</h2>
<h3 style="color:#1a1c1e;font-size:18px;margin:18px 0 14px 0;">${escapeHtml(heading)}</h3>
${paragraphs}${codeBlock}
<hr style="border:none;border-top:1px solid #f1f3f5;margin:24px 0 14px 0;">
<p style="color:#adb5bd;font-size:12px;text-align:center;margin:0;">&copy; ${new Date().getFullYear()} DailyMealBox</p>
</div></body></html>`;
    try {
        await trans.sendMail({
            from: typeof from === 'string' && from.includes('<') ? from : `DailyMealBox <${from}>`,
            to,
            subject,
            text: [heading, ...lines, code].filter(Boolean).join('\n\n'),
            html
        });
        logger.info(`Office notification email "${subject}" sent to ${to}`);
        return true;
    } catch (err) {
        logger.error(`Failed to send office notification email to ${to}: ${err.message}`);
        return false;
    }
}
