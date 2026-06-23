import * as wallet from './wallet.service.js';

export async function getInstruments(req, res, next) {
    try {
        const data = await wallet.getInstruments(req.user.id);
        return res.json({ success: true, data });
    } catch (err) {
        return next(err);
    }
}

export async function addCard(req, res, next) {
    try {
        const data = await wallet.addCard(req.user.id, req.body);
        return res.status(201).json({ success: true, data });
    } catch (err) {
        return next(err);
    }
}

export async function removeCard(req, res, next) {
    try {
        const ok = await wallet.deleteCard(req.user.id, req.params.id);
        if (!ok) return res.status(404).json({ success: false, error: 'card not found' });
        return res.json({ success: true });
    } catch (err) {
        return next(err);
    }
}

export async function addCoupon(req, res, next) {
    try {
        const data = await wallet.addCoupon(req.user.id, req.body);
        return res.status(201).json({ success: true, data });
    } catch (err) {
        return next(err);
    }
}

export async function removeCoupon(req, res, next) {
    try {
        const ok = await wallet.deleteCoupon(req.user.id, req.params.id);
        if (!ok) return res.status(404).json({ success: false, error: 'coupon not found' });
        return res.json({ success: true });
    } catch (err) {
        return next(err);
    }
}

export async function setLoyalty(req, res, next) {
    try {
        const accounts = Array.isArray(req.body) ? req.body : [req.body];
        const data = await wallet.replaceLoyaltyAccounts(req.user.id, accounts);
        return res.json({ success: true, data });
    } catch (err) {
        return next(err);
    }
}

export async function setMembership(req, res, next) {
    try {
        const data = await wallet.upsertMembership(req.user.id, req.body);
        return res.json({ success: true, data });
    } catch (err) {
        return next(err);
    }
}

export async function addBank(req, res, next) {
    try {
        const data = await wallet.addBank(req.user.id, req.body);
        return res.status(201).json({ success: true, data });
    } catch (err) {
        return next(err);
    }
}

export async function removeBank(req, res, next) {
    try {
        const ok = await wallet.deleteBank(req.user.id, req.params.id);
        if (!ok) return res.status(404).json({ success: false, error: 'bank not found' });
        return res.json({ success: true });
    } catch (err) {
        return next(err);
    }
}
