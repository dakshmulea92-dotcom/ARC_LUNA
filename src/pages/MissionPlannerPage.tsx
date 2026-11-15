import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Download, FileText, Plus, Trash2 } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import { CoordinateSelectorBar } from '../components/shared/CoordinateSelectorBar';
import { ProvenanceBar } from '../components/shared/ProvenanceBar';
import { GLOBAL_LAUNCH_FACILITIES } from '../lib/nasaCatalog';
import { computeEducationalMissionMechanics } from '../lib/orbitalMechanics';
import type { SavedMission } from '../types/lunar';

export function MissionPlannerPage() {
  const {
    activeCoordinate,
    terrain,
    illuminationNow,
    illuminationTimeline,
    suitability,
    selectedFacility,
    setSelectedFacilityId,
    missions,
    createMission,
    removeMission,
    pushNotification,
  } = useMission();

  const [name, setName] = useState('Polar Volatile Reconnaissance Mission');
  const [missionType, setMissionType] = useState<SavedMission['missionType']>('Robotic Lander');
  const [landingDateUtc, setLandingDateUtc] = useState(() => new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 16));
  const [durationDays, setDurationDays] = useState(14);
  const [spacecraftConfig, setSpacecraftConfig] = useState('CLPS-Class Reference Lander (Unspecified Dry Mass)');
  const [roverDeployment, setRoverDeployment] = useState(true);
  const [minSolarElevationDeg, setMinSolarElevationDeg] = useState(2);
  const [objectives, setObjectives] = useState(
    'Validate LOLA-derived landing ellipse slopes, assess solar window persistence, and conduct surface traverse.',
  );

  const mechanics = useMemo(() => {
    return computeEducationalMissionMechanics({
      earthMoonDistanceKm: illuminationNow.earthMoonDistanceKm,
      launchLatDeg: selectedFacility.lat,
    });
  }, [illuminationNow.earthMoonDistanceKm, selectedFacility.lat]);

  const handleSaveMission = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMission({
      name,
      missionType,
      launchFacilityId: selectedFacility.id,
      launchFacilityName: selectedFacility.name,
      targetSiteName: activeCoordinate.label,
      targetLat: activeCoordinate.lat,
      targetLon: activeCoordinate.lon,
      landingDateUtc: new Date(landingDateUtc + ':00Z').toISOString(),
      durationDays,
      spacecraftConfig,
      roverDeployment,
      minSolarElevationDeg,
      objectives,
    });
  };

  const buildReportObject = () => ({
    reportTitle: 'ARC LUNA — LUNASIGHT Mission Intelligence Report',
    generatedAtUtc: new Date().toISOString(),
    missionPlan: {
      name,
      missionType,
      launchFacility: selectedFacility,
      targetCoordinate: activeCoordinate,
      landingDateUtc,
      durationDays,
      spacecraftConfig,
      roverDeployment,
      minSolarElevationDeg,
      objectives,
    },
    orbitalMechanicsEducational: mechanics,
    terrainReport: terrain
      ? {
          datasetId: terrain.provenance.datasetId,
          productId: terrain.provenance.productId,
          centerElevationM: terrain.centerElevationM,
          elevationStats: terrain.elevationStats,
          slopeStats: terrain.slopeStats,
          roughness: terrain.roughness,
          horizonAnalysis: {
            meanHorizonDeg: terrain.horizonAnalysis.meanHorizonDeg,
            maxHorizonDeg: terrain.horizonAnalysis.maxHorizonDeg,
            skyViewFactor: terrain.horizonAnalysis.skyViewFactor,
          },
        }
      : 'NASA DATA UNAVAILABLE',
    illuminationReport: {
      current: illuminationNow,
      window30DaySunlitPct: illuminationTimeline.illuminationPct,
      peakSunlightUtc: illuminationTimeline.peakSunlightUtc,
    },
    suitabilityAssessment: suitability,
    identifiedUncertainties: [
      'Sub-meter boulder hazard density is NASA DATA UNAVAILABLE in global LOLA LDEM_16 (1,895 m/px).',
      'Orbital mechanics values are two-body patched-conic educational estimates; operational flight design requires full N-body SPICE ephemeris.',
      'Spacecraft hardware mass/Isp specifications are not fabricated.',
    ],
  });

  const exportJson = () => {
    const report = buildReportObject();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arc-luna-mission-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushNotification('Exported Mission Report JSON', 'success');
  };

  const exportPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let y = 44;
    const addLine = (text: string, size = 10, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const wrapped = doc.splitTextToSize(text, 510) as string[];
      for (const line of wrapped) {
        if (y > 780) {
          doc.addPage();
          y = 44;
        }
        doc.text(line, 42, y);
        y += size + 4;
      }
    };

    addLine('ARC LUNA — LUNASIGHT | SCIENTIFIC MISSION REPORT', 14, true);
    addLine(`Generated: ${new Date().toISOString()}`, 9);
    y += 8;

    addLine('1. MISSION PARAMETERS', 11, true);
    addLine(`Mission Name: ${name} (${missionType})`);
    addLine(`Launch Facility: ${selectedFacility.name} (${selectedFacility.lat.toFixed(3)}°, ${selectedFacility.lon.toFixed(3)}°)`);
    addLine(`Target Lunar Coordinate: ${activeCoordinate.label} (${activeCoordinate.lat.toFixed(4)}°, ${activeCoordinate.lon.toFixed(4)}°)`);
    addLine(`Landing Window: ${landingDateUtc} UTC · Duration: ${durationDays} days · Rover: ${roverDeployment ? 'Yes' : 'No'}`);
    addLine(`Spacecraft Reference: ${spacecraftConfig}`);
    y += 8;

    addLine('2. NASA LOLA TERRAIN & SUITABILITY REPORT', 11, true);
    if (terrain && suitability) {
      addLine(`Source: ${terrain.provenance.sourceName} (${terrain.provenance.datasetId} ${terrain.provenance.productId})`);
      addLine(`Center Elevation: ${terrain.centerElevationM} m (ref 1,737.4 km) | Relief: ${terrain.elevationStats.reliefM} m`);
      addLine(`Slope (Horn 3x3): Mean ${terrain.slopeStats.meanDeg}° | P95 ${terrain.slopeStats.p95Deg}° | Max ${terrain.slopeStats.maxDeg}° (${terrain.slopeStats.suitabilityClass})`);
      addLine(`Horizon Obstruction: Mean ${terrain.horizonAnalysis.meanHorizonDeg}° | Max ${terrain.horizonAnalysis.maxHorizonDeg}° | SVF ${terrain.horizonAnalysis.skyViewFactor}`);
      addLine(`Suitability Score: ${suitability.overallScore}/100 — ${suitability.verdict}`);
    } else {
      addLine('Terrain telemetry: NASA DATA UNAVAILABLE');
    }
    y += 8;

    addLine('3. ILLUMINATION & ENVIRONMENTAL REPORT (JPL EPHEMERIS)', 11, true);
    addLine(`Solar Elevation: ${illuminationNow.solarElevationDeg}° | Azimuth: ${illuminationNow.solarAzimuthDeg}° | Radiative Temp: ${illuminationNow.derivedSurfaceTempK} K`);
    addLine(`30-Day Sunlit Availability: ${illuminationTimeline.illuminationPct}% | Peak: ${illuminationTimeline.peakSunlightUtc ?? 'N/A'}`);
    y += 8;

    addLine('4. EDUCATIONAL ASTRODYNAMICS CALCULATIONS', 11, true);
    addLine(`Earth-Moon Distance: ${mechanics.earthMoonDistanceKm} km | Transfer Duration Est: ${mechanics.transferDurationHours} hours`);
    addLine(`TLI dV: ${mechanics.tliDeltaVKmS} km/s | LOI dV: ${mechanics.loiDeltaVKmS} km/s | Descent Ref dV: ${mechanics.deorbitAndDescentDeltaVKmS} km/s`);
    y += 8;

    addLine('5. ASSUMPTIONS & UNCERTAINTIES', 11, true);
    addLine('- Sub-meter rock/boulder distribution is NASA DATA UNAVAILABLE in global LOLA LDEM_16 (1,895 m/px).');
    addLine('- Orbital delta-V estimates use two-body coplanar patched-conic assumptions for educational planning.');

    doc.save(`arc-luna-report-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
    pushNotification('Exported Mission Report PDF', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
            Mission Planner &amp; Scientific Reporting
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure lunar mission profiles, inspect documented astrodynamics formulas, and export traceable PDF &amp; JSON reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportJson}
            className="px-3 py-1.5 text-xs bg-[#0D121C] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="px-3 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            Export PDF Report
          </button>
        </div>
      </div>

      <CoordinateSelectorBar />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Mission Form */}
        <form onSubmit={handleSaveMission} className="xl:col-span-2 bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-4">
          <h2 className="text-base font-display font-semibold text-slate-100">
            Configure Custom Mission Profile
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <label className="space-y-1">
              <span className="text-slate-400">Mission Name</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#07090E] border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </label>

            <label className="space-y-1">
              <span className="text-slate-400">Mission Architecture</span>
              <select
                value={missionType}
                onChange={(e) => setMissionType(e.target.value as SavedMission['missionType'])}
                className="w-full bg-[#07090E] border border-slate-700 rounded px-3 py-2 text-slate-100"
              >
                <option value="Crewed Lander">Crewed Lander</option>
                <option value="Robotic Lander">Robotic Lander</option>
                <option value="Polar Rover">Polar Rover</option>
                <option value="Sample Return">Sample Return</option>
                <option value="Orbital + Descent">Orbital + Descent</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-slate-400">Launch Facility</span>
              <select
                value={selectedFacility.id}
                onChange={(e) => setSelectedFacilityId(e.target.value)}
                className="w-full bg-[#07090E] border border-slate-700 rounded px-3 py-2 text-slate-100"
              >
                {GLOBAL_LAUNCH_FACILITIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-slate-400">Target Landing Date (UTC)</span>
              <input
                type="datetime-local"
                value={landingDateUtc}
                onChange={(e) => setLandingDateUtc(e.target.value)}
                className="w-full bg-[#07090E] border border-slate-700 rounded px-3 py-2 font-mono text-slate-100"
              />
            </label>

            <label className="space-y-1">
              <span className="text-slate-400">Planned Duration (Earth Days)</span>
              <input
                type="number"
                min={1}
                max={365}
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full bg-[#07090E] border border-slate-700 rounded px-3 py-2 font-mono text-slate-100"
              />
            </label>

            <label className="space-y-1">
              <span className="text-slate-400">Minimum Solar Elevation Requirement (deg)</span>
              <input
                type="number"
                min={0}
                max={45}
                step={0.5}
                value={minSolarElevationDeg}
                onChange={(e) => setMinSolarElevationDeg(Number(e.target.value))}
                className="w-full bg-[#07090E] border border-slate-700 rounded px-3 py-2 font-mono text-slate-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <label className="space-y-1">
              <span className="text-slate-400">Spacecraft Reference Configuration</span>
              <input
                type="text"
                value={spacecraftConfig}
                onChange={(e) => setSpacecraftConfig(e.target.value)}
                className="w-full bg-[#07090E] border border-slate-700 rounded px-3 py-2 text-slate-100"
              />
            </label>

            <label className="flex items-center gap-2 pt-5 text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={roverDeployment}
                onChange={(e) => setRoverDeployment(e.target.checked)}
                className="accent-cyan-500"
              />
              Include Surface Rover Traverse Deployment
            </label>
          </div>

          <label className="block text-xs space-y-1">
            <span className="text-slate-400">Scientific Objectives</span>
            <textarea
              rows={2}
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              className="w-full bg-[#07090E] border border-slate-700 rounded px-3 py-2 text-slate-100"
            />
          </label>

          <button
            type="submit"
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium text-xs rounded-md inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Save Mission Profile
          </button>
        </form>

        {/* Saved Missions List */}
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <h2 className="text-base font-display font-semibold text-slate-100">
            Saved Mission Registry
          </h2>
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {missions.map((m) => (
              <div key={m.id} className="bg-[#07090E] border border-slate-800 rounded-md p-3 text-xs space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-100">{m.name}</span>
                  <button
                    type="button"
                    onClick={() => void removeMission(m.id)}
                    className="text-slate-500 hover:text-rose-400 cursor-pointer"
                    title="Delete mission"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-cyan-300 font-mono text-[11px]">
                  {m.targetSiteName} ({m.targetLat.toFixed(2)}°, {m.targetLon.toFixed(2)}°)
                </div>
                <div className="text-slate-400 text-[11px]">
                  {m.missionType} · {m.launchFacilityName} · {m.durationDays}d
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Educational Astrodynamics & Documented Formulas */}
      <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-display font-semibold text-slate-100">
            Astrodynamics &amp; Trajectory Quantities (Educational Two-Body Model)
          </h2>
          <span className="text-xs font-mono text-slate-400">
            Instantaneous Earth–Moon Distance: {mechanics.earthMoonDistanceKm.toLocaleString()} km
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-mono">
          <div className="bg-[#07090E] border border-slate-800 rounded p-3">
            <div className="text-slate-400 font-sans">LEO Velocity (200 km)</div>
            <div className="text-lg font-semibold text-slate-100 mt-1">{mechanics.leoCircularVelKmS} km/s</div>
          </div>
          <div className="bg-[#07090E] border border-slate-800 rounded p-3">
            <div className="text-slate-400 font-sans">Est. TLI Δv</div>
            <div className="text-lg font-semibold text-cyan-300 mt-1">{mechanics.tliDeltaVKmS} km/s</div>
          </div>
          <div className="bg-[#07090E] border border-slate-800 rounded p-3">
            <div className="text-slate-400 font-sans">Hohmann Transit</div>
            <div className="text-lg font-semibold text-slate-100 mt-1">{mechanics.transferDurationHours} h</div>
          </div>
          <div className="bg-[#07090E] border border-slate-800 rounded p-3">
            <div className="text-slate-400 font-sans">Est. LOI Δv (100 km)</div>
            <div className="text-lg font-semibold text-cyan-300 mt-1">{mechanics.loiDeltaVKmS} km/s</div>
          </div>
          <div className="bg-[#07090E] border border-slate-800 rounded p-3">
            <div className="text-slate-400 font-sans">Total Ref Δv Budget</div>
            <div className="text-lg font-semibold text-amber-300 mt-1">{mechanics.totalReferenceDeltaVKmS} km/s</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {mechanics.formulas.map((f) => (
            <div key={f.name} className="bg-[#07090E] border border-slate-800 rounded p-3 space-y-1">
              <div className="font-medium text-slate-200">{f.name}</div>
              <div className="font-mono text-cyan-300">{f.equation}</div>
              <div className="text-slate-400">{f.assumption}</div>
            </div>
          ))}
        </div>

        <ProvenanceBar
          sourceName="JPL/IAU Earth–Moon Distance + NASA LOLA Terrain + Standard Two-Body Astrodynamics"
          datasetId="ARC-LUNA-PLANNER-V1"
          classification="Derived Scientific Calculation"
          units="km, km/s, hours, m/s²"
        />
      </div>
    </div>
  );
}
