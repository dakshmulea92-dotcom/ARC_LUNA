export type AppPageId =
  | 'command-center'
  | 'lunar-explorer'
  | 'landing-intelligence'
  | 'terrain-intelligence'
  | 'environmental-explorer'
  | 'sunlight-analyzer'
  | 'earth-explorer'
  | 'mission-planner'
  | 'landing-simulator'
  | 'rover-explorer'
  | 'ai-assistant'
  | 'data-center'
  | 'settings';

export interface LunarCoordinate {
  lat: number;
  lon: number; // -180 to +180 (East positive)
  label: string;
  region?: string;
  source?: string;
}

export interface LunarSitePreset extends LunarCoordinate {
  id: string;
  category: 'South Pole' | 'North Pole' | 'Apollo Historical' | 'Major Crater' | 'Mare / Highlands';
  description: string;
  nasaUrl: string;
  officialElevationNote?: string;
}

export interface LaunchFacility {
  id: string;
  name: string;
  shortName: string;
  country: string;
  operator: string;
  isNasaFacility: boolean;
  lat: number;
  lon: number;
  timeZone: string;
  cityLabel: string;
  elevationM: number;
  officialSource: string;
  sourceUrl: string;
  notes: string;
}

export interface LolaDatasetMeta {
  datasetId: string;
  productId: string;
  sourceName: string;
  instrument: string;
  mission: string;
  resolutionDeg: number;
  resolutionMetersAtEquator: number;
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
  elevationGrid: number[][];
  slopeGrid: number[][];
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
    obstructedDirectionsCount: number;
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

export interface ScoringWeights {
  slope: number;
  roughness: number;
  craterProximity: number;
  illumination: number;
  dataCoverage: number;
}

export interface SavedMission {
  id: string;
  name: string;
  missionType: 'Crewed Lander' | 'Robotic Lander' | 'Polar Rover' | 'Sample Return' | 'Orbital + Descent';
  launchFacilityId: string;
  launchFacilityName: string;
  targetSiteName: string;
  targetLat: number;
  targetLon: number;
  landingDateUtc: string;
  durationDays: number;
  spacecraftConfig: string;
  roverDeployment: boolean;
  minSolarElevationDeg: number;
  objectives: string;
  createdAtUtc: string;
}

export interface SavedCoordinate {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: 'Artemis Candidate' | 'Apollo Historical' | 'Polar Science' | 'Custom';
  notes: string;
  createdAtUtc: string;
}

export interface NasaPowerLaunchEnv {
  facilityId: string;
  lat: number;
  lon: number;
  available: boolean;
  dataType: 'NASA_POWER_CLIMATOLOGY_AND_RECENT_DAILY';
  disclaimer: string;
  sourceName: string;
  sourceUrl: string;
  observationPeriod: string;
  fetchedAtUtc: string;
  climatologyMonth: string;
  climatology?: {
    temperatureC: number | null;
    tempMaxC: number | null;
    tempMinC: number | null;
    cloudCoverPct: number | null;
    windSpeed10mMs: number | null;
    precipitationMmDay: number | null;
    relativeHumidityPct: number | null;
    solarIrradianceKwhM2Day: number | null;
    surfacePressureKpa: number | null;
  };
  recentDaily?: {
    date: string;
    temperatureC: number | null;
    windSpeed10mMs: number | null;
    precipitationMmDay: number | null;
    relativeHumidityPct: number | null;
    cloudCoverPct: number | null;
  };
  error?: string;
}

export interface AppSettings {
  lightweightMode: boolean;
  lonFormat: 'signed180' | 'east360';
  defaultRadiusKm: number;
  defaultWeights: ScoringWeights;
}
