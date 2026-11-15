import type { ScoringWeights, TerrainAnalysisResult } from '../types/lunar';
import type { IlluminationWindowSummary } from './lunarEphemeris';

export interface LandingSuitabilityAssessment {
  overallScore: number; // 0-100
  verdict: 'Suitable (High Confidence)' | 'Conditional (Verify High-Res NAC)' | 'Caution (Moderate Hazards)' | 'Unsuitable (Hazard / Terrain Rejection)';
  subScores: {
    slope: number;
    roughness: number;
    craterProximity: number;
    illumination: number;
    dataCoverage: number;
  };
  dataCoveragePct: number;
  uncertaintyLevel: 'Moderate (1.9 km LOLA Global Baseline)' | 'High (Unverified Meter-Scale Hazards)';
  reasonsForCautionOrRejection: string[];
  scientificReasoning: string[];
  methodologyDoc: string;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  slope: 0.35,
  roughness: 0.2,
  craterProximity: 0.2,
  illumination: 0.15,
  dataCoverage: 0.1,
};

export function evaluateLandingSite(
  terrain: TerrainAnalysisResult,
  illumination: IlluminationWindowSummary | null,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): LandingSuitabilityAssessment {
  // 1. Slope Score (0-100): penalize P95 slope > 5 deg and max slope > 15 deg
  const p95 = terrain.slopeStats.p95Deg;
  const meanS = terrain.slopeStats.meanDeg;
  const slopeScore = Math.max(0, Math.min(100, 100 - Math.max(0, p95 - 2) * 5.5 - Math.max(0, meanS - 2) * 4));

  // 2. Roughness Score (0-100): based on LOLA TRI (meters at 1.9 km baseline)
  const tri = terrain.roughness.triMeters;
  const roughnessScore = Math.max(0, Math.min(100, 100 - Math.max(0, tri - 40) * 0.18));

  // 3. Crater Proximity Score: penalize large/deep craters within 10 km of target center
  const closeCraters = terrain.detectedCraters.filter((c) => c.distanceKm <= 10);
  const nearest = terrain.detectedCraters[0];
  let craterScore = 92;
  if (closeCraters.length > 0) {
    craterScore -= Math.min(60, closeCraters.length * 14);
  }
  if (nearest && nearest.distanceKm < 4 && (nearest.depthM ?? 0) > 150) {
    craterScore -= 25;
  }
  craterScore = Math.max(0, Math.min(100, craterScore));

  // 4. Illumination Score: from ephemeris + LOLA horizon obstruction
  const illumPct = illumination ? illumination.illuminationPct : 50;
  const horizonPenalty = Math.max(0, terrain.horizonAnalysis.meanHorizonDeg - 3) * 3;
  const illuminationScore = Math.max(0, Math.min(100, illumPct * 0.9 + 10 - horizonPenalty));

  // 5. Data Coverage & Resolution Uncertainty Score:
  // Honest scientific discipline: global LOLA LDEM_16 (1.9 km/px) is 100% present,
  // but meter-scale LROC NAC boulder hazard is unavailable globally, capping coverage confidence at 68%.
  const dataCoveragePct = 68;
  const dataCoverageScore = 68;

  const totalW =
    weights.slope +
    weights.roughness +
    weights.craterProximity +
    weights.illumination +
    weights.dataCoverage;

  const weighted =
    (slopeScore * weights.slope +
      roughnessScore * weights.roughness +
      craterScore * weights.craterProximity +
      illuminationScore * weights.illumination +
      dataCoverageScore * weights.dataCoverage) /
    Math.max(0.01, totalW);

  const overallScore = Number(weighted.toFixed(1));

  const reasons: string[] = [];
  if (p95 > 12) {
    reasons.push(`Steep regional slopes: 95th-percentile slope is ${p95.toFixed(1)}° (exceeds 12° lander stability guideline).`);
  }
  if (terrain.slopeStats.maxDeg > 18) {
    reasons.push(`Localized escarpments/crater walls reach ${terrain.slopeStats.maxDeg.toFixed(1)}° within ${terrain.radiusKm} km.`);
  }
  if (tri > 220) {
    reasons.push(`High terrain ruggedness index (TRI = ${tri.toFixed(0)} m) indicates rough highland/crater relief.`);
  }
  if (closeCraters.length > 0) {
    reasons.push(`${closeCraters.length} LOLA-resolved crater depression(s) detected within 10 km of target center.`);
  }
  if (illumination && illumination.illuminationPct < 15) {
    reasons.push(`Low solar illumination availability (${illumination.illuminationPct}% over window); prolonged thermal/power deficit risk.`);
  }
  if (terrain.horizonAnalysis.maxHorizonDeg > 10) {
    reasons.push(`Terrain horizon obstruction peaks at ${terrain.horizonAnalysis.maxHorizonDeg}°; low-angle solar rays or Earth LoS may be blocked.`);
  }
  reasons.push('Sub-meter rock/boulder distribution is NASA DATA UNAVAILABLE in global LOLA LDEM_16 (1.9 km/px); local LROC NAC stereo verification is mandatory before flight.');

  let verdict: LandingSuitabilityAssessment['verdict'] = 'Conditional (Verify High-Res NAC)';
  if (p95 > 15 || overallScore < 48) {
    verdict = 'Unsuitable (Hazard / Terrain Rejection)';
  } else if (overallScore < 66 || p95 > 10) {
    verdict = 'Caution (Moderate Hazards)';
  } else if (overallScore >= 76 && p95 <= 6) {
    verdict = 'Suitable (High Confidence)';
  }

  const scientificReasoning = [
    `Regional LOLA elevation spans ${terrain.elevationStats.minM.toFixed(0)} m to ${terrain.elevationStats.maxM.toFixed(0)} m (relief ${terrain.elevationStats.reliefM.toFixed(0)} m).`,
    `Horn 3x3 slope distribution yields mean ${terrain.slopeStats.meanDeg}° and 95th-percentile ${p95}° (${terrain.slopeStats.suitabilityClass}).`,
    `360° Horizon Analyzer reports mean obstruction ${terrain.horizonAnalysis.meanHorizonDeg}° (Sky View Factor ${terrain.horizonAnalysis.skyViewFactor}).`,
  ];

  return {
    overallScore,
    verdict,
    subScores: {
      slope: Number(slopeScore.toFixed(1)),
      roughness: Number(roughnessScore.toFixed(1)),
      craterProximity: Number(craterScore.toFixed(1)),
      illumination: Number(illuminationScore.toFixed(1)),
      dataCoverage: dataCoverageScore,
    },
    dataCoveragePct,
    uncertaintyLevel: p95 > 10 || tri > 200 ? 'High (Unverified Meter-Scale Hazards)' : 'Moderate (1.9 km LOLA Global Baseline)',
    reasonsForCautionOrRejection: reasons,
    scientificReasoning,
    methodologyDoc:
      'Configurable weighted sum over LOLA LDEM_16 Horn-3x3 slope (P95 & mean), Terrain Ruggedness Index (TRI), LOLA-resolved crater proximity, JPL/IAU ephemeris + horizon-occluded sunlight %, and explicit 68% data-coverage cap due to absence of meter-scale LROC NAC boulder maps.',
  };
}
