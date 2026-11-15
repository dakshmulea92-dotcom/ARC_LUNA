import fs from 'node:fs';
import path from 'node:path';
import { lolaService } from './lolaService.js';

export interface MoonTrekItem {
  uuid: string;
  title: string;
  itemType: string;
  description: string;
  bbox?: string;
  centerLat?: number;
  centerLon?: number;
  mediaUrl?: string;
  sourceUrl: string;
}

export interface NasaPowerLaunchEnv {
  facilityId: string;
  lat: number;
  lon: number;
  available: boolean;
  dataType: 'NASA_POWER_CLIMATOLOGY_AND_RECENT_DAILY';
  disclaimer: string;
  sourceName: string;
  sourceUrl: string;
  observationPeriod: string;
  fetchedAtUtc: string;
  climatologyMonth: string;
  climatology?: {
    temperatureC: number | null;
    tempMaxC: number | null;
    tempMinC: number | null;
    cloudCoverPct: number | null;
    windSpeed10mMs: number | null;
    precipitationMmDay: number | null;
    relativeHumidityPct: number | null;
    solarIrradianceKwhM2Day: number | null;
    surfacePressureKpa: number | null;
  };
  recentDaily?: {
    date: string;
    temperatureC: number | null;
    windSpeed10mMs: number | null;
    precipitationMmDay: number | null;
    relativeHumidityPct: number | null;
    cloudCoverPct: number | null;
  };
  error?: string;
}

const powerCache = new Map<string, { expiresAt: number; payload: NasaPowerLaunchEnv }>();
const moonTrekCache = new Map<string, { expiresAt: number; items: MoonTrekItem[] }>();

