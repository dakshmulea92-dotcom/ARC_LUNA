import fs from 'node:fs';
import path from 'node:path';

export const LUNAR_RADIUS_KM = 1737.4;
export const LUNAR_RADIUS_M = 1737400;

export interface LolaDatasetMeta {
  datasetId: string;
  productId: string;
  sourceName: string;
  instrument: string;
  mission: string;
  resolutionDeg: number; // 16 px/deg
  resolutionMetersAtEquator: number; // 1895.21 m/pix
  lines: number;
  samples: number;
  units: string;
  scalingFactor: number;
  referenceRadiusM: number;
  observationPeriod: string;
  coordinateSystem: string;
  sourceUrl: string;
  filePath: string;
  fileSizeBytes: number;
  available: boolean;
  methodology: string;
}

export interface ElevationSample {
  lat: number;
  lon: number; // normalized -180..180
  lon360: number;
  elevationM: number;
  planetaryRadiusM: number;
  nearestRawM: number;
  dataAvailable: boolean;
  provenance: LolaDatasetMeta;
}

export interface CraterDetection {
  id: string;
  lat: number;
  lon: number;
  diameterKm: number;
  depthM: number | null;
  rimElevationM: number;
  floorElevationM: number;
  distanceKm: number;
  azimuthDeg: number;
  source: 'LOLA_DEM_DETECTED';
}

export interface HorizonSample {
  azimuthDeg: number;
  horizonAngleDeg: number;
  ridgeDistanceKm: number;
  ridgeElevationM: number;
  obstructed: boolean;
}

export interface TerrainAnalysisResult {
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  gridSize: number;
  cellSpacingKm: number;
  centerElevationM: number;
  elevationGrid: number[][]; // meters relative to 1737.4 km
  slopeGrid: number[][]; // degrees
  elevationStats: {
    minM: number;
    maxM: number;
    meanM: number;
    stdDevM: number;
    reliefM: number;
  };
  slopeStats: {
    minDeg: number;
    meanDeg: number;
    maxDeg: number;
    p95Deg: number;
    suitabilityClass: 'Optimal (<5°)' | 'Nominal (5°–10°)' | 'Marginal (10°–15°)' | 'Hazardous (>15°)';
    histogram: { label: string; count: number; pct: number }[];
  };
  roughness: {
    rmsResidualM: number;
    triMeters: number;
    baselineResolutionM: number;
    subMeterBoulderData: 'NASA DATA UNAVAILABLE';
    boulderNote: string;
  };
  detectedCraters: CraterDetection[];
  horizonAnalysis: {
    maxSearchRadiusKm: number;
    meanHorizonDeg: number;
    maxHorizonDeg: number;
    minHorizonDeg: number;
    skyViewFactor: number;
    obstructedDirectionsCount: number; // > 2 deg horizon obstruction
    samples: HorizonSample[];
  };
  provenance: LolaDatasetMeta;
  methodologyNotes: string[];
}

export interface ProfilePoint {
  distanceKm: number;
  lat: number;
  lon: number;
  elevationM: number;
  slopeDeg: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'data', 'nasa-lola');
const LDEM16_PATH = path.join(DATA_DIR, 'ldem_16.img');
const LDEM4_PATH = path.join(DATA_DIR, 'ldem_4.img');

class LolaService {
  private fd16: number | null = null;
  private fd4: number | null = null;
  private rowCache = new Map<number, Int16Array>();
  private maxRowCache = 512;
  private patchCache = new Map<string, TerrainAnalysisResult>();
  private cacheHits = 0;
  private cacheMisses = 0;

