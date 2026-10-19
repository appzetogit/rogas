import { config } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Validates required environment configuration on startup.
 * Logs clear errors and exits if critical variables are missing.
 */
export const validateConfig = () => {
    const missing = [];

    if (!config.mongodbUri) {
        missing.push('MONGO_URI or MONGODB_URI');
    }
    if (!config.jwtAccessSecret) {
        missing.push('JWT_ACCESS_SECRET or JWT_SECRET');
    }
    if (!config.jwtRefreshSecret) {
        missing.push('JWT_REFRESH_SECRET');
    }
    if (config.redisEnabled && !config.redisUrl) {
        missing.push('REDIS_URL (required when REDIS_ENABLED=true)');
    }
    if (config.bullmqEnabled && !config.redisEnabled) {
        missing.push('REDIS_ENABLED=true (required when BULLMQ_ENABLED=true)');
    }

    if (!['local', 'cloudinary'].includes(config.uploadDriver)) {
        missing.push('UPLOAD_DRIVER must be "local" or "cloudinary"');
    }
    // Stored files get absolute URLs; on a server they must point at the public API address, not localhost.
    if (config.nodeEnv === 'production' && config.uploadDriver === 'local' && /\/\/(localhost|127\.0\.0\.1)[:/]/.test(config.uploadPublicUrl)) {
        logger.warn(`Uploaded files will get URLs on ${config.uploadPublicUrl}. Set API_PUBLIC_URL (or UPLOAD_PUBLIC_URL) to the public API address.`);
    }
    if (config.uploadDriver === 'cloudinary' && !(config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret)) {
        logger.warn('UPLOAD_DRIVER is cloudinary but CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are not all set; uploads will fail.');
    }

    if (missing.length > 0) {
        logger.error(`Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }
};
