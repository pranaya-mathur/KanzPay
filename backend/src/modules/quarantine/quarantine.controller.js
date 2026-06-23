import * as quarantineService from '../quarantine/quarantine.service.js';

export async function listQuarantine(req, res, next) {
    try {
        const result = await quarantineService.listQuarantine(req.query);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function getQuarantineRecord(req, res, next) {
    try {
        const record = await quarantineService.getQuarantineRecord(req.params.id);
        if (!record) return res.status(404).json({ error: 'Quarantine record not found' });
        res.json(record);
    } catch (err) {
        next(err);
    }
}

export async function getQuarantineStats(req, res, next) {
    try {
        const stats = await quarantineService.getQuarantineStats();
        res.json(stats);
    } catch (err) {
        next(err);
    }
}

export async function promoteQuarantine(req, res, next) {
    try {
        const result = await quarantineService.promoteQuarantineRecord(req.params.id, {
            reviewedBy: req.body?.reviewedBy || 'api',
        });
        if (result.error === 'not_found') return res.status(404).json({ error: result.error });
        if (result.error) return res.status(422).json(result);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function rejectQuarantine(req, res, next) {
    try {
        const result = await quarantineService.rejectQuarantineRecord(req.params.id, {
            reviewedBy: req.body?.reviewedBy || 'api',
        });
        if (result.error === 'not_found') return res.status(404).json({ error: result.error });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function replayQuarantine(req, res, next) {
    try {
        const result = await quarantineService.replayQuarantineRecord(req.params.id);
        if (result.error === 'not_found') return res.status(404).json({ error: result.error });
        res.json(result);
    } catch (err) {
        next(err);
    }
}
