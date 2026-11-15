import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  computeIlluminationTimeline,
  computeLunarIllumination,
  type IlluminationWindowSummary,
  type LunarIlluminationState,
} from '../lib/lunarEphemeris';
import { GLOBAL_LAUNCH_FACILITIES, LUNAR_SITE_PRESETS } from '../lib/nasaCatalog';
import { DEFAULT_SCORING_WEIGHTS, evaluateLandingSite, type LandingSuitabilityAssessment } from '../lib/scoringEngine';
import type {
  AppPageId,
  AppSettings,
  LaunchFacility,
  LunarCoordinate,
  SavedCoordinate,
  SavedMission,
  TerrainAnalysisResult,
} from '../types/lunar';

interface AppNotification {
  id: string;
  title: string;
  tone: 'info' | 'warning' | 'error' | 'success';
}

interface MissionContextValue {
  activePage: AppPageId;
  setActivePage: (page: AppPageId) => void;
  activeCoordinate: LunarCoordinate;
  selectCoordinate: (coord: LunarCoordinate) => void;
  analysisRadiusKm: number;
  setAnalysisRadiusKm: (r: number) => void;
  analysisDateIso: string;
  setAnalysisDateIso: (iso: string) => void;
  terrain: TerrainAnalysisResult | null;
  terrainLoading: boolean;
  terrainError: string | null;
  refreshTerrain: () => void;
  illuminationNow: LunarIlluminationState;
  illuminationTimeline: IlluminationWindowSummary;
  suitability: LandingSuitabilityAssessment | null;
  selectedFacility: LaunchFacility;
  setSelectedFacilityId: (id: string) => void;
  savedCoordinates: SavedCoordinate[];
  addSavedCoordinate: (coord: Omit<SavedCoordinate, 'id' | 'createdAtUtc'>) => Promise<void>;
  removeSavedCoordinate: (id: string) => Promise<void>;
  missions: SavedMission[];
  createMission: (mission: Omit<SavedMission, 'id' | 'createdAtUtc'>) => Promise<SavedMission | null>;
  removeMission: (id: string) => Promise<void>;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  aiDrawerOpen: boolean;
  setAiDrawerOpen: (open: boolean) => void;
  notifications: AppNotification[];
  pushNotification: (title: string, tone?: AppNotification['tone']) => void;
  dismissNotification: (id: string) => void;
  formatLon: (lon: number) => string;
}

const MissionContext = createContext<MissionContextValue | null>(null);

const SETTINGS_STORAGE_KEY = 'arc-luna-settings-v1';

function loadInitialSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        lightweightMode: Boolean(parsed.lightweightMode),
        lonFormat: parsed.lonFormat === 'east360' ? 'east360' : 'signed180',
        defaultRadiusKm: parsed.defaultRadiusKm ?? 30,
        defaultWeights: { ...DEFAULT_SCORING_WEIGHTS, ...(parsed.defaultWeights ?? {}) },
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    lightweightMode: false,
    lonFormat: 'signed180',
    defaultRadiusKm: 30,
    defaultWeights: DEFAULT_SCORING_WEIGHTS,
  };
}

