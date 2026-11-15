export const MU_EARTH_KM3_S2 = 398600.4418;
export const MU_MOON_KM3_S2 = 4902.800066;
export const R_EARTH_KM = 6378.137;
export const R_MOON_KM = 1737.4;
export const G_MOON_MS2 = 1.622;
export const G0_MS2 = 9.80665;

export interface TransferMechanicsResult {
  earthOrbitAltKm: number;
  lunarOrbitAltKm: number;
  earthMoonDistanceKm: number;
  leoCircularVelKmS: number;
  tliDeltaVKmS: number;
  transferDurationHours: number;
  loiDeltaVKmS: number;
  lloCircularVelKmS: number;
  deorbitAndDescentDeltaVKmS: number;
  totalReferenceDeltaVKmS: number;
  lunarFreeFallImpactVelAt1kmMS: number;
  launchAzimuthEstimateDeg: number;
  formulas: Array<{ name: string; equation: string; assumption: string }>;
}

export function computeEducationalMissionMechanics(params: {
  earthMoonDistanceKm: number;
  launchLatDeg: number;
  earthParkingAltKm?: number;
  lunarOrbitAltKm?: number;
}): TransferMechanicsResult {
  const leoAlt = params.earthParkingAltKm ?? 200;
  const lloAlt = params.lunarOrbitAltKm ?? 100;
  const r1 = R_EARTH_KM + leoAlt;
  const r2 = params.earthMoonDistanceKm;
  const aTrans = (r1 + r2) / 2;

  const vLeo = Math.sqrt(MU_EARTH_KM3_S2 / r1);
  const vPerigeeTrans = Math.sqrt(MU_EARTH_KM3_S2 * (2 / r1 - 1 / aTrans));
  const tliDeltaV = vPerigeeTrans - vLeo;

  // Half-period of transfer ellipse (educational two-body patched-conic estimate)
  const transferSeconds = Math.PI * Math.sqrt(Math.pow(aTrans, 3) / MU_EARTH_KM3_S2);
  const transferDurationHours = transferSeconds / 3600;

  // Moon orbital velocity ~1.022 km/s; relative arrival excess velocity ~0.82 km/s patched-conic
  const vApogeeEarth = Math.sqrt(MU_EARTH_KM3_S2 * (2 / r2 - 1 / aTrans));
  const vMoonOrbit = Math.sqrt(MU_EARTH_KM3_S2 / r2);
  const vInfMoon = Math.abs(vMoonOrbit - vApogeeEarth);

  const rLlo = R_MOON_KM + lloAlt;
  const vLlo = Math.sqrt(MU_MOON_KM3_S2 / rLlo);
  const vPeriapsisHyperbolic = Math.sqrt(vInfMoon * vInfMoon + (2 * MU_MOON_KM3_S2) / rLlo);
  const loiDeltaV = vPeriapsisHyperbolic - vLlo;

  // Powered descent from 100 km LLO: orbital speed (~1.63 km/s) + gravity losses (~0.25 km/s)
  const deorbitAndDescentDeltaV = vLlo + 0.25;
  const totalReferenceDeltaV = tliDeltaV + loiDeltaV + deorbitAndDescentDeltaV;

  // Educational free-fall kinematic check from 1000 m altitude
  const freeFall1km = Math.sqrt(2 * G_MOON_MS2 * 1000);

  // Ideal eastward launch azimuth approximation for equatorial/low-inclination transfer
  const launchAzimuth = Math.max(
    35,
    Math.min(120, 90 - Math.abs(params.launchLatDeg) * 0.25),
  );

  return {
    earthOrbitAltKm: leoAlt,
    lunarOrbitAltKm: lloAlt,
    earthMoonDistanceKm: Number(r2.toFixed(1)),
    leoCircularVelKmS: Number(vLeo.toFixed(3)),
    tliDeltaVKmS: Number(tliDeltaV.toFixed(3)),
    transferDurationHours: Number(transferDurationHours.toFixed(1)),
    loiDeltaVKmS: Number(loiDeltaV.toFixed(3)),
    lloCircularVelKmS: Number(vLlo.toFixed(3)),
    deorbitAndDescentDeltaVKmS: Number(deorbitAndDescentDeltaV.toFixed(3)),
    totalReferenceDeltaVKmS: Number(totalReferenceDeltaV.toFixed(3)),
    lunarFreeFallImpactVelAt1kmMS: Number(freeFall1km.toFixed(1)),
    launchAzimuthEstimateDeg: Number(launchAzimuth.toFixed(1)),
    formulas: [
      {
        name: 'Circular Orbital Velocity',
        equation: 'v = sqrt(mu / r)',
        assumption: `mu_Earth = 398,600.44 km^3/s^2, mu_Moon = 4,902.80 km^3/s^2, circular parking orbit at ${leoAlt} km / LLO ${lloAlt} km.`,
      },
      {
        name: 'Vis-Viva Trans-Lunar Injection (Two-Body Approximation)',
        equation: 'v_p = sqrt(mu_Earth * (2/r_1 - 1/a_trans)), dV_TLI = v_p - v_LEO',
        assumption: 'Coplanar patched-conic Hohmann transfer ellipse from circular LEO to instantaneous Earth-Moon distance.',
      },
      {
        name: 'Transfer Half-Period',
        equation: 't_trans = pi * sqrt(a_trans^3 / mu_Earth)',
        assumption: 'Unperturbed Keplerian semi-major axis; actual Artemis/Apollo trajectories vary (~72–110 h) via mid-course burns.',
      },
      {
        name: 'Lunar Orbit Insertion (Hyperbolic Capture)',
        equation: 'dV_LOI = sqrt(v_inf^2 + 2*mu_Moon/r_LLO) - sqrt(mu_Moon/r_LLO)',
        assumption: 'Patched-conic hyperbolic arrival without 3-body Sun/Earth gravity assist.',
      },
      {
        name: 'Powered Descent Reference Budget',
        equation: 'dV_descent = v_LLO + dV_gravity_loss (0.25 km/s ref)',
        assumption: 'Educational reference estimate; actual propellant depends on spacecraft Isp and thrust-to-weight ratio.',
      },
    ],
  };
}
