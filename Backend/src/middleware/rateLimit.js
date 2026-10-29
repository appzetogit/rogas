import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

const windowMs = config.rateLimitWindowMinutes * 60 * 1000;

export const apiRateLimiter = rateLimit({
    windowMs,
    // Dev UX: local UI can generate lots of background API calls (location, polling, etc).
    // Keep production strict, but avoid blocking local development.
    max: config.nodeEnv === 'development' ? Math.max(config.rateLimitMaxRequests, 2000) : config.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    // Payment providers call webhooks from a handful of IPs; throttling them would leave payments unconfirmed.
    // Webhooks are authenticated by their signatures instead.
    skip: (req) => req.path.startsWith('/v1/payments/webhook/'),
    message: {
        success: false,
        message: 'Too many requests, please try again later.'
    }
});

const authWindowMs = config.authRateLimitWindowMinutes * 60 * 1000;

/** Stricter rate limit for auth routes (OTP, login, refresh, logout). Applied in addition to global limiter. */
export const authRateLimiter = rateLimit({
    windowMs: authWindowMs,
    // Dev UX: login/otp testing can be frequent. Keep production strict (e.g. 30),
    // but relax local development to avoid 429 when testing flows.
    max: config.nodeEnv === 'development' ? Math.max(config.authRateLimitMax, 100) : config.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many authentication attempts. Please try again later.'
    }
});

/** Limit for the public file upload endpoints (they accept files before login, e.g. during onboarding). */
export const uploadRateLimiter = rateLimit({
    windowMs: authWindowMs,
    max: config.nodeEnv === 'development' ? Math.max(config.uploadRateLimitMax, 500) : config.uploadRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many uploads. Please try again later.'
    }
});

/** NIP lookups ask a public government service: each signed-in customer gets a modest hourly allowance. */
export const nipLookupRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: config.nodeEnv === 'development' ? 500 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.user?.userId || req.user?._id || 'anonymous'),
    validate: { keyGeneratorIpFallback: false },
    message: {
        success: false,
        message: 'Too many company lookups. Please try again later.'
    }
});
