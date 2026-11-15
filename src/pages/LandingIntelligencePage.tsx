import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, SlidersHorizontal } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import { CoordinateSelectorBar } from '../components/shared/CoordinateSelectorBar';
import { LolaHeatmapCanvas } from '../components/shared/LolaHeatmapCanvas';
import { ProvenanceBar } from '../components/shared/ProvenanceBar';
import { evaluateLandingSite } from '../lib/scoringEngine';
import type { ScoringWeights } from '../types/lunar';

export function LandingIntelligencePage() {
  const { terrain, terrainLoading, illuminationTimeline, settings, updateSettings } = useMission();
  const [weights, setWeights] = useState<ScoringWeights>(settings.defaultWeights);
  const [mapMode, setMapMode] = useState<'slope' | 'elevation' | 'roughness'>('slope');

  const assessment = terrain ? evaluateLandingSite(terrain, illuminationTimeline, weights) : null;

  const updateWeight = (key: keyof ScoringWeights, val: number) => {
    const next = { ...weights, [key]: val };
    setWeights(next);
    updateSettings({ defaultWeights: next });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
          Landing Site Intelligence
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Multi-parameter landing safety assessment derived from NASA LOLA LDEM_16 topography, crater detection, and ephemeris illumination.
        </p>
      </div>

      <CoordinateSelectorBar />

      {terrainLoading && !terrain && (
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-6 text-sm text-cyan-300 font-mono">
          Extracting NASA LOLA LDEM_16 patch and computing Horn 3×3 slopes...
        </div>
      )}

      {terrain && assessment && (
        <>
          {/* Verdict & Score Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-400">Overall Suitability Score</div>
                  <div className="mt-1 flex items-baseline">
                    <span className="text-4xl font-mono font-bold text-slate-100">
                      {assessment.overallScore.toFixed(1)}
                    </span>
                    <span className="text-xs font-mono text-slate-400 ml-1.5">/ 100</span>
                  </div>
                </div>
                {assessment.verdict.startsWith('Suitable') ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
                )}
              </div>

              <div className="text-sm font-medium text-cyan-300">{assessment.verdict}</div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Data Coverage Confidence:</span>
                  <span className="font-mono text-amber-300">{assessment.dataCoveragePct}%</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Uncertainty Classification:</span>
                  <span className="text-right text-slate-200">{assessment.uncertaintyLevel}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Meter-Scale Boulder Map:</span>
                  <span className="font-mono text-rose-300">{terrain.roughness.subMeterBoulderData}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="text-xs font-medium text-slate-200">Sub-Parameter Scores</div>
                {[
                  { label: 'Terrain Slope (Horn 3×3)', val: assessment.subScores.slope },
                  { label: 'Surface Roughness (TRI)', val: assessment.subScores.roughness },
                  { label: 'Crater Proximity Clearance', val: assessment.subScores.craterProximity },
                  { label: 'Illumination & Horizon', val: assessment.subScores.illumination },
                  { label: 'NASA Data Coverage', val: assessment.subScores.dataCoverage },
                ].map((row) => (
                  <div key={row.label} className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>{row.label}</span>
                      <span className="font-mono">{row.val.toFixed(1)}</span>
                    </div>
                    <div className="h-1.5 bg-[#07090E] rounded overflow-hidden">
                      <div
                        className={`h-full ${row.val >= 70 ? 'bg-cyan-500' : row.val >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${row.val}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Slope Distribution Map + Histogram */}
            <div className="lg:col-span-2 bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-display font-semibold text-slate-100">
                  Regional Terrain &amp; Hazard Distribution ({terrain.radiusKm} km radius)
                </h2>
                <div className="flex items-center gap-1 bg-[#07090E] p-1 rounded-md border border-slate-800">
                  {(['slope', 'elevation', 'roughness'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMapMode(m)}
                      className={`px-2.5 py-1 text-xs rounded capitalize cursor-pointer ${
                        mapMode === m ? 'bg-cyan-600 text-slate-950 font-medium' : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <LolaHeatmapCanvas terrain={terrain} mode={mapMode} heightPx={290} />

                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-medium text-slate-200 mb-2">
                      Slope Distribution Histogram ({terrain.slopeStats.suitabilityClass})
                    </div>
                    <div className="space-y-2">
                      {terrain.slopeStats.histogram.map((b) => (
                        <div key={b.label} className="text-xs">
                          <div className="flex justify-between text-slate-300 font-mono mb-0.5">
                            <span>{b.label}</span>
                            <span>{b.pct}% ({b.count} cells)</span>
                          </div>
                          <div className="h-2 bg-[#07090E] rounded overflow-hidden">
                            <div className="h-full bg-cyan-500/80" style={{ width: `${b.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#07090E] border border-slate-800 rounded-md p-3 text-xs space-y-1 font-mono">
                    <div className="text-slate-200 font-sans font-medium mb-1">Elevation &amp; Roughness Metrics</div>
                    <div className="flex justify-between"><span className="text-slate-400">Center Elevation:</span><span>{terrain.centerElevationM} m</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Min / Max Elevation:</span><span>{terrain.elevationStats.minM} / {terrain.elevationStats.maxM} m</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Total Relief:</span><span>{terrain.elevationStats.reliefM} m</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">RMS Residual / TRI:</span><span>{terrain.roughness.rmsResidualM} m / {terrain.roughness.triMeters} m</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Crater Analysis, Scientific Reasoning, and Configurable Weights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-display font-semibold text-slate-100">
                <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                Configurable Scoring Weights
              </div>
              <p className="text-xs text-slate-400">{assessment.methodologyDoc}</p>
              <div className="space-y-3 pt-1">
                {([
                  ['slope', 'Slope Stability Weight'],
                  ['roughness', 'Surface Roughness Weight'],
                  ['craterProximity', 'Crater Proximity Weight'],
                  ['illumination', 'Solar Illumination Weight'],
                  ['dataCoverage', 'Data Coverage Weight'],
                ] as Array<[keyof ScoringWeights, string]>).map(([k, label]) => (
                  <label key={k} className="block text-xs">
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>{label}</span>
                      <span className="font-mono">{(weights[k] * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.6}
                      step={0.05}
                      value={weights[k]}
                      onChange={(e) => updateWeight(k, Number(e.target.value))}
                      className="w-full accent-cyan-500"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
              <h3 className="text-sm font-display font-semibold text-slate-100">
                Scientific Findings &amp; Rejection / Caution Reasons
              </h3>
              <ul className="space-y-2 text-xs text-slate-300 list-disc pl-4">
                {assessment.scientificReasoning.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <div className="pt-2 border-t border-slate-800 text-xs font-medium text-amber-300">
                Hazards, Uncertainties &amp; Limitations
              </div>
              <ul className="space-y-2 text-xs text-slate-300 list-disc pl-4">
                {assessment.reasonsForCautionOrRejection.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>

            <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
              <h3 className="text-sm font-display font-semibold text-slate-100">
                LOLA-Detected Craters &amp; Depressions
              </h3>
              {terrain.detectedCraters.length === 0 ? (
                <div className="text-xs text-slate-400">
                  No major crater depressions ≥60 m depth resolved at {terrain.cellSpacingKm.toFixed(2)} km cell spacing in this window.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-1.5 pr-2">Dist</th>
                        <th className="py-1.5 pr-2">Diam</th>
                        <th className="py-1.5 pr-2">Depth</th>
                        <th className="py-1.5">Coord</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 font-mono text-slate-200">
                      {terrain.detectedCraters.map((c) => (
                        <tr key={c.id}>
                          <td className="py-1.5 pr-2">{c.distanceKm.toFixed(1)} km</td>
                          <td className="py-1.5 pr-2">{c.diameterKm.toFixed(1)} km</td>
                          <td className="py-1.5 pr-2 text-amber-300">
                            {c.depthM !== null ? `${c.depthM.toFixed(0)} m` : 'NASA DATA UNAVAILABLE'}
                          </td>
                          <td className="py-1.5 text-slate-400">
                            {c.lat.toFixed(2)}°, {c.lon.toFixed(2)}°
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <ProvenanceBar
            sourceName={terrain.provenance.sourceName}
            datasetId={`${terrain.provenance.datasetId} (${terrain.provenance.productId})`}
            classification="Derived Scientific Calculation"
            resolution={`${terrain.provenance.resolutionMetersAtEquator} m/px baseline`}
            units="deg, m, km"
            observationPeriod={terrain.provenance.observationPeriod}
            crs={terrain.provenance.coordinateSystem}
            sourceUrl={terrain.provenance.sourceUrl}
          />
        </>
      )}
    </div>
  );
}
