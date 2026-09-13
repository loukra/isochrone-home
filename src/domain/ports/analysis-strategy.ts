import type {
  LocationAnalysisRequest,
  LocationAnalysisResult,
} from '../models/analysis.js';

/**
 * Zentraler Wechselpunkt (Spec 21). Erste Implementierung:
 * IsochroneIntersectionStrategy. Später z. B. HeatmapStrategy.
 */
export interface LocationAnalysisStrategy {
  readonly id: string;
  analyze(request: LocationAnalysisRequest): Promise<LocationAnalysisResult>;
}