export function MissionProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadInitialSettings);
  const [activePage, setActivePage] = useState<AppPageId>('command-center');
  const [activeCoordinate, setActiveCoordinate] = useState<LunarCoordinate>({
    lat: LUNAR_SITE_PRESETS[0].lat,
    lon: LUNAR_SITE_PRESETS[0].lon,
    label: LUNAR_SITE_PRESETS[0].label,
    region: LUNAR_SITE_PRESETS[0].region,
    source: LUNAR_SITE_PRESETS[0].source,
  });
  const [analysisRadiusKm, setAnalysisRadiusKm] = useState<number>(settings.defaultRadiusKm);
  const [analysisDateIso, setAnalysisDateIso] = useState<string>(() => new Date().toISOString());

  const [terrain, setTerrain] = useState<TerrainAnalysisResult | null>(null);
  const [terrainLoading, setTerrainLoading] = useState<boolean>(false);
  const [terrainError, setTerrainError] = useState<string | null>(null);

  const [selectedFacilityId, setSelectedFacilityId] = useState<string>(GLOBAL_LAUNCH_FACILITIES[0].id);
  const [savedCoordinates, setSavedCoordinates] = useState<SavedCoordinate[]>([]);
  const [missions, setMissions] = useState<SavedMission[]>([]);
  const [aiDrawerOpen, setAiDrawerOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const pushNotification = useCallback((title: string, tone: AppNotification['tone'] = 'info') => {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setNotifications((prev) => [{ id, title, tone }, ...prev].slice(0, 4));
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4500);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const selectCoordinate = useCallback((coord: LunarCoordinate) => {
    const lat = Math.max(-90, Math.min(90, Number(coord.lat)));
    let lon = Number(coord.lon);
    lon = (((lon % 360) + 360) % 360);
    if (lon > 180) lon -= 360;
    setActiveCoordinate({
      ...coord,
      lat: Number(lat.toFixed(5)),
      lon: Number(lon.toFixed(5)),
    });
  }, []);

  const fetchTerrain = useCallback(async () => {
    setTerrainLoading(true);
    setTerrainError(null);
    try {
      const gridSize = settings.lightweightMode ? 25 : 33;
      const url = `/api/lola/analyze?lat=${activeCoordinate.lat}&lon=${activeCoordinate.lon}&radiusKm=${analysisRadiusKm}&gridSize=${gridSize}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'NASA DATA UNAVAILABLE');
      }
      setTerrain(data as TerrainAnalysisResult);
    } catch (err) {
      setTerrainError(err instanceof Error ? err.message : 'NASA DATA UNAVAILABLE');
      setTerrain(null);
    } finally {
      setTerrainLoading(false);
    }
  }, [activeCoordinate.lat, activeCoordinate.lon, analysisRadiusKm, settings.lightweightMode]);

  useEffect(() => {
    void fetchTerrain();
  }, [fetchTerrain]);

  useEffect(() => {
    void (async () => {
      try {
        const [coordRes, msnRes] = await Promise.all([
          fetch('/api/coordinates'),
          fetch('/api/missions'),
        ]);
        if (coordRes.ok) {
          const cData = (await coordRes.json()) as { coordinates: SavedCoordinate[] };
          setSavedCoordinates(cData.coordinates ?? []);
        }
        if (msnRes.ok) {
          const mData = (await msnRes.json()) as { missions: SavedMission[] };
          setMissions(mData.missions ?? []);
        }
      } catch {
        // silent initial fetch error
      }
    })();
  }, []);

  const addSavedCoordinate = useCallback(
    async (coord: Omit<SavedCoordinate, 'id' | 'createdAtUtc'>) => {
      const res = await fetch('/api/coordinates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coord),
      });
      if (res.ok) {
        const data = (await res.json()) as { coordinate: SavedCoordinate };
        setSavedCoordinates((prev) => [data.coordinate, ...prev]);
        pushNotification(`Saved lunar coordinate: ${data.coordinate.name}`, 'success');
      }
    },
    [pushNotification],
  );

  const removeSavedCoordinate = useCallback(async (id: string) => {
    const res = await fetch(`/api/coordinates/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      setSavedCoordinates((prev) => prev.filter((c) => c.id !== id));
    }
  }, []);

  const createMission = useCallback(
    async (mission: Omit<SavedMission, 'id' | 'createdAtUtc'>) => {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mission),
      });
      if (!res.ok) {
        pushNotification('Failed to save mission profile', 'error');
        return null;
      }
      const data = (await res.json()) as { mission: SavedMission };
      setMissions((prev) => [data.mission, ...prev]);
      pushNotification(`Mission saved: ${data.mission.name}`, 'success');
      return data.mission;
    },
    [pushNotification],
  );

  const removeMission = useCallback(async (id: string) => {
    const res = await fetch(`/api/missions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      setMissions((prev) => prev.filter((m) => m.id !== id));
      pushNotification('Mission profile removed', 'info');
    }
  }, [pushNotification]);

  const illuminationNow = useMemo(() => {
    const d = new Date(analysisDateIso);
    const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
    return computeLunarIllumination(
      activeCoordinate.lat,
      activeCoordinate.lon,
      validDate,
      terrain?.horizonAnalysis.samples,
    );
  }, [activeCoordinate.lat, activeCoordinate.lon, analysisDateIso, terrain]);

  const illuminationTimeline = useMemo(() => {
    const d = new Date(analysisDateIso);
    const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
    return computeIlluminationTimeline(
      activeCoordinate.lat,
      activeCoordinate.lon,
      validDate,
      30,
      terrain?.horizonAnalysis.samples,
    );
  }, [activeCoordinate.lat, activeCoordinate.lon, analysisDateIso, terrain]);

  const suitability = useMemo(() => {
    if (!terrain) return null;
    return evaluateLandingSite(terrain, illuminationTimeline, settings.defaultWeights);
  }, [terrain, illuminationTimeline, settings.defaultWeights]);

  const selectedFacility = useMemo(() => {
    return (
      GLOBAL_LAUNCH_FACILITIES.find((f) => f.id === selectedFacilityId) ??
      GLOBAL_LAUNCH_FACILITIES[0]
    );
  }, [selectedFacilityId]);

  const formatLon = useCallback(
    (lon: number) => {
      if (settings.lonFormat === 'east360') {
        const l360 = ((lon % 360) + 360) % 360;
        return `${l360.toFixed(3)}° E`;
      }
      return `${lon >= 0 ? '+' : ''}${lon.toFixed(3)}°`;
    },
    [settings.lonFormat],
  );

  const value: MissionContextValue = {
    activePage,
    setActivePage,
    activeCoordinate,
    selectCoordinate,
    analysisRadiusKm,
    setAnalysisRadiusKm,
    analysisDateIso,
    setAnalysisDateIso,
    terrain,
    terrainLoading,
    terrainError,
    refreshTerrain: fetchTerrain,
    illuminationNow,
    illuminationTimeline,
    suitability,
    selectedFacility,
    setSelectedFacilityId,
    savedCoordinates,
    addSavedCoordinate,
    removeSavedCoordinate,
    missions,
    createMission,
    removeMission,
    settings,
    updateSettings,
    aiDrawerOpen,
    setAiDrawerOpen,
    notifications,
    pushNotification,
    dismissNotification,
    formatLon,
  };

  return <MissionContext.Provider value={value}>{children}</MissionContext.Provider>;
}

export function useMission() {
  const ctx = useContext(MissionContext);
  if (!ctx) throw new Error('useMission must be used inside MissionProvider');
  return ctx;
}
