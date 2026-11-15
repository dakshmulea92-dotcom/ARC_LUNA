import React, { useEffect, useRef, useState } from 'react';
import type { TerrainAnalysisResult } from '../../types/lunar';

export type HeatmapLayerMode = 'elevation' | 'slope' | 'roughness';

function viridisColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  // Calibrated scientific hypsometric/thermal ramp: deep slate-navy -> cyan -> emerald -> amber -> white-gold
  const stops: Array<[number, number, number]> = [
    [15, 23, 42],
    [14, 116, 144],
    [16, 185, 129],
    [245, 158, 11],
    [254, 243, 199],
  ];
  const scaled = x * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - idx;
  const a = stops[idx];
  const b = stops[idx + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

function slopeColor(deg: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, deg / 25));
  const stops: Array<[number, number, number]> = [
    [16, 185, 129], // 0 deg safe green
    [6, 182, 212],  // ~6 deg nominal cyan
    [245, 158, 11], // ~12.5 deg caution amber
    [239, 68, 68],  // ~18.75 deg steep red
    [153, 27, 27],  // >=25 deg critical
  ];
  const scaled = t * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - idx;
  const a = stops[idx];
  const b = stops[idx + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export function LolaHeatmapCanvas({
  terrain,
  mode,
  heightPx = 320,
}: {
  terrain: TerrainAnalysisResult;
  mode: HeatmapLayerMode;
  heightPx?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    row: number;
    col: number;
    elevM: number;
    slopeDeg: number;
    offsetNorthKm: number;
    offsetEastKm: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const n = terrain.gridSize;
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = ctx.createImageData(n, n);
    const minE = terrain.elevationStats.minM;
    const rangeE = Math.max(1, terrain.elevationStats.maxM - minE);

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        let rgb: [number, number, number];
        if (mode === 'slope') {
          rgb = slopeColor(terrain.slopeGrid[r][c]);
        } else if (mode === 'roughness') {
          const z = terrain.elevationGrid[r][c];
          const r0 = Math.max(0, r - 1);
          const r1 = Math.min(n - 1, r + 1);
          const c0 = Math.max(0, c - 1);
          const c1 = Math.min(n - 1, c + 1);
          const localDiff =
            Math.abs(z - (terrain.elevationGrid[r0][c] + terrain.elevationGrid[r1][c] + terrain.elevationGrid[r][c0] + terrain.elevationGrid[r][c1]) / 4);
          rgb = viridisColor(Math.min(1, localDiff / Math.max(50, terrain.roughness.triMeters * 1.8)));
        } else {
          rgb = viridisColor((terrain.elevationGrid[r][c] - minE) / rangeE);
        }
        const idx = (r * n + c) * 4;
        img.data[idx] = rgb[0];
        img.data[idx + 1] = rgb[1];
        img.data[idx + 2] = rgb[2];
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [terrain, mode]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const n = terrain.gridSize;
    const col = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - rect.left) / rect.width) * n)));
    const row = Math.max(0, Math.min(n - 1, Math.floor(((e.clientY - rect.top) / rect.height) * n)));
    const half = Math.floor(n / 2);
    setHoverInfo({
      row,
      col,
      elevM: terrain.elevationGrid[row][col],
      slopeDeg: terrain.slopeGrid[row][col],
      offsetNorthKm: Number(((half - row) * terrain.cellSpacingKm).toFixed(1)),
      offsetEastKm: Number(((col - half) * terrain.cellSpacingKm).toFixed(1)),
    });
  };

  const minLabel =
    mode === 'slope'
      ? '0.0°'
      : mode === 'roughness'
        ? '0 m'
        : `${terrain.elevationStats.minM.toFixed(0)} m`;
  const maxLabel =
    mode === 'slope'
      ? '≥25.0°'
      : mode === 'roughness'
        ? `${(terrain.roughness.triMeters * 1.8).toFixed(0)} m`
        : `${terrain.elevationStats.maxM.toFixed(0)} m`;

  return (
    <div className="space-y-2">
      <div className="relative bg-[#07090E] border border-slate-800 rounded-md overflow-hidden" style={{ height: heightPx }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverInfo(null)}
          className="w-full h-full cursor-crosshair"
          style={{ imageRendering: 'auto' }}
        />

        {/* Target center reticle */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 border border-white/70 rounded-full flex items-center justify-center">
            <div className="w-1 h-1 bg-cyan-400 rounded-full" />
          </div>
        </div>

        {/* Scale bar */}
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 bg-[#07090E]/90 border border-slate-700 px-2 py-1 rounded text-[11px] font-mono text-slate-200">
          Span: {(terrain.radiusKm * 2).toFixed(0)} × {(terrain.radiusKm * 2).toFixed(0)} km · {terrain.cellSpacingKm.toFixed(2)} km/cell
        </div>

        {/* Live hover readout */}
        {hoverInfo && (
          <div className="pointer-events-none absolute top-2.5 left-2.5 bg-[#07090E]/90 border border-slate-700 px-2.5 py-1.5 rounded text-[11px] font-mono text-slate-100 space-y-0.5">
            <div>
              ΔN {hoverInfo.offsetNorthKm >= 0 ? '+' : ''}{hoverInfo.offsetNorthKm} km · ΔE {hoverInfo.offsetEastKm >= 0 ? '+' : ''}{hoverInfo.offsetEastKm} km
            </div>
            <div className="text-cyan-300">
              Elev: {hoverInfo.elevM.toFixed(1)} m · Slope: {hoverInfo.slopeDeg.toFixed(2)}°
            </div>
          </div>
        )}
      </div>

      {/* Scientific Legend */}
      <div className="flex items-center justify-between gap-3 text-[11px] font-mono text-slate-400">
        <span>{minLabel}</span>
        <div
          className="flex-1 h-2 rounded-sm border border-slate-800"
          style={{
            background:
              mode === 'slope'
                ? 'linear-gradient(90deg, rgb(16,185,129), rgb(6,182,212), rgb(245,158,11), rgb(239,68,68), rgb(153,27,27))'
                : 'linear-gradient(90deg, rgb(15,23,42), rgb(14,116,144), rgb(16,185,129), rgb(245,158,11), rgb(254,243,199))',
          }}
        />
        <span>{maxLabel}</span>
        <span className="text-slate-500">
          {mode === 'slope' ? 'deg (Horn 3×3)' : mode === 'roughness' ? 'm residual' : 'm vs 1737.4 km'}
        </span>
      </div>
    </div>
  );
}
