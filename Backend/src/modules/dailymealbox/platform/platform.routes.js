import express from 'express';
import { FoodAdmin } from '../../../core/admin/admin.model.js';
import {
    getPublicConfig, listControlsForAdmin, setControl, clearCityOverride,
    listAdminAlerts, updateAdminAlertStatus
} from './platformConfig.service.js';
import { listJobs, recentJobRuns, runJobNow } from './jobRunner.js';

const send = (fn) => async (req, res) => {
    try {
        const data = await fn(req, res);
        if (!res.headersSent) res.json({ success: true, ...data });
    } catch (err) {
        res.status(err.statusCode || 400).json({ success: false, message: err.message, code: err.code });
    }
};

/**
 * Public: the web apps' "Remote Config". GET /api/v1/dmb/config?zoneId=…
 * Cheap to call; responds 304 when the client already has the current version (If-None-Match).
 */
export const publicConfigRouter = express.Router();
publicConfigRouter.get('/', async (req, res) => {
    try {
        const cfg = await getPublicConfig({ zoneId: req.query.zoneId || req.zoneId, cityId: req.query.cityId });
        const etag = `"${cfg.version}"`;
        res.set('ETag', etag);
        res.set('Cache-Control', 'no-cache');
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.json({ success: true, config: cfg });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

const loadAdmin = async (req) => {
    const id = req.user?.userId || req.user?._id;
    const admin = await FoodAdmin.findById(id).select('adminRole assignedCityIds email name').lean();
    if (!admin) {
        const err = new Error('Admin not found');
        err.statusCode = 401;
        throw err;
    }
    return admin;
};

/** Admin (mounted under /v1/food/admin/dmb, after the admin auth guard). */
export const adminPlatformRouter = express.Router();

adminPlatformRouter.get('/controls', send(async (req) => {
    const admin = await loadAdmin(req);
    return { ...(await listControlsForAdmin({ cityId: req.query.cityId })), me: { adminRole: admin.adminRole, assignedCityIds: admin.assignedCityIds || [] } };
}));

adminPlatformRouter.put('/controls/:key', send(async (req) => {
    const admin = await loadAdmin(req);
    const control = await setControl({ key: req.params.key, cityId: req.body?.cityId || null, value: req.body?.value, reason: req.body?.reason, admin, req });
    return { control };
}));

adminPlatformRouter.delete('/controls/:key/city/:cityId', send(async (req) => {
    const admin = await loadAdmin(req);
    return clearCityOverride({ key: req.params.key, cityId: req.params.cityId, admin, req });
}));

adminPlatformRouter.get('/alerts', send(async (req) => {
    const admin = await loadAdmin(req);
    const cityIds = admin.adminRole === 'CITY_MANAGER' ? (admin.assignedCityIds || []) : undefined;
    return listAdminAlerts({ status: req.query.status, type: req.query.type, cityIds, limit: req.query.limit, page: req.query.page });
}));

adminPlatformRouter.patch('/alerts/:id', send(async (req) => {
    const admin = await loadAdmin(req);
    return { alert: await updateAdminAlertStatus(req.params.id, req.body?.status, admin._id) };
}));

adminPlatformRouter.get('/jobs', send(async () => ({ jobs: listJobs(), runs: await recentJobRuns({ limit: 100 }) })));

adminPlatformRouter.post('/jobs/:name/run', send(async (req) => {
    const admin = await loadAdmin(req);
    if (admin.adminRole !== 'SUPER_ADMIN') {
        const err = new Error('Only a Super Admin can run jobs manually');
        err.statusCode = 403;
        throw err;
    }
    return { result: await runJobNow(req.params.name) };
}));
