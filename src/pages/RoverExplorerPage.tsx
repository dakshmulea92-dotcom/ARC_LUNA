import React, { useEffect, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import { CoordinateSelectorBar } from '../components/shared/CoordinateSelectorBar';
import { ProvenanceBar } from '../components/shared/ProvenanceBar';
import { RoverSimViewport3D } from '../components/three/RoverSimViewport3D';
import type { ProfilePoint } from '../types/lunar';

export function RoverExplorerPage() {
  const { activeCoordinate, terrain, illuminationNow, settings } = useMission();

  const [destOffsetLat, setDestOffsetLat] = useState(0.35);
  const [destOffsetLon, setDestOffsetLon] = useState(0.45);
  const [routePoints, setRoutePoints] = useState<ProfilePoint[]>([]);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [playing, setPlaying] = useState(false);

  const startLat = activeCoordinate.lat;
  const startLon = activeCoordinate.lon;
  const endLat = Math.max(-89.9, Math.min(89.9, startLat + destOffsetLat));
  const endLon = startLon + destOffsetLon;

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/lola/profile?lat1=${startLat}&lon1=${startLon}&lat2=${endLat}&lon2=${endLon}&samples=32`,
        );
        if (res.ok) {
          const data = (await res.json()) as { totalDistanceKm: number; points: ProfilePoint[] };
          setRoutePoints(data.points ?? []);
          setTotalDistanceKm(data.totalDistanceKm ?? 0);
        }
      } catch {
        // ignore
      }
    })();
  }, [startLat, startLon, endLat, endLon]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setProgressPct((p) => {
        if (p >= 100) {
          setPlaying(false);
          return 100;
        }
        return Math.min(100, p + 1.5);
      });
    }, 120);
    return () => window.clearInterval(id);
  }, [playing]);

  const currentIdx = Math.min(
    Math.max(0, routePoints.length - 1),
    Math.floor((progressPct / 100) * Math.max(0, routePoints.length - 1)),
  );
  const currentPt = routePoints[currentIdx];
  const maxRouteSlope = routePoints.length > 0 ? Math.max(...routePoints.map((p) => p.slopeDeg)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
          Rover Explorer &amp; Traverse Planner
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Plan great-circle lunar rover traverses over NASA LOLA elevation profiles and run a simulated 3D mobility traverse (not live rover telemetry).
        </p>
      </div>

      <CoordinateSelectorBar compact />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-4">
          {terrain ? (
            <RoverSimViewport3D
              terrain={terrain}
              routePoints={routePoints}
              progressPct={progressPct}
              lightweightMode={settings.lightweightMode}
            />
          ) : (
            <div className="h-[400px] bg-[#0D121C] border border-slate-800 rounded-lg flex items-center justify-center text-xs font-mono text-cyan-300">
              Loading NASA LOLA terrain...
            </div>
          )}

          <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium text-xs rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {playing ? 'Pause Traverse' : 'Simulate Traverse'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setProgressPct(0);
                }}
                className="px-3 py-1.5 bg-[#07090E] border border-slate-700 text-slate-200 text-xs rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>

            <label className="flex items-center gap-3 text-xs text-slate-300 flex-1 max-w-xs">
              <span>Progress</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={progressPct}
                onChange={(e) => setProgressPct(Number(e.target.value))}
                className="flex-1 accent-cyan-500"
              />
              <span className="font-mono">{progressPct.toFixed(0)}%</span>
            </label>
          </div>
        </div>

        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-4">
          <h2 className="text-base font-display font-semibold text-slate-100">
            Traverse Waypoints &amp; Route Telemetry
          </h2>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-slate-400">ΔLat Destination (°)</span>
              <input
                type="number"
                step={0.05}
                min={-1.5}
                max={1.5}
                value={destOffsetLat}
                onChange={(e) => setDestOffsetLat(Number(e.target.value))}
                className="w-full bg-[#07090E] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">ΔLon Destination (°)</span>
              <input
                type="number"
                step={0.05}
                min={-1.5}
                max={1.5}
                value={destOffsetLon}
                onChange={(e) => setDestOffsetLon(Number(e.target.value))}
                className="w-full bg-[#07090E] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-100"
              />
            </label>
          </div>

          <div className="bg-[#07090E] border border-slate-800 rounded p-3 text-xs font-mono space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-400">Total Route Distance:</span><span>{totalDistanceKm.toFixed(2)} km</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Distance Travelled (Sim):</span><span className="text-cyan-300">{((totalDistanceKm * progressPct) / 100).toFixed(2)} km</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Max Route Slope:</span><span className={maxRouteSlope > 15 ? 'text-rose-400' : 'text-emerald-300'}>{maxRouteSlope.toFixed(2)}°</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Current Elev (LOLA):</span><span>{currentPt ? `${currentPt.elevationM.toFixed(1)} m` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Current Slope (LOLA):</span><span>{currentPt ? `${currentPt.slopeDeg.toFixed(2)}°` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Solar Elevation:</span><span className="text-amber-300">{illuminationNow.solarElevationDeg}°</span></div>
          </div>

          <div className="text-xs text-slate-300 space-y-1">
            <div className="font-medium text-slate-200">Route Obstacle &amp; Crater Assessment</div>
            <p className="text-slate-400">
              {terrain && terrain.detectedCraters.length > 0
                ? `${terrain.detectedCraters.length} LOLA-resolved crater(s) identified in corridor. Closest depression is ${terrain.detectedCraters[0].distanceKm} km from origin.`
                : 'No LOLA-resolved crater hazards detected along corridor at 1.9 km baseline.'}
            </p>
          </div>
        </div>
      </div>

      <ProvenanceBar
        sourceName="Simulated Rover Traverse over NASA PDS LOLA LDEM_16 Elevation Profile"
        datasetId="SIMULATED-ROVER + LRO-L-LOLA-4-GDR-V1.0"
        classification="Simulated Environment"
        resolution="1,895 m/px LOLA baseline"
      />
    </div>
  );
}