function parseBboxCenter(bbox?: string): { lat?: number; lon?: number } {
  if (!bbox) return {};
  const parts = bbox.split(',').map((n) => Number(n.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return {};
  const [minLon, minLat, maxLon, maxLat] = parts;
  let lon = (minLon + maxLon) / 2;
  if (lon > 180) lon -= 360;
  return {
    lat: Number(((minLat + maxLat) / 2).toFixed(4)),
    lon: Number(lon.toFixed(4)),
  };
}

function cleanVal(v: number | undefined): number | null {
  if (v === undefined || v === null || v <= -900 || Number.isNaN(v)) return null;
  return Number(v.toFixed(2));
}

export async function searchMoonTrek(query: string, rows = 8): Promise<{ available: boolean; items: MoonTrekItem[]; sourceUrl: string; error?: string }> {
  const cleanQ = query.trim() || 'Apollo';
  const cacheKey = `${cleanQ.toLowerCase()}:${rows}`;
  const cached = moonTrekCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      available: true,
      items: cached.items,
      sourceUrl: 'https://trek.nasa.gov/moon/TrekServices/ws/index/eq/searchItems',
    };
  }

  const url = `https://trek.nasa.gov/moon/TrekServices/ws/index/eq/searchItems?proj=eq&text=${encodeURIComponent(cleanQ)}&start=0&rows=${rows}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const json = (await resp.json()) as {
      response?: {
        docs?: Array<{
          item_UUID?: string;
          title?: string;
          itemType?: string;
          description?: string;
          bbox?: string;
          mediaURL?: string;
        }>;
      };
    };

    const docs = json.response?.docs ?? [];
    const items: MoonTrekItem[] = docs.map((d) => {
      const center = parseBboxCenter(d.bbox);
      return {
        uuid: d.item_UUID ?? '',
        title: d.title ?? 'Unnamed Lunar Feature',
        itemType: d.itemType ?? 'product',
        description: (d.description ?? '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').slice(0, 320),
        bbox: d.bbox,
        centerLat: center.lat,
        centerLon: center.lon,
        mediaUrl: d.mediaURL,
        sourceUrl: 'https://trek.nasa.gov/moon/',
      };
    });

    moonTrekCache.set(cacheKey, { expiresAt: Date.now() + 1000 * 60 * 30, items });
    return {
      available: true,
      items,
      sourceUrl: 'https://trek.nasa.gov/moon/TrekServices/ws/index/eq/searchItems',
    };
  } catch (err) {
    return {
      available: false,
      items: [],
      sourceUrl: 'https://trek.nasa.gov/moon/TrekServices/ws/index/eq/searchItems',
      error: err instanceof Error ? err.message : 'Moon Trek request failed',
    };
  }
}

export async function getNasaPowerLaunchEnv(facilityId: string, lat: number, lon: number): Promise<NasaPowerLaunchEnv> {
  const cacheKey = `${facilityId}:${lat.toFixed(3)}:${lon.toFixed(3)}`;
  const cached = powerCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const now = new Date();
  const currentMonthKey = months[now.getUTCMonth()];

  // Fetch recent 14-day window ending 5 days ago (NASA POWER satellite latency is ~3-7 days)
  const endD = new Date(now.getTime() - 5 * 86400_000);
  const startD = new Date(endD.getTime() - 10 * 86400_000);
  const fmtDate = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

  const climUrl = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2M_MAX,T2M_MIN,CLOUD_AMT,WS10M,PRECTOTCORR,RH2M,ALLSKY_SFC_SW_DWN,PS&community=RE&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&format=JSON`;
  const dailyUrl = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,WS10M,PRECTOTCORR,RH2M,CLOUD_AMT&community=RE&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${fmtDate(startD)}&end=${fmtDate(endD)}&format=JSON`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const [climResp, dailyResp] = await Promise.all([
      fetch(climUrl, { signal: controller.signal }),
      fetch(dailyUrl, { signal: controller.signal }),
    ]);
    clearTimeout(timer);

    if (!climResp.ok) {
      throw new Error(`NASA POWER HTTP ${climResp.status}`);
    }

    const climJson = (await climResp.json()) as {
      properties?: { parameter?: Record<string, Record<string, number>> };
      header?: { title?: string; api?: { version?: string } };
    };

    const p = climJson.properties?.parameter ?? {};
    let recentDaily: NasaPowerLaunchEnv['recentDaily'] | undefined;

    if (dailyResp.ok) {
      const dailyJson = (await dailyResp.json()) as {
        properties?: { parameter?: Record<string, Record<string, number>> };
      };
      const dp = dailyJson.properties?.parameter ?? {};
      const dates = Object.keys(dp.T2M ?? {}).sort();
      // Find latest valid non-fill (-999) entry
      for (let i = dates.length - 1; i >= 0; i--) {
        const dt = dates[i];
        const t = dp.T2M?.[dt];
        if (t !== undefined && t > -900) {
          recentDaily = {
            date: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`,
            temperatureC: cleanVal(dp.T2M?.[dt]),
            windSpeed10mMs: cleanVal(dp.WS10M?.[dt]),
            precipitationMmDay: cleanVal(dp.PRECTOTCORR?.[dt]),
            relativeHumidityPct: cleanVal(dp.RH2M?.[dt]),
            cloudCoverPct: cleanVal(dp.CLOUD_AMT?.[dt]),
          };
          break;
        }
      }
    }

    const payload: NasaPowerLaunchEnv = {
      facilityId,
      lat,
      lon,
      available: true,
      dataType: 'NASA_POWER_CLIMATOLOGY_AND_RECENT_DAILY',
      disclaimer:
        'NASA POWER provides historical climatology (2001–2020 CERES/MERRA-2) and recent retrospective daily satellite/reanalysis values. It is NOT a live launch-day operational weather forecast.',
      sourceName: 'NASA Langley Research Center (LaRC) POWER Project',
      sourceUrl: 'https://power.larc.nasa.gov/',
      observationPeriod: `Climatology (${currentMonthKey} 20-yr mean) + Recent Daily`,
      fetchedAtUtc: new Date().toISOString(),
      climatologyMonth: currentMonthKey,
      climatology: {
        temperatureC: cleanVal(p.T2M?.[currentMonthKey]),
        tempMaxC: cleanVal(p.T2M_MAX?.[currentMonthKey]),
        tempMinC: cleanVal(p.T2M_MIN?.[currentMonthKey]),
        cloudCoverPct: cleanVal(p.CLOUD_AMT?.[currentMonthKey]),
        windSpeed10mMs: cleanVal(p.WS10M?.[currentMonthKey]),
        precipitationMmDay: cleanVal(p.PRECTOTCORR?.[currentMonthKey]),
        relativeHumidityPct: cleanVal(p.RH2M?.[currentMonthKey]),
        solarIrradianceKwhM2Day: cleanVal(p.ALLSKY_SFC_SW_DWN?.[currentMonthKey]),
        surfacePressureKpa: cleanVal(p.PS?.[currentMonthKey]),
      },
      recentDaily,
    };

    powerCache.set(cacheKey, { expiresAt: Date.now() + 1000 * 60 * 60, payload });
    return payload;
  } catch (err) {
    return {
      facilityId,
      lat,
      lon,
      available: false,
      dataType: 'NASA_POWER_CLIMATOLOGY_AND_RECENT_DAILY',
      disclaimer:
        'NASA POWER data request failed or timed out. No synthetic weather data has been generated.',
      sourceName: 'NASA Langley Research Center (LaRC) POWER Project',
      sourceUrl: 'https://power.larc.nasa.gov/',
      observationPeriod: 'NASA DATA UNAVAILABLE',
      fetchedAtUtc: new Date().toISOString(),
      climatologyMonth: currentMonthKey,
      error: err instanceof Error ? err.message : 'NASA POWER request failed',
    };
  }
}

