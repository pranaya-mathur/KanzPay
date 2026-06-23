import * as repo from './wallet.repository.js';

export async function getInstruments(userId) {
    return repo.getWalletInstruments(userId);
}

export async function getInstrumentsForPayment(userId) {
    return repo.toUserInstruments(await repo.getWalletInstruments(userId));
}

export const addCard = repo.addCard;
export const deleteCard = repo.deleteCard;
export const addCoupon = repo.addCoupon;
export const deleteCoupon = repo.deleteCoupon;
export const replaceLoyaltyAccounts = repo.replaceLoyaltyAccounts;
export const upsertMembership = repo.upsertMembership;
export const addBank = repo.addBank;
export const deleteBank = repo.deleteBank;
