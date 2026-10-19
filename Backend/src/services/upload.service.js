import { config } from '../config/env.js';
import * as cloud from './cloudinary.service.js';
import * as local from './localUpload.service.js';

/**
 * The one entry point for storing and removing uploaded files.
 * UPLOAD_DRIVER picks the storage: "local" (default in production, files on this server under UPLOAD_DIR)
 * or "cloudinary" (default in development). Files already stored elsewhere keep working: their URLs are
 * saved as-is, and deletes are routed by the stored public id, not by the current driver.
 */

const useLocal = () => config.uploadDriver === 'local';

/** Returns the image's public URL. */
export const uploadImageBuffer = async (buffer, folder = 'uploads', options = {}) => {
    if (useLocal()) return (await local.saveImage(buffer, folder)).secure_url;
    return (await cloud.uploadImageBufferDetailed(buffer, folder, options.cloudinary)).secure_url;
};

/** Returns { secure_url, public_id, ... }. */
export const uploadImageBufferDetailed = async (buffer, folder = 'uploads', options = {}) => {
    if (useLocal()) return local.saveImage(buffer, folder);
    return cloud.uploadImageBufferDetailed(buffer, folder, options.cloudinary);
};

/** Returns the video's public URL. */
export const uploadVideoBuffer = async (buffer, folder = 'uploads') => {
    if (useLocal()) return (await local.saveVideo(buffer, folder)).secure_url;
    return cloud.uploadVideoBuffer(buffer, folder);
};

/** Non-image files (PDFs). options: { fileName, format }. Returns the file's public URL. */
export const uploadFileBuffer = async (buffer, folder = 'uploads', options = {}) => {
    if (useLocal()) return (await local.saveFile(buffer, folder, options)).secure_url;
    return cloud.uploadFileBuffer(buffer, folder, options);
};

/** Returns { secure_url, public_id, ... }. */
export const uploadFileBufferDetailed = async (buffer, folder = 'uploads', options = {}) => {
    if (useLocal()) return local.saveFile(buffer, folder, options);
    return cloud.uploadFileBufferDetailed(buffer, folder, options);
};

/** Deletes a stored file by the public id saved with it (local or Cloudinary, whichever stored it). */
export const deleteUploadedFile = async (publicId, resourceType = 'image') => {
    if (!publicId) return;
    if (String(publicId).startsWith(local.LOCAL_ID_PREFIX)) return local.deleteLocalFile(publicId);
    return cloud.deleteCloudinaryAsset(publicId, resourceType);
};

/** Download link for a stored PDF. Files on this server are already directly downloadable. */
export const buildRawDownloadUrlFromFileUrl = (fileUrl, options = {}) => {
    if (fileUrl && String(fileUrl).startsWith(`${config.uploadPublicUrl}/`)) return String(fileUrl);
    return cloud.buildRawDownloadUrlFromFileUrl(fileUrl, options);
};

export const ensureUploadStorage = async () => {
    if (useLocal()) await local.ensureUploadDir();
};
