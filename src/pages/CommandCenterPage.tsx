import React, { useEffect, useState } from 'react';
import { ArrowRight, Compass, Mountain, ShieldCheck, Sun, Globe, Rocket, Bot } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import { CoordinateSelectorBar } from '../components/shared/CoordinateSelectorBar';
import { NasaVisualTile } from '../components/shared/NasaVisualTile';
import { ProvenanceBar } from '../components/shared/ProvenanceBar';
import { LUNAR_SITE_PRESETS } from '../lib/nasaCatalog';

interface EpicSummary {
  available: boolean;
  dateUtc?: string;
  imageProxyUrl?: string;
  moonDistanceKm?: number;
}

export function CommandCenterPage() {
  const {
    activeCoordinate,
    selectCoordinate,
    terrain,
    terrainLoading,
    terrainError,
    illuminationNow,
    illuminationTimeline,
    suitability,
    selectedFacility,
    missions,
    setActivePage,
    setAiDrawerOpen,
    formatLon,
  } = useMission();

  const [epicSummary, setEpicSummary] = useState<EpicSummary | null>(null);

  useEffect(() => {
    void fetch('/api/nasa/epic/latest')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: EpicSummary | null) => {
        if (data) setEpicSummary(data);
      })
      .catch(() => {
        // leave null
      });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
            Mission Command Center
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Integrated NASA LOLA topographic intelligence, JPL/IAU ephemeris illumination, and mission readiness overview.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAiDrawerOpen(true)}
          className="px-3.5 py-2 text-xs font-medium bg-[#0D121C] hover:bg-slate-800 border border-slate-700 text-cyan-300 rounded-md inline-flex items-center gap-2 cursor-pointer"
        >
          <Bot className="w-3.5 h-3.5" />
          Open LUNA AI Brief
        </button>
      </div>

      <CoordinateSelectorBar />

      {terrainError && (
        <div className="bg-rose-950/50 border border-rose-800 text-rose-200 px-4 py-3 rounded-md text-xs">
          {terrainError}
        </div>
      )}

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400">LOLA Elevation (vs 1737.4 km)</div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-mono font-semibold text-slate-100">
              {terrainLoading ? '...' : terrain ? terrain.centerElevationM.toFixed(1) : 'NASA DATA UNAVAILABLE'}
            </span>
            {terrain && <span className="text-xs font-mono text-slate-400 ml-1.5">m</span>}
          </div>
          <div className="text-xs text-slate-400 mt-2 font-mono">
            {terrain ? `Range: ${terrain.elevationStats.minM.toFixed(0)} to ${terrain.elevationStats.maxM.toFixed(0)} m` : 'Awaiting LOLA tile'}
          </div>
        </div>

        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400">Regional Slope (Horn 3×3 P95)</div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-mono font-semibold text-cyan-300">
              {terrainLoading ? '...' : terrain ? terrain.slopeStats.p95Deg.toFixed(2) : '—'}
            </span>
            {terrain && <span className="text-xs font-mono text-slate-400 ml-1.5">deg</span>}
          </div>
          <div className="text-xs text-slate-300 mt-2">
            {terrain ? terrain.slopeStats.suitabilityClass : 'Computing slope distribution'}
          </div>
        </div>

        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400">Solar Elevation &amp; Horizon Check</div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-mono font-semibold text-amber-300">
              {illuminationNow.solarElevationDeg.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-slate-400 ml-1.5">deg</span>
          </div>
          <div className="text-xs text-slate-300 mt-2">
            {illuminationNow.sunlitTerrain ? 'Sunlit (Terrain-Cleared)' : 'Shadowed / Below Horizon'} · 30d: {illuminationTimeline.illuminationPct}%
          </div>
        </div>

        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400">Landing Suitability Index</div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-mono font-semibold text-slate-100">
              {suitability ? suitability.overallScore.toFixed(1) : '—'}
            </span>
            {suitability && <span className="text-xs font-mono text-slate-400 ml-1.5">/ 100</span>}
          </div>
          <div className="text-xs text-slate-300 mt-2 truncate">
            {suitability ? suitability.verdict : 'Evaluating LOLA metrics'}
          </div>
        </div>
      </div>

      {/* Main Split: Active Target Briefing & Quick Module Routing */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-slate-100">
              Active Target Scientific Summary
            </h2>
            <span className="text-xs font-mono text-slate-400">
              {activeCoordinate.lat.toFixed(3)}°, {formatLon(activeCoordinate.lon)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="bg-[#07090E] border border-slate-800 rounded-md p-3.5 space-y-2">
              <div className="font-medium text-slate-200">Topography &amp; Horizon (NASA LOLA)</div>
              {terrain ? (
                <ul className="space-y-1.5 text-slate-300 font-mono">
                  <li className="flex justify-between">
                    <span className="text-slate-400">Mean / Max Slope:</span>
                    <span>{terrain.slopeStats.meanDeg}° / {terrain.slopeStats.maxDeg}°</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-400">Roughness (TRI):</span>
                    <span>{terrain.roughness.triMeters.toFixed(1)} m</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-400">Detected Craters:</span>
                    <span>{terrain.detectedCraters.length} within {terrain.radiusKm} km</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-400">Max Horizon Block:</span>
                    <span>{terrain.horizonAnalysis.maxHorizonDeg}° (SVF {terrain.horizonAnalysis.skyViewFactor})</span>
                  </li>
                </ul>
              ) : (
                <div className="text-slate-400">Loading NASA LOLA LDEM_16 patch...</div>
              )}
            </div>

            <div className="bg-[#07090E] border border-slate-800 rounded-md p-3.5 space-y-2">
              <div className="font-medium text-slate-200">Ephemeris &amp; Launch Link</div>
              <ul className="space-y-1.5 text-slate-300 font-mono">
                <li className="flex justify-between">
                  <span className="text-slate-400">Lunar Phase:</span>
                  <span>{illuminationNow.phaseName}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">Earth–Moon Dist:</span>
                  <span>{illuminationNow.earthMoonDistanceKm.toLocaleString()} km</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">Radiative Temp:</span>
                  <span>{illuminationNow.derivedSurfaceTempK} K ({illuminationNow.derivedSurfaceTempC} °C)</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-400">Launch Site:</span>
                  <span className="font-sans truncate max-w-[160px]">{selectedFacility.shortName}</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Quick Jump Module Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
            {[
              { id: 'lunar-explorer', label: '3D Lunar Globe', desc: 'NASA SVS 14959 GLB', icon: Compass },
              { id: 'landing-intelligence', label: 'Site Assessment', desc: 'Safety & uncertainty', icon: ShieldCheck },
              { id: 'terrain-intelligence', label: 'LOLA & Horizon', desc: 'DEM, slopes & ridges', icon: Mountain },
              { id: 'sunlight-analyzer', label: 'Sunlight Window', desc: 'JPL ephemeris & UTC', icon: Sun },
              { id: 'earth-explorer', label: 'Earth & POWER', desc: 'Launch infrastructure', icon: Globe },
              { id: 'landing-simulator', label: 'Landing Sim', desc: '3D autopilot & Apollo 11', icon: Rocket },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivePage(item.id as Parameters<typeof setActivePage>[0])}
                  className="text-left bg-[#07090E] hover:bg-slate-900 border border-slate-800 hover:border-cyan-700/70 rounded-md p-3 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-cyan-400">
                    <Icon className="w-4 h-4" />
                    <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-xs font-medium text-slate-100 mt-2">{item.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{item.desc}</div>
                </button>
              );
            })}
          </div>

          {/* Live Synchronized NASA Satellite & Orbital Visuals */}
          <div className="pt-2 border-t border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-200">
                Live NASA Visuals Feed (Orbital &amp; Full-Disc Imagery)
              </span>
              <span className="text-[11px] font-mono text-cyan-400">Moon Trek WMTS · GIBS · DSCOVR EPIC</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NasaVisualTile
                src={`/api/nasa/moon-trek/tile?layer=wac&lat=${activeCoordinate.lat}&lon=${activeCoordinate.lon}&z=4`}
                alt={`NASA LRO WAC Mosaic at ${activeCoordinate.label}`}
                label="Moon · LRO WAC 303ppd"
                sublabel={`${activeCoordinate.lat.toFixed(1)}°, ${activeCoordinate.lon.toFixed(1)}°`}
                aspectClass="aspect-[4/3]"
              />
              <NasaVisualTile
                src={`/api/nasa/gibs/tile?lat=${selectedFacility.lat}&lon=${selectedFacility.lon}&z=4`}
                alt={`NASA GIBS 500m Blue Marble at ${selectedFacility.shortName}`}
                label={`Earth · ${selectedFacility.shortName}`}
                sublabel="GIBS 500m"
                aspectClass="aspect-[4/3]"
              />
              {epicSummary?.available && epicSummary.imageProxyUrl ? (
                <NasaVisualTile
                  src={epicSummary.imageProxyUrl}
                  alt="NASA DSCOVR EPIC Full-Disc Earth"
                  label="DSCOVR EPIC (L1 Earth)"
                  sublabel={epicSummary.dateUtc ? epicSummary.dateUtc.slice(0, 10) : 'Live'}
                  aspectClass="aspect-[4/3]"
                />
              ) : (
                <div className="bg-[#07090E] border border-slate-800 rounded-md flex items-center justify-center p-3 text-[11px] font-mono text-slate-400 aspect-[4/3]">
                  {epicSummary === null ? 'Querying DSCOVR EPIC...' : 'NASA DATA UNAVAILABLE'}
                </div>
              )}
            </div>
          </div>

          {terrain && (
            <ProvenanceBar
              sourceName={terrain.provenance.sourceName}
              datasetId={`${terrain.provenance.datasetId} (${terrain.provenance.productId})`}
              classification="Measured NASA Data"
              resolution={`${terrain.provenance.resolutionMetersAtEquator} m/px (${terrain.provenance.resolutionDeg} ppd)`}
              units={terrain.provenance.units}
              observationPeriod={terrain.provenance.observationPeriod}
              crs={terrain.provenance.coordinateSystem}
              sourceUrl={terrain.provenance.sourceUrl}
            />
          )}
        </div>

        {/* Right Column: Reference Landing Sites & Active Saved Missions */}
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-slate-100">
              NASA Candidate &amp; Historical Sites
            </h2>
            <span className="text-xs text-slate-400">{LUNAR_SITE_PRESETS.length} sites</span>
          </div>

          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {LUNAR_SITE_PRESETS.map((site) => {
              const isSelected =
                Math.abs(site.lat - activeCoordinate.lat) < 0.01 &&
                Math.abs(site.lon - activeCoordinate.lon) < 0.01;
              return (
                <button
                  key={site.id}
                  type="button"
                  onClick={() =>
                    selectCoordinate({
                      lat: site.lat,
                      lon: site.lon,
                      label: site.label,
                      region: site.region,
                      source: site.source,
                    })
                  }
                  className={`w-full text-left px-3 py-2 rounded-md border text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-950/40 border-cyan-600 text-slate-100'
                      : 'bg-[#07090E] border-slate-800 hover:border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{site.label}</span>
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">
                      {site.lat.toFixed(2)}°, {site.lon.toFixed(1)}°
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {site.category} · {site.region}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-200">Saved Mission Profiles</span>
              <button
                type="button"
                onClick={() => setActivePage('mission-planner')}
                className="text-xs text-cyan-400 hover:underline cursor-pointer"
              >
                Open Planner
              </button>
            </div>
            {missions.slice(0, 3).map((m) => (
              <div key={m.id} className="bg-[#07090E] border border-slate-800 rounded p-2.5 text-xs">
                <div className="font-medium text-slate-200 truncate">{m.name}</div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {m.targetSiteName} · {m.durationDays}d · {m.missionType}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
