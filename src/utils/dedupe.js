import { buildDedupeKey } from '../schema/offerSchema.js';

export class OfferDeduplicator {
    constructor() {
        this.seen = new Set();
        this.duplicateCount = 0;
    }

    isDuplicate(offer) {
        const key = buildDedupeKey(offer);
        if (this.seen.has(key)) {
            this.duplicateCount += 1;
            return true;
        }
        this.seen.add(key);
        return false;
    }

    getStats() {
        return { unique: this.seen.size, duplicatesSkipped: this.duplicateCount };
    }
}
