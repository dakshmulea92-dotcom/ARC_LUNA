# ARC LUNA — LUNASIGHT

**Advanced Lunar Navigation, Intelligence & Mission Simulation Platform**

ARC LUNA — LUNASIGHT is a full-stack scientific lunar exploration, landing-site assessment, solar illumination prediction, and mission simulation platform grounded in official NASA datasets and JPL/IAU ephemeris calculations.

---

## Core Architecture

- **Frontend (`src/`)**: React 19 + TypeScript + Tailwind CSS v4 + Three.js (`GLTFLoader`, `OrbitControls`, `RoomEnvironment` PMREM).
- **Backend (`server.ts` & `server/`)**: Express server with Vite middleware (dev) / static `dist/` serving (prod), binary random-access NASA PDS LOLA elevation reader, NASA API caching proxy, persistent JSON mission/coordinate store, and server-side LUNA AI Gemini integration.
- **Installed NASA Datasets (`data/nasa-lola/` & `public/nasa-models/`)**:
  - `data/nasa-lola/ldem_16.img` + `ldem_16.lbl`: Official NASA PDS **LRO-L-LOLA-4-GDR-V1.0 (`LDEM_16`)** global digital elevation model (5760×2880, 16 px/deg, 1895.21 m/px at equator, 16-bit signed LSB integer relative to 1,737.4 km reference sphere).
  - `data/nasa-lola/ldem_4.img` + `ldem_4.lbl`: 4 px/deg backup global LOLA DEM.
  - `public/nasa-models/moon_small.glb` & `Moon_NASA_LRO_15k_Grid_Small.glb`: Official **NASA SVS 14959** LRO 3D Moon models.
  - `public/nasa-models/Earth_1_12756.glb`: Official **NASA Solar System Exploration (#2393)** Earth 3D model.
  - `public/nasa-models/Sun_1_1391000.glb`: Official **NASA Science Heliophysics** Sun 3D model.

---

## Modules (13 Pages)

1. **Mission Command Center** — Active lunar target overview, LOLA elevation/slope metrics, ephemeris illumination, and quick navigation.
2. **Lunar Explorer** — Interactive 3D Moon (NASA SVS 14959 GLB + NASA Sun 3D GLB) with raycast coordinate picking, grid toggle, North/South Pole presets, and live NASA Moon Trek search.
3. **Landing Site Intelligence** — Configurable scoring weights, Horn 3×3 slope distribution, Terrain Ruggedness Index (TRI), LOLA crater detection, uncertainty & coverage indicators, and explicit safety rejection checks.
4. **Terrain Intelligence** — Interactive LOLA elevation/slope/roughness heatmaps, great-circle cross-section profiles, multi-site comparison matrix, JSON export, and **360° Terrain Horizon Analyzer**.
5. **Lunar Environmental Explorer** — Separates Surface Temperature (LRO Diviner-calibrated radiative balance), Solar Illumination, Radiation Environment (LRO CRaTER baseline), and Terrain Conditions without fabricated lunar weather.
6. **Sunlight & Illumination Analyzer** — JPL/IAU ephemeris (`astronomy-engine`) solar angles, terrain-occluded illumination timelines, peak sunlight/sunrise finder, and separate **Earth Launch-Pad Local Time Conversion**.
7. **Earth Explorer** — Interactive 3D Earth (NASA #2393 GLB), 8 major launch facilities (clearly distinguishing NASA vs non-NASA operators), and live **NASA LaRC POWER** climatology & retrospective daily environmental observations.
8. **Mission Planner** — Custom mission configuration, persistent storage, educational astrodynamics calculations with documented formulas, and **PDF & JSON report exports**.
9. **Autonomous Landing Simulator** — 3D LOLA terrain descent simulation with Manual, Assisted, and Autonomous hazard-divert modes, simulated onboard nadir camera feed, and **Apollo 11 Historical Reconstruction**.
10. **Rover Explorer** — 3D lunar rover traverse simulation along real LOLA great-circle elevation/slope profiles.
11. **AI Mission Assistant (LUNA AI)** — Server-side `@google/genai` (`gemini-4-hydrogen`) assistant strictly grounded in active NASA telemetry.
12. **Data & Research Center** — Live dataset provenance, resolution, CRS, file sizes, and tile/row cache controls.
13. **Settings** — Lightweight GPU/CPU performance mode, longitude convention (`±180°` vs `0–360° E`), and saved coordinates manager.

---

## Running Locally

```bash
npm install
npm run dev
```

Default server port is `3000` (configurable via `PORT=8000 npm run dev`).

### Environment Variables (`.env`)
- `GEMINI_API_KEY`: Optional server-side Gemini API key for LUNA AI (`gemini-4-hydrogen`). Without a key, LUNA AI provides deterministic telemetry summaries grounded in active LOLA/ephemeris data.
- `PORT`: Server port (defaults to `3000`).

---

## Scientific Data Provenance Policy

- **Measured NASA Data**: LOLA `LDEM_16` elevations (`LRO-L-LOLA-4-GDR-V1.0`), NASA Moon Trek search items, NASA LaRC POWER satellite/reanalysis values.
- **Derived Calculations**: Horn 3×3 slopes, Terrain Ruggedness Index, 360° curvature-corrected horizon obstruction angles, JPL/IAU solar ephemeris (`astronomy-engine`), Stefan-Boltzmann radiative equilibrium temperature, two-body patched-conic Δv estimates.
- **Unavailable Data**: Reported explicitly as `NASA DATA UNAVAILABLE` (e.g., global sub-1.9 km boulder hazard maps without LROC NAC stereo, live operational launch-day weather forecasts).
- **Simulated Data**: Autonomous landing descent kinematics, simulated onboard nadir camera, and rover traverse playback are strictly isolated and labeled as simulations.
