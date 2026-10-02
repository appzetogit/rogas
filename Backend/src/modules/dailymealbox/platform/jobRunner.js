import mongoose from 'mongoose';
import { logger } from '../../../utils/logger.js';

/**
 * Tiny scheduler for the DailyMealBox background jobs (the SOP's "CRON" items).
 *
 * Each job declares how its period is named (`periodKey(now)` → e.g. "2026-10-02" for a daily job, or
 * "2026-10-02T10:15" for a 15-minute job) and optionally `isDue(now)`. A run claims its period by inserting a
 * dmb_job_runs row with a unique (name, periodKey) — so with several server instances, or after a restart, each period
 * runs exactly once. A run that crashes is recorded as failed and retried on the next tick of the same period, up to
 * MAX_ATTEMPTS.
 */

const MAX_ATTEMPTS = 3;

const jobRunSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        periodKey: { type: String, required: true },
        status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
        attempts: { type: Number, default: 1 },
        startedAt: { type: Date, default: () => new Date() },
        finishedAt: { type: Date, default: null },
        result: { type: mongoose.Schema.Types.Mixed, default: null },
        error: { type: String, default: '' }
    },
    { collection: 'dmb_job_runs', timestamps: true }
);
jobRunSchema.index({ name: 1, periodKey: 1 }, { unique: true });
jobRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });

export const DMBJobRun = mongoose.models.DMBJobRun || mongoose.model('DMBJobRun', jobRunSchema);

const jobs = new Map();

/** register({ name, periodKey: (now) => string, isDue?: (now) => boolean, run: async (now) => result }) */
export const registerJob = (job) => {
    if (!job?.name || typeof job.run !== 'function' || typeof job.periodKey !== 'function') throw new Error('Invalid job definition');
    jobs.set(job.name, job);
};

export const listJobs = () => [...jobs.values()].map((j) => ({ name: j.name, description: j.description || '' }));

const claim = async (name, periodKey) => {
    try {
        await DMBJobRun.create({ name, periodKey });
        return true;
    } catch (err) {
        if (err?.code !== 11000) throw err;
        // Someone already claimed this period. Retry only a failed run that has attempts left.
        const res = await DMBJobRun.updateOne(
            { name, periodKey, status: 'failed', attempts: { $lt: MAX_ATTEMPTS } },
            { $set: { status: 'running', startedAt: new Date(), error: '' }, $inc: { attempts: 1 } }
        );
        return res.modifiedCount === 1;
    }
};

/** Runs one job now if its current period has not run yet. Returns the result, or null when skipped. */
export const runJobIfDue = async (name, now = new Date()) => {
    const job = jobs.get(name);
    if (!job) throw new Error(`Unknown job ${name}`);
    if (job.isDue && !job.isDue(now)) return null;
    const periodKey = job.periodKey(now);
    if (!(await claim(name, periodKey))) return null;
    try {
        const result = await job.run(now);
        await DMBJobRun.updateOne({ name, periodKey }, { $set: { status: 'done', finishedAt: new Date(), result: result ?? null } });
        return result ?? {};
    } catch (err) {
        logger.warn(`[jobs] ${name} (${periodKey}) failed: ${err?.message || err}`);
        await DMBJobRun.updateOne({ name, periodKey }, { $set: { status: 'failed', finishedAt: new Date(), error: String(err?.message || err).slice(0, 500) } });
        return null;
    }
};

/** Forces a run regardless of period bookkeeping (admin "run now"). */
export const runJobNow = async (name, now = new Date()) => {
    const job = jobs.get(name);
    if (!job) throw new Error(`Unknown job ${name}`);
    return job.run(now);
};

let timer = null;
let ticking = false;
export const tick = async (now = new Date()) => {
    if (ticking) return;
    ticking = true;
    try {
        for (const name of jobs.keys()) {
            await runJobIfDue(name, now);
        }
    } finally {
        ticking = false;
    }
};

export const startJobRunner = ({ everyMs = 60_000 } = {}) => {
    if (timer || process.env.DMB_JOBS === 'false') return;
    timer = setInterval(() => {
        tick().catch((err) => logger.warn(`[jobs] tick failed: ${err?.message || err}`));
    }, everyMs);
    timer.unref?.();
    logger.info(`[jobs] DailyMealBox job runner started (${jobs.size} jobs)`);
};

export const stopJobRunner = () => {
    if (timer) clearInterval(timer);
    timer = null;
};

export const recentJobRuns = async ({ limit = 100 } = {}) =>
    DMBJobRun.find({}).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).lean();
