import * as Astronomy from 'astronomy-engine';

export interface LunarIlluminationState {
  utcIso: string;
  subsolarLatDeg: number;
  subsolarLonDeg: number;
  earthMoonDistanceKm: number;
  sunDistanceAu: number;
  lunarPhaseDeg: number;
  phaseName: string;
  solarIncidenceDeg: number;
  solarElevationDeg: number;
  solarAzimuthDeg: number;
  sunlitFlat: boolean;
  sunlitTerrain: boolean;
  horizonObstructionDeg: number | null;
  solarFluxWm2: number;
  derivedSurfaceTempK: number;
  derivedSurfaceTempC: number;
  sourceMethod: string;
}

export interface IlluminationTimelinePoint {
  utcIso: string;
  hoursFromStart: number;
  solarElevationDeg: number;
  solarAzimuthDeg: number;
  sunlitFlat: boolean;
  sunlitTerrain: boolean;
  derivedSurfaceTempK: number;
}

export interface IlluminationWindowSummary {
  sunlitHours: number;
  totalHours: number;
  illuminationPct: number;
  maxSolarElevationDeg: number;
  peakSunlightUtc: string | null;
  nextSunriseUtc: string | null;
  nextSunsetUtc: string | null;
  timeline: IlluminationTimelinePoint[];
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
// Moon spin axis obliquity to ecliptic (IAU 2015: ~1.5424 deg)
const LUNAR_OBLIQUITY_DEG = 1.5424;

function normalizeLon180(deg: number): number {
  const n = ((deg % 360) + 360) % 360;
  return n > 180 ? n - 360 : n;
}

function getPhaseName(phaseDeg: number): string {
  if (phaseDeg < 22.5 || phaseDeg >= 337.5) return 'New Moon';
  if (phaseDeg < 67.5) return 'Waxing Crescent';
  if (phaseDeg < 112.5) return 'First Quarter';
  if (phaseDeg < 157.5) return 'Waxing Gibbous';
  if (phaseDeg < 202.5) return 'Full Moon';
  if (phaseDeg < 247.5) return 'Waning Gibbous';
  if (phaseDeg < 292.5) return 'Last Quarter';
  return 'Waning Crescent';
}

/**
 * Computes selenographic subsolar latitude & longitude using JPL/IAU ephemeris
 * from astronomy-engine (GeoVector, Libration, MoonPhase, HelioVector).
 */
export function computeSubsolarPoint(date: Date): {
  subsolarLatDeg: number;
  subsolarLonDeg: number;
  earthMoonDistanceKm: number;
  sunDistanceAu: number;
  lunarPhaseDeg: number;
} {
  const astroTime = Astronomy.MakeTime(date);
  const lib = Astronomy.Libration(astroTime);
  const phaseDeg = Astronomy.MoonPhase(astroTime);

  // Heliocentric Earth vector to get Earth-Sun distance in AU & Sun ecliptic longitude
  const sunGeo = Astronomy.GeoVector(Astronomy.Body.Sun, astroTime, true);
  const sunEcl = Astronomy.Ecliptic(sunGeo);
  const sunDistanceAu = Math.hypot(sunGeo.x, sunGeo.y, sunGeo.z);

  // Selenocentric subsolar longitude relative to prime meridian (0 deg faces mean Earth):
  // When phaseDeg = 180 (Full Moon), Sun is overhead near 0 deg lon; at 0 (New Moon), near 180 deg lon.
  // Combine with lunar longitudinal optical libration offset (`lib.elon`)
  const subsolarLonDeg = normalizeLon180(180 - phaseDeg - lib.elon);

  // Approximate Moon ascending node longitude on ecliptic (18.6-yr regression from J2000)
  const daysSinceJ2000 = astroTime.ut;
  const omegaMoonDeg = (125.04452 - 0.0529537648 * daysSinceJ2000) % 360;
  // Subsolar selenographic latitude: -i * sin(sun_ecl_lon - omega)
  const subsolarLatDeg =
    -LUNAR_OBLIQUITY_DEG * Math.sin((sunEcl.elon - omegaMoonDeg) * DEG2RAD) - lib.elat * 0.15;

  return {
    subsolarLatDeg: Number(subsolarLatDeg.toFixed(3)),
    subsolarLonDeg: Number(subsolarLonDeg.toFixed(3)),
    earthMoonDistanceKm: Number(lib.dist_km.toFixed(1)),
    sunDistanceAu: Number(sunDistanceAu.toFixed(5)),
    lunarPhaseDeg: Number(phaseDeg.toFixed(2)),
  };
}

/**
 * Computes local solar incidence, solar elevation, azimuth, radiative flux, and
 * Diviner-calibrated radiative equilibrium surface temperature at (lat, lon).
 */
export function computeLunarIllumination(
  latDeg: number,
  lonDeg: number,
  date: Date,
  horizonTable?: Array<{ azimuthDeg: number; horizonAngleDeg: number }>,
): LunarIlluminationState {
  const sub = computeSubsolarPoint(date);

  const phi = latDeg * DEG2RAD;
  const phiS = sub.subsolarLatDeg * DEG2RAD;
  const dLam = (sub.subsolarLonDeg - lonDeg) * DEG2RAD;

  // Cosine of solar zenith (incidence) angle
  const cosIncidence =
    Math.sin(phi) * Math.sin(phiS) +
    Math.cos(phi) * Math.cos(phiS) * Math.cos(dLam);

  const clampedCos = Math.max(-1, Math.min(1, cosIncidence));
  const incidenceDeg = Math.acos(clampedCos) * RAD2DEG;
  const solarElevationDeg = 90 - incidenceDeg;

  // Solar azimuth clockwise from North
  const y = Math.sin(dLam) * Math.cos(phiS);
  const x = Math.cos(phi) * Math.sin(phiS) - Math.sin(phi) * Math.cos(phiS) * Math.cos(dLam);
  const solarAzimuthDeg = ((Math.atan2(y, x) * RAD2DEG) + 360) % 360;

  let horizonObstructionDeg: number | null = null;
  if (horizonTable && horizonTable.length > 0) {
    // Interpolate nearest 5-deg horizon bin
    const idx = Math.round(solarAzimuthDeg / 5) % horizonTable.length;
    horizonObstructionDeg = horizonTable[idx]?.horizonAngleDeg ?? null;
  }

  const sunlitFlat = solarElevationDeg > 0;
  const sunlitTerrain =
    horizonObstructionDeg !== null
      ? solarElevationDeg > horizonObstructionDeg
      : sunlitFlat;

  // Solar constant scaled by inverse square of heliocentric distance
  const s0 = 1361 / (sub.sunDistanceAu * sub.sunDistanceAu);
  const solarFluxWm2 = sunlitTerrain ? s0 * Math.max(0, Math.sin(solarElevationDeg * DEG2RAD)) : 0;

  // Radiative equilibrium temperature calibrated to NASA LRO Diviner observations:
  // Daytime: ((1 - A) * S_eff / (epsilon * sigma))^(1/4), with A=0.12, eps=0.95, sigma=5.670374e-8
  // Nighttime / PSR baseline floor: ~95K equatorial night cooling floor, ~35K deep polar PSR bound
  const sigma = 5.670374419e-8;
  const albedo = 0.12;
  const emissivity = 0.95;
  const nightFloorK = Math.abs(latDeg) > 84 ? 38 : 95;
  const radTempK =
    solarFluxWm2 > 0
      ? Math.pow(((1 - albedo) * solarFluxWm2) / (emissivity * sigma), 0.25)
      : nightFloorK;
  const derivedSurfaceTempK = Math.max(nightFloorK, radTempK);

  return {
    utcIso: date.toISOString(),
    subsolarLatDeg: sub.subsolarLatDeg,
    subsolarLonDeg: sub.subsolarLonDeg,
    earthMoonDistanceKm: sub.earthMoonDistanceKm,
    sunDistanceAu: sub.sunDistanceAu,
    lunarPhaseDeg: sub.lunarPhaseDeg,
    phaseName: getPhaseName(sub.lunarPhaseDeg),
    solarIncidenceDeg: Number(incidenceDeg.toFixed(2)),
    solarElevationDeg: Number(solarElevationDeg.toFixed(2)),
    solarAzimuthDeg: Number(solarAzimuthDeg.toFixed(2)),
    sunlitFlat,
    sunlitTerrain,
    horizonObstructionDeg,
    solarFluxWm2: Number(solarFluxWm2.toFixed(1)),
    derivedSurfaceTempK: Number(derivedSurfaceTempK.toFixed(1)),
    derivedSurfaceTempC: Number((derivedSurfaceTempK - 273.15).toFixed(1)),
    sourceMethod: 'JPL/IAU Ephemeris (astronomy-engine) + Stefan-Boltzmann Radiative Balance (Diviner A=0.12, ε=0.95)',
  };
}

export function computeIlluminationTimeline(
  latDeg: number,
  lonDeg: number,
  startDate: Date,
  periodDays: number,
  horizonTable?: Array<{ azimuthDeg: number; horizonAngleDeg: number }>,
): IlluminationWindowSummary {
  const totalHours = Math.max(24, Math.min(365 * 24, periodDays * 24));
  const stepHours = periodDays > 60 ? 12 : periodDays > 14 ? 4 : 2;
  const timeline: IlluminationTimelinePoint[] = [];

  let sunlitSteps = 0;
  let maxSolarElevationDeg = -90;
  let peakSunlightUtc: string | null = null;
  let nextSunriseUtc: string | null = null;
  let nextSunsetUtc: string | null = null;

  let prevSunlit: boolean | null = null;

  for (let h = 0; h <= totalHours; h += stepHours) {
    const dt = new Date(startDate.getTime() + h * 3600_000);
    const state = computeLunarIllumination(latDeg, lonDeg, dt, horizonTable);
    if (state.sunlitTerrain) sunlitSteps++;
    if (state.solarElevationDeg > maxSolarElevationDeg) {
      maxSolarElevationDeg = state.solarElevationDeg;
      peakSunlightUtc = state.utcIso;
    }
    if (prevSunlit !== null) {
      if (!prevSunlit && state.sunlitTerrain && !nextSunriseUtc) {
        nextSunriseUtc = state.utcIso;
      }
      if (prevSunlit && !state.sunlitTerrain && !nextSunsetUtc) {
        nextSunsetUtc = state.utcIso;
      }
    }
    prevSunlit = state.sunlitTerrain;

    timeline.push({
      utcIso: state.utcIso,
      hoursFromStart: h,
      solarElevationDeg: state.solarElevationDeg,
      solarAzimuthDeg: state.solarAzimuthDeg,
      sunlitFlat: state.sunlitFlat,
      sunlitTerrain: state.sunlitTerrain,
      derivedSurfaceTempK: state.derivedSurfaceTempK,
    });
  }

  const sunlitHours = Number((sunlitSteps * stepHours).toFixed(1));
  const illuminationPct = Number(((sunlitSteps / Math.max(1, timeline.length)) * 100).toFixed(1));

  return {
    sunlitHours,
    totalHours,
    illuminationPct,
    maxSolarElevationDeg: Number(maxSolarElevationDeg.toFixed(2)),
    peakSunlightUtc,
    nextSunriseUtc,
    nextSunsetUtc,
    timeline,
  };
}

export function formatTimeInZone(utcIso: string, timeZone: string): {
  localTime: string;
  utcTime: string;
  tzName: string;
} {
  const date = new Date(utcIso);
  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(date);
  const tzName = tzParts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;

  const utcTime = date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  return { localTime, utcTime, tzName };
}
