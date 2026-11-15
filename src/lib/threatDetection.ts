import type { TerrainAnalysisResult } from '../types/lunar';

export interface ThreatCraterMarker {
  id: string;
  x: number;
  z: number;
  y: number;
  radiusUnits: number;
  diameterKm: number;
  depthM: number | null;
}

export interface SteepSlopeMarker {
  x: number;
  z: number;
  y: number;
  slopeDeg: number;
}

export interface ThreatAssessmentSummary {
  steepSlopeCellCount: number;
  moderateSlopeCellCount: number;
  craterThreatCount: number;
  craterMarkers: ThreatCraterMarker[];
  steepMarkers: SteepSlopeMarker[];
  safestPad: {
    x: number;
    z: number;
    y: number;
    offsetNorthM: number;
    offsetEastM: number;
    slopeDeg: number;
    neighborMaxSlopeDeg: number;
    craterClearanceKm: number;
    divertDistanceFromTargetM: number;
    safe: boolean;
  };
  overallThreatLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  threatsDetected: string[];
}

export const SIM_SPAN_UNITS = 40;

export function runLolaThreatScan(
  terrain: TerrainAnalysisResult,
  solarElevationDeg?: number,
): ThreatAssessmentSummary {
  const n = terrain.gridSize;
  const spanUnits = SIM_SPAN_UNITS;
  const relief = Math.max(50, terrain.elevationStats.reliefM);
  const heightScale = 5.5 / relief;
  const centerElev = terrain.centerElevationM;
  const metersPerUnit = (terrain.radiusKm * 2000) / spanUnits;

  const gridToXZ = (r: number, c: number) => {
    const u = c / Math.max(1, n - 1);
    const v = r / Math.max(1, n - 1);
    return {
      x: (u - 0.5) * spanUnits,
      z: (v - 0.5) * spanUnits,
    };
  };

  // Map detected LOLA craters inside the simulated terrain patch
  const craterMarkers: ThreatCraterMarker[] = [];
  for (const crater of terrain.detectedCraters) {
    if (crater.distanceKm > terrain.radiusKm * 0.95) continue;
    const azRad = (crater.azimuthDeg * Math.PI) / 180;
    const rUnits = (crater.distanceKm / terrain.radiusKm) * (spanUnits / 2);
    const cx = rUnits * Math.sin(azRad);
    const cz = -rUnits * Math.cos(azRad);
    const radiusUnits = Math.max(0.55, ((crater.diameterKm / 2) / terrain.radiusKm) * (spanUnits / 2));
    const cy = (crater.rimElevationM - centerElev) * heightScale;
    craterMarkers.push({
      id: crater.id,
      x: cx,
      z: cz,
      y: cy,
      radiusUnits,
      diameterKm: crater.diameterKm,
      depthM: crater.depthM,
    });
  }

  let steepSlopeCellCount = 0;
  let moderateSlopeCellCount = 0;
  const steepCandidates: SteepSlopeMarker[] = [];

  let bestCost = Number.POSITIVE_INFINITY;
  let safest = {
    x: 0,
    z: 0,
    y: 0,
    slopeDeg: terrain.slopeStats.meanDeg,
    neighborMaxSlopeDeg: terrain.slopeStats.meanDeg,
    craterClearanceKm: 99,
  };

  for (let r = 1; r < n - 1; r++) {
    for (let c = 1; c < n - 1; c++) {
      const slope = terrain.slopeGrid[r][c];
      const elev = terrain.elevationGrid[r][c];
      const y = (elev - centerElev) * heightScale;
      const { x, z } = gridToXZ(r, c);

      if (slope >= 12) {
        steepSlopeCellCount++;
        if (Math.hypot(x, z) < 16) {
          steepCandidates.push({ x, z, y, slopeDeg: slope });
        }
      } else if (slope >= 8) {
        moderateSlopeCellCount++;
      }

      const distUnits = Math.hypot(x, z);
      if (distUnits > 14) continue; // Search inside landing approach corridor

      // 3x3 neighborhood slope & relief roughness check
      let neighborMaxSlope = slope;
      let elevMin = elev;
      let elevMax = elev;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const ns = terrain.slopeGrid[r + dr][c + dc];
          const ne = terrain.elevationGrid[r + dr][c + dc];
          if (ns > neighborMaxSlope) neighborMaxSlope = ns;
          if (ne < elevMin) elevMin = ne;
          if (ne > elevMax) elevMax = ne;
        }
      }
      const localReliefM = elevMax - elevMin;

      // Minimum clearance from any detected crater rim in km
      let minClearanceKm = 99;
      for (const cr of craterMarkers) {
        const dKm = (Math.hypot(x - cr.x, z - cr.z) * metersPerUnit) / 1000;
        const edgeDistKm = dKm - cr.diameterKm * 0.55;
        if (edgeDistKm < minClearanceKm) minClearanceKm = edgeDistKm;
      }

      const craterPenalty = minClearanceKm < 0 ? 120 + Math.abs(minClearanceKm) * 30 : minClearanceKm < 1.5 ? 25 : 0;
      const slopePenalty = slope > 12 ? 90 + slope * 4 : slope * 2.5;
      const cost =
        slopePenalty +
        neighborMaxSlope * 1.15 +
        (localReliefM / 500) * 6 +
        craterPenalty +
        distUnits * 0.12;

      if (cost < bestCost) {
        bestCost = cost;
        safest = {
          x,
          z,
          y,
          slopeDeg: slope,
          neighborMaxSlopeDeg: neighborMaxSlope,
          craterClearanceKm: Number(minClearanceKm.toFixed(2)),
        };
      }
    }
  }

  // Pick top 6 steepest distinct hazard hotspots for crisp 3D markers
  steepCandidates.sort((a, b) => b.slopeDeg - a.slopeDeg);
  const steepMarkers: SteepSlopeMarker[] = [];
  for (const cand of steepCandidates) {
    if (steepMarkers.every((m) => Math.hypot(m.x - cand.x, m.z - cand.z) > 2.4)) {
      steepMarkers.push(cand);
      if (steepMarkers.length >= 6) break;
    }
  }

  const padSafe = safest.slopeDeg <= 16 && safest.neighborMaxSlopeDeg <= 22;
  const divertDistanceFromTargetM = Math.round(Math.hypot(safest.x, safest.z) * metersPerUnit);

  const threatsDetected: string[] = [];
  if (steepSlopeCellCount > 0) {
    threatsDetected.push(`${steepSlopeCellCount} high-slope LOLA cells (>=12°, max ${terrain.slopeStats.maxDeg}°)`);
  }
  if (craterMarkers.length > 0) {
    threatsDetected.push(`${craterMarkers.length} crater depression hazard(s) within landing corridor`);
  }
  if (terrain.roughness.triMeters > 80) {
    threatsDetected.push(`Elevated topographic roughness index (TRI ${terrain.roughness.triMeters} m)`);
  }
  if (solarElevationDeg !== undefined && solarElevationDeg <= 0) {
    threatsDetected.push(`Low/negative solar elevation (${solarElevationDeg.toFixed(1)}°) — optical shadow hazard`);
  } else if (solarElevationDeg !== undefined && solarElevationDeg < 7) {
    threatsDetected.push(`Grazing solar angle (${solarElevationDeg.toFixed(1)}°) — long crater shadows`);
  }
  if (threatsDetected.length === 0) {
    threatsDetected.push('No regional LOLA macro-slope or crater rim threats detected in landing corridor');
  }

  let overallThreatLevel: ThreatAssessmentSummary['overallThreatLevel'] = 'LOW';
  if (!padSafe) overallThreatLevel = 'CRITICAL';
  else if (steepSlopeCellCount > 25 || craterMarkers.length >= 3 || terrain.slopeStats.p95Deg > 15) {
    overallThreatLevel = 'HIGH';
  } else if (steepSlopeCellCount > 0 || craterMarkers.length > 0 || moderateSlopeCellCount > 15) {
    overallThreatLevel = 'MODERATE';
  }

  return {
    steepSlopeCellCount,
    moderateSlopeCellCount,
    craterThreatCount: craterMarkers.length,
    craterMarkers,
    steepMarkers,
    safestPad: {
      x: safest.x,
      z: safest.z,
      y: safest.y,
      offsetNorthM: Math.round(-safest.z * metersPerUnit),
      offsetEastM: Math.round(safest.x * metersPerUnit),
      slopeDeg: Number(safest.slopeDeg.toFixed(2)),
      neighborMaxSlopeDeg: Number(safest.neighborMaxSlopeDeg.toFixed(2)),
      craterClearanceKm: safest.craterClearanceKm,
      divertDistanceFromTargetM,
      safe: padSafe,
    },
    overallThreatLevel,
    threatsDetected,
  };
}