  private ensureOpen(): { fd: number; ppd: number; lines: number; samples: number; scaleM: number; filePath: string; productId: string; sizeBytes: number } {
    if (fs.existsSync(LDEM16_PATH)) {
      if (this.fd16 === null) {
        this.fd16 = fs.openSync(LDEM16_PATH, 'r');
      }
      const stat = fs.statSync(LDEM16_PATH);
      return {
        fd: this.fd16,
        ppd: 16,
        lines: 2880,
        samples: 5760,
        scaleM: 1895.21,
        filePath: LDEM16_PATH,
        productId: 'LDEM_16',
        sizeBytes: stat.size,
      };
    }
    if (fs.existsSync(LDEM4_PATH)) {
      if (this.fd4 === null) {
        this.fd4 = fs.openSync(LDEM4_PATH, 'r');
      }
      const stat = fs.statSync(LDEM4_PATH);
      return {
        fd: this.fd4,
        ppd: 4,
        lines: 720,
        samples: 1440,
        scaleM: 7580.84,
        filePath: LDEM4_PATH,
        productId: 'LDEM_4',
        sizeBytes: stat.size,
      };
    }
    throw new Error('NASA DATA UNAVAILABLE: LOLA LDEM binary file not found on server.');
  }

  public getDatasetMeta(): LolaDatasetMeta {
    const has16 = fs.existsSync(LDEM16_PATH);
    const has4 = fs.existsSync(LDEM4_PATH);
    const targetPath = has16 ? LDEM16_PATH : LDEM4_PATH;
    const available = has16 || has4;
    const sizeBytes = available ? fs.statSync(targetPath).size : 0;

    return {
      datasetId: 'LRO-L-LOLA-4-GDR-V1.0',
      productId: has16 ? 'LDEM_16' : 'LDEM_4',
      sourceName: 'NASA Planetary Data System (PDS) — LRO LOLA Science Team / GSFC',
      instrument: 'Lunar Orbiter Laser Altimeter (LOLA)',
      mission: 'Lunar Reconnaissance Orbiter (LRO)',
      resolutionDeg: has16 ? 16 : 4,
      resolutionMetersAtEquator: has16 ? 1895.21 : 7580.84,
      lines: has16 ? 2880 : 720,
      samples: has16 ? 5760 : 1440,
      units: 'Meters (relative to 1,737.4 km reference sphere)',
      scalingFactor: 0.5,
      referenceRadiusM: LUNAR_RADIUS_M,
      observationPeriod: '2009-07-13T17:33:17 to 2016-11-29T05:48:19 UTC (LRO_ES_52)',
      coordinateSystem: 'MEAN EARTH/POLAR AXIS OF DE421 (Simple Cylindrical, East Longitude)',
      sourceUrl: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img',
      filePath: targetPath,
      fileSizeBytes: sizeBytes,
      available,
      methodology:
        '16-bit signed LSB integer height DN * 0.5 m relative to R=1737.4 km. Geolocated via GRGM 900C gravity field. Bilinear interpolation for sub-pixel queries; Horn 3x3 finite-difference slope with cos(lat) spherical scaling.',
    };
  }

  public getCacheStats() {
    return {
      cachedRows: this.rowCache.size,
      cachedPatches: this.patchCache.size,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
    };
  }

  public clearCache() {
    this.rowCache.clear();
    this.patchCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  private readRow(line: number): Int16Array {
    const info = this.ensureOpen();
    const clampedLine = Math.max(0, Math.min(info.lines - 1, line));
    const cached = this.rowCache.get(clampedLine);
    if (cached) {
      this.cacheHits++;
      return cached;
    }
    this.cacheMisses++;

    const rowBytes = info.samples * 2;
    const buf = Buffer.allocUnsafe(rowBytes);
    const offset = clampedLine * rowBytes;
    fs.readSync(info.fd, buf, 0, rowBytes, offset);

    const arr = new Int16Array(info.samples);
    for (let i = 0; i < info.samples; i++) {
      arr[i] = buf.readInt16LE(i * 2);
    }

    if (this.rowCache.size >= this.maxRowCache) {
      const oldestKey = this.rowCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.rowCache.delete(oldestKey);
      }
    }
    this.rowCache.set(clampedLine, arr);
    return arr;
  }

  public normalizeLon360(lon: number): number {
    return ((lon % 360) + 360) % 360;
  }

  public normalizeLon180(lon: number): number {
    const l = this.normalizeLon360(lon);
    return l > 180 ? l - 360 : l;
  }

