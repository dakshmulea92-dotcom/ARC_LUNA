import React from 'react';
import { Trash2 } from 'lucide-react';
import { useMission } from '../context/MissionContext';

export function SettingsPage() {
  const { settings, updateSettings, savedCoordinates, removeSavedCoordinate, selectCoordinate, pushNotification } =
    useMission();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
          System Settings &amp; Optimization
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure lightweight rendering for standard laptops/desktops, coordinate notation, and saved lunar targets.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-4">
          <h2 className="text-base font-display font-semibold text-slate-100">
            Performance &amp; Display Preferences
          </h2>

          <label className="flex items-start gap-3 p-3 bg-[#07090E] border border-slate-800 rounded-md cursor-pointer">
            <input
              type="checkbox"
              checked={settings.lightweightMode}
              onChange={(e) => {
                updateSettings({ lightweightMode: e.target.checked });
                pushNotification(
                  e.target.checked ? 'Lightweight Mode enabled (1x DPR, reduced grid density)' : 'Standard High-Detail 3D enabled',
                  'info',
                );
              }}
              className="mt-1 accent-cyan-500"
            />
            <div className="text-xs">
              <div className="font-medium text-slate-100">Lightweight Performance Mode</div>
              <div className="text-slate-400 mt-0.5">
                Caps WebGL pixel ratio at 1.0, disables shadow maps, reduces starfield count, and uses 25×25 LOLA DEM sampling for low-power GPUs and ordinary Windows PCs.
              </div>
            </div>
          </label>

          <label className="block text-xs space-y-1.5">
            <span className="text-slate-300 font-medium">Selenographic Longitude Convention</span>
            <select
              value={settings.lonFormat}
              onChange={(e) => updateSettings({ lonFormat: e.target.value as 'signed180' | 'east360' })}
              className="w-full bg-[#07090E] border border-slate-700 rounded px-3 py-2 text-slate-100"
            >
              <option value="signed180">Signed (-180° W to +180° E)</option>
              <option value="east360">IAU East Positive (0° to 360° E)</option>
            </select>
          </label>
        </div>

        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <h2 className="text-base font-display font-semibold text-slate-100">
            Saved Lunar Coordinates ({savedCoordinates.length})
          </h2>
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {savedCoordinates.map((c) => (
              <div key={c.id} className="bg-[#07090E] border border-slate-800 rounded p-3 text-xs flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() =>
                    selectCoordinate({
                      lat: c.lat,
                      lon: c.lon,
                      label: c.name,
                      region: c.category,
                      source: 'Saved Coordinate',
                    })
                  }
                  className="text-left min-w-0 flex-1 cursor-pointer"
                >
                  <div className="font-medium text-slate-100 truncate hover:text-cyan-300">{c.name}</div>
                  <div className="font-mono text-slate-400 text-[11px]">
                    {c.lat.toFixed(4)}°, {c.lon.toFixed(4)}° · {c.category}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void removeSavedCoordinate(c.id)}
                  className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                  title="Remove coordinate"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
