import * as repo from './merchants.repository.js';

export async function registerMerchant(body) {
    if (!body?.name) throw new Error('merchant name is required');
    const merchant = await repo.createMerchant(body);
    await repo.addAlias(merchant.id, body.name);
    if (body.aliases?.length) {
        for (const alias of body.aliases) {
            await repo.addAlias(merchant.id, alias);
        }
    }
    return merchant;
}

export const findMerchantById = repo.findMerchantById;
export const listMerchants = repo.listMerchants;
export const resolveMerchantSearchTerms = repo.resolveMerchantSearchTerms;