  public sampleElevationRaw(lat: number, lon: number): { bilinearM: number; nearestM: number } {
    const info = this.ensureOpen();
    const clampedLat = Math.max(-90, Math.min(90, lat));
    const lon360 = this.normalizeLon360(lon);

    // PDS3 pixel registration:
    // LINE_FIRST_PIXEL = 1 corresponds to +90 - 0.5/ppd
    const fy = (90 - clampedLat) * info.ppd - 0.5;
    const fx = lon360 * info.ppd - 0.5;

    const y0 = Math.max(0, Math.min(info.lines - 1, Math.floor(fy)));
    const y1 = Math.max(0, Math.min(info.lines - 1, y0 + 1));
    const ty = Math.max(0, Math.min(1, fy - y0));

    const x0 = ((Math.floor(fx) % info.samples) + info.samples) % info.samples;
    const x1 = (x0 + 1) % info.samples;
    const tx = fx - Math.floor(fx);

    const row0 = this.readRow(y0);
    const row1 = y1 === y0 ? row0 : this.readRow(y1);

    const z00 = row0[x0] * 0.5;
    const z10 = row0[x1] * 0.5;
    const z01 = row1[x0] * 0.5;
    const z11 = row1[x1] * 0.5;

    const top = z00 * (1 - tx) + z10 * tx;
    const bot = z01 * (1 - tx) + z11 * tx;
    const bilinearM = top * (1 - ty) + bot * ty;

    const ny = Math.max(0, Math.min(info.lines - 1, Math.round(fy)));
    const nx = ((Math.round(fx) % info.samples) + info.samples) % info.samples;
    const nearestM = this.readRow(ny)[nx] * 0.5;

    return { bilinearM, nearestM };
  }

  public sampleElevation(lat: number, lon: number): ElevationSample {
    const provenance = this.getDatasetMeta();
    const lon360 = this.normalizeLon360(lon);
    const lon180 = this.normalizeLon180(lon);
    if (!provenance.available) {
      return {
        lat,
        lon: lon180,
        lon360,
        elevationM: 0,
        planetaryRadiusM: LUNAR_RADIUS_M,
        nearestRawM: 0,
        dataAvailable: false,
        provenance,
      };
    }
    const { bilinearM, nearestM } = this.sampleElevationRaw(lat, lon);
    return {
      lat,
      lon: lon180,
      lon360,
      elevationM: Number(bilinearM.toFixed(2)),
      planetaryRadiusM: Number((LUNAR_RADIUS_M + bilinearM).toFixed(2)),
      nearestRawM: Number(nearestM.toFixed(2)),
      dataAvailable: true,
      provenance,
    };
  }

  public sphericalDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = Math.PI / 180;
    const phi1 = lat1 * toRad;
    const phi2 = lat2 * toRad;
    const dPhi = (lat2 - lat1) * toRad;
    const dLam = (lon2 - lon1) * toRad;
    const a =
      Math.sin(dPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
    return 2 * LUNAR_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  public destinationPoint(latDeg: number, lonDeg: number, azimuthDeg: number, distanceKm: number): { lat: number; lon: number } {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const delta = distanceKm / LUNAR_RADIUS_KM;
    const theta = azimuthDeg * toRad;
    const phi1 = latDeg * toRad;
    const lam1 = lonDeg * toRad;

    const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
    const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
    const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
    const x = Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2);
    const lam2 = lam1 + Math.atan2(y, x);

    return {
      lat: Math.max(-90, Math.min(90, phi2 * toDeg)),
      lon: this.normalizeLon180(lam2 * toDeg),
    };
  }

