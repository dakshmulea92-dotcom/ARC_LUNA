import fs from 'node:fs';
import path from 'node:path';

export interface SavedMission {
  id: string;
  name: string;
  missionType: 'Crewed Lander' | 'Robotic Lander' | 'Polar Rover' | 'Sample Return' | 'Orbital + Descent';
  launchFacilityId: string;
  launchFacilityName: string;
  targetSiteName: string;
  targetLat: number;
  targetLon: number;
  landingDateUtc: string;
  durationDays: number;
  spacecraftConfig: string;
  roverDeployment: boolean;
  minSolarElevationDeg: number;
  objectives: string;
  createdAtUtc: string;
}

export interface SavedCoordinate {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: 'Artemis Candidate' | 'Apollo Historical' | 'Polar Science' | 'Custom';
  notes: string;
  createdAtUtc: string;
}

interface StoreState {
  missions: SavedMission[];
  savedCoordinates: SavedCoordinate[];
}

const STORE_PATH = path.resolve(process.cwd(), 'data', 'arc-luna-store.json');

const DEFAULT_STORE: StoreState = {
  missions: [
    {
      id: 'msn-artemis-connecting-ridge',
      name: 'South Pole Connecting Ridge Recon',
      missionType: 'Crewed Lander',
      launchFacilityId: 'ksc-lc39a',
      launchFacilityName: 'Kennedy Space Center (LC-39A)',
      targetSiteName: 'Shackleton–de Gerlache Connecting Ridge',
      targetLat: -89.45,
      targetLon: 137.3,
      landingDateUtc: '2027-11-15T14:00:00.000Z',
      durationDays: 14,
      spacecraftConfig: 'Human Landing System (Reference Architecture)',
      roverDeployment: true,
      minSolarElevationDeg: 2.0,
      objectives:
        'Assess ridge illumination persistence, slope stability (<10 deg), and proximity to Shackleton PSR volatile cold traps.',
      createdAtUtc: '2026-11-15T00:00:00.000Z',
    },
  ],
  savedCoordinates: [
    {
      id: 'coord-shackleton-rim',
      name: 'Shackleton Crater Rim (Artemis III Region)',
      lat: -89.66,
      lon: 129.2,
      category: 'Artemis Candidate',
      notes: 'High-illumination South Pole rim adjacent to permanently shadowed crater floor.',
      createdAtUtc: '2026-11-15T00:00:00.000Z',
    },
    {
      id: 'coord-apollo-11',
      name: 'Apollo 11 — Tranquility Base',
      lat: 0.67408,
      lon: 23.47297,
      category: 'Apollo Historical',
      notes: 'Official NASA LRO NAC coordinates for Eagle Lunar Module descent stage.',
      createdAtUtc: '2026-11-15T00:00:00.000Z',
    },
  ],
};

function readStore(): StoreState {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StoreState;
      if (Array.isArray(parsed.missions) && Array.isArray(parsed.savedCoordinates)) {
        return parsed;
      }
    }
  } catch {
    // Fall back to default store if corrupted
  }
  writeStore(DEFAULT_STORE);
  return DEFAULT_STORE;
}

function writeStore(state: StoreState) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

export function listMissions(): SavedMission[] {
  return readStore().missions;
}

export function saveMission(mission: Omit<SavedMission, 'id' | 'createdAtUtc'>): SavedMission {
  const state = readStore();
  const created: SavedMission = {
    ...mission,
    id: `msn-${Date.now().toString(36)}`,
    createdAtUtc: new Date().toISOString(),
  };
  state.missions.unshift(created);
  writeStore(state);
  return created;
}

export function deleteMission(id: string): boolean {
  const state = readStore();
  const next = state.missions.filter((m) => m.id !== id);
  if (next.length === state.missions.length) return false;
  state.missions = next;
  writeStore(state);
  return true;
}

export function listSavedCoordinates(): SavedCoordinate[] {
  return readStore().savedCoordinates;
}

export function saveCoordinate(coord: Omit<SavedCoordinate, 'id' | 'createdAtUtc'>): SavedCoordinate {
  const state = readStore();
  const created: SavedCoordinate = {
    ...coord,
    id: `coord-${Date.now().toString(36)}`,
    createdAtUtc: new Date().toISOString(),
  };
  state.savedCoordinates.unshift(created);
  writeStore(state);
  return created;
}

export function deleteCoordinate(id: string): boolean {
  const state = readStore();
  const next = state.savedCoordinates.filter((c) => c.id !== id);
  if (next.length === state.savedCoordinates.length) return false;
  state.savedCoordinates = next;
  writeStore(state);
  return true;
}
