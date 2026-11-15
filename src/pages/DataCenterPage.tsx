import React, { useEffect, useState } from 'react';
import { Database, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { useMission } from '../context/MissionContext';

interface InventoryResponse {
  lola: {
    datasetId: string;
    productId: string;
    sourceName: string;
    resolutionDeg: number;
    resolutionMetersAtEquator: number;
    lines: number;
    samples: number;
    observationPeriod: string;
    coordinateSystem: string;
    sourceUrl: string;
    fileSizeBytes: number;
    available: boolean;
    methodology: string;
    cache: {
      cachedRows: number;
      cachedPatches: number;
      cacheHits: number;
      cacheMisses: number;
    };
  };
  models: Array<{
    id: string;
    file: string;
    name: string;
    source: string;
    url: string;
    resolution: string;
    localPath: string;
    available: boolean;
    sizeBytes: number;
  }>;
  externalApis: Array<{
    id: string;
    name: string;
    source: string;
    resolution: string;
    crs: string;
    date: string;
    url: string;
    status: string;
    cachedEntries: number;
  }>;
}

export function DataCenterPage() {
  const { pushNotification } = useMission();
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const loadInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/data-center/inventory');
      if (res.ok) {
        setInventory((await res.json()) as InventoryResponse);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInventory();
  }, []);

  const clearCache = async () => {
    const res = await fetch('/api/data-center/clear-cache', { method: 'POST' });
    if (res.ok) {
      const data = (await res.json()) as { inventory: InventoryResponse };
      setInventory(data.inventory);
      pushNotification('Cleared LOLA row & patch tile cache', 'info');
    }
  };

  const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
            Data &amp; Research Center
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Provenance registry, file caching status, coordinate reference systems, and processing methodology for every active NASA dataset.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadInventory()}
            className="px-3 py-1.5 text-xs bg-[#0D121C] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
          <button
            type="button"
            onClick={() => void clearCache()}
            className="px-3 py-1.5 text-xs bg-[#0D121C] hover:bg-slate-800 border border-slate-700 text-amber-300 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear DEM Cache
          </button>
        </div>
      </div>

      {inventory && (
        <>
          {/* Primary Installed NASA LOLA DEM */}
          <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <h2 className="text-base font-display font-semibold text-slate-100">
                  {inventory.lola.sourceName} — {inventory.lola.productId}
                </h2>
              </div>
              <span className={`text-xs font-mono ${inventory.lola.available ? 'text-emerald-400' : 'text-rose-400'}`}>
                {inventory.lola.available ? 'Installed & Indexed' : 'NASA DATA UNAVAILABLE'}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              <div className="bg-[#07090E] border border-slate-800 rounded p-3">
                <div className="text-slate-400 font-sans">Dataset ID</div>
                <div className="text-slate-100 mt-1">{inventory.lola.datasetId}</div>
              </div>
              <div className="bg-[#07090E] border border-slate-800 rounded p-3">
                <div className="text-slate-400 font-sans">Resolution / Grid</div>
                <div className="text-cyan-300 mt-1">
                  {inventory.lola.resolutionMetersAtEquator} m/px ({inventory.lola.samples}×{inventory.lola.lines})
                </div>
              </div>
              <div className="bg-[#07090E] border border-slate-800 rounded p-3">
                <div className="text-slate-400 font-sans">Binary Size</div>
                <div className="text-slate-100 mt-1">{formatMb(inventory.lola.fileSizeBytes)}</div>
              </div>
              <div className="bg-[#07090E] border border-slate-800 rounded p-3">
                <div className="text-slate-400 font-sans">Row / Patch Cache</div>
                <div className="text-slate-100 mt-1">
                  {inventory.lola.cache.cachedRows} rows · {inventory.lola.cache.cacheHits} hits
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-300 space-y-1">
              <div><span className="text-slate-400">CRS:</span> {inventory.lola.coordinateSystem}</div>
              <div><span className="text-slate-400">Observation Period:</span> {inventory.lola.observationPeriod}</div>
              <div><span className="text-slate-400">Processing Methodology:</span> {inventory.lola.methodology}</div>
            </div>
          </div>

          {/* Official NASA 3D GLB Models */}
          <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-base font-display font-semibold text-slate-100">
              Official NASA 3D Visualization Assets (Locally Cached GLB)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 pr-3">Model Name</th>
                    <th className="py-2 pr-3">NASA Source</th>
                    <th className="py-2 pr-3">Size</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {inventory.models.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-3 text-slate-100 font-medium">{m.name}</td>
                      <td className="py-2.5 pr-3 text-slate-300">{m.source}</td>
                      <td className="py-2.5 pr-3 font-mono text-slate-300">{formatMb(m.sizeBytes)}</td>
                      <td className="py-2.5 pr-3 font-mono text-emerald-400">
                        {m.available ? 'Cached Locally' : 'Missing'}
                      </td>
                      <td className="py-2.5">
                        <a href={m.url} target="_blank" rel="noreferrer" className="text-cyan-400 inline-flex items-center gap-1 hover:underline">
                          NASA Page <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* On-Demand NASA APIs & Solvers */}
          <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-base font-display font-semibold text-slate-100">
              On-Demand NASA Services &amp; Analytical Solvers
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {inventory.externalApis.map((api) => (
                <div key={api.id} className="bg-[#07090E] border border-slate-800 rounded p-3.5 space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-slate-100">{api.name}</span>
                    <span className="font-mono text-cyan-300 shrink-0">{api.status}</span>
                  </div>
                  <div className="text-slate-400">{api.source} · {api.resolution}</div>
                  <div className="text-slate-500 font-mono">CRS: {api.crs} · {api.date}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
