import * as repo from './cards.repository.js';

export async function listCardProducts(query = {}) {
    return repo.findCardProducts({
        bank: query.bank,
        network: query.network,
        q: query.q,
    });
}
