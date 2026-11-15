import React, { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import { EarthGlobe3D } from '../components/three/EarthGlobe3D';
import { NasaVisualTile } from '../components/shared/NasaVisualTile';
import { ProvenanceBar } from '../components/shared/ProvenanceBar';
import { GLOBAL_LAUNCH_FACILITIES } from '../lib/nasaCatalog';
import { formatTimeInZone } from '../lib/lunarEphemeris';
import type { NasaPowerLaunchEnv } from '../types/lunar';

interface EpicEarthObs {
  available: boolean;
  sourceName: string;
  sourceUrl: string;
  dateUtc?: string;
  caption?: string;
  imageName?: string;
  imageProxyUrl?: string;
  centroidLat?: number;
  centroidLon?: number;
  dscovrDistanceKm?: number;
  moonDistanceKm?: number;
  sunDistanceKm?: number;
  error?: string;
}

export function EarthExplorerPage() {
  const { selectedFacility, setSelectedFacilityId, settings } = useMission();
  const [powerData, setPowerData] = useState<NasaPowerLaunchEnv | null>(null);
  const [powerLoading, setPowerLoading] = useState(false);
  const [epicObs, setEpicObs] = useState<EpicEarthObs | null>(null);
  const [epicLoading, setEpicLoading] = useState(false);
  const [gibsFocusNullIsland, setGibsFocusNullIsland] = useState(false);

  const fetchPower = async () => {
    setPowerLoading(true);
    try {
      const res = await fetch(
        `/api/nasa/power?facilityId=${encodeURIComponent(selectedFacility.id)}&lat=${selectedFacility.lat}&lon=${selectedFacility.lon}`,
      );
      if (res.ok) {
        const json = (await res.json()) as NasaPowerLaunchEnv;
        setPowerData(json);
      }
    } catch {
      setPowerData(null);
    } finally {
      setPowerLoading(false);
    }
  };

  const fetchEpic = async () => {
    setEpicLoading(true);
    try {
      const res = await fetch('/api/nasa/epic/latest');
      if (res.ok) {
        const json = (await res.json()) as EpicEarthObs;
        setEpicObs(json);
      }
    } catch {
      setEpicObs(null);
    } finally {
      setEpicLoading(false);
    }
  };

  useEffect(() => {
    void fetchPower();
  }, [selectedFacility.id]);

  useEffect(() => {
    void fetchEpic();
  }, []);

  const localClock = formatTimeInZone(new Date().toISOString(), selectedFacility.timeZone);
  const gibsLat = gibsFocusNullIsland ? 0 : selectedFacility.lat;
  const gibsLon = gibsFocusNullIsland ? 0 : selectedFacility.lon;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
          Earth Explorer — Global Launch Infrastructure
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Official NASA 3D Earth model (#2393), global launch facility registry (distinguishing NASA vs non-NASA operators), and NASA POWER environmental observations.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 min-h-[480px]">
          <EarthGlobe3D
            selectedFacilityId={selectedFacility.id}
            lightweightMode={settings.lightweightMode}
            onSelectFacility={(f) => setSelectedFacilityId(f.id)}
          />
        </div>

        {/* Facility Database & Selector */}
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4 space-y-3 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-display font-semibold text-slate-100">
              Launch Facilities Registry
            </h2>
            <span className="text-xs text-slate-400">{GLOBAL_LAUNCH_FACILITIES.length} sites</span>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {GLOBAL_LAUNCH_FACILITIES.map((fac) => {
              const active = fac.id === selectedFacility.id;
              return (
                <button
                  key={fac.id}
                  type="button"
                  onClick={() => setSelectedFacilityId(fac.id)}
                  className={`w-full text-left p-2.5 rounded-md border text-xs transition-colors cursor-pointer ${
                    active
                      ? 'bg-cyan-950/40 border-cyan-600 text-slate-100'
                      : 'bg-[#07090E] border-slate-800 hover:border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{fac.name}</span>
                    <span
                      className={`text-[11px] shrink-0 ${
                        fac.isNasaFacility ? 'text-cyan-400' : 'text-amber-300'
                      }`}
                    >
                      {fac.isNasaFacility ? 'NASA' : 'Non-NASA'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {fac.country} · {fac.operator}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                    {fac.lat.toFixed(4)}°, {fac.lon.toFixed(4)}° · Elev {fac.elevationM} m
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Facility Details + NASA POWER Launch Environment Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-display font-semibold text-slate-100">
                {selectedFacility.name}
              </h2>
              <div className="text-xs text-slate-400 mt-0.5">
                {selectedFacility.cityLabel} · {selectedFacility.country}
              </div>
            </div>
            <span
              className={`text-xs font-medium ${
                selectedFacility.isNasaFacility ? 'text-cyan-400' : 'text-amber-300'
              }`}
            >
              {selectedFacility.isNasaFacility ? 'NASA Facility' : 'Non-NASA Facility'}
            </span>
          </div>

          <div className="bg-[#07090E] border border-slate-800 rounded p-3 text-xs font-mono space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-400">Operator:</span><span className="font-sans text-slate-200">{selectedFacility.operator}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Coordinates:</span><span>{selectedFacility.lat.toFixed(4)}°, {selectedFacility.lon.toFixed(4)}°</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Site Local Time:</span><span className="text-cyan-300">{localClock.localTime} ({localClock.tzName})</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Reference UTC:</span><span>{localClock.utcTime}</span></div>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">{selectedFacility.notes}</p>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-400">Source: {selectedFacility.officialSource}</span>
            <a
              href={selectedFacility.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 inline-flex items-center gap-1 hover:underline"
            >
              Facility Reference <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* NASA POWER Environmental Information Panel */}
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-display font-semibold text-slate-100">
                Launch Environment (NASA LaRC POWER)
              </h2>
              <div className="text-xs text-slate-400">
                Climatological &amp; retrospective daily satellite observations — not a live launch forecast
              </div>
            </div>
            <button
              type="button"
              onClick={() => void fetchPower()}
              disabled={powerLoading}
              className="p-1.5 border border-slate-700 hover:border-slate-500 rounded text-slate-300 cursor-pointer"
              title="Refresh NASA POWER query"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${powerLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {powerLoading && !powerData && (
            <div className="text-xs font-mono text-cyan-300">Querying NASA POWER API...</div>
          )}

          {powerData && !powerData.available && (
            <div className="bg-rose-950/50 border border-rose-800 rounded p-3 text-xs text-rose-200">
              NASA DATA UNAVAILABLE ({powerData.error ?? 'Upstream request failed'}). No synthetic weather substituted.
            </div>
          )}

          {powerData && powerData.available && powerData.climatology && (
            <>
              <div className="bg-amber-950/30 border border-amber-800/60 rounded p-2.5 text-[11px] text-amber-200">
                {powerData.disclaimer}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-mono">
                <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                  <div className="text-slate-400 font-sans text-[11px]">{powerData.climatologyMonth} Mean Temp</div>
                  <div className="text-sm font-semibold text-slate-100 mt-0.5">
                    {powerData.climatology.temperatureC !== null ? `${powerData.climatology.temperatureC} °C` : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                  <div className="text-slate-400 font-sans text-[11px]">Wind Speed (10m)</div>
                  <div className="text-sm font-semibold text-cyan-300 mt-0.5">
                    {powerData.climatology.windSpeed10mMs !== null ? `${powerData.climatology.windSpeed10mMs} m/s` : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                  <div className="text-slate-400 font-sans text-[11px]">Cloud Cover</div>
                  <div className="text-sm font-semibold text-slate-100 mt-0.5">
                    {powerData.climatology.cloudCoverPct !== null ? `${powerData.climatology.cloudCoverPct} %` : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                  <div className="text-slate-400 font-sans text-[11px]">Precipitation</div>
                  <div className="text-sm font-semibold text-slate-100 mt-0.5">
                    {powerData.climatology.precipitationMmDay !== null ? `${powerData.climatology.precipitationMmDay} mm/d` : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                  <div className="text-slate-400 font-sans text-[11px]">Rel. Humidity</div>
                  <div className="text-sm font-semibold text-slate-100 mt-0.5">
                    {powerData.climatology.relativeHumidityPct !== null ? `${powerData.climatology.relativeHumidityPct} %` : 'N/A'}
                  </div>
                </div>
                <div className="bg-[#07090E] border border-slate-800 rounded p-2.5">
                  <div className="text-slate-400 font-sans text-[11px]">Visibility</div>
                  <div className="text-xs font-semibold text-slate-400 mt-0.5">NASA DATA UNAVAILABLE</div>
                </div>
              </div>

              {powerData.recentDaily && (
                <div className="bg-[#07090E] border border-slate-800 rounded p-3 text-xs font-mono">
                  <div className="font-sans font-medium text-slate-200 mb-1">
                    Latest NASA POWER Retrospective Daily Observation ({powerData.recentDaily.date})
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-300">
                    <span>Temp: {powerData.recentDaily.temperatureC ?? 'N/A'} °C</span>
                    <span>Wind: {powerData.recentDaily.windSpeed10mMs ?? 'N/A'} m/s</span>
                    <span>Precip: {powerData.recentDaily.precipitationMmDay ?? 'N/A'} mm/d</span>
                    <span>Cloud: {powerData.recentDaily.cloudCoverPct ?? 'N/A'} %</span>
                  </div>
                </div>
              )}

              <div className="text-[11px] font-mono text-slate-500">
                Fetched UTC: {powerData.fetchedAtUtc} · Period: {powerData.observationPeriod}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Live NASA Earth Satellite Visuals: GIBS 500m Blue Marble + DSCOVR EPIC Full-Disc Earth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-display font-semibold text-slate-100">
                NASA GIBS Blue Marble (500m WMTS)
              </h2>
              <div className="text-xs text-slate-400">
                {gibsFocusNullIsland
                  ? 'Null Island Reference (0.000°, 0.000°)'
                  : `${selectedFacility.shortName} (${selectedFacility.lat.toFixed(2)}°, ${selectedFacility.lon.toFixed(2)}°)`}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-[#07090E] border border-slate-800 rounded p-1 text-xs">
              <button
                type="button"
                onClick={() => setGibsFocusNullIsland(false)}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  !gibsFocusNullIsland ? 'bg-cyan-600 text-slate-950 font-medium' : 'text-slate-300'
                }`}
              >
                Launch Site
              </button>
              <button
                type="button"
                onClick={() => setGibsFocusNullIsland(true)}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  gibsFocusNullIsland ? 'bg-emerald-500 text-slate-950 font-medium' : 'text-slate-300'
                }`}
              >
                Null Island (0°,0°)
              </button>
            </div>
          </div>

          <NasaVisualTile
            src={`/api/nasa/gibs/tile?lat=${gibsLat}&lon=${gibsLon}&z=4`}
            alt={`NASA GIBS 500m tile at ${gibsLat.toFixed(2)}, ${gibsLon.toFixed(2)}`}
            label={gibsFocusNullIsland ? 'EPSG:4326 Tile · Null Island (0°,0°)' : `EPSG:4326 Tile · ${selectedFacility.shortName}`}
            sublabel="500m Blue Marble · z=4"
            aspectClass="aspect-[16/10]"
          />
        </div>

        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-display font-semibold text-slate-100">
                NASA DSCOVR EPIC Full-Disc Earth (Sun–Earth L1)
              </h2>
              <div className="text-xs text-slate-400">
                Live spacecraft photograph &amp; J2000 measured range vectors
              </div>
            </div>
            <button
              type="button"
              onClick={() => void fetchEpic()}
              disabled={epicLoading}
              className="p-1.5 border border-slate-700 hover:border-slate-500 rounded text-slate-300 cursor-pointer"
              title="Refresh NASA EPIC observation"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${epicLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {epicLoading && !epicObs && (
            <div className="text-xs font-mono text-cyan-300">Querying NASA DSCOVR EPIC API...</div>
          )}

          {epicObs && !epicObs.available && (
            <div className="bg-rose-950/50 border border-rose-800 rounded p-3 text-xs text-rose-200">
              NASA DATA UNAVAILABLE ({epicObs.error ?? 'EPIC API unavailable'})
            </div>
          )}

          {epicObs && epicObs.available && epicObs.imageProxyUrl && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <NasaVisualTile
                src={epicObs.imageProxyUrl}
                alt={`NASA DSCOVR EPIC Earth captured ${epicObs.dateUtc ?? ''}`}
                label={epicObs.imageName ?? 'EPIC Earth Full-Disc'}
                sublabel={epicObs.dateUtc ? epicObs.dateUtc.slice(0, 16).replace('T', ' ') + 'Z' : undefined}
                aspectClass="aspect-square"
              />
              <div className="bg-[#07090E] border border-slate-800 rounded p-3 text-xs font-mono space-y-1.5">
                <div className="font-sans text-[11px] text-slate-300 leading-relaxed">
                  {epicObs.caption ?? 'Sunlit Earth imaged by NASA DSCOVR EPIC instrument at L1.'}
                </div>
                <div className="pt-1 border-t border-slate-800 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sub-Solar Centroid:</span>
                    <span className="text-cyan-300">
                      {epicObs.centroidLat?.toFixed(2)}°, {epicObs.centroidLon?.toFixed(2)}°
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">DSCOVR Range:</span>
                    <span>{epicObs.dscovrDistanceKm?.toLocaleString() ?? 'N/A'} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Measured Moon Dist:</span>
                    <span className="text-amber-300">{epicObs.moonDistanceKm?.toLocaleString() ?? 'N/A'} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sun Distance:</span>
                    <span>{epicObs.sunDistanceKm?.toLocaleString() ?? 'N/A'} km</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ProvenanceBar
        sourceName="NASA Solar System Exploration (#2393) + NASA LaRC POWER + NASA GIBS + DSCOVR EPIC"
        datasetId="Earth_1_12756.glb / POWER / BlueMarble 500m / EPIC"
        classification="Climatology / Historical Observation"
        resolution="500m GIBS · 2048px EPIC · 0.5° MERRA-2"
        sourceUrl="https://epic.gsfc.nasa.gov/"
      />
    </div>
  );
}
