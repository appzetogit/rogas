/**
 * Upload storage. In production files go to this server's disk (UPLOAD_DIR, /var/www/uploads) and are served from
 * /uploads; in development they go to Cloudinary. This covers the disk driver: what it accepts, where files land,
 * that a client can't steer a file outside UPLOAD_DIR or store HTML, and that the files are served cross-origin.
 *
 * No database needed:   node --test tests/uploadStorage.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uploads-test-'));
process.env.UPLOAD_DRIVER = 'local';
process.env.UPLOAD_DIR = dir;
process.env.UPLOAD_PUBLIC_URL = 'https://api.example.test/uploads';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const storage = await import('../src/services/upload.service.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const PDF = Buffer.from('%PDF-1.4\n%test\n');
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

const toDiskPath = (url) => path.join(dir, ...new URL(url).pathname.replace(/^\/uploads\//, '').split('/'));

after(() => fs.rm(dir, { recursive: true, force: true }));

test('an image is written under UPLOAD_DIR and gets a public URL on the API', async () => {
    const res = await storage.uploadImageBufferDetailed(PNG, 'food/hero-banners');
    assert.match(res.secure_url, /^https:\/\/api\.example\.test\/uploads\/food\/hero-banners\/\d+-[0-9a-f]{16}\.png$/);
    assert.match(res.public_id, /^local:food\/hero-banners\//);
    assert.deepEqual(await fs.readFile(toDiskPath(res.secure_url)), PNG);
});

test('the plain helpers return just the URL, like the Cloudinary ones did', async () => {
    const url = await storage.uploadImageBuffer(PNG, 'uploads');
    assert.equal(typeof url, 'string');
    assert.match(url, /\/uploads\/misc\//, 'a bare "uploads" folder is not nested twice');
});

test('a PDF keeps a readable name and the .pdf extension', async () => {
    const url = await storage.uploadFileBuffer(PDF, 'food/restaurants/menu-pdf', { fileName: 'My Menu.pdf', format: 'pdf' });
    assert.match(url, /\/food\/restaurants\/menu-pdf\/my-menu-[0-9a-f]{16}\.pdf$/);
    assert.equal(storage.buildRawDownloadUrlFromFileUrl(url), url, 'files on this server download directly');
});

test('the real content decides the type: HTML is never stored as an image or a PDF', async () => {
    await assert.rejects(storage.uploadImageBuffer(HTML, 'x'), (err) => err.statusCode === 400);
    await assert.rejects(storage.uploadFileBuffer(HTML, 'x', { fileName: 'evil.html', format: 'pdf' }), (err) => err.statusCode === 400);
    await assert.rejects(storage.uploadVideoBuffer(PNG, 'x'), (err) => err.statusCode === 400);
});

test('a client-chosen folder cannot escape UPLOAD_DIR', async () => {
    const url = await storage.uploadImageBuffer(PNG, '../../etc/../Cron.d\\..\\x');
    const onDisk = toDiskPath(url);
    assert.ok(onDisk.startsWith(dir + path.sep), onDisk);
    assert.match(url, /\/uploads\/etc\/crond\/x\//);
    await assert.rejects(storage.deleteUploadedFile('local:../../outside.txt'), /Invalid file path/);
});

test('deleting by the stored public id removes the file, and a second delete is harmless', async () => {
    const res = await storage.uploadImageBufferDetailed(PNG, 'food/explore-icons');
    await storage.deleteUploadedFile(res.public_id);
    await assert.rejects(fs.access(toDiskPath(res.secure_url)));
    await storage.deleteUploadedFile(res.public_id);
});

test('stored files are served at /uploads and can be embedded by the apps on another origin', async () => {
    const { default: app } = await import('../src/app.js');
    const url = await storage.uploadImageBuffer(PNG, 'food/served');
    const server = app.listen(0);
    try {
        const { port } = server.address();
        const res = await fetch(`http://127.0.0.1:${port}${new URL(url).pathname}`);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
        assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
    } finally {
        server.close();
    }
});