const tileCache = new Map<string, { expiresAt: number; contentType: string; buffer: Buffer }>();

export interface EpicEarthObservation {
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

let epicCache: { expiresAt: number; payload: EpicEarthObservation } | null = null;

function normLon180(lon: number): number {
  const n = ((lon % 360) + 360) % 360;
  return n > 180 ? n - 360 : n;
}

function storeTileCache(key: string, contentType: string, buffer: Buffer) {
  if (tileCache.size >= 80) {
    const oldest = tileCache.keys().next().value;
    if (oldest !== undefined) tileCache.delete(oldest);
  }
  tileCache.set(key, { expiresAt: Date.now() + 1000 * 60 * 60, contentType, buffer });
}

export async function fetchMoonTrekTile(params: {
  layer: 'wac' | 'lola_color';
  lat: number;
  lon: number;
  z?: number;
}): Promise<{ ok: boolean; contentType?: string; buffer?: Buffer; tileCoords?: { z: number; row: number; col: number }; error?: string }> {
  const z = Math.max(2, Math.min(params.layer === 'wac' ? 5 : 4, Math.round(params.z ?? (params.layer === 'wac' ? 4 : 4))));
  const cols = Math.pow(2, z + 1);
  const rows = Math.pow(2, z);
  const clampedLat = Math.max(-89.99, Math.min(89.99, params.lat));
  const lon180 = normLon180(params.lon);
  const col = Math.max(0, Math.min(cols - 1, Math.floor(((lon180 + 180) / 360) * cols)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor(((90 - clampedLat) / 180) * rows)));

  const cacheKey = `moontrek:${params.layer}:${z}:${row}:${col}`;
  const cached = tileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, contentType: cached.contentType, buffer: cached.buffer, tileCoords: { z, row, col } };
  }

  const upstream =
    params.layer === 'wac'
      ? `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${z}/${row}/${col}.jpg`
      : `https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/default/default028mm/${z}/${row}/${col}.png`;

  try {
    const resp = await fetch(upstream, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`NASA Moon Trek HTTP ${resp.status}`);
    const contentType = resp.headers.get('content-type') || (params.layer === 'wac' ? 'image/jpeg' : 'image/png');
    const buffer = Buffer.from(await resp.arrayBuffer());
    storeTileCache(cacheKey, contentType, buffer);
    return { ok: true, contentType, buffer, tileCoords: { z, row, col } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Moon Trek tile unavailable' };
  }
}

