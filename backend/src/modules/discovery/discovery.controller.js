import { getDiscoveryCandidates } from '../discovery/discovery-candidates.service.js';

export async function listDiscoveryCandidates(req, res, next) {
    try {
        const data = await getDiscoveryCandidates();
        res.json(data);
    } catch (err) {
        next(err);
    }
}
