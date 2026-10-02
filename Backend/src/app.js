import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoSanitize from 'mongo-sanitize';
import xssClean from 'xss-clean';
import routes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { responseTimeLogger } from './middleware/responseTimeLogger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { healthCheck } from './config/health.js';
import { config } from './config/env.js';
import compression from 'compression';

const app = express();

// Add compression middleware to compress JSON payloads (Gzip)
app.use(compression());

// Trust first proxy (essential for express-rate-limit if behind a proxy)
app.set('trust proxy', 1);

// Request ID tracing (before other middlewares so all logs can use it)
app.use(requestIdMiddleware);

// Health endpoints (no rate limit, minimal JSON, no secrets)
app.get('/health', async (_req, res) => {
    try {
        const data = await healthCheck();
        res.status(200).json(data);
    } catch (err) {
        res.status(503).json({ status: 'DOWN', error: 'Health check failed' });
    }
});
app.get('/ready', (_req, res) => {
    res.status(200).json({ status: 'ready' });
});

// GDPR Art. 32 (Gap N): plain HTTP is never served in production — redirect to HTTPS behind the TLS-terminating proxy.
// FORCE_HTTPS=false turns it off (e.g. a proxy that already redirects); health checks above stay reachable over HTTP.
const forceHttps = process.env.FORCE_HTTPS ? process.env.FORCE_HTTPS === 'true' : config.nodeEnv === 'production';
if (forceHttps) {
    app.use((req, res, next) => {
        if (req.secure || req.get('x-forwarded-proto') === 'https') return next();
        if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
        return res.status(403).json({ success: false, message: 'HTTPS is required' });
    });
}

// Security & parsing middlewares
app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
    hsts: config.nodeEnv === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({
    verify: (req, res, buf) => {
        // ✅ Store rawBody for signature verification (Razorpay, Przelewy24 and Stripe webhooks)
        if (req.originalUrl && req.originalUrl.includes('/payments/webhook/')) {
            req.rawBody = buf;
        }
    }
}));
app.use(express.urlencoded({ extended: true }));

// Protect against NoSQL injection and XSS
app.use((req, _res, next) => {
    req.body = mongoSanitize(req.body);
    req.query = mongoSanitize(req.query);
    req.params = mongoSanitize(req.params);
    next();
});
app.use(xssClean());

// Global rate limiting for API routes
app.use('/api', apiRateLimiter);

// Optional: log API response time (method, path, status, duration) - no sensitive data
app.use('/api', responseTimeLogger);

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// API Routes
app.use('/api', routes);

// Error Handling
app.use(errorHandler);

export default app;