  public analyzeTerrainPatch(lat: number, lon: number, radiusKm = 30, gridSize = 33): TerrainAnalysisResult {
    const clampedRadius = Math.max(5, Math.min(150, radiusKm));
    const clampedGrid = Math.max(15, Math.min(49, gridSize % 2 === 0 ? gridSize + 1 : gridSize));
    const key = `${lat.toFixed(3)}:${lon.toFixed(3)}:${clampedRadius}:${clampedGrid}`;
    const existing = this.patchCache.get(key);
    if (existing) {
      return existing;
    }

    const provenance = this.getDatasetMeta();
    const half = Math.floor(clampedGrid / 2);
    const cellSpacingKm = (clampedRadius * 2) / (clampedGrid - 1);
    const cellSpacingM = cellSpacingKm * 1000;

    // Sample local tangent-plane grid around (lat, lon) using spherical great-circle offsets
    const elevationGrid: number[][] = [];
    const latGrid: number[][] = [];
    const lonGrid: number[][] = [];

    for (let r = 0; r < clampedGrid; r++) {
      const rowElev: number[] = [];
      const rowLat: number[] = [];
      const rowLon: number[] = [];
      const northKm = (half - r) * cellSpacingKm;
      for (let c = 0; c < clampedGrid; c++) {
        const eastKm = (c - half) * cellSpacingKm;
        const distKm = Math.hypot(northKm, eastKm);
        let pLat = lat;
        let pLon = this.normalizeLon180(lon);
        if (distKm > 1e-6) {
          const az = (Math.atan2(eastKm, northKm) * 180) / Math.PI;
          const pt = this.destinationPoint(lat, lon, az, distKm);
          pLat = pt.lat;
          pLon = pt.lon;
        }
        const { bilinearM } = this.sampleElevationRaw(pLat, pLon);
        rowElev.push(Number(bilinearM.toFixed(2)));
        rowLat.push(pLat);
        rowLon.push(pLon);
      }
      elevationGrid.push(rowElev);
      latGrid.push(rowLat);
      lonGrid.push(rowLon);
    }

    // Horn's 3x3 finite-difference slope calculation (degrees)
    const slopeGrid: number[][] = Array.from({ length: clampedGrid }, () => Array(clampedGrid).fill(0));
    const allSlopes: number[] = [];
    const allElevs: number[] = [];

    for (let r = 0; r < clampedGrid; r++) {
      for (let c = 0; c < clampedGrid; c++) {
        allElevs.push(elevationGrid[r][c]);
        const r0 = Math.max(0, r - 1);
        const r2 = Math.min(clampedGrid - 1, r + 1);
        const c0 = Math.max(0, c - 1);
        const c2 = Math.min(clampedGrid - 1, c + 1);

        const a = elevationGrid[r0][c0];
        const b = elevationGrid[r0][c];
        const cc = elevationGrid[r0][c2];
        const d = elevationGrid[r][c0];
        const f = elevationGrid[r][c2];
        const g = elevationGrid[r2][c0];
        const h = elevationGrid[r2][c];
        const i = elevationGrid[r2][c2];

        const dzdx = ((cc + 2 * f + i) - (a + 2 * d + g)) / (8 * cellSpacingM);
        const dzdy = ((g + 2 * h + i) - (a + 2 * b + cc)) / (8 * cellSpacingM);
        const slopeRad = Math.atan(Math.hypot(dzdx, dzdy));
        const slopeDeg = Number(((slopeRad * 180) / Math.PI).toFixed(2));
        slopeGrid[r][c] = slopeDeg;
        allSlopes.push(slopeDeg);
      }
    }

    const minM = Math.min(...allElevs);
    const maxM = Math.max(...allElevs);
    const meanM = allElevs.reduce((s, v) => s + v, 0) / allElevs.length;
    const varianceM = allElevs.reduce((s, v) => s + (v - meanM) ** 2, 0) / allElevs.length;
    const stdDevM = Math.sqrt(varianceM);

    const sortedSlopes = [...allSlopes].sort((a, b) => a - b);
    const minSlope = sortedSlopes[0];
    const maxSlope = sortedSlopes[sortedSlopes.length - 1];
    const meanSlope = sortedSlopes.reduce((s, v) => s + v, 0) / sortedSlopes.length;
    const p95Slope = sortedSlopes[Math.min(sortedSlopes.length - 1, Math.floor(sortedSlopes.length * 0.95))];

    const bins = [
      { label: '0°–2°', min: 0, max: 2, count: 0 },
      { label: '2°–5°', min: 2, max: 5, count: 0 },
      { label: '5°–10°', min: 5, max: 10, count: 0 },
      { label: '10°–15°', min: 10, max: 15, count: 0 },
      { label: '15°–25°', min: 15, max: 25, count: 0 },
      { label: '>25°', min: 25, max: 999, count: 0 },
    ];
    for (const s of allSlopes) {
      const bin = bins.find((b) => s >= b.min && s < b.max) ?? bins[bins.length - 1];
      bin.count++;
    }

    let suitabilityClass: TerrainAnalysisResult['slopeStats']['suitabilityClass'] = 'Optimal (<5°)';
    if (p95Slope > 15 || meanSlope > 12) suitabilityClass = 'Hazardous (>15°)';
    else if (p95Slope > 10 || meanSlope > 8) suitabilityClass = 'Marginal (10°–15°)';
    else if (p95Slope > 5 || meanSlope > 4) suitabilityClass = 'Nominal (5°–10°)';

    // Surface roughness (TRI + local planar residual)
    let triSum = 0;
    let triCount = 0;
    let residualSqSum = 0;
    for (let r = 1; r < clampedGrid - 1; r++) {
      for (let c = 1; c < clampedGrid - 1; c++) {
        const z = elevationGrid[r][c];
        const neighbors = [
          elevationGrid[r - 1][c - 1],
          elevationGrid[r - 1][c],
          elevationGrid[r - 1][c + 1],
          elevationGrid[r][c - 1],
          elevationGrid[r][c + 1],
          elevationGrid[r + 1][c - 1],
          elevationGrid[r + 1][c],
          elevationGrid[r + 1][c + 1],
        ];
        const meanNeighbor = neighbors.reduce((s, v) => s + v, 0) / 8;
        residualSqSum += (z - meanNeighbor) ** 2;
        const localTri = Math.sqrt(neighbors.reduce((s, v) => s + (v - z) ** 2, 0) / 8);
        triSum += localTri;
        triCount++;
      }
    }

    // Detect craters / topographic depressions in the LOLA DEM patch
    const detectedCraters: CraterDetection[] = [];
    for (let r = 2; r < clampedGrid - 2; r++) {
      for (let c = 2; c < clampedGrid - 2; c++) {
        const z = elevationGrid[r][c];
        let isLocalMin = true;
        for (let dr = -2; dr <= 2 && isLocalMin; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (elevationGrid[r + dr][c + dc] < z) {
              isLocalMin = false;
              break;
            }
          }
        }
        if (!isLocalMin) continue;

        // Estimate rim elevation & radius by scanning 8 directions outward until slope reverses
        let rimSum = 0;
        let rimSamples = 0;
        let radiusCellsSum = 0;
        const dirs = [
          [-1, 0], [1, 0], [0, -1], [0, 1],
          [-1, -1], [-1, 1], [1, -1], [1, 1],
        ];
        for (const [dr, dc] of dirs) {
          let prev = z;
          let peak = z;
          let peakStep = 1;
          for (let step = 1; step <= 6; step++) {
            const rr = r + dr * step;
            const cc = c + dc * step;
            if (rr < 0 || rr >= clampedGrid || cc < 0 || cc >= clampedGrid) break;
            const val = elevationGrid[rr][cc];
            if (val > peak) {
              peak = val;
              peakStep = step;
            }
            if (val < prev && step > 1) break;
            prev = val;
          }
          rimSum += peak;
          rimSamples++;
          radiusCellsSum += peakStep * Math.hypot(dr, dc);
        }
        const rimElevationM = rimSamples > 0 ? rimSum / rimSamples : z;
        const depthM = rimElevationM - z;
        if (depthM >= 60) {
          const avgRadiusKm = (radiusCellsSum / Math.max(1, rimSamples)) * cellSpacingKm;
          const diameterKm = Number((avgRadiusKm * 2).toFixed(2));
          const cLat = latGrid[r][c];
          const cLon = lonGrid[r][c];
          const distanceKm = Number(this.sphericalDistanceKm(lat, lon, cLat, cLon).toFixed(2));
          const northOffset = (half - r) * cellSpacingKm;
          const eastOffset = (c - half) * cellSpacingKm;
          const az = ((Math.atan2(eastOffset, northOffset) * 180) / Math.PI + 360) % 360;

          detectedCraters.push({
            id: `LOLA-DEP-${r}-${c}`,
            lat: Number(cLat.toFixed(3)),
            lon: Number(cLon.toFixed(3)),
            diameterKm,
            depthM: Number(depthM.toFixed(1)),
            rimElevationM: Number(rimElevationM.toFixed(1)),
            floorElevationM: Number(z.toFixed(1)),
            distanceKm,
            azimuthDeg: Number(az.toFixed(1)),
            source: 'LOLA_DEM_DETECTED',
          });
        }
      }
    }
    detectedCraters.sort((a, b) => a.distanceKm - b.distanceKm);

