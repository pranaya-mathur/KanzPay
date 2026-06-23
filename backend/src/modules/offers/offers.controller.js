import * as offersService from './offers.service.js';
import { startIngestionRun, getIngestionRun } from '../ingestion/ingestion.service.js';
import { IngestionRunInputSchema } from '../../shared/schemas/offer.schema.js';

export async function listOffers(req, res, next) {
    try {
        const result = await offersService.listOffers(req.query);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function getOffer(req, res, next) {
    try {
        const offer = await offersService.getOffer(req.params.id);
        if (!offer) return res.status(404).json({ error: 'Offer not found' });
        res.json(offer);
    } catch (err) {
        next(err);
    }
}

export async function searchOffers(req, res, next) {
    try {
        const result = await offersService.searchOffers(req.query);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function getOffersByMerchant(req, res, next) {
    try {
        const result = await offersService.getOffersByMerchant(req.params.merchant, req.query);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function getOffersByBank(req, res, next) {
    try {
        const result = await offersService.getOffersByBank(req.params.bank, req.query);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function getOffersByCard(req, res, next) {
    try {
        const result = await offersService.getOffersByCard(req.params.card, req.query);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function getFreshOffers(req, res, next) {
    try {
        const result = await offersService.getFreshOffers(req.query);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function createIngestionRun(req, res, next) {
    try {
        const input = IngestionRunInputSchema.parse(req.body || {});
        const result = await startIngestionRun(input);
        res.status(202).json(result);
    } catch (err) {
        next(err);
    }
}

export async function getIngestionRunById(req, res, next) {
    try {
        const run = await getIngestionRun(req.params.id);
        if (!run) return res.status(404).json({ error: 'Ingestion run not found' });
        res.json(run);
    } catch (err) {
        next(err);
    }
}

export async function health(req, res) {
    res.json({ status: 'ok', service: 'kanzpay-backend', timestamp: new Date().toISOString() });
}
