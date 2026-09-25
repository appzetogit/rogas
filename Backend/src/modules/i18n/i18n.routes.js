import express from 'express';
import { authMiddleware } from '../../core/auth/auth.middleware.js';
import { requirePermission } from '../../middleware/rbac.middleware.js';
import * as i18n from './i18n.service.js';

const wrap = (fn) => async (req, res) => {
    try {
        const data = await fn(req, res);
        if (data !== undefined) res.json({ success: true, ...data });
    } catch (err) {
        res.status(err.statusCode || 500).json({
            success: false,
            message: err.message,
            ...(err.usage ? { usage: err.usage } : {}),
            ...(err.report ? { report: err.report } : {})
        });
    }
};

const bool = (v) => v === true || v === 'true' || v === '1';

/** Public + per-account routes. Mounted at /v1/i18n */
export const publicI18nRouter = express.Router();

publicI18nRouter.get('/languages', wrap(() => i18n.getPublicLanguages()));

publicI18nRouter.get('/bundle/:code', wrap(async (req) => {
    const requested = String(req.query.ns || '').split(',').map((s) => s.trim()).filter(Boolean);
    const bundle = await i18n.getBundle(req.params.code, requested.length ? { namespaces: requested } : undefined);
    const since = Number(req.query.since);
    if (Number.isFinite(since) && since === bundle.version) return { notModified: true, language: bundle.language, version: bundle.version };
    return bundle;
}));

publicI18nRouter.get('/preference', authMiddleware, wrap((req) => i18n.getPreference(req.user.role, req.user._id)));
publicI18nRouter.put('/preference', authMiddleware, wrap((req) => i18n.setPreference(req.user.role, req.user._id, req.body?.language)));

/** Admin management. Mounted inside admin.routes.js at /i18n (after requireAdmin). */
export const adminI18nRouter = express.Router();
const PERM = 'otaContent';

adminI18nRouter.get('/languages', requirePermission(PERM, 'view'), wrap(async () => ({
    languages: await i18n.listLanguages(),
    stats: await i18n.getLanguageStats(),
    namespaces: i18n.NAMESPACES,
    fallbackLanguage: i18n.FALLBACK_LANGUAGE
})));
adminI18nRouter.post('/languages', requirePermission(PERM, 'edit'), wrap(async (req) => ({ language: await i18n.createLanguage(req.body || {}) })));
adminI18nRouter.put('/languages/:id', requirePermission(PERM, 'edit'), wrap(async (req) => ({ language: await i18n.updateLanguage(req.params.id, req.body || {}) })));
adminI18nRouter.delete('/languages/:id', requirePermission(PERM, 'edit'), wrap((req) => i18n.deleteLanguage(req.params.id)));

adminI18nRouter.get('/translations', requirePermission(PERM, 'view'), wrap((req) => i18n.getCatalogPage({
    language: req.query.language,
    namespace: req.query.namespace,
    q: req.query.q,
    missingOnly: bool(req.query.missingOnly),
    page: req.query.page,
    limit: req.query.limit
})));
adminI18nRouter.put('/translations', requirePermission(PERM, 'edit'), wrap(async (req) => ({ translation: await i18n.upsertTranslation(req.body || {}) })));
adminI18nRouter.post('/translations/import', requirePermission(PERM, 'edit'), wrap(async (req) => ({
    report: await i18n.importTranslations({
        language: req.body?.language,
        namespace: req.body?.namespace,
        data: req.body?.data,
        dryRun: bool(req.body?.dryRun),
        skipInvalid: bool(req.body?.skipInvalid)
    })
})));
adminI18nRouter.get('/translations/export', requirePermission(PERM, 'view'), wrap(async (req) => ({
    data: await i18n.exportTranslations({
        language: req.query.language,
        namespace: req.query.namespace,
        includeMissing: req.query.includeMissing === undefined ? true : bool(req.query.includeMissing)
    })
})));