    // 360-degree Terrain Horizon Analyzer (every 5 degrees = 72 rays)
    const centerElevationM = elevationGrid[half][half];
    const maxSearchRadiusKm = Math.max(60, Math.min(180, clampedRadius * 2));
    const horizonSamples: HorizonSample[] = [];
    const stepKm = 2.0;

    for (let az = 0; az < 360; az += 5) {
      let maxAngleDeg = -5;
      let ridgeDistKm = stepKm;
      let ridgeElevM = centerElevationM;

      for (let dKm = stepKm; dKm <= maxSearchRadiusKm; dKm += stepKm) {
        const pt = this.destinationPoint(lat, lon, az, dKm);
        const { bilinearM } = this.sampleElevationRaw(pt.lat, pt.lon);
        const dM = dKm * 1000;
        // Account for lunar curvature drop: d^2 / (2 * R_moon)
        const curvatureDropM = (dM * dM) / (2 * LUNAR_RADIUS_M);
        const relHeightM = bilinearM - centerElevationM - curvatureDropM;
        const angleDeg = (Math.atan2(relHeightM, dM) * 180) / Math.PI;
        if (angleDeg > maxAngleDeg) {
          maxAngleDeg = angleDeg;
          ridgeDistKm = dKm;
          ridgeElevM = bilinearM;
        }
      }

      const clampedAngle = Number(Math.max(0, maxAngleDeg).toFixed(2));
      horizonSamples.push({
        azimuthDeg: az,
        horizonAngleDeg: clampedAngle,
        ridgeDistanceKm: Number(ridgeDistKm.toFixed(1)),
        ridgeElevationM: Number(ridgeElevM.toFixed(1)),
        obstructed: clampedAngle > 2.0,
      });
    }