export async function fetchGibsEarthTile(params: {
  lat: number;
  lon: number;
  z?: number;
}): Promise<{ ok: boolean; contentType?: string; buffer?: Buffer; error?: string }> {
  // GIBS BlueMarble_NextGeneration 500m grid: z=2 (5x3), z=3 (10x5 = exact 36°x36°), z=4 (20x10 = exact 18°x18°)
  const z = Math.max(2, Math.min(4, Math.round(params.z ?? 4)));
  const cols = z === 2 ? 5 : z === 3 ? 10 : 20;
  const rows = z === 2 ? 3 : z === 3 ? 5 : 10;
  const clampedLat = Math.max(-89.99, Math.min(89.99, params.lat));
  const lon180 = normLon180(params.lon);
  const col = Math.max(0, Math.min(cols - 1, Math.floor(((lon180 + 180) / 360) * cols)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor(((90 - clampedLat) / 180) * rows)));

  const cacheKey = `gibs:${z}:${row}:${col}`;
  const cached = tileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, contentType: cached.contentType, buffer: cached.buffer };
  }

  const upstream = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_NextGeneration/default/500m/${z}/${row}/${col}.jpg`;
  try {
    const resp = await fetch(upstream, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`NASA GIBS HTTP ${resp.status}`);
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await resp.arrayBuffer());
    storeTileCache(cacheKey, contentType, buffer);
    return { ok: true, contentType, buffer };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'NASA GIBS tile unavailable' };
  }
}

export async function getLatestEpicEarthObservation(): Promise<EpicEarthObservation> {
  if (epicCache && epicCache.expiresAt > Date.now()) {
    return epicCache.payload;
  }
  try {
    const resp = await fetch('https://epic.gsfc.nasa.gov/api/natural', {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`NASA EPIC HTTP ${resp.status}`);
    const list = (await resp.json()) as Array<{
      identifier?: string;
      caption?: string;
      image?: string;
      date?: string;
      centroid_coordinates?: { lat: number; lon: number };
      dscovr_j2000_position?: { x: number; y: number; z: number };
      lunar_j2000_position?: { x: number; y: number; z: number };
      sun_j2000_position?: { x: number; y: number; z: number };
    }>;
    const latest = list[0];
    if (!latest || !latest.image || !latest.date) {
      throw new Error('NASA EPIC returned empty observation list');
    }
    const datePart = latest.date.split(' ')[0];
    const dist = (v?: { x: number; y: number; z: number }) =>
      v ? Math.round(Math.hypot(v.x, v.y, v.z)) : undefined;

    const payload: EpicEarthObservation = {
      available: true,
      sourceName: 'NASA DSCOVR Earth Polychromatic Imaging Camera (EPIC)',
      sourceUrl: 'https://epic.gsfc.nasa.gov/',
      dateUtc: latest.date.replace(' ', 'T') + 'Z',
      caption: latest.caption,
      imageName: latest.image,
      imageProxyUrl: `/api/nasa/epic/image?date=${encodeURIComponent(datePart)}&image=${encodeURIComponent(latest.image)}`,
      centroidLat: latest.centroid_coordinates?.lat,
      centroidLon: latest.centroid_coordinates?.lon,
      dscovrDistanceKm: dist(latest.dscovr_j2000_position),
      moonDistanceKm: dist(latest.lunar_j2000_position),
      sunDistanceKm: dist(latest.sun_j2000_position),
    };
    epicCache = { expiresAt: Date.now() + 1000 * 60 * 30, payload };
    return payload;
  } catch (err) {
    return {
      available: false,
      sourceName: 'NASA DSCOVR Earth Polychromatic Imaging Camera (EPIC)',
      sourceUrl: 'https://epic.gsfc.nasa.gov/',
      error: err instanceof Error ? err.message : 'NASA EPIC request failed',
    };
  }
}

export async function fetchProxiedNasaMedia(targetUrl: string): Promise<{ ok: boolean; contentType?: string; buffer?: Buffer; error?: string }> {
  const allowed =
    targetUrl.startsWith('https://trek.nasa.gov/assets/') ||
    targetUrl.startsWith('https://epic.gsfc.nasa.gov/archive/');
  if (!allowed) {
    return { ok: false, error: 'Blocked non-NASA asset URL' };
  }
  const cacheKey = `media:${targetUrl}`;
  const cached = tileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, contentType: cached.contentType, buffer: cached.buffer };
  }
  try {
    const resp = await fetch(targetUrl, { signal: AbortSignal.timeout(9000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await resp.arrayBuffer());
    storeTileCache(cacheKey, contentType, buffer);
    return { ok: true, contentType, buffer };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'NASA image fetch failed' };
  }
}

export function getDataCenterInventory() {
  const lolaMeta = lolaService.getDatasetMeta();
  const lolaCache = lolaService.getCacheStats();
  const modelsDir = path.resolve(process.cwd(), 'public', 'nasa-models');

  const modelFiles = [
    {
      id: 'nasa-svs-14959-moon',
      file: 'moon_small.glb',
      name: 'NASA LRO Moon 3D Model (SVS 14959)',
      source: 'NASA Scientific Visualization Studio (SVS) / LRO',
      url: 'https://svs.gsfc.nasa.gov/14959',
      resolution: 'LRO WAC + LOLA Color/Displacement GLB',
    },
    {
      id: 'nasa-svs-14959-moon-grid',
      file: 'Moon_NASA_LRO_15k_Grid_Small.glb',
      name: 'NASA LRO Moon 3D Model with Selenographic Grid (SVS 14959)',
      source: 'NASA Scientific Visualization Studio (SVS) / LRO',
      url: 'https://svs.gsfc.nasa.gov/14959',
      resolution: '15k Grid Overlay GLB',
    },
    {
      id: 'nasa-solarsystem-2393-earth',
      file: 'Earth_1_12756.glb',
      name: 'NASA Earth 3D Model (Solar System Exploration #2393)',
      source: 'NASA Solar System Exploration',
      url: 'https://solarsystem.nasa.gov/gltf_embed/2393/',
      resolution: '1:12,756 km scale GLB',
    },
    {
      id: 'nasa-science-sun-3d',
      file: 'Sun_1_1391000.glb',
      name: 'NASA Sun 3D Model',
      source: 'NASA Science Heliophysics',
      url: 'https://science.nasa.gov/learn/heat/resource/sun-3d-model/#download',
      resolution: '1:1,391,000 km scale GLB',
    },
  ].map((m) => {
    const fp = path.join(modelsDir, m.file);
    const exists = fs.existsSync(fp);
    const sizeBytes = exists ? fs.statSync(fp).size : 0;
    return {
      ...m,
      localPath: `/nasa-models/${m.file}`,
      available: exists,
      sizeBytes,
    };
  });

  return {
    lola: {
      ...lolaMeta,
      cache: lolaCache,
    },
    models: modelFiles,
    externalApis: [
      {
        id: 'nasa-moon-trek-wmts',
        name: 'NASA Moon Trek WMTS (LRO WAC Mosaic & LOLA Color Shaded Relief)',
        source: 'NASA Moon Trek / JPL / GSFC',
        resolution: '303 ppd (WAC) / 128 ppd (LOLA Color Shade)',
        crs: 'Moon Equirectangular (EPSG:4326-equivalent)',
        date: 'LRO Mission Archive',
        url: 'https://trek.nasa.gov/moon/',
        status: 'Live Tile Streaming Active',
        cachedEntries: moonTrekCache.size + tileCache.size,
      },
      {
        id: 'nasa-power-api',
        name: 'NASA POWER Climatology & Retrospective Daily Atmospheric API',
        source: 'NASA Langley Research Center (LaRC)',
        resolution: '0.5° × 0.625° MERRA-2 / 1° CERES',
        crs: 'WGS84 Geographic',
        date: '2001–Present (3–7 day satellite latency)',
        url: 'https://power.larc.nasa.gov/',
        status: 'On-Demand Point Query + 1h Cache',
        cachedEntries: powerCache.size,
      },
      {
        id: 'nasa-gibs-wmts',
        name: 'NASA GIBS Blue Marble 500m & DSCOVR EPIC Full-Disc Earth',
        source: 'NASA EOSDIS GIBS & DSCOVR EPIC (GSFC)',
        resolution: '500m WMTS + 2048px Full-Disc L1 Earth Camera',
        crs: 'EPSG:4326 / Sun-Earth L1',
        date: 'Live EPIC + Blue Marble NextGen',
        url: 'https://epic.gsfc.nasa.gov/',
        status: 'Live Tile & Image Streaming Active',
        cachedEntries: epicCache ? 1 : 0,
      },
      {
        id: 'jpl-ephemeris',
        name: 'JPL/IAU Selenocentric Solar & Libration Ephemeris',
        source: 'JPL Solar System Dynamics / IAU DE-equivalent via astronomy-engine',
        resolution: 'Sub-arcminute ephemeris precision',
        crs: 'Selenographic Mean Earth / Polar Axis',
        date: 'Dynamic UTC Query',
        url: 'https://naif.jpl.nasa.gov/naif/',
        status: 'Local Analytical Solver Active',
        cachedEntries: 0,
      },
    ],
  };
}

