import Fuse from 'fuse.js';
import type { VehicleParameter, MatchItem } from '../types';

export const findMatches = (
    requirements: string[],
    library: VehicleParameter[],
    threshold: number = 0.4
): MatchItem[] => {
    // Setup Fuse.js
    const fuse = new Fuse(library, {
        keys: ['name', 'group'], // Weighted? maybe ['name'] is enough
        includeScore: true,
        threshold: threshold,
    });

    return requirements.map((reqName, index) => {
        // Clean the requirement name (remove punctuation, etc if needed)
        // For now take as is.
        const results = fuse.search(reqName);

        let match: VehicleParameter | null = null;
        let score = 0;

        if (results.length > 0) {
            match = results[0].item;
            // Fuse js score: 0 is perfect, 1 is mismatch. We invert to confidence.
            const fuseScore = results[0].score ?? 1;
            score = 1 - fuseScore;
        }

        return {
            id: `req-${index}`,
            requirementName: reqName,
            matchedParam: match,
            confidence: score,
            isManual: false
        };
    });
};
