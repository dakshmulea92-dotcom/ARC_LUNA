import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { lolaService } from './server/lolaService.js';
import {
  fetchGibsEarthTile,
  fetchMoonTrekTile,
  fetchProxiedNasaMedia,
  getDataCenterInventory,
  getLatestEpicEarthObservation,
  getNasaPowerLaunchEnv,
  searchMoonTrek,
} from './server/nasaApiService.js';
import {
  deleteCoordinate,
  deleteMission,
  listMissions,
  listSavedCoordinates,
  saveCoordinate,
  saveMission,
} from './server/missionStore.js';
import { queryLunaAi } from './server/geminiService.js';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '2mb' }));

  // Health & provenance endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'ARC LUNA — LUNASIGHT',
      lola: lolaService.getDatasetMeta(),
    });
  });

  // Point LOLA elevation query
  app.get('/api/lola/elevation', (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90) {
      res.status(400).json({ error: 'Invalid lat/lon parameters. Latitude must be in [-90, 90].' });
      return;
    }
    try {
      res.json(lolaService.sampleElevation(lat, lon));
    } catch (err) {
      res.status(503).json({
        dataAvailable: false,
        error: err instanceof Error ? err.message : 'NASA DATA UNAVAILABLE',
      });
    }
  });

  // Full LOLA terrain patch, slope, roughness, craters, and 360° horizon analysis
  app.get('/api/lola/analyze', (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : 30;
    const gridSize = req.query.gridSize ? Number(req.query.gridSize) : 33;
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90) {
      res.status(400).json({ error: 'Invalid lat/lon parameters. Latitude must be in [-90, 90].' });
      return;
    }
    try {
      const analysis = lolaService.analyzeTerrainPatch(lat, lon, radiusKm, gridSize);
      res.json(analysis);
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'NASA DATA UNAVAILABLE',
      });
    }
  });

  // LOLA cross-section profile (Terrain Intelligence + Rover Explorer)
  app.get('/api/lola/profile', (req, res) => {
    const lat1 = Number(req.query.lat1);
    const lon1 = Number(req.query.lon1);
    const lat2 = Number(req.query.lat2);
    const lon2 = Number(req.query.lon2);
    const samples = req.query.samples ? Number(req.query.samples) : 40;
    if ([lat1, lon1, lat2, lon2].some((v) => Number.isNaN(v)) || lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) {
      res.status(400).json({ error: 'Invalid profile coordinates.' });
      return;
    }
    try {
      res.json(lolaService.computeCrossSection(lat1, lon1, lat2, lon2, samples));
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'NASA DATA UNAVAILABLE',
      });
    }
  });

  // NASA Moon Trek nomenclature & bookmark search
  app.get('/api/nasa/moon-trek/search', async (req, res) => {
    const q = String(req.query.q ?? 'Apollo');
    const rows = req.query.rows ? Number(req.query.rows) : 8;
    const result = await searchMoonTrek(q, Math.min(25, Math.max(1, rows)));
    res.json(result);
  });

  // NASA POWER Earth launch environment query
  app.get('/api/nasa/power', async (req, res) => {
    const facilityId = String(req.query.facilityId ?? 'custom');
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      res.status(400).json({ error: 'Invalid Earth coordinates.' });
      return;
    }
    const data = await getNasaPowerLaunchEnv(facilityId, lat, lon);
    res.json(data);
  });

  // Live NASA Moon Trek WMTS tile proxy (LRO WAC Mosaic & LOLA Color Shaded Relief)
  app.get('/api/nasa/moon-trek/tile', async (req, res) => {
    const layer = req.query.layer === 'lola_color' ? 'lola_color' : 'wac';
    const lat = Number(req.query.lat ?? 0);
    const lon = Number(req.query.lon ?? 0);
    const z = req.query.z ? Number(req.query.z) : undefined;
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      res.status(400).json({ error: 'Invalid lat/lon' });
      return;
    }
    const result = await fetchMoonTrekTile({ layer, lat, lon, z });
    if (!result.ok || !result.buffer) {
      res.status(502).json({ error: result.error ?? 'NASA DATA UNAVAILABLE' });
      return;
    }
    res.setHeader('Content-Type', result.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(result.buffer);
  });

  // Live NASA GIBS 500m Blue Marble Earth imagery tile proxy
  app.get('/api/nasa/gibs/tile', async (req, res) => {
    const lat = Number(req.query.lat ?? 0);
    const lon = Number(req.query.lon ?? 0);
    const z = req.query.z ? Number(req.query.z) : 4;
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      res.status(400).json({ error: 'Invalid Earth lat/lon' });
      return;
    }
    const result = await fetchGibsEarthTile({ lat, lon, z });
    if (!result.ok || !result.buffer) {
      res.status(502).json({ error: result.error ?? 'NASA DATA UNAVAILABLE' });
      return;
    }
    res.setHeader('Content-Type', result.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(result.buffer);
  });

  // Live NASA DSCOVR EPIC latest full-disc Earth telemetry + image proxy
  app.get('/api/nasa/epic/latest', async (_req, res) => {
    const obs = await getLatestEpicEarthObservation();
    res.json(obs);
  });

  app.get('/api/nasa/epic/image', async (req, res) => {
    const date = String(req.query.date ?? '').replace(/-/g, '/');
    const image = String(req.query.image ?? '');
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date) || !/^[A-Za-z0-9_.-]+$/.test(image)) {
      res.status(400).json({ error: 'Invalid EPIC image parameters' });
      return;
    }
    const url = `https://epic.gsfc.nasa.gov/archive/natural/${date}/jpg/${image}.jpg`;
    const result = await fetchProxiedNasaMedia(url);
    if (!result.ok || !result.buffer) {
      res.status(502).json({ error: result.error ?? 'NASA DATA UNAVAILABLE' });
      return;
    }
    res.setHeader('Content-Type', result.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(result.buffer);
  });

  // Allowlisted NASA Moon Trek bookmark/media image proxy
  app.get('/api/nasa/media', async (req, res) => {
    const targetUrl = String(req.query.url ?? '');
    const result = await fetchProxiedNasaMedia(targetUrl);
    if (!result.ok || !result.buffer) {
      res.status(400).json({ error: result.error ?? 'NASA DATA UNAVAILABLE' });
      return;
    }
    res.setHeader('Content-Type', result.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(result.buffer);
  });

  // Data & Research Center inventory and cache management
  app.get('/api/data-center/inventory', (_req, res) => {
    res.json(getDataCenterInventory());
  });

  app.post('/api/data-center/clear-cache', (_req, res) => {
    lolaService.clearCache();
    res.json({ cleared: true, inventory: getDataCenterInventory() });
  });

  // Persisted Missions CRUD
  app.get('/api/missions', (_req, res) => {
    res.json({ missions: listMissions() });
  });

  app.post('/api/missions', (req, res) => {
    const body = req.body;
    if (!body?.name || typeof body.targetLat !== 'number' || typeof body.targetLon !== 'number') {
      res.status(400).json({ error: 'Mission name and numeric targetLat/targetLon are required.' });
      return;
    }
    const created = saveMission({
      name: String(body.name).slice(0, 120),
      missionType: body.missionType ?? 'Robotic Lander',
      launchFacilityId: String(body.launchFacilityId ?? 'ksc-lc39a'),
      launchFacilityName: String(body.launchFacilityName ?? 'Kennedy Space Center'),
      targetSiteName: String(body.targetSiteName ?? 'Custom Lunar Site'),
      targetLat: body.targetLat,
      targetLon: body.targetLon,
      landingDateUtc: String(body.landingDateUtc ?? new Date().toISOString()),
      durationDays: Number(body.durationDays ?? 14),
      spacecraftConfig: String(body.spacecraftConfig ?? 'Reference Lunar Lander'),
      roverDeployment: Boolean(body.roverDeployment),
      minSolarElevationDeg: Number(body.minSolarElevationDeg ?? 2),
      objectives: String(body.objectives ?? ''),
    });
    res.status(201).json({ mission: created });
  });

  app.delete('/api/missions/:id', (req, res) => {
    const ok = deleteMission(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }
    res.json({ deleted: true });
  });

  // Saved Coordinates CRUD
  app.get('/api/coordinates', (_req, res) => {
    res.json({ coordinates: listSavedCoordinates() });
  });

  app.post('/api/coordinates', (req, res) => {
    const body = req.body;
    if (!body?.name || typeof body.lat !== 'number' || typeof body.lon !== 'number') {
      res.status(400).json({ error: 'Coordinate name and numeric lat/lon are required.' });
      return;
    }
    const created = saveCoordinate({
      name: String(body.name).slice(0, 100),
      lat: body.lat,
      lon: body.lon,
      category: body.category ?? 'Custom',
      notes: String(body.notes ?? ''),
    });
    res.status(201).json({ coordinate: created });
  });

  app.delete('/api/coordinates/:id', (req, res) => {
    const ok = deleteCoordinate(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Saved coordinate not found' });
      return;
    }
    res.json({ deleted: true });
  });

  // LUNA AI server-side Gemini endpoint
  app.post('/api/luna-ai/chat', async (req, res) => {
    const body = req.body;
    if (!body?.prompt || typeof body.prompt !== 'string') {
      res.status(400).json({ error: 'Prompt string is required.' });
      return;
    }
    const result = await queryLunaAi({
      prompt: body.prompt.slice(0, 4000),
      activeModule: String(body.activeModule ?? 'Mission Command Center'),
      contextData: (body.contextData as Record<string, unknown>) ?? {},
      history: Array.isArray(body.history) ? body.history : [],
    });
    res.json(result);
  });

  // Serve Vite middleware in development or static dist in production
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ARC LUNA — LUNASIGHT server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
