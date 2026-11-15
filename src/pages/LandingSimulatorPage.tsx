import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, AlertOctagon, Camera, ShieldCheck, Rocket, CheckCircle2 } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import { CoordinateSelectorBar } from '../components/shared/CoordinateSelectorBar';
import { ProvenanceBar } from '../components/shared/ProvenanceBar';
import { LandingSimViewport3D, type SimTelemetryFrame } from '../components/three/LandingSimViewport3D';
import { GLOBAL_LAUNCH_FACILITIES, LUNAR_SITE_PRESETS } from '../lib/nasaCatalog';
import { computeEducationalMissionMechanics } from '../lib/orbitalMechanics';
import { runLolaThreatScan } from '../lib/threatDetection';

interface MissionOriginOption {
  id: string;
  label: string;
  category: 'Earth Space Station (LEO)' | 'Earth Spaceport';
  lat: number;
  lon: number;
  parkingAltKm: number;
  operator: string;
  country: string;
}

const ORBITAL_SPACE_STATIONS: MissionOriginOption[] = [
  {
    id: 'iss-leo',
    label: 'International Space Station (ISS · LEO 408 km, 51.6°)',
    category: 'Earth Space Station (LEO)',
    lat: 51.6,
    lon: 0,
    parkingAltKm: 408,
    operator: 'NASA / Roscosmos / ESA / JAXA / CSA',
    country: 'Low Earth Orbit',
  },
  {
    id: 'tiangong-leo',
    label: 'Tiangong Space Station (CSS · LEO 390 km, 41.5°)',
    category: 'Earth Space Station (LEO)',
    lat: 41.5,
    lon: 0,
    parkingAltKm: 390,
    operator: 'CMSA',
    country: 'Low Earth Orbit',
  },
];

const MISSION_ORIGIN_OPTIONS: MissionOriginOption[] = [
  ...GLOBAL_LAUNCH_FACILITIES.map((f) => ({
    id: f.id,
    label: `${f.shortName} (${f.cityLabel})`,
    category: 'Earth Spaceport' as const,
    lat: f.lat,
    lon: f.lon,
    parkingAltKm: 200,
    operator: f.operator,
    country: f.country,
  })),
  ...ORBITAL_SPACE_STATIONS,
];

const APOLLO_11_TIMELINE = [
  { met: '000:00:00', phase: 'Saturn V Liftoff — KSC LC-39A', note: 'July 16, 1969 13:32:00 UTC · 28.5729° N, 80.6490° W.' },
  { met: '002:44:16', phase: 'Trans-Lunar Injection (TLI)', note: 'S-IVB third stage burn injecting Apollo 11 onto lunar free-return trajectory.' },
  { met: '075:49:50', phase: 'Lunar Orbit Insertion (LOI-1)', note: 'SPS burn behind lunar farside entering 111 × 313 km lunar orbit.' },
  { met: '102:33:05', phase: 'Powered Descent Initiation (PDI)', note: 'Descent engine ignition at ~50,000 ft toward Mare Tranquillitatis.' },
  { met: '102:44:10', phase: 'Boulder Crater Hazard Avoidance', note: 'Manual attitude hover past West Crater boulder field (Program Alarm 1202 cleared).' },
  { met: '102:45:40', phase: 'Contact Light — Tranquility Base', note: 'Confirmed Eagle safe touchdown at 0.67408° N, 23.47297° E (LRO NAC verified).' },
];

type TransitStage = 'STANDBY' | 'LAUNCH_TLI' | 'TRANSLUNAR_COAST' | 'LOI_INSERTION' | 'POWERED_DESCENT';

