import * as sourcesService from './sources.service.js';

export async function listSources(req, res, next) {
    try {
        res.json(await sourcesService.listSources(req.query));
    } catch (err) {
        next(err);
    }
}

export async function getSource(req, res, next) {
    try {
        const source = await sourcesService.getSource(req.params.id);
        if (!source) return res.status(404).json({ error: 'Source not found' });
        res.json(source);
    } catch (err) {
        next(err);
    }
}

export async function listApproved(req, res, next) {
    try {
        res.json({ data: await sourcesService.listByStatus('approved') });
    } catch (err) {
        next(err);
    }
}

export async function listProbation(req, res, next) {
    try {
        res.json({ data: await sourcesService.listByStatus('probation') });
    } catch (err) {
        next(err);
    }
}

export async function listRejected(req, res, next) {
    try {
        res.json({ data: await sourcesService.listByStatus('rejected') });
    } catch (err) {
        next(err);
    }
}

export async function validateSources(req, res, next) {
    try {
        const result = await sourcesService.validateSource(req.body || {});
        res.status(202).json(result);
    } catch (err) {
        next(err);
    }
}

export async function updateStatus(req, res, next) {
    try {
        const updated = await sourcesService.setSourceStatus(req.params.id, req.body || {});
        res.json(updated);
    } catch (err) {
        next(err);
    }
}

export async function getHealth(req, res, next) {
    try {
        const health = await sourcesService.getSourceHealth(req.params.id);
        if (!health) return res.status(404).json({ error: 'Source not found' });
        res.json(health);
    } catch (err) {
        next(err);
    }
}

export async function getDashboard(req, res, next) {
    try {
        res.json(await sourcesService.getSourceDashboard());
    } catch (err) {
        next(err);
    }
}
