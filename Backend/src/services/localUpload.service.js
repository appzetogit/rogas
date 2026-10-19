import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Stores uploads on this server's disk (UPLOAD_DIR, /var/www/uploads in production) and returns
 * results shaped like Cloudinary's, so callers don't care which storage is active.
 * Public ids are prefixed with "local:" so a later delete knows where the file lives.
 */

export const LOCAL_ID_PREFIX = 'local:';

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const startsWith = (buf, bytes, offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf, start, end) => buf.subarray(start, end).toString('latin1');

/** Detects the real file type from its first bytes; the client's name and mimetype are never trusted. */
const sniff = (buf) => {
    if (startsWith(buf, [0xff, 0xd8, 0xff])) return { ext: 'jpg', kind: 'image' };
    if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return { ext: 'png', kind: 'image' };
    if (ascii(buf, 0, 4) === 'GIF8') return { ext: 'gif', kind: 'image' };
    if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return { ext: 'webp', kind: 'image' };
    if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'AVI ') return { ext: 'avi', kind: 'video' };
    if (ascii(buf, 0, 2) === 'BM') return { ext: 'bmp', kind: 'image' };
    if (startsWith(buf, [0x00, 0x00, 0x01, 0x00])) return { ext: 'ico', kind: 'image' };
    if (startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a])) return { ext: 'tiff', kind: 'image' };
    if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { ext: 'webm', kind: 'video' };
    if (ascii(buf, 0, 5) === '%PDF-') return { ext: 'pdf', kind: 'raw' };
    if (ascii(buf, 4, 8) === 'ftyp') {
        const brand = ascii(buf, 8, 12).toLowerCase();
        if (brand === 'avif' || brand === 'avis') return { ext: 'avif', kind: 'image' };
        if (['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return { ext: 'heic', kind: 'image' };
        if (brand.startsWith('qt')) return { ext: 'mov', kind: 'video' };
        return { ext: 'mp4', kind: 'video' };
    }
    const head = ascii(buf, 0, 512).trimStart().toLowerCase();
    if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return { ext: 'svg', kind: 'image' };
    return null;
};

// Formats a raw (non-image) upload may be stored as. Anything else is saved as .bin so it is never served as HTML/JS.
const RAW_FORMATS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt']);

/** "food/Hero Banners/../x" -> "food/herobanners/x". Leading "uploads" is dropped: everything already lives under UPLOAD_DIR. */
const safeFolder = (folder) => {
    const parts = String(folder || '')
        .split(/[\\/]+/)
        .map((s) => s.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
        .filter(Boolean)
        .slice(0, 6);
    if (parts[0] === 'uploads') parts.shift();
    return parts.join('/') || 'misc';
};

const slug = (value) => String(value || '').toLowerCase().replace(/\.[^.]*$/, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** Absolute path for a stored file, refusing anything that would land outside UPLOAD_DIR. */
const resolveInsideRoot = (relativePath) => {
    const root = config.uploadDir;
    const abs = path.resolve(root, relativePath);
    if (abs !== root && !abs.startsWith(root + path.sep)) throw badRequest('Invalid file path');
    return abs;
};

const publicUrlFor = (relativePath) => `${config.uploadPublicUrl}/${relativePath.split('/').map(encodeURIComponent).join('/')}`;

const save = async (buffer, folder, { ext, resourceType, baseName }) => {
    if (!buffer || !buffer.length) throw new Error('File buffer is required');
    const random = crypto.randomBytes(8).toString('hex');
    const name = baseName ? `${baseName}-${random}.${ext}` : `${Date.now()}-${random}.${ext}`;
    const relativePath = `${safeFolder(folder)}/${name}`;
    const abs = resolveInsideRoot(relativePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buffer, { flag: 'wx' });
    const url = publicUrlFor(relativePath);
    return {
        secure_url: url,
        url,
        public_id: `${LOCAL_ID_PREFIX}${relativePath}`,
        format: ext,
        resource_type: resourceType,
        bytes: buffer.length
    };
};

export const saveImage = async (buffer, folder) => {
    const type = buffer?.length ? sniff(buffer) : null;
    if (!type || type.kind !== 'image') throw badRequest('Unsupported image format');
    return save(buffer, folder, { ext: type.ext, resourceType: 'image' });
};

export const saveVideo = async (buffer, folder) => {
    const type = buffer?.length ? sniff(buffer) : null;
    if (!type || type.kind !== 'video') throw badRequest('Unsupported video format');
    return save(buffer, folder, { ext: type.ext, resourceType: 'video' });
};

export const saveFile = async (buffer, folder, options = {}) => {
    const type = buffer?.length ? sniff(buffer) : null;
    const requested = String(options.format || '').trim().toLowerCase();
    // A file claiming to be a PDF must really be one; other formats can't be sniffed reliably, so they keep the asked-for extension.
    const ext = type?.ext === 'pdf' ? 'pdf' : (RAW_FORMATS.has(requested) && requested !== 'pdf' ? requested : 'bin');
    if (requested === 'pdf' && ext !== 'pdf') throw badRequest('File is not a valid PDF');
    return save(buffer, folder, { ext, resourceType: 'raw', baseName: slug(options.fileName) });
};

/** Removes a file saved by this driver. A file that is already gone is not an error. */
export const deleteLocalFile = async (publicId) => {
    const relativePath = String(publicId || '').slice(LOCAL_ID_PREFIX.length);
    if (!relativePath) return;
    try {
        await fs.unlink(resolveInsideRoot(relativePath));
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
};

/** Creates UPLOAD_DIR if needed and checks the server can write to it. Logs (never throws) so a bad disk setup doesn't take the API down. */
export const ensureUploadDir = async () => {
    try {
        await fs.mkdir(config.uploadDir, { recursive: true });
        await fs.access(config.uploadDir, fsConstants.W_OK);
        logger.info(`[uploads] Storing files on disk in ${config.uploadDir}, served from ${config.uploadPublicUrl}`);
    } catch (err) {
        logger.error(`[uploads] UPLOAD_DIR ${config.uploadDir} is not writable (${err.code || err.message}). Uploads will fail until it is created and owned by the user running the API.`);
    }
};
