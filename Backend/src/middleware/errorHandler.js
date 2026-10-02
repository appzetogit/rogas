import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Server Error';
    const requestId = req.requestId || '-';

    logger.error(
        `[${requestId}] ${req.method} ${req.originalUrl} ${statusCode} - ${err.name || 'Error'} - ${message}`
    );
    if (config.nodeEnv === 'development' && err.stack) {
        logger.error(`[${requestId}] ${err.stack}`);
    }

    const body = { success: false, message: message, error: message };
    // Machine-readable reason (e.g. ADDRESS_OUTSIDE_ZONE) and safe details for the apps, when the error carries them.
    if (err.code && typeof err.code === 'string') body.code = err.code;
    if (err.details && typeof err.details === 'object') body.details = err.details;
    res.status(statusCode).json(body);
};

export default errorHandler;
