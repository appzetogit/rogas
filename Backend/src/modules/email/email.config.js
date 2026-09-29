/**
 * SMTP configuration. Read lazily from the environment (same variables the older utils/email.js already used),
 * so tests and hot config changes after a restart never see stale values, and secrets never leave this module.
 */
const env = () => process.env;

export const smtpConfig = () => {
    const host = String(env().EMAIL_HOST || '');
    const port = Number(env().EMAIL_PORT) || 587;
    const user = String(env().EMAIL_USER || '');
    const pass = env().EMAIL_PASS ? String(env().EMAIL_PASS).replace(/\s/g, '') : '';
    const from = String(env().EMAIL_FROM || user || 'noreply@example.com');
    return { host, port, user, pass, from, secure: port === 465 };
};

export const isSmtpConfigured = () => {
    const { host, user, pass } = smtpConfig();
    return Boolean(host && user && pass);
};

/** How many times a failed send is retried before it is left for the admin to resend by hand. */
export const EMAIL_MAX_ATTEMPTS = 5;
