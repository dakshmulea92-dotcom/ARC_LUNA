import React, { useEffect, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import { CoordinateSelectorBar } from '../components/shared/CoordinateSelectorBar';
import { LolaHeatmapCanvas, type HeatmapLayerMode } from '../components/shared/LolaHeatmapCanvas';
import { NasaVisualTile } from '../components/shared/NasaVisualTile';
import { ProvenanceBar } from '../components/shared/ProvenanceBar';
import type { ProfilePoint, TerrainAnalysisResult } from '../types/lunar';

export function TerrainIntelligencePage() {
  const { activeCoordinate, terrain, analysisRadiusKm, pushNotification } = useMission();
  const [layerMode, setLayerMode] = useState<HeatmapLayerMode>('elevation');
  const [profileAxis, setProfileAxis] = useState<'east-west' | 'north-south'>('east-west');
  const [profilePoints, setProfilePoints] = useState<ProfilePoint[]>([]);
  const [compareSites, setCompareSites] = useState<TerrainAnalysisResult[]>([]);

  // Fetch great-circle cross-section profile across the active target
  useEffect(() => {
    const dDeg = analysisRadiusKm / 30.32; // ~30.32 km per lunar degree at equator
    const cosLat = Math.max(0.15, Math.cos((activeCoordinate.lat * Math.PI) / 180));
    const lat1 = profileAxis === 'north-south' ? Math.max(-90, activeCoordinate.lat - dDeg) : activeCoordinate.lat;
    const lat2 = profileAxis === 'north-south' ? Math.min(90, activeCoordinate.lat + dDeg) : activeCoordinate.lat;
    const lon1 = profileAxis === 'east-west' ? activeCoordinate.lon - dDeg / cosLat : activeCoordinate.lon;
    const lon2 = profileAxis === 'east-west' ? activeCoordinate.lon + dDeg / cosLat : activeCoordinate.lon;

    void (async () => {
      try {
        const res = await fetch(
          `/api/lola/profile?lat1=${lat1}&lon1=${lon1}&lat2=${lat2}&lon2=${lon2}&samples=45`,
        );
        if (res.ok) {
          const data = (await res.json()) as { points: ProfilePoint[] };
          setProfilePoints(data.points ?? []);
        }
      } catch {
        // ignore
      }
    })();
  }, [activeCoordinate.lat, activeCoordinate.lon, analysisRadiusKm, profileAxis]);

  const addToComparison = () => {
    if (!terrain) return;
    setCompareSites((prev) => {
      const exists = prev.some(
        (p) => Math.abs(p.centerLat - terrain.centerLat) < 0.01 && Math.abs(p.centerLon - terrain.centerLon) < 0.01,
      );
      if (exists) return prev;
      return [...prev, terrain].slice(-4);
    });
    pushNotification('Added site to LOLA comparison table', 'success');
  };

  const exportAnalysisJson = () => {
    if (!terrain) return;
    const blob = new Blob([JSON.stringify(terrain, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lola-terrain-${terrain.centerLat.toFixed(2)}-${terrain.centerLon.toFixed(2)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Build SVG path for cross-section profile
  const buildProfilePath = () => {
    if (profilePoints.length < 2) return '';
    const minE = Math.min(...profilePoints.map((p) => p.elevationM));
    const maxE = Math.max(...profilePoints.map((p) => p.elevationM));
    const span = Math.max(20, maxE - minE);
    const maxD = Math.max(1, profilePoints[profilePoints.length - 1].distanceKm);
    return profilePoints
      .map((p, idx) => {
        const x = (p.distanceKm / maxD) * 560 + 20;
        const y = 145 - ((p.elevationM - minE) / span) * 115;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  // Build Polar Horizon Obstruction polygon
  const buildHorizonPolygon = () => {
    if (!terrain) return '';
    const samples = terrain.horizonAnalysis.samples;
    const maxAngle = Math.max(15, terrain.horizonAnalysis.maxHorizonDeg);
    return samples
      .map((s) => {
        const rad = ((s.azimuthDeg - 90) * Math.PI) / 180;
        const r = (s.horizonAngleDeg / maxAngle) * 95;
        const x = 120 + r * Math.cos(rad);
        const y = 120 + r * Math.sin(rad);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
            Terrain Intelligence — NASA LOLA
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Digital elevation models, Horn 3×3 slope maps, cross-section profiles, and 360° Terrain Horizon obstruction analysis.
          </p>
        </div>
        {terrain && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addToComparison}
              className="px-3 py-1.5 text-xs bg-[#0D121C] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              Compare Site
            </button>
            <button
              type="button"
              onClick={exportAnalysisJson}
              className="px-3 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export LOLA JSON
            </button>
          </div>
        )}
      </div>

      <CoordinateSelectorBar />

      {terrain && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* DEM / Slope / Roughness Map */}
            <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-display font-semibold text-slate-100">
                  LOLA Digital Elevation &amp; Slope Map
                </h2>
                <div className="flex items-center gap-1 bg-[#07090E] p-1 rounded border border-slate-800">
                  {(['elevation', 'slope', 'roughness'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setLayerMode(m)}
                      className={`px-2.5 py-1 text-xs rounded capitalize cursor-pointer ${
                        layerMode === m ? 'bg-cyan-600 text-slate-950 font-medium' : 'text-slate-300'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <LolaHeatmapCanvas terrain={terrain} mode={layerMode} heightPx={320} />
            </div>

            {/* 360° Terrain Horizon Analyzer */}
            <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-display font-semibold text-slate-100">
                    Terrain Horizon Analyzer (360° Obstruction)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Curvature-corrected horizon angle out to {terrain.horizonAnalysis.maxSearchRadiusKm} km
                  </p>
                </div>
                <div className="text-right font-mono text-xs">
                  <div className="text-cyan-300">Max: {terrain.horizonAnalysis.maxHorizonDeg}°</div>
                  <div className="text-slate-400">SVF: {terrain.horizonAnalysis.skyViewFactor}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <svg viewBox="0 0 240 240" className="w-full max-w-[240px] mx-auto bg-[#07090E] border border-slate-800 rounded-md">
                  <circle cx="120" cy="120" r="95" fill="none" stroke="#1e293b" strokeWidth="1" />
                  <circle cx="120" cy="120" r="63" fill="none" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="1" />
                  <circle cx="120" cy="120" r="32" fill="none" stroke="#1e293b" strokeDasharray="3 3" strokeWidth="1" />
                  <line x1="120" y1="18" x2="120" y2="222" stroke="#1e293b" strokeWidth="1" />
                  <line x1="18" y1="120" x2="222" y2="120" stroke="#1e293b" strokeWidth="1" />
                  <polygon points={buildHorizonPolygon()} fill="rgba(6, 182, 212, 0.25)" stroke="#06b6d4" strokeWidth="2" />
                  <text x="120" y="14" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">N 0°</text>
                  <text x="229" y="124" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">E</text>
                  <text x="120" y="234" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">S</text>
                  <text x="11" y="124" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">W</text>
                </svg>

                <div className="space-y-2 text-xs">
                  <div className="bg-[#07090E] border border-slate-800 rounded p-3 font-mono space-y-1">
                    <div className="flex justify-between"><span className="text-slate-400">Mean Obstruction:</span><span>{terrain.horizonAnalysis.meanHorizonDeg}°</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Min / Max Angle:</span><span>{terrain.horizonAnalysis.minHorizonDeg}° / {terrain.horizonAnalysis.maxHorizonDeg}°</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Obstructed Sectors (&gt;2°):</span><span>{terrain.horizonAnalysis.obstructedDirectionsCount} / 72</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Sky View Factor:</span><span>{terrain.horizonAnalysis.skyViewFactor}</span></div>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    Topographic ridgelines exceeding solar elevation block direct sunlight and can obstruct low-elevation Earth line-of-sight links near polar latitudes.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Elevation Cross-Section Profile */}
          <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-display font-semibold text-slate-100">
                  Terrain Cross-Section Elevation Profile
                </h2>
                <p className="text-xs text-slate-400">
                  Great-circle transect across target coordinate ({profilePoints.length > 0 ? `${profilePoints[profilePoints.length - 1].distanceKm} km span` : '...'})
                </p>
              </div>
              <div className="flex items-center gap-1 bg-[#07090E] p-1 rounded border border-slate-800">
                {(['east-west', 'north-south'] as const).map((ax) => (
                  <button
                    key={ax}
                    type="button"
                    onClick={() => setProfileAxis(ax)}
                    className={`px-2.5 py-1 text-xs rounded capitalize cursor-pointer ${
                      profileAxis === ax ? 'bg-cyan-600 text-slate-950 font-medium' : 'text-slate-300'
                    }`}
                  >
                    {ax}
                  </button>
                ))}
              </div>
            </div>

            <svg viewBox="0 0 600 170" className="w-full h-44 bg-[#07090E] border border-slate-800 rounded-md">
              <line x1="20" y1="145" x2="580" y2="145" stroke="#1e293b" strokeWidth="1" />
              <line x1="300" y1="15" x2="300" y2="150" stroke="#334155" strokeDasharray="3 3" strokeWidth="1" />
              <path d={buildProfilePath()} fill="none" stroke="#06b6d4" strokeWidth="2" />
              {profilePoints.length > 0 && (
                <>
                  <text x="24" y="24" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                    Max {Math.max(...profilePoints.map((p) => p.elevationM)).toFixed(0)} m
                  </text>
                  <text x="24" y="160" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                    0 km
                  </text>
                  <text x="530" y="160" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                    {profilePoints[profilePoints.length - 1].distanceKm.toFixed(0)} km
                  </text>
                </>
              )}
            </svg>
              <div className="text-[11px] text-slate-400">
                Computed along 45 great-circle samples across real NASA LOLA LDEM_16 elevation grid.
              </div>
            </div>

          {/* Live NASA LRO Orbital Visuals (Moon Trek WMTS) */}
          <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-display font-semibold text-slate-100">
                  NASA LRO Orbital Visuals (Live Moon Trek WMTS)
                </h2>
                <p className="text-xs text-slate-400">
                  Real orbital camera imagery and LOLA color shaded relief at {activeCoordinate.lat.toFixed(3)}°, {activeCoordinate.lon.toFixed(3)}°
                </p>
              </div>
              <span className="text-[11px] font-mono text-cyan-300">
                Measured NASA LRO / LOLA Products
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NasaVisualTile
                src={`/api/nasa/moon-trek/tile?layer=wac&lat=${activeCoordinate.lat}&lon=${activeCoordinate.lon}&z=4`}
                alt={`NASA LRO WAC Orbital Mosaic at ${activeCoordinate.lat.toFixed(2)}, ${activeCoordinate.lon.toFixed(2)}`}
                label="LRO WAC Global Mosaic"
                sublabel="303 ppd · WMTS z=4"
                aspectClass="aspect-[16/10]"
              />
              <NasaVisualTile
                src={`/api/nasa/moon-trek/tile?layer=lola_color&lat=${activeCoordinate.lat}&lon=${activeCoordinate.lon}&z=4`}
                alt={`NASA LOLA Color Shaded Relief at ${activeCoordinate.lat.toFixed(2)}, ${activeCoordinate.lon.toFixed(2)}`}
                label="LOLA Color Shaded Relief"
                sublabel="128 ppd · WMTS z=4"
                aspectClass="aspect-[16/10]"
              />
            </div>
          </div>

          {/* Multi-Site Comparison Table */}
          {compareSites.length > 0 && (
            <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-display font-semibold text-slate-100">
                  Candidate Site Comparison Matrix
                </h2>
                <button
                  type="button"
                  onClick={() => setCompareSites([])}
                  className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Clear Table
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 pr-3">Coordinate</th>
                      <th className="py-2 pr-3">Elevation</th>
                      <th className="py-2 pr-3">Relief</th>
                      <th className="py-2 pr-3">Mean / P95 Slope</th>
                      <th className="py-2 pr-3">TRI Roughness</th>
                      <th className="py-2">Max Horizon</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono text-slate-200">
                    {compareSites.map((s, idx) => (
                      <tr key={idx}>
                        <td className="py-2 pr-3">{s.centerLat.toFixed(2)}°, {s.centerLon.toFixed(2)}°</td>
                        <td className="py-2 pr-3">{s.centerElevationM.toFixed(1)} m</td>
                        <td className="py-2 pr-3">{s.elevationStats.reliefM.toFixed(0)} m</td>
                        <td className="py-2 pr-3">{s.slopeStats.meanDeg}° / {s.slopeStats.p95Deg}°</td>
                        <td className="py-2 pr-3">{s.roughness.triMeters.toFixed(1)} m</td>
                        <td className="py-2">{s.horizonAnalysis.maxHorizonDeg}°</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <ProvenanceBar
            sourceName={terrain.provenance.sourceName}
            datasetId={`${terrain.provenance.datasetId} (${terrain.provenance.productId})`}
            classification="Measured NASA Data"
            resolution={`${terrain.provenance.resolutionMetersAtEquator} m/px`}
            units="Meters / Degrees"
            observationPeriod={terrain.provenance.observationPeriod}
            crs={terrain.provenance.coordinateSystem}
            sourceUrl={terrain.provenance.sourceUrl}
          />
        </>
      )}
    </div>
  );
}
