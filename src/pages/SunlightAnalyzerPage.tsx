import React, { useMemo, useState } from 'react';
import { Clock, Sun } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import { CoordinateSelectorBar } from '../components/shared/CoordinateSelectorBar';
import { ProvenanceBar } from '../components/shared/ProvenanceBar';
import { computeIlluminationTimeline, formatTimeInZone } from '../lib/lunarEphemeris';
import { GLOBAL_LAUNCH_FACILITIES } from '../lib/nasaCatalog';

export function SunlightAnalyzerPage() {
  const {
    activeCoordinate,
    analysisDateIso,
    setAnalysisDateIso,
    terrain,
    illuminationNow,
    selectedFacility,
    setSelectedFacilityId,
  } = useMission();

  const [periodDays, setPeriodDays] = useState<number>(30);

  const customTimeline = useMemo(() => {
    const d = new Date(analysisDateIso);
    const valid = Number.isNaN(d.getTime()) ? new Date() : d;
    return computeIlluminationTimeline(
      activeCoordinate.lat,
      activeCoordinate.lon,
      valid,
      periodDays,
      terrain?.horizonAnalysis.samples,
    );
  }, [activeCoordinate.lat, activeCoordinate.lon, analysisDateIso, periodDays, terrain]);

  const earthTimeCurrent = formatTimeInZone(illuminationNow.utcIso, selectedFacility.timeZone);
  const peakTimeEarth = customTimeline.peakSunlightUtc
    ? formatTimeInZone(customTimeline.peakSunlightUtc, selectedFacility.timeZone)
    : null;
  const nextSunriseEarth = customTimeline.nextSunriseUtc
    ? formatTimeInZone(customTimeline.nextSunriseUtc, selectedFacility.timeZone)
    : null;

  const buildSunPath = () => {
    const pts = customTimeline.timeline;
    if (pts.length < 2) return '';
    return pts
      .map((p, idx) => {
        const x = (idx / (pts.length - 1)) * 660 + 20;
        const clamped = Math.max(-45, Math.min(90, p.solarElevationDeg));
        const y = 115 - (clamped / 90) * 95;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
          Sunlight &amp; Illumination Analyzer
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          JPL/IAU ephemeris solar angles, terrain-obstructed illumination timelines, peak sunlight prediction, and separate Earth launch-pad local time conversion.
        </p>
      </div>

      <CoordinateSelectorBar />

      {/* Date, Period & Launch City Controls */}
      <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center gap-4">
        <label className="text-xs text-slate-300 space-y-1">
          <span className="block text-slate-400">Analysis Start (UTC)</span>
          <input
            type="datetime-local"
            value={analysisDateIso.slice(0, 16)}
            onChange={(e) => {
              const d = new Date(e.target.value + ':00Z');
              if (!Number.isNaN(d.getTime())) setAnalysisDateIso(d.toISOString());
            }}
            className="bg-[#07090E] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-xs text-slate-100"
          />
        </label>

        <label className="text-xs text-slate-300 space-y-1">
          <span className="block text-slate-400">Prediction Period</span>
          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            className="bg-[#07090E] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-xs text-slate-100"
          >
            <option value={7}>7 Days (168 h)</option>
            <option value={30}>30 Days (1 Lunar Cycle)</option>
            <option value={90}>90 Days (Polar Season)</option>
            <option value={180}>180 Days</option>
          </select>
        </label>

        <label className="text-xs text-slate-300 space-y-1 flex-1 min-w-[240px]">
          <span className="block text-slate-400">Earth Launch-Pad City (Time-Zone Conversion)</span>
          <select
            value={selectedFacility.id}
            onChange={(e) => setSelectedFacilityId(e.target.value)}
            className="w-full bg-[#07090E] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100"
          >
            {GLOBAL_LAUNCH_FACILITIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.shortName} — {f.cityLabel} ({f.timeZone})
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Two strictly separated panels: Lunar Illumination vs Earth Local Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-display font-semibold text-slate-100">
            <Sun className="w-4 h-4 text-amber-400" />
            Lunar Surface Solar State (Target Coordinate)
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">Solar Elevation</div>
              <div className="text-lg font-semibold text-amber-300 mt-1">{illuminationNow.solarElevationDeg}°</div>
            </div>
            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">Solar Azimuth</div>
              <div className="text-lg font-semibold text-slate-100 mt-1">{illuminationNow.solarAzimuthDeg}°</div>
            </div>
            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">Incidence Angle</div>
              <div className="text-lg font-semibold text-slate-100 mt-1">{illuminationNow.solarIncidenceDeg}°</div>
            </div>
            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">LOLA Horizon Block</div>
              <div className="text-lg font-semibold text-cyan-300 mt-1">
                {illuminationNow.horizonObstructionDeg !== null ? `${illuminationNow.horizonObstructionDeg}°` : '—'}
              </div>
            </div>
            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">Window Sunlit</div>
              <div className="text-lg font-semibold text-emerald-300 mt-1">{customTimeline.illuminationPct}%</div>
            </div>
            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">Peak Sun Elev</div>
              <div className="text-lg font-semibold text-slate-100 mt-1">{customTimeline.maxSolarElevationDeg}°</div>
            </div>
          </div>
          <div className="text-xs text-slate-300">
            Status at {illuminationNow.utcIso.slice(0, 16)} UTC:{' '}
            <span className={illuminationNow.sunlitTerrain ? 'text-emerald-400 font-medium' : 'text-amber-300 font-medium'}>
              {illuminationNow.sunlitTerrain
                ? 'Directly Illuminated (Clears Local LOLA Horizon)'
                : illuminationNow.sunlitFlat
                  ? 'Topographically Shadowed by Local LOLA Ridgeline'
                  : 'Lunar Night (Sun Below Mathematical Horizon)'}
            </span>
          </div>
        </div>

        {/* Earth Local Time Conversion (Strictly Distinct from Lunar Sunrise) */}
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-display font-semibold text-slate-100">
            <Clock className="w-4 h-4 text-cyan-400" />
            Earth Launch-Pad Local Time Conversion
          </div>
          <p className="text-xs text-slate-400">
            Converts lunar illumination events to UTC and local clock time at {selectedFacility.shortName} ({selectedFacility.timeZone}). Note: Earth launch time is distinct from lunar sunrise.
          </p>
          <div className="space-y-2.5 text-xs font-mono">
            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">Reference Analysis Instant</div>
              <div className="text-slate-100 mt-1">UTC: {earthTimeCurrent.utcTime}</div>
              <div className="text-cyan-300">
                {selectedFacility.cityLabel}: {earthTimeCurrent.localTime} ({earthTimeCurrent.tzName})
              </div>
            </div>

            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">Estimated Peak Lunar Sunlight in Window</div>
              {peakTimeEarth ? (
                <>
                  <div className="text-slate-100 mt-1">UTC: {peakTimeEarth.utcTime}</div>
                  <div className="text-amber-300">
                    Launch Pad Local: {peakTimeEarth.localTime} ({peakTimeEarth.tzName})
                  </div>
                </>
              ) : (
                <div className="text-slate-400 mt-1">No sunlit peak in window</div>
              )}
            </div>

            <div className="bg-[#07090E] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-sans">Next Lunar Sunrise / Illumination Window</div>
              {illuminationNow.sunlitTerrain ? (
                <div className="text-emerald-300 mt-1">
                  Currently sunlit · Next sunset:{' '}
                  {customTimeline.nextSunsetUtc
                    ? formatTimeInZone(customTimeline.nextSunsetUtc, selectedFacility.timeZone).utcTime
                    : 'Continuous over period'}
                </div>
              ) : nextSunriseEarth ? (
                <>
                  <div className="text-slate-100 mt-1">UTC: {nextSunriseEarth.utcTime}</div>
                  <div className="text-cyan-300">
                    Launch Pad Local: {nextSunriseEarth.localTime} ({nextSunriseEarth.tzName})
                  </div>
                </>
              ) : (
                <div className="text-rose-300 mt-1">
                  No direct sunlight predicted within {periodDays}-day window (PSR / polar shadow).
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Illumination Timeline Chart */}
      <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-display font-semibold text-slate-100">
            Predicted Solar Elevation Timeline ({periodDays} Days · {customTimeline.sunlitHours} Sunlit Hours)
          </h2>
          <span className="text-xs font-mono text-slate-400">
            0° line = Mathematical Horizon · Cyan curve = Solar Elevation
          </span>
        </div>

        <svg viewBox="0 0 700 185" className="w-full h-48 bg-[#07090E] border border-slate-800 rounded-md">
          {/* 0 degree horizon line */}
          <line x1="20" y1="115" x2="680" y2="115" stroke="#475569" strokeDasharray="4 4" strokeWidth="1" />
          <path d={buildSunPath()} fill="none" stroke="#06b6d4" strokeWidth="2" />
          <text x="24" y="20" fill="#94a3b8" fontSize="10" fontFamily="monospace">+90°</text>
          <text x="24" y="111" fill="#94a3b8" fontSize="10" fontFamily="monospace">0° Horizon</text>
          <text x="24" y="172" fill="#94a3b8" fontSize="10" fontFamily="monospace">T+0h</text>
          <text x="635" y="172" fill="#94a3b8" fontSize="10" fontFamily="monospace">T+{customTimeline.totalHours}h</text>
        </svg>

        <ProvenanceBar
          sourceName="JPL/IAU Ephemeris Solver (astronomy-engine) + NASA LOLA Horizon Table"
          datasetId="JPL-DE-EPHEMERIS + LRO-L-LOLA-4-GDR-V1.0"
          classification="Derived Scientific Calculation"
          units="Degrees, Hours, UTC"
          sourceUrl="https://naif.jpl.nasa.gov/naif/"
        />
      </div>
    </div>
  );
}
