import * as offersRepo from './offers.repository.js';
import { validateOfferQuery } from '../../shared/schemas/offer.schema.js';

export async function listOffers(query) {
    const filters = validateOfferQuery(query);
    return offersRepo.findOffers(filters);
}

export async function getOffer(id) {
    return offersRepo.findOfferById(id);
}

export async function searchOffers(query) {
    const filters = validateOfferQuery(query);
    return offersRepo.findOffers(filters);
}

export async function getOffersByMerchant(merchant, query = {}) {
    const filters = validateOfferQuery({ ...query, merchant });
    return offersRepo.findByMerchant(merchant, filters);
}

export async function getOffersByBank(bank, query = {}) {
    const filters = validateOfferQuery({ ...query, bank });
    return offersRepo.findByBank(bank, filters);
}

export async function getOffersByCard(card, query = {}) {
    const filters = validateOfferQuery({ ...query, card });
    return offersRepo.findByCard(card, filters);
}

export async function getFreshOffers(query = {}) {
    const filters = validateOfferQuery(query);
    return offersRepo.findFreshOffers(filters);
}

export async function refreshStaleOffers() {
    return offersRepo.markStaleOffers();
}