    const horizonAngles = horizonSamples.map((s) => s.horizonAngleDeg);
    const meanHorizonDeg = horizonAngles.reduce((s, v) => s + v, 0) / horizonAngles.length;
    const maxHorizonDeg = Math.max(...horizonAngles);
    const minHorizonDeg = Math.min(...horizonAngles);
    const obstructedDirectionsCount = horizonSamples.filter((s) => s.obstructed).length;
    // Sky-view factor approximation over azimuthal sectors: SVF = (1/N) * sum cos^2(theta_h)
    const skyViewFactor =
      horizonSamples.reduce((s, h) => s + Math.cos((h.horizonAngleDeg * Math.PI) / 180) ** 2, 0) /
      horizonSamples.length;

    const result: TerrainAnalysisResult = {
      centerLat: Number(lat.toFixed(4)),
      centerLon: Number(this.normalizeLon180(lon).toFixed(4)),
      radiusKm: clampedRadius,
      gridSize: clampedGrid,
      cellSpacingKm: Number(cellSpacingKm.toFixed(3)),
      centerElevationM: Number(centerElevationM.toFixed(2)),
      elevationGrid,
      slopeGrid,
      elevationStats: {
        minM: Number(minM.toFixed(2)),
        maxM: Number(maxM.toFixed(2)),
        meanM: Number(meanM.toFixed(2)),
        stdDevM: Number(stdDevM.toFixed(2)),
        reliefM: Number((maxM - minM).toFixed(2)),
      },
      slopeStats: {
        minDeg: Number(minSlope.toFixed(2)),
        meanDeg: Number(meanSlope.toFixed(2)),
        maxDeg: Number(maxSlope.toFixed(2)),
        p95Deg: Number(p95Slope.toFixed(2)),
        suitabilityClass,
        histogram: bins.map((b) => ({
          label: b.label,
          count: b.count,
          pct: Number(((b.count / allSlopes.length) * 100).toFixed(1)),
        })),
      },
      roughness: {
        rmsResidualM: Number(Math.sqrt(residualSqSum / Math.max(1, triCount)).toFixed(2)),
        triMeters: Number((triSum / Math.max(1, triCount)).toFixed(2)),
        baselineResolutionM: provenance.resolutionMetersAtEquator,
        subMeterBoulderData: 'NASA DATA UNAVAILABLE',
        boulderNote:
          'LOLA LDEM_16 resolves 1,895 m/px at equator (~0.0625°). Meter-scale rock/boulder hazard requires local LROC NAC stereo DEMs not bundled in global LDEM_16.',
      },
      detectedCraters: detectedCraters.slice(0, 12),
      horizonAnalysis: {
        maxSearchRadiusKm,
        meanHorizonDeg: Number(meanHorizonDeg.toFixed(2)),
        maxHorizonDeg: Number(maxHorizonDeg.toFixed(2)),
        minHorizonDeg: Number(minHorizonDeg.toFixed(2)),
        skyViewFactor: Number(skyViewFactor.toFixed(3)),
        obstructedDirectionsCount,
        samples: horizonSamples,
      },
      provenance,
      methodologyNotes: [
        `Elevation sampled via bilinear interpolation from ${provenance.datasetId} (${provenance.productId}, ${provenance.resolutionDeg} px/deg).`,
        `Slope computed via Horn's 3x3 finite-difference kernel over spherical great-circle tangent grid (spacing ${cellSpacingKm.toFixed(2)} km).`,
        `Horizon obstruction angles include lunar spherical curvature correction d² / (2 × 1,737.4 km) out to ${maxSearchRadiusKm} km.`,
      ],
    };

