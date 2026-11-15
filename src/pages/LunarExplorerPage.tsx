import React, { useEffect, useRef, useState } from 'react';
import { Search, ExternalLink, Play, Pause, RotateCcw, Sun, Moon, Globe2, Compass } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import { CoordinateSelectorBar } from '../components/shared/CoordinateSelectorBar';
import { NasaVisualTile } from '../components/shared/NasaVisualTile';
import { ProvenanceBar } from '../components/shared/ProvenanceBar';
import { LunarGlobe3D, type CameraPreset, type EarthSelectionInfo } from '../components/three/LunarGlobe3D';
import { GLOBAL_LAUNCH_FACILITIES, NASA_3D_ASSETS } from '../lib/nasaCatalog';

interface TrekResult {
  uuid: string;
  title: string;
  itemType: string;
  description: string;
  centerLat?: number;
  centerLon?: number;
  mediaUrl?: string;
  sourceUrl: string;
}

export function LunarExplorerPage() {
  const {
    activeCoordinate,
    selectCoordinate,
    terrain,
    illuminationNow,
    illuminationTimeline,
    suitability,
    analysisDateIso,
    setAnalysisDateIso,
    selectedFacility,
    setSelectedFacilityId,
    setActivePage,
    settings,
    formatLon,
  } = useMission();

  const [trekQuery, setTrekQuery] = useState('Shackleton');
  const [trekLoading, setTrekLoading] = useState(false);
  const [trekResults, setTrekResults] = useState<TrekResult[]>([]);
  const [trekError, setTrekError] = useState<string | null>(null);

  const [earthLocation, setEarthLocation] = useState<EarthSelectionInfo>({
    lat: 0,
    lon: 0,
    label: 'Null Island Origin (0.000°, 0.000°)',
  });
  const [externalPreset, setExternalPreset] = useState<{ id: CameraPreset; seq: number } | null>(null);

  // Day & Night Cycle Playback state
  const [cyclePlaying, setCyclePlaying] = useState(false);
  const [cycleStepHours, setCycleStepHours] = useState<number>(6);
  const baseEpochRef = useRef<number>(Date.now());
  const dateIsoRef = useRef<string>(analysisDateIso);
  dateIsoRef.current = analysisDateIso;

  useEffect(() => {
    if (!cyclePlaying) return;
    const id = window.setInterval(() => {
      const curMs = new Date(dateIsoRef.current).getTime();
      const nextMs = (Number.isFinite(curMs) ? curMs : Date.now()) + cycleStepHours * 3600_000;
      setAnalysisDateIso(new Date(nextMs).toISOString());
    }, 360);
    return () => window.clearInterval(id);
  }, [cyclePlaying, cycleStepHours, setAnalysisDateIso]);

  const currentMs = new Date(analysisDateIso).getTime();
  const offsetHours = Number.isFinite(currentMs)
    ? Math.max(0, Math.min(708, Math.round((currentMs - baseEpochRef.current) / 3600_000)))
    : 0;

  const setSynodicHourOffset = (hours: number) => {
    setCyclePlaying(false);
    setAnalysisDateIso(new Date(baseEpochRef.current + hours * 3600_000).toISOString());
  };

  const resetToLiveUtc = () => {
    setCyclePlaying(false);
    const now = Date.now();
    baseEpochRef.current = now;
    setAnalysisDateIso(new Date(now).toISOString());
  };

  const triggerCameraPreset = (id: CameraPreset) => {
    setExternalPreset((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
  };

  const dayNightLabel = illuminationNow.sunlitTerrain
    ? 'LUNAR DAY (SUNLIT)'
    : illuminationNow.sunlitFlat
      ? 'TOPOGRAPHIC SHADOW'
      : 'LUNAR NIGHT';

  const dayNightColorClass = illuminationNow.sunlitTerrain
    ? 'text-amber-300 border-amber-700/70 bg-amber-950/30'
    : illuminationNow.sunlitFlat
      ? 'text-cyan-300 border-cyan-700/70 bg-cyan-950/30'
      : 'text-indigo-300 border-indigo-700/70 bg-indigo-950/40';

  const runTrekSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTrekLoading(true);
    setTrekError(null);
    try {
      const res = await fetch(`/api/nasa/moon-trek/search?q=${encodeURIComponent(trekQuery)}&rows=8`);
      const data = (await res.json()) as { available: boolean; items: TrekResult[]; error?: string };
      if (!data.available) {
        setTrekError(data.error ?? 'NASA Moon Trek query unavailable');
        setTrekResults([]);
      } else {
        setTrekResults(data.items);
      }
    } catch {
      setTrekError('Network error querying NASA Moon Trek');
    } finally {
      setTrekLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
          Lunar Explorer — Interactive 3D Moon, 3.67:1 Earth &amp; Shackleton Rim Rover
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Official NASA SVS 14959 Moon, NASA #2393 Earth (3.67:1 scale, (0°, 0°) Null Island origin), and hyper-realistic Shackleton Crater Rim rover close-up.
        </p>
      </div>

      <CoordinateSelectorBar />

      {/* Day & Night Terminator Cycle Controls */}
      <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCyclePlaying((p) => !p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer ${
                cyclePlaying
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-slate-950'
              }`}
            >
              {cyclePlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {cyclePlaying ? 'Pause Day/Night Cycle' : 'Animate Day/Night Cycle'}
            </button>

            <div className="flex items-center gap-1 bg-[#07090E] border border-slate-800 rounded p-0.5 text-[11px]">
              {[
                { h: 2, label: '2h/step' },
                { h: 6, label: '6h/step' },
                { h: 18, label: '18h/step' },
              ].map((opt) => (
                <button
                  key={opt.h}
                  type="button"
                  onClick={() => setCycleStepHours(opt.h)}
                  className={`px-2 py-1 rounded cursor-pointer ${
                    cycleStepHours === opt.h ? 'bg-slate-800 text-cyan-300 font-medium' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {illuminationTimeline.nextSunriseUtc && (
              <button
                type="button"
                onClick={() => {
                  setCyclePlaying(false);
                  setAnalysisDateIso(illuminationTimeline.nextSunriseUtc!);
                }}
                className="px-2.5 py-1.5 text-xs bg-[#07090E] hover:bg-slate-800 border border-slate-700 text-amber-200 rounded inline-flex items-center gap-1 cursor-pointer"
              >
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                Jump to Sunrise
              </button>
            )}

            {illuminationTimeline.nextSunsetUtc && (
              <button
                type="button"
                onClick={() => {
                  setCyclePlaying(false);
                  setAnalysisDateIso(illuminationTimeline.nextSunsetUtc!);
                }}
                className="px-2.5 py-1.5 text-xs bg-[#07090E] hover:bg-slate-800 border border-slate-700 text-indigo-200 rounded inline-flex items-center gap-1 cursor-pointer"
              >
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                Jump to Lunar Night
              </button>
            )}

            <button
              type="button"
              onClick={resetToLiveUtc}
              className="px-2.5 py-1.5 text-xs bg-[#07090E] hover:bg-slate-800 border border-slate-700 text-slate-300 rounded inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Live UTC
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
            <span className={`px-2.5 py-1 rounded border text-[11px] font-semibold ${dayNightColorClass}`}>
              {dayNightLabel}
            </span>
            <span className="text-slate-300">
              {illuminationNow.utcIso.replace('T', ' ').slice(0, 16)} UTC
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[240px] flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">Synodic Scrubber (29.5d):</span>
            <input
              type="range"
              min={0}
              max={708}
              step={2}
              value={offsetHours}
              onChange={(e) => setSynodicHourOffset(Number(e.target.value))}
              aria-label="Synodic Day Night Hour Scrubber"
              className="w-full accent-amber-400 cursor-pointer"
            />
            <span className="text-[11px] font-mono text-amber-300 whitespace-nowrap">
              +{(offsetHours / 24).toFixed(1)} d
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-300">
            <span>Phase: <strong className="text-slate-100">{illuminationNow.phaseName}</strong></span>
            <span>Subsolar: <strong className="text-amber-300">{illuminationNow.subsolarLatDeg.toFixed(2)}°, {illuminationNow.subsolarLonDeg.toFixed(1)}°</strong></span>
            <span>Radiative Temp (Derived): <strong className="text-cyan-300">{illuminationNow.derivedSurfaceTempK} K ({illuminationNow.derivedSurfaceTempC} °C)</strong></span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* 3D NASA Moon + 3.67:1 Earth + Shackleton Rim Rover Viewport */}
        <div className="xl:col-span-2 min-h-[540px]">
          <LunarGlobe3D
            selectedLat={activeCoordinate.lat}
            selectedLon={activeCoordinate.lon}
            subsolarLat={illuminationNow.subsolarLatDeg}
            subsolarLon={illuminationNow.subsolarLonDeg}
            utcIso={illuminationNow.utcIso}
            lightweightMode={settings.lightweightMode}
            externalPreset={externalPreset}
            onSelectCoordinate={(lat, lon, label) => {
              selectCoordinate({
                lat,
                lon,
                label: label ?? `Globe Pick (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
                region: Math.abs(lat) > 80 ? (lat < 0 ? 'Lunar South Pole' : 'Lunar North Pole') : 'Lunar Surface',
                source: 'Interactive 3D NASA SVS 14959 Globe Selection',
              });
            }}
            onSelectEarthLocation={(info) => {
              setEarthLocation(info);
              if (info.facilityId) {
                setSelectedFacilityId(info.facilityId);
              }
            }}
          />
        </div>

        {/* Synchronized Lunar Telemetry, Earth Access & Moon Trek Panel */}
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4 space-y-4 flex flex-col">
          <div>
            <h2 className="text-sm font-display font-semibold text-slate-100">
              Synchronized Location Telemetry
            </h2>
            <div className="text-xs text-slate-400 mt-0.5">{activeCoordinate.label}</div>
          </div>

          <div className="bg-[#07090E] border border-slate-800 rounded-md p-3 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">Coordinates:</span>
              <span className="text-slate-100">
                {activeCoordinate.lat.toFixed(4)}°, {formatLon(activeCoordinate.lon)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">LOLA Elevation:</span>
              <span className="text-cyan-300">
                {terrain ? `${terrain.centerElevationM.toFixed(1)} m` : 'Loading...'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Mean / P95 Slope:</span>
              <span className="text-slate-100">
                {terrain ? `${terrain.slopeStats.meanDeg}° / ${terrain.slopeStats.p95Deg}°` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Solar Elevation:</span>
              <span className="text-amber-300">
                {illuminationNow.solarElevationDeg.toFixed(2)}° ({illuminationNow.sunlitTerrain ? 'Day / Sunlit' : illuminationNow.sunlitFlat ? 'Terrain Shadow' : 'Night'})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Derived Surf. Temp:</span>
              <span className="text-slate-100">
                {illuminationNow.derivedSurfaceTempK} K ({illuminationNow.derivedSurfaceTempC} °C)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Earth–Moon Distance:</span>
              <span className="text-sky-300">
                {illuminationNow.earthMoonDistanceKm.toLocaleString()} km
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Site Suitability:</span>
              <span className="text-slate-100">
                {suitability ? `${suitability.overallScore}/100` : '—'}
              </span>
            </div>
          </div>

          {/* Synchronized Real NASA LRO Orbital Visuals for Selected Target */}
          <div className="grid grid-cols-2 gap-2">
            <NasaVisualTile
              src={`/api/nasa/moon-trek/tile?layer=wac&lat=${activeCoordinate.lat}&lon=${activeCoordinate.lon}&z=4`}
              alt="NASA LRO WAC Mosaic"
              label="LRO WAC 303ppd"
              aspectClass="aspect-square"
            />
            <NasaVisualTile
              src={`/api/nasa/moon-trek/tile?layer=lola_color&lat=${activeCoordinate.lat}&lon=${activeCoordinate.lon}&z=4`}
              alt="NASA LOLA Color Relief"
              label="LOLA Relief 128ppd"
              aspectClass="aspect-square"
            />
          </div>

          {/* Earth Access & Null Island (0°, 0°) Inspector inside Lunar Explorer */}
          <div className="bg-[#07090E] border border-sky-900/60 rounded-md p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-medium text-sky-300">
                <Globe2 className="w-3.5 h-3.5" />
                Earth Access (3.67:1 Scale · Null Island Origin)
              </div>
              <button
                type="button"
                onClick={() => setActivePage('earth-explorer')}
                className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
              >
                Open Earth Explorer →
              </button>
            </div>

            <div className="text-[11px] font-mono text-slate-300 space-y-0.5">
              <div>Selected Earth Point: <span className="text-emerald-300">{earthLocation.label}</span></div>
              <div>Earth Coords: {earthLocation.lat.toFixed(3)}°, {earthLocation.lon.toFixed(3)}° · Launch Pad: {selectedFacility.shortName}</div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  setEarthLocation({ lat: 0, lon: 0, label: 'Null Island Origin (0.000°, 0.000°)' });
                  triggerCameraPreset('earth-null');
                }}
                className="px-2 py-1 text-[11px] bg-emerald-950/40 border border-emerald-700/70 text-emerald-200 hover:bg-emerald-900/40 rounded inline-flex items-center gap-1 cursor-pointer"
              >
                <Compass className="w-3 h-3" />
                Focus Null Island (0°,0°)
              </button>
              <button
                type="button"
                onClick={() => triggerCameraPreset('earth-moon')}
                className="px-2 py-1 text-[11px] bg-sky-950/40 border border-sky-700/70 text-sky-200 hover:bg-sky-900/40 rounded cursor-pointer"
              >
                3.67:1 Earth–Moon
              </button>
              <button
                type="button"
                onClick={() => {
                  selectCoordinate({
                    lat: -89.66,
                    lon: 129.2,
                    label: 'Shackleton Crater Rim',
                    region: 'Lunar South Pole',
                    source: 'NASA LRO / Artemis III Candidate Region',
                  });
                  triggerCameraPreset('shackleton');
                }}
                className="px-2 py-1 text-[11px] bg-cyan-950/40 border border-cyan-700/70 text-cyan-200 hover:bg-cyan-900/40 rounded cursor-pointer"
              >
                Inspect Shackleton Rim + Rover
              </button>
            </div>

            <select
              aria-label="Jump to Earth launch facility"
              value={selectedFacility.id}
              onChange={(e) => {
                const fac = GLOBAL_LAUNCH_FACILITIES.find((f) => f.id === e.target.value);
                if (fac) {
                  setSelectedFacilityId(fac.id);
                  setEarthLocation({
                    lat: fac.lat,
                    lon: fac.lon,
                    label: fac.shortName,
                    facilityId: fac.id,
                  });
                }
              }}
              className="w-full bg-[#0D121C] border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-sky-500"
            >
              {GLOBAL_LAUNCH_FACILITIES.map((f) => (
                <option key={f.id} value={f.id}>
                  Earth Site: {f.shortName} ({f.lat.toFixed(2)}°, {f.lon.toFixed(2)}°)
                </option>
              ))}
            </select>
          </div>

          {/* NASA Moon Trek Live Search */}
          <div className="pt-2 border-t border-slate-800 space-y-2.5 flex-1 flex flex-col">
            <div className="text-xs font-medium text-slate-200">
              NASA Moon Trek Feature &amp; Crater Lookup
            </div>
            <form onSubmit={runTrekSearch} className="flex gap-2">
              <input
                type="text"
                value={trekQuery}
                onChange={(e) => setTrekQuery(e.target.value)}
                placeholder="Search craters, Apollo, mare..."
                className="flex-1 bg-[#07090E] border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={trekLoading}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-md text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                Query
              </button>
            </form>

            {trekError && <div className="text-xs text-amber-300">{trekError}</div>}

            <div className="flex-1 overflow-y-auto space-y-2 max-h-[160px] pr-1">
              {trekResults.length === 0 && !trekLoading && (
                <div className="text-xs text-slate-500">
                  Query NASA Moon Trek API for named craters, Apollo sites, and official LRO products.
                </div>
              )}
              {trekResults.map((item) => (
                <div key={item.uuid || item.title} className="bg-[#07090E] border border-slate-800 rounded p-2.5 text-xs space-y-1.5">
                  <div className="flex items-start gap-2.5">
                    {item.mediaUrl && (
                      <img
                        src={`/api/nasa/media?url=${encodeURIComponent(item.mediaUrl)}`}
                        alt={item.title}
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                        className="w-12 h-12 rounded object-cover border border-slate-800 shrink-0 bg-[#04060B]"
                      />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-200 truncate">{item.title}</span>
                        <span className="text-[11px] font-mono text-slate-400 shrink-0">{item.itemType}</span>
                      </div>
                      {item.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-2">{item.description}</p>
                      )}
                      {item.centerLat !== undefined && item.centerLon !== undefined && (
                        <button
                          type="button"
                          onClick={() =>
                            selectCoordinate({
                              lat: item.centerLat!,
                              lon: item.centerLon!,
                              label: item.title,
                              region: 'NASA Moon Trek Feature',
                              source: 'NASA Moon Trek Search API',
                            })
                          }
                          className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                        >
                          Center Target ({item.centerLat.toFixed(2)}°, {item.centerLon.toFixed(2)}°)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div>
              3D Assets: {NASA_3D_ASSETS[0].attribution} · {NASA_3D_ASSETS[1].attribution} · {NASA_3D_ASSETS[2].attribution}
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={NASA_3D_ASSETS[0].pageUrl} target="_blank" rel="noreferrer" className="text-cyan-400 inline-flex items-center gap-1 hover:underline">
                SVS 14959 <ExternalLink className="w-3 h-3" />
              </a>
              <a href={NASA_3D_ASSETS[1].pageUrl} target="_blank" rel="noreferrer" className="text-cyan-400 inline-flex items-center gap-1 hover:underline">
                NASA Earth 3D <ExternalLink className="w-3 h-3" />
              </a>
              <a href={NASA_3D_ASSETS[2].pageUrl} target="_blank" rel="noreferrer" className="text-cyan-400 inline-flex items-center gap-1 hover:underline">
                NASA Sun 3D <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {terrain && (
        <ProvenanceBar
          sourceName={terrain.provenance.sourceName}
          datasetId={`${terrain.provenance.datasetId} + NASA SVS 14959 + NASA #2393`}
          classification="Measured NASA Data"
          resolution={`${terrain.provenance.resolutionMetersAtEquator} m/px LOLA + 3D GLB`}
          observationPeriod={terrain.provenance.observationPeriod}
          crs={terrain.provenance.coordinateSystem}
          sourceUrl={terrain.provenance.sourceUrl}
        />
      )}
    </div>
  );
}
