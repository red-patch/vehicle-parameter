import type { VehicleParameter, MatchItem } from '../types';
import { findBestMatch } from './matchingEngine';

export const findMatches = (
    requirements: string[],
    library: VehicleParameter[],
    threshold: number = 0.4
): MatchItem[] => {
    return requirements.map((reqName, index) => {
        // 使用统一匹配引擎
        const matchResult = findBestMatch(reqName, library, threshold);
        
        // 转换分数为置信度 (Confidence): 1 - score (假设 score 0是完美，1是不匹配)
        // 或者是直接使用匹配类型来决定置信度
        let confidence = 0;
        
        if (matchResult.matchedParam) {
            if (matchResult.matchType === 'exact') confidence = 1.0;
            else if (matchResult.matchType === 'normalized') confidence = 0.95;
            else if (matchResult.matchType === 'alias') confidence = 0.9;
            else if (matchResult.matchType === 'fuzzy') {
                // Fuse score: 0=Perfect, 1=Mismatch
                // Confidence = 1 - score
                confidence = Math.max(0, 1 - matchResult.score);
            }
        }

        return {
            id: `req-${index}`,
            requirementName: reqName,
            matchedParam: matchResult.matchedParam || null,
            confidence: parseFloat(confidence.toFixed(2)),
            isManual: false
        };
    });
};
