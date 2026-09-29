/**
 * Transactional email service. One place that actually talks to SMTP; every trigger elsewhere in the app (vendor
 * approved, licence expiring, payment failed, GDPR deletion confirmed, ...) calls `queueEmail()` and is done.
 *
 * - Content is translated and admin-editable, exactly like push notifications: the English subject/body text
 *   written in the calling code IS the i18n key (namespace "email"), looked up for the recipient's language and
 *   editable from Admin > Translations > Emails — no separate template system to keep in sync.
 * - Every send is recorded in EmailLog first, so nothing is silently dropped; a failure is retried with backoff by
 *   a background sweep (retryEmailJobs, started from server.js), the same pattern the payments module uses for its
 *   own upkeep. After EMAIL_MAX_ATTEMPTS it stays "failed" for an admin to inspect and resend by hand.
 */
import nodemailer from 'nodemailer';
import { EmailLog } from './email.models.js';
import { smtpConfig, isSmtpConfigured, EMAIL_MAX_ATTEMPTS } from './email.config.js';
import { translate, resolveOwnerLanguage, getDefaultLanguageCode } from '../i18n/i18n.service.js';
import { logger } from '../../utils/logger.js';

let transporter = null;
let transporterSignature = '';
let testTransporter = undefined; // undefined = not overridden; anything else (including null) = forced value

const buildTransporter = () => {
    if (testTransporter !== undefined) return testTransporter;
    if (!isSmtpConfigured()) return null;
    const cfg = smtpConfig();
    const signature = `${cfg.host}:${cfg.port}:${cfg.user}`;
    if (transporter && transporterSignature === signature) return transporter;
    transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass }
    });
    transporterSignature = signature;
    return transporter;
};

/** Tests only: swap in a fake `{ sendMail, verify }`. Pass undefined to go back to the real SMTP transporter. */
export const _setTransporterForTests = (fake) => {
    testTransporter = fake;
};

/** Proves the configured SMTP credentials actually work, without sending anything. For the admin "Test connection" button. */
export const testConnection = async () => {
    if (!isSmtpConfigured()) return { ok: false, message: 'EMAIL_HOST, EMAIL_USER and EMAIL_PASS are not all set.' };
    try {
        await buildTransporter().verify();
        return { ok: true, message: 'Connected to the SMTP server.' };
    } catch (err) {
        return { ok: false, message: err?.message || String(err) };
    }
};

const wrapHtml = (bodyHtml) => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${bodyHtml}
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #999; font-size: 12px;">DailyMealBox</p>
</body>
</html>`;

/** Body text -> paragraphs, so a plain translated string reads correctly as HTML without every caller writing markup. */
const bodyToHtml = (body) =>
    String(body)
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('\n');

const stripHtml = (html) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

const resolveLanguage = async ({ language, ownerType, ownerId }) => {
    if (language) return language;
    if (ownerType && ownerId) {
        try {
            return await resolveOwnerLanguage(ownerType, ownerId);
        } catch {
            /* fall through to the platform default */
        }
    }
    return getDefaultLanguageCode();
};

const doSend = async (log) => {
    const trans = buildTransporter();
    if (!trans) throw new Error('SMTP is not configured (EMAIL_HOST, EMAIL_USER, EMAIL_PASS)');
    const cfg = smtpConfig();
    await trans.sendMail({
        from: cfg.from.includes('<') ? cfg.from : `DailyMealBox <${cfg.from}>`,
        to: log.to,
        cc: log.cc || undefined,
        subject: log.subject,
        html: log.html,
        text: log.text,
        attachments: log.attachments?.length ? log.attachments.map((a) => ({ filename: a.filename, path: a.path })) : undefined
    });
};

/**
 * Translates subjectKey/bodyKey for the recipient's language, records it, and sends immediately. A send failure
 * does not throw — the row is left "failed" for the background retry (and, eventually, the admin) to pick up,
 * because losing the record of what should have gone out is worse than a delayed retry.
 *
 * @returns the EmailLog row (status is "sent" or "failed" depending on the immediate attempt).
 */
export const queueEmail = async ({ to, subjectKey, bodyKey, vars = {}, language, ownerType = '', ownerId = null, cc = '', attachments = [] }) => {
    if (!to) throw new Error('queueEmail: "to" is required');
    if (!subjectKey || !bodyKey) throw new Error('queueEmail: subjectKey and bodyKey are required');

    const lang = await resolveLanguage({ language, ownerType, ownerId });
    const subject = await translate(lang, 'email', subjectKey, vars);
    const body = await translate(lang, 'email', bodyKey, vars);
    const html = wrapHtml(bodyToHtml(body));

    const log = await EmailLog.create({
        to,
        cc,
        templateKey: subjectKey,
        subject,
        html,
        text: stripHtml(html),
        language: lang,
        attachments,
        ownerType,
        ownerId: ownerId || null,
        status: 'queued',
        attempts: 0
    });

    return attemptSend(log);
};

/** One delivery attempt against an existing log row (new or retried). Updates and returns the row. */
const attemptSend = async (log) => {
    log.attempts += 1;
    try {
        await doSend(log);
        log.status = 'sent';
        log.sentAt = new Date();
        log.lastError = '';
    } catch (err) {
        log.status = 'failed';
        log.lastError = err?.message || String(err);
        // Exponential-ish backoff: 5, 10, 20, 40... minutes, capped well under a day.
        const delayMinutes = Math.min(5 * 2 ** (log.attempts - 1), 6 * 60);
        log.nextAttemptAt = new Date(Date.now() + delayMinutes * 60_000);
        logger.warn(`Email to ${log.to} ("${log.templateKey}") failed (attempt ${log.attempts}): ${log.lastError}`);
    }
    await log.save();
    return log;
};

/** Retries emails that failed and are due, up to EMAIL_MAX_ATTEMPTS. Called by the background sweep and by admin "Resend". */
export const retryFailed = async ({ limit = 50 } = {}) => {
    const rows = await EmailLog.find({ status: 'failed', attempts: { $lt: EMAIL_MAX_ATTEMPTS }, nextAttemptAt: { $lte: new Date() } })
        .sort({ nextAttemptAt: 1 })
        .limit(limit);
    let sent = 0;
    for (const log of rows) {
        const after = await attemptSend(log);
        if (after.status === 'sent') sent++;
    }
    return { checked: rows.length, sent };
};

/** Admin "Resend": tries again right now regardless of backoff or the attempt cap. */
export const resendById = async (id) => {
    const log = await EmailLog.findById(id);
    if (!log) return null;
    return attemptSend(log);
};

let jobTimer = null;
export const startEmailJobs = ({ everyMs = 60_000 } = {}) => {
    if (jobTimer || process.env.EMAIL_JOBS === 'false') return;
    jobTimer = setInterval(async () => {
        try {
            await retryFailed();
        } catch (err) {
            logger.warn(`Email retry sweep failed: ${err?.message || err}`);
        }
    }, everyMs);
    jobTimer.unref?.();
};
export const stopEmailJobs = () => {
    if (jobTimer) clearInterval(jobTimer);
    jobTimer = null;
};