    if (this.patchCache.size > 64) {
      const oldest = this.patchCache.keys().next().value;
      if (oldest !== undefined) this.patchCache.delete(oldest);
    }
    this.patchCache.set(key, result);
    return result;
  }

  public computeCrossSection(lat1: number, lon1: number, lat2: number, lon2: number, numSamples = 40): {
    totalDistanceKm: number;
    points: ProfilePoint[];
    provenance: LolaDatasetMeta;
  } {
    const provenance = this.getDatasetMeta();
    const samples = Math.max(8, Math.min(120, numSamples));
    const totalDistanceKm = this.sphericalDistanceKm(lat1, lon1, lat2, lon2);

    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const phi1 = lat1 * toRad;
    const lam1 = lon1 * toRad;
    const phi2 = lat2 * toRad;
    const lam2 = lon2 * toRad;
    const angularDist = totalDistanceKm / LUNAR_RADIUS_KM;

    const rawPts: { distanceKm: number; lat: number; lon: number; elevationM: number }[] = [];

    for (let i = 0; i < samples; i++) {
      const f = i / (samples - 1);
      let pLat = lat1;
      let pLon = lon1;
      if (angularDist > 1e-6) {
        const a = Math.sin((1 - f) * angularDist) / Math.sin(angularDist);
        const b = Math.sin(f * angularDist) / Math.sin(angularDist);
        const x = a * Math.cos(phi1) * Math.cos(lam1) + b * Math.cos(phi2) * Math.cos(lam2);
        const y = a * Math.cos(phi1) * Math.sin(lam1) + b * Math.cos(phi2) * Math.sin(lam2);
        const z = a * Math.sin(phi1) + b * Math.sin(phi2);
        pLat = Math.atan2(z, Math.hypot(x, y)) * toDeg;
        pLon = this.normalizeLon180(Math.atan2(y, x) * toDeg);
      }
      const { bilinearM } = this.sampleElevationRaw(pLat, pLon);
      rawPts.push({
        distanceKm: Number((f * totalDistanceKm).toFixed(2)),
        lat: Number(pLat.toFixed(4)),
        lon: Number(pLon.toFixed(4)),
        elevationM: Number(bilinearM.toFixed(2)),
      });
    }

    const points: ProfilePoint[] = rawPts.map((pt, idx) => {
      const prev = rawPts[Math.max(0, idx - 1)];
      const next = rawPts[Math.min(rawPts.length - 1, idx + 1)];
      const dKm = Math.max(0.01, next.distanceKm - prev.distanceKm);
      const slopeDeg = (Math.atan2(Math.abs(next.elevationM - prev.elevationM), dKm * 1000) * 180) / Math.PI;
      return {
        ...pt,
        slopeDeg: Number(slopeDeg.toFixed(2)),
      };
    });

    return {
      totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
      points,
      provenance,
    };
  }
}

export const lolaService = new LolaService();
