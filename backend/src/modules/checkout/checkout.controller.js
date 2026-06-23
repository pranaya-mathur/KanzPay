import * as checkout from './checkout.service.js';

export async function createSession(req, res, next) {
    try {
        const data = await checkout.createSession(req.user.id, req.body);
        return res.status(201).json({ success: true, data });
    } catch (err) {
        if (err.message?.includes('required') || err.message?.includes('not found')) {
            return res.status(400).json({ success: false, error: err.message });
        }
        return next(err);
    }
}

export async function getRecommend(req, res, next) {
    try {
        const skipAI = req.query.skipAI === 'true' || req.query.skipAI === '1';
        const data = await checkout.getSessionRecommendation(req.params.id, req.user.id, { skipAI });
        return res.json({ success: true, data });
    } catch (err) {
        if (err.message?.includes('not found')) {
            return res.status(404).json({ success: false, error: err.message });
        }
        return next(err);
    }
}

export async function patchInstruments(req, res, next) {
    try {
        const session = await checkout.updateSessionInstruments(req.params.id, req.user.id, req.body);
        if (!session) return res.status(404).json({ success: false, error: 'session not found' });
        const skipAI = req.query.skipAI === 'true' || req.query.skipAI === '1';
        const data = await checkout.getSessionRecommendation(session.id, req.user.id, { skipAI });
        return res.json({ success: true, data });
    } catch (err) {
        return next(err);
    }
}