export function LandingSimulatorPage() {
  const {
    activeCoordinate,
    selectCoordinate,
    terrain,
    illuminationNow,
    selectedFacility,
    setSelectedFacilityId,
    settings,
    formatLon,
  } = useMission();

  const [originId, setOriginId] = useState<string>(selectedFacility.id);
  const [mode, setMode] = useState<'manual' | 'assisted' | 'autonomous'>('autonomous');
  const [running, setRunning] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [apolloMode, setApolloMode] = useState(false);
  const [sampleImageMode, setSampleImageMode] = useState<'live-sim-nadir' | 'sample-crater-test'>('live-sim-nadir');

  // End-to-End Earth-to-Moon Transit Sequencer state
  const [transitStage, setTransitStage] = useState<TransitStage>('STANDBY');
  const [transitPct, setTransitPct] = useState<number>(0);

  const [manualInput, setManualInput] = useState({ throttleDelta: 0, pitchX: 0, rollZ: 0 });
  const [telemetry, setTelemetry] = useState<SimTelemetryFrame>({
    simTimeSec: 0,
    altitudeM: 900,
    verticalVelMS: -22,
    horizontalVelMS: 3.4,
    accelerationMS2: 0,
    throttlePct: 44,
    distanceFromTargetM: 320,
    offsetNorthM: 210,
    offsetEastM: 240,
    localSlopeDeg: terrain?.slopeStats.meanDeg ?? 0,
    phase: 'IDLE',
    hazardStatus: 'Ready for simulated descent',
    divertActive: false,
    selectedPadSlopeDeg: terrain?.slopeStats.meanDeg ?? 0,
  });

  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedOrigin = useMemo(
    () => MISSION_ORIGIN_OPTIONS.find((o) => o.id === originId) ?? MISSION_ORIGIN_OPTIONS[0],
    [originId],
  );

  const handleSelectOrigin = (id: string) => {
    setOriginId(id);
    if (GLOBAL_LAUNCH_FACILITIES.some((f) => f.id === id)) {
      setSelectedFacilityId(id);
    }
  };

  const transferMechanics = useMemo(
    () =>
      computeEducationalMissionMechanics({
        earthMoonDistanceKm: illuminationNow.earthMoonDistanceKm,
        launchLatDeg: selectedOrigin.lat,
        earthParkingAltKm: selectedOrigin.parkingAltKm,
        lunarOrbitAltKm: 100,
      }),
    [illuminationNow.earthMoonDistanceKm, selectedOrigin.lat, selectedOrigin.parkingAltKm],
  );

  const threatScan = useMemo(
    () => (terrain ? runLolaThreatScan(terrain, illuminationNow.solarElevationDeg) : null),
    [terrain, illuminationNow.solarElevationDeg],
  );

  // Accelerated Earth -> Moon transfer sequencer that automatically hands off into LOLA Powered Descent
  useEffect(() => {
    if (transitStage === 'STANDBY' || transitStage === 'POWERED_DESCENT') return;
    const id = window.setInterval(() => {
      setTransitPct((prev) => {
        const next = Math.min(100, prev + 5);
        if (next < 28) setTransitStage('LAUNCH_TLI');
        else if (next < 80) setTransitStage('TRANSLUNAR_COAST');
        else if (next < 100) setTransitStage('LOI_INSERTION');
        else {
          setTransitStage('POWERED_DESCENT');
          setRunning(true);
        }
        return next;
      });
    }, 150);
    return () => window.clearInterval(id);
  }, [transitStage]);

  const launchFullEarthToMoonMission = (apolloPreset = false) => {
    if (apolloPreset) {
      handleSelectOrigin('ksc-lc39a');
      const apollo = LUNAR_SITE_PRESETS.find((p) => p.id === 'apollo-11');
      if (apollo) {
        selectCoordinate({
          lat: apollo.lat,
          lon: apollo.lon,
          label: apollo.label,
          region: apollo.region,
          source: apollo.source,
        });
      }
      setApolloMode(true);
    }
    setMode('autonomous');
    setRunning(false);
    setResetSignal((s) => s + 1);
    setTransitPct(2);
    setTransitStage('LAUNCH_TLI');
  };

  const startDirectDescent = () => {
    setTransitPct(100);
    setTransitStage('POWERED_DESCENT');
    setRunning(true);
  };

  const resetAll = () => {
    setRunning(false);
    setTransitPct(0);
    setTransitStage('STANDBY');
    setResetSignal((s) => s + 1);
  };

  const currentDistanceCoveredKm = Math.round((transitPct / 100) * transferMechanics.earthMoonDistanceKm);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
            End-to-End Safe Lunar Landing &amp; Threat Detection Simulator
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Simulate Earth Space Station / Spaceport departure to Apollo 11 or any custom lunar coordinate with NASA LOLA threat-avoidance landing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => launchFullEarthToMoonMission(true)}
            className={`px-3.5 py-2 text-xs font-medium rounded-md border inline-flex items-center gap-1.5 cursor-pointer ${
              apolloMode
                ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                : 'bg-[#0D121C] border-amber-700/70 hover:border-amber-400 text-amber-200'
            }`}
          >
            <Rocket className="w-3.5 h-3.5" />
            Run Safe Apollo 11 Mission (KSC → Tranquility Base)
          </button>

          <button
            type="button"
            onClick={() => launchFullEarthToMoonMission(false)}
            className="px-3.5 py-2 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-slate-950 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Rocket className="w-3.5 h-3.5" />
            Launch Origin → Target Mission
          </button>
        </div>
      </div>

      {/* Origin Station & Target Lunar Coordinate Matrix */}
      <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-5 space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              1. Origin Earth Space Station or Launch Facility
            </label>
            <select
              value={originId}
              onChange={(e) => handleSelectOrigin(e.target.value)}
              className="w-full bg-[#07090E] border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              <optgroup label="Earth Spaceports & Launch Complexes">
                {MISSION_ORIGIN_OPTIONS.filter((o) => o.category === 'Earth Spaceport').map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Low Earth Orbit Space Stations">
                {MISSION_ORIGIN_OPTIONS.filter((o) => o.category === 'Earth Space Station (LEO)').map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <div className="text-[11px] font-mono text-slate-400">
              Operator: {selectedOrigin.operator} · Parking Orbit: {selectedOrigin.parkingAltKm} km
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
            <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
              <div className="text-[10px] font-sans text-slate-400">TLI Δv (Derived)</div>
              <div className="text-sm font-semibold text-cyan-300">{transferMechanics.tliDeltaVKmS} km/s</div>
            </div>
            <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
              <div className="text-[10px] font-sans text-slate-400">Hohmann Transit</div>
              <div className="text-sm font-semibold text-slate-100">{transferMechanics.transferDurationHours} h</div>
            </div>
            <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
              <div className="text-[10px] font-sans text-slate-400">LOI Capture Δv</div>
              <div className="text-sm font-semibold text-slate-100">{transferMechanics.loiDeltaVKmS} km/s</div>
            </div>
            <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
              <div className="text-[10px] font-sans text-slate-400">Total Ref. Δv</div>
              <div className="text-sm font-semibold text-amber-300">{transferMechanics.totalReferenceDeltaVKmS} km/s</div>
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800">
          <div className="text-xs font-medium text-slate-300 mb-2">
            2. Destination Lunar Coordinate (Apollo 11, Presets, or Custom Lat/Lon)
          </div>
          <CoordinateSelectorBar compact />
        </div>

        {/* End-to-End Mission Phase Progress Pipeline */}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <span className="text-slate-300">
              Mission Corridor: <strong className="text-sky-300">{selectedOrigin.label.split(' (')[0]}</strong> →{' '}
              <strong className="text-cyan-300">{activeCoordinate.label}</strong> ({activeCoordinate.lat.toFixed(3)}°, {formatLon(activeCoordinate.lon)})
            </span>
            <span className="text-amber-300">
              Transit: {currentDistanceCoveredKm.toLocaleString()} / {transferMechanics.earthMoonDistanceKm.toLocaleString()} km ({transitPct}%)
            </span>
          </div>

          <div className="w-full h-2 bg-[#07090E] border border-slate-800 rounded overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-150"
              style={{ width: `${transitPct}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono">
            {[
              { key: 'LAUNCH_TLI', label: '1. Launch / TLI Burn', active: transitStage === 'LAUNCH_TLI', done: transitPct >= 28 },
              { key: 'TRANSLUNAR_COAST', label: '2. Trans-Lunar Coast', active: transitStage === 'TRANSLUNAR_COAST', done: transitPct >= 80 },
              { key: 'LOI_INSERTION', label: '3. LOI (100 km Orbit)', active: transitStage === 'LOI_INSERTION', done: transitPct >= 100 },
              {
                key: 'THREAT_SCAN',
                label: '4. LOLA Threat Divert',
                active: transitStage === 'POWERED_DESCENT' && telemetry.phase !== 'LANDED' && telemetry.phase !== 'ABORTED',
                done: telemetry.phase === 'LANDED',
              },
              {
                key: 'TOUCHDOWN',
                label: telemetry.phase === 'ABORTED' ? '5. Safety Abort' : '5. Safe Touchdown',
                active: telemetry.phase === 'LANDED' || telemetry.phase === 'ABORTED',
                done: telemetry.phase === 'LANDED',
              },
            ].map((step) => (
              <div
                key={step.key}
                className={`px-2.5 py-1.5 rounded border flex items-center justify-between gap-1 ${
                  step.done && !step.active
                    ? 'bg-emerald-950/30 border-emerald-800/70 text-emerald-300'
                    : step.active
                      ? 'bg-cyan-950/40 border-cyan-500 text-cyan-200 font-semibold'
                      : 'bg-[#07090E] border-slate-800 text-slate-500'
                }`}
              >
                <span className="truncate">{step.label}</span>
                {step.done && <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-amber-950/30 border border-amber-800/60 rounded-md px-4 py-2.5 text-xs text-amber-200">
        Simulation Boundary Notice: Isolated research kinematics simulator using real NASA LOLA LDEM_16 elevation/slope/crater maps and patched-conic two-body transfer estimates. Apollo 11 historical telemetry is shown separately as NASA reference data.
      </div>

      {threatScan && !threatScan.safestPad.safe && (
        <div className="bg-rose-950/50 border border-rose-700 rounded-md px-4 py-3 text-xs text-rose-200 flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
          <span>
            Critical Terrain Hazard: No verified safe landing pad (&lt;=16° slope) exists inside the LOLA approach corridor (minimum found {threatScan.safestPad.slopeDeg}°). Autonomous Threat Detection will command an abort.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-4">
          {terrain ? (
            <LandingSimViewport3D
              terrain={terrain}
              mode={mode}
              running={running}
              resetSignal={resetSignal}
              manualInput={manualInput}
              lightweightMode={settings.lightweightMode}
              solarElevationDeg={illuminationNow.solarElevationDeg}
              cameraCanvasRef={cameraCanvasRef}
              onTelemetry={setTelemetry}
            />
          ) : (
            <div className="h-[440px] bg-[#0D121C] border border-slate-800 rounded-lg flex items-center justify-center text-xs font-mono text-cyan-300">
              Loading NASA LOLA terrain mesh...
            </div>
          )}

          {/* Simulation Controls Bar */}
          <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-1 bg-[#07090E] p-1 rounded border border-slate-800">
              {(['manual', 'assisted', 'autonomous'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-xs rounded capitalize cursor-pointer ${
                    mode === m ? 'bg-cyan-600 text-slate-950 font-medium' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {m} Mode
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (transitStage !== 'POWERED_DESCENT') {
                    startDirectDescent();
                  } else {
                    setRunning((r) => !r);
                  }
                }}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium text-xs rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                {running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {running ? 'Pause Descent' : transitStage === 'POWERED_DESCENT' ? 'Resume Descent' : 'Start Terminal Descent'}
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="px-3 py-1.5 bg-[#07090E] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Mission
              </button>
            </div>
          </div>

          {mode !== 'autonomous' && (
            <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <label className="space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>Manual Thrust Trim</span>
                  <span className="font-mono">{manualInput.throttleDelta.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={manualInput.throttleDelta}
                  onChange={(e) => setManualInput((p) => ({ ...p, throttleDelta: Number(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
              </label>
              <label className="space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>East/West Pitch</span>
                  <span className="font-mono">{manualInput.pitchX.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.1}
                  value={manualInput.pitchX}
                  onChange={(e) => setManualInput((p) => ({ ...p, pitchX: Number(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
              </label>
              <label className="space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>North/South Roll</span>
                  <span className="font-mono">{manualInput.rollZ.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.1}
                  value={manualInput.rollZ}
                  onChange={(e) => setManualInput((p) => ({ ...p, rollZ: Number(e.target.value) }))}
                  className="w-full accent-cyan-500"
                />
              </label>
            </div>
          )}

          {/* LOLA Multi-Factor Threat Detection Report */}
          {threatScan && (
            <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-display font-semibold text-slate-100">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  LOLA Threat Detection &amp; Safe Pad Selection Report
                </div>
                <span
                  className={`px-2 py-0.5 text-[11px] font-mono rounded border ${
                    threatScan.overallThreatLevel === 'LOW'
                      ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300'
                      : threatScan.overallThreatLevel === 'MODERATE'
                        ? 'bg-amber-950/40 border-amber-700 text-amber-300'
                        : 'bg-rose-950/40 border-rose-700 text-rose-300'
                  }`}
                >
                  CORRIDOR RISK: {threatScan.overallThreatLevel}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                  <div className="text-[10px] font-sans text-slate-400">Steep Cells (&gt;=12°)</div>
                  <div className="text-sm font-semibold text-rose-300">{threatScan.steepSlopeCellCount}</div>
                </div>
                <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                  <div className="text-[10px] font-sans text-slate-400">Crater Hazards</div>
                  <div className="text-sm font-semibold text-amber-300">{threatScan.craterThreatCount}</div>
                </div>
                <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                  <div className="text-[10px] font-sans text-slate-400">Verified Safe Pad</div>
                  <div className="text-sm font-semibold text-emerald-300">{threatScan.safestPad.slopeDeg}° slope</div>
                </div>
                <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                  <div className="text-[10px] font-sans text-slate-400">Autopilot Divert</div>
                  <div className="text-sm font-semibold text-cyan-300">
                    {threatScan.safestPad.divertDistanceFromTargetM} m
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-[#07090E] border border-slate-800 rounded p-3 space-y-1">
                  <div className="font-medium text-slate-200">Detected Hazards Avoided</div>
                  <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-0.5">
                    {threatScan.threatsDetected.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[#07090E] border border-slate-800 rounded p-3 space-y-1 font-mono text-[11px] text-slate-300">
                  <div className="font-sans font-medium text-xs text-emerald-300">Locked Divert Pad Solution</div>
                  <div>Offset: {threatScan.safestPad.offsetNorthM} m N, {threatScan.safestPad.offsetEastM} m E</div>
                  <div>3×3 Neighbor Max Slope: {threatScan.safestPad.neighborMaxSlopeDeg}°</div>
                  <div>Nearest Crater Clearance: {threatScan.safestPad.craterClearanceKm >= 50 ? 'Outside detected crater rims' : `${threatScan.safestPad.craterClearanceKm} km`}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Telemetry + Simulated Onboard Camera Feed */}
        <div className="space-y-4">
          <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-display font-semibold text-slate-100">Simulated Descent Telemetry</span>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded border ${
                  telemetry.phase === 'LANDED'
                    ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300'
                    : telemetry.phase === 'ABORTED'
                      ? 'bg-rose-950/50 border-rose-700 text-rose-300'
                      : 'bg-[#07090E] border-slate-700 text-cyan-300'
                }`}
              >
                {telemetry.phase}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
              <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 font-sans text-[11px]">Altitude (AGL)</div>
                <div className="text-base font-semibold text-slate-100">{telemetry.altitudeM} m</div>
              </div>
              <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 font-sans text-[11px]">Vertical Vel</div>
                <div className="text-base font-semibold text-cyan-300">{telemetry.verticalVelMS} m/s</div>
              </div>
              <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 font-sans text-[11px]">Horiz Vel</div>
                <div className="text-base font-semibold text-slate-100">{telemetry.horizontalVelMS} m/s</div>
              </div>
              <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 font-sans text-[11px]">Net Accel / Thrust</div>
                <div className="text-base font-semibold text-amber-300">{telemetry.accelerationMS2} m/s² ({telemetry.throttlePct}%)</div>
              </div>
              <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 font-sans text-[11px]">Safe Pad Range</div>
                <div className="text-sm font-semibold text-slate-100">{telemetry.distanceFromTargetM} m</div>
              </div>
              <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 font-sans text-[11px]">Slope Below</div>
                <div className="text-sm font-semibold text-slate-100">{telemetry.localSlopeDeg}°</div>
              </div>
            </div>

            <div className="bg-[#07090E] border border-slate-800 rounded p-2.5 text-xs text-slate-300">
              {telemetry.hazardStatus}
            </div>
          </div>

          {/* Camera-Integrated Landing Interface */}
          <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                <Camera className="w-3.5 h-3.5 text-cyan-400" />
                Simulated Onboard Nadir Camera
              </div>
              <select
                value={sampleImageMode}
                onChange={(e) => setSampleImageMode(e.target.value as typeof sampleImageMode)}
                className="bg-[#07090E] border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200"
              >
                <option value="live-sim-nadir">Sim Nadir Optical</option>
                <option value="sample-crater-test">LOLA Hazard Compare</option>
              </select>
            </div>

            <div className="relative bg-[#07090E] border border-slate-800 rounded overflow-hidden h-40 flex items-center justify-center">
              {sampleImageMode === 'live-sim-nadir' ? (
                <canvas ref={cameraCanvasRef} width={280} height={180} className="w-full h-full object-cover" />
              ) : (
                <div className="p-3 text-[11px] font-mono text-slate-300 space-y-1">
                  <div className="text-cyan-300">Optical-to-DEM Hazard Comparison</div>
                  <div>Target: {activeCoordinate.label}</div>
                  <div>Detected LOLA Craters: {terrain?.detectedCraters.length ?? 0}</div>
                  <div>Max Local Slope: {terrain?.slopeStats.maxDeg ?? '—'}°</div>
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 border border-cyan-400/70 rounded-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400">
              Simulated vision overlay only (no live spacecraft telemetry link).
            </div>
          </div>

          {apolloMode && (
            <div className="bg-[#0D121C] border border-amber-800/60 rounded-lg p-4 space-y-2">
              <div className="text-xs font-display font-semibold text-amber-300">
                Apollo 11 Historical NASA Timeline (Reference)
              </div>
              <div className="space-y-2 text-[11px]">
                {APOLLO_11_TIMELINE.map((ev) => (
                  <div key={ev.met} className="bg-[#07090E] border border-slate-800 rounded p-2">
                    <div className="font-mono text-amber-200">MET {ev.met} · {ev.phase}</div>
                    <div className="text-slate-400 mt-0.5">{ev.note}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <ProvenanceBar
        sourceName="Simulated Earth-to-Moon Transfer + 3-DOF Threat-Avoidance Descent over NASA LOLA LDEM_16"
        datasetId="SIMULATED-AUTOPILOT + LRO-L-LOLA-4-GDR-V1.0"
        classification="Simulated Environment"
        resolution="1,895 m/px underlying DEM"
        sourceUrl="https://www.lroc.asu.edu/featured_sites/view_site/1"
      />
    </div>
  );
}
