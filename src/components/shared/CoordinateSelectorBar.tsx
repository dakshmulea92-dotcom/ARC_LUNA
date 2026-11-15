import React, { useEffect, useState } from 'react';
import { BookmarkPlus, Download, MapPin, Upload } from 'lucide-react';
import { useMission } from '../../context/MissionContext';
import { LUNAR_SITE_PRESETS } from '../../lib/nasaCatalog';

export function CoordinateSelectorBar({ compact = false }: { compact?: boolean }) {
  const {
    activeCoordinate,
    selectCoordinate,
    analysisRadiusKm,
    setAnalysisRadiusKm,
    savedCoordinates,
    addSavedCoordinate,
    pushNotification,
    formatLon,
  } = useMission();

  const [latInput, setLatInput] = useState(String(activeCoordinate.lat));
  const [lonInput, setLonInput] = useState(String(activeCoordinate.lon));
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setLatInput(String(activeCoordinate.lat));
    setLonInput(String(activeCoordinate.lon));
  }, [activeCoordinate.lat, activeCoordinate.lon]);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(latInput);
    const lon = Number(lonInput);
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -360 || lon > 360) {
      setValidationError('Enter valid selenographic coordinates: Lat [-90, 90], Lon [-360, 360].');
      return;
    }
    setValidationError(null);
    selectCoordinate({
      lat,
      lon,
      label: `Custom (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
      region: Math.abs(lat) > 80 ? (lat < 0 ? 'Lunar South Pole' : 'Lunar North Pole') : 'Custom Lunar Target',
      source: 'Manual Coordinate Entry (Mean Earth / Polar Axis DE421)',
    });
  };

  const handlePresetChange = (value: string) => {
    const preset = LUNAR_SITE_PRESETS.find((p) => p.id === value);
    if (preset) {
      selectCoordinate({
        lat: preset.lat,
        lon: preset.lon,
        label: preset.label,
        region: preset.region,
        source: preset.source,
      });
      return;
    }
    const saved = savedCoordinates.find((s) => s.id === value);
    if (saved) {
      selectCoordinate({
        lat: saved.lat,
        lon: saved.lon,
        label: saved.name,
        region: saved.category,
        source: 'Saved User Coordinate',
      });
    }
  };

  const handleSaveCurrent = async () => {
    await addSavedCoordinate({
      name: activeCoordinate.label,
      lat: activeCoordinate.lat,
      lon: activeCoordinate.lon,
      category: 'Custom',
      notes: activeCoordinate.region ?? 'Saved from universal coordinate selector',
    });
  };

  const handleExportJson = () => {
    const payload = {
      coordinateReferenceSystem: 'MOON_MEAN_EARTH_POLAR_AXIS_DE421',
      ...activeCoordinate,
      analysisRadiusKm,
      exportedAtUtc: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lunar-coord-${activeCoordinate.lat.toFixed(2)}-${activeCoordinate.lon.toFixed(2)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushNotification('Exported coordinate JSON', 'success');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { lat?: number; lon?: number; label?: string; region?: string };
        if (typeof parsed.lat !== 'number' || typeof parsed.lon !== 'number' || parsed.lat < -90 || parsed.lat > 90) {
          throw new Error('Invalid lat/lon in JSON');
        }
        selectCoordinate({
          lat: parsed.lat,
          lon: parsed.lon,
          label: parsed.label ?? 'Imported Coordinate',
          region: parsed.region ?? 'Imported Target',
          source: 'Imported Coordinate File',
        });
        pushNotification(`Imported coordinate: ${parsed.label ?? `${parsed.lat}, ${parsed.lon}`}`, 'success');
      } catch {
        pushNotification('Could not parse coordinate JSON (requires numeric lat & lon)', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="bg-[#0D121C] border border-slate-800 rounded-lg px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-100 truncate">{activeCoordinate.label}</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
              <span>{activeCoordinate.lat.toFixed(4)}°</span>
              <span aria-hidden="true">·</span>
              <span>{formatLon(activeCoordinate.lon)}</span>
              {activeCoordinate.region && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans">{activeCoordinate.region}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleApply} className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select lunar preset or saved coordinate"
            onChange={(e) => handlePresetChange(e.target.value)}
            value=""
            className="bg-[#07090E] border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="" disabled>
              Jump to NASA Site / Preset...
            </option>
            <optgroup label="NASA Presets & Historical Sites">
              {LUNAR_SITE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.lat.toFixed(1)}°, {p.lon.toFixed(1)}°)
                </option>
              ))}
            </optgroup>
            {savedCoordinates.length > 0 && (
              <optgroup label="Saved Coordinates">
                {savedCoordinates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.lat.toFixed(1)}°, {s.lon.toFixed(1)}°)
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Lat</span>
            <input
              type="number"
              step="0.01"
              min={-90}
              max={90}
              value={latInput}
              onChange={(e) => setLatInput(e.target.value)}
              className="w-20 bg-[#07090E] border border-slate-700 rounded-md px-2 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Lon</span>
            <input
              type="number"
              step="0.01"
              min={-360}
              max={360}
              value={lonInput}
              onChange={(e) => setLonInput(e.target.value)}
              className="w-20 bg-[#07090E] border border-slate-700 rounded-md px-2 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
            />
          </label>

          {!compact && (
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>Radius</span>
              <select
                value={analysisRadiusKm}
                onChange={(e) => setAnalysisRadiusKm(Number(e.target.value))}
                className="bg-[#07090E] border border-slate-700 rounded-md px-2 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value={15}>15 km</option>
                <option value={30}>30 km</option>
                <option value={60}>60 km</option>
                <option value={100}>100 km</option>
              </select>
            </label>
          )}

          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Set Target
          </button>

          <button
            type="button"
            onClick={handleSaveCurrent}
            title="Save coordinate"
            className="p-1.5 border border-slate-700 hover:border-slate-500 text-slate-300 rounded-md transition-colors cursor-pointer"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            title="Export coordinate JSON"
            className="p-1.5 border border-slate-700 hover:border-slate-500 text-slate-300 rounded-md transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <label
            title="Import coordinate JSON"
            className="p-1.5 border border-slate-700 hover:border-slate-500 text-slate-300 rounded-md transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <input type="file" accept=".json,application/json" onChange={handleImportJson} className="hidden" />
          </label>
        </form>
      </div>
      {validationError && <p className="text-xs text-rose-400 mt-2">{validationError}</p>}
    </div>
  );
}
