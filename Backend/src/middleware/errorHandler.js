import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
    // Multer rejections (file too large, unexpected field) are the client's fault, not a server error.
    const multerStatus = err.name === 'MulterError' ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : null;
    const statusCode = err.statusCode || multerStatus || 500;
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
