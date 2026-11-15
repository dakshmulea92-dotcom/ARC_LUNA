import React from 'react';
import { Info } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import { CoordinateSelectorBar } from '../components/shared/CoordinateSelectorBar';
import { ProvenanceBar } from '../components/shared/ProvenanceBar';

export function EnvironmentalExplorerPage() {
  const { activeCoordinate, terrain, illuminationNow, illuminationTimeline } = useMission();

  const isPolar = Math.abs(activeCoordinate.lat) >= 80;
  const isPsrCandidate = isPolar && illuminationTimeline.illuminationPct < 5;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
          Lunar Environmental Explorer
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Physical surface thermal, illumination, radiation, and regolith terrain conditions — strictly grounded in NASA LRO observations without fabricated weather forecasts.
        </p>
      </div>

      <CoordinateSelectorBar />

      {/* Explicit Lunar Vacuum / No-Weather Scientific Notice */}
      <div className="bg-[#0D121C] border border-cyan-900/60 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <span className="font-semibold text-slate-100">Why Lunar Environmental Conditions Are Not Earth Weather:</span>{' '}
          The Moon possesses only an ultra-thin surface-bounded exosphere (~10⁵–10⁷ molecules/cm³), with zero clouds, wind, precipitation, or convective weather. Surface conditions are governed instead by radiative solar balance, topographic shadowing, cosmic/solar radiation, and regolith mechanics.
        </div>
      </div>

      {/* 4 Explicit Scientific Domains */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 1. Surface Temperature */}
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-slate-100">
              1. Surface Temperature Environment
            </h2>
            <span className="text-xs text-sky-300">Derived + LRO Diviner Bounds</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">Current Radiative Eq. Temp</div>
              <div className="text-xl font-semibold text-amber-300 mt-1">
                {illuminationNow.derivedSurfaceTempK} K
              </div>
              <div className="text-slate-400">{illuminationNow.derivedSurfaceTempC} °C</div>
            </div>
            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">PSR Classification</div>
              <div className="text-sm font-semibold text-cyan-300 mt-1">
                {isPsrCandidate ? 'Candidate Cold Trap' : isPolar ? 'Polar Variable' : 'Diurnal Cycle'}
              </div>
              <div className="text-slate-400">30d sunlit: {illuminationTimeline.illuminationPct}%</div>
            </div>
          </div>
          <div className="text-xs text-slate-300 space-y-1.5">
            <div>
              <span className="text-slate-400">Published NASA LRO Diviner Reference Ranges:</span> Equatorial noon reaches ~380–395 K (+107 to +122 °C); equatorial pre-dawn cools to ~90–100 K (−183 to −173 °C); deep polar Permanently Shadowed Regions (PSRs) drop to ~25–45 K (−248 to −228 °C).
            </div>
            <div className="text-slate-400">
              Instantaneous equilibrium temperature above is derived from JPL solar incidence ({illuminationNow.solarIncidenceDeg}°) and Bond albedo A=0.12, emissivity ε=0.95. Direct per-pixel Diviner bolometric maps are not bundled locally.
            </div>
          </div>
        </div>

        {/* 2. Solar Illumination & Shadows */}
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-slate-100">
              2. Solar Illumination &amp; Terrain Shadowing
            </h2>
            <span className="text-xs text-cyan-400">JPL Ephemeris + LOLA Horizon</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">Solar Incidence / Elev</div>
              <div className="text-xl font-semibold text-slate-100 mt-1">
                {illuminationNow.solarElevationDeg}°
              </div>
              <div className="text-slate-400">Incidence: {illuminationNow.solarIncidenceDeg}°</div>
            </div>
            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">Direct Solar Flux</div>
              <div className="text-xl font-semibold text-amber-300 mt-1">
                {illuminationNow.solarFluxWm2} W/m²
              </div>
              <div className="text-slate-400">
                {illuminationNow.sunlitTerrain ? 'Unobstructed' : 'Topographic Shadow'}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-300">
            At {activeCoordinate.lat.toFixed(2)}° latitude, the local LOLA horizon obstructs azimuths up to{' '}
            <span className="font-mono text-cyan-300">
              {terrain ? `${terrain.horizonAnalysis.maxHorizonDeg}°` : '—'}
            </span>
            . Subsolar latitude is {illuminationNow.subsolarLatDeg}° (Sun distance {illuminationNow.sunDistanceAu} AU).
          </p>
        </div>

        {/* 3. Radiation Environment */}
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-slate-100">
              3. Radiation Environment (LRO CRaTER Reference)
            </h2>
            <span className="text-xs text-amber-300">Published NASA Mission Baseline</span>
          </div>
          <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
            <p>
              Without a global dipole magnetic field or dense atmosphere, the lunar surface receives direct Galactic Cosmic Rays (GCR) and episodic Solar Energetic Particle (SEP) events.
            </p>
            <div className="bg-[#07090E] border border-slate-800 rounded p-3 font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">LRO CRaTER GCR Baseline:</span>
                <span>~300–400 mSv/yr (solar cycle dependent)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Real-Time Local Dose Telemetry:</span>
                <span className="text-rose-300">NASA DATA UNAVAILABLE (Live Probe Required)</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Local Terrain & Polar Characteristics */}
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-slate-100">
              4. Local Terrain &amp; Polar Regolith Context
            </h2>
            <span className="text-xs text-cyan-400">LOLA LDEM_16 Measured</span>
          </div>
          {terrain ? (
            <div className="bg-[#07090E] border border-slate-800 rounded p-3 text-xs font-mono space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Elevation vs 1737.4 km:</span>
                <span>{terrain.centerElevationM} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Slope Classification:</span>
                <span className="font-sans text-slate-200">{terrain.slopeStats.suitabilityClass}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Polar Regime:</span>
                <span className="font-sans text-slate-200">
                  {isPolar ? 'Extreme grazing solar angles; high thermal contrast' : 'Standard ~29.53-day synodic diurnal cycle'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400">Loading terrain parameters...</div>
          )}
          <p className="text-xs text-slate-400">
            In situ electrostatic dust levitation and local regolith bearing strength vary with illumination transitions and require surface lander instrumentation.
          </p>
        </div>
      </div>

      <ProvenanceBar
        sourceName="NASA LRO LOLA + LRO Diviner / CRaTER Reference Literature + JPL Ephemeris"
        datasetId="LRO-L-LOLA-4-GDR-V1.0 / JPL DE-Ephemeris"
        classification="Derived Scientific Calculation"
        resolution="1,895 m/px topography + analytical radiative model"
        units="K, °C, W/m², deg, mSv/yr"
        sourceUrl="https://lunar.gsfc.nasa.gov/"
      />
    </div>
  );
}
