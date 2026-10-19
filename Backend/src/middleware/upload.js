import multer from 'multer';
import { config } from '../config/env.js';

const storage = multer.memoryStorage();

// Files are held in memory until stored, so cap their size (UPLOAD_MAX_FILE_MB) to protect RAM and the server's disk.
export const upload = multer({ storage, limits: { fileSize: config.uploadMaxFileMb * 1024 * 1024 } });
