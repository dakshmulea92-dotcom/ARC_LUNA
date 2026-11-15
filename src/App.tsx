import React from 'react';
import {
  Activity,
  Bot,
  Compass,
  Database,
  Globe,
  LayoutDashboard,
  MapPin,
  Menu,
  Mountain,
  Rocket,
  Settings,
  ShieldCheck,
  Sun,
  Thermometer,
  Truck,
  X,
} from 'lucide-react';
import { MissionProvider, useMission } from './context/MissionContext';
import { LunaAiDrawer } from './components/shared/LunaAiDrawer';
import { CommandCenterPage } from './pages/CommandCenterPage';
import { LunarExplorerPage } from './pages/LunarExplorerPage';
import { LandingIntelligencePage } from './pages/LandingIntelligencePage';
import { TerrainIntelligencePage } from './pages/TerrainIntelligencePage';
import { EnvironmentalExplorerPage } from './pages/EnvironmentalExplorerPage';
import { SunlightAnalyzerPage } from './pages/SunlightAnalyzerPage';
import { EarthExplorerPage } from './pages/EarthExplorerPage';
import { MissionPlannerPage } from './pages/MissionPlannerPage';
import { LandingSimulatorPage } from './pages/LandingSimulatorPage';
import { RoverExplorerPage } from './pages/RoverExplorerPage';
import { AiAssistantPage } from './pages/AiAssistantPage';
import { DataCenterPage } from './pages/DataCenterPage';
import { SettingsPage } from './pages/SettingsPage';
import type { AppPageId } from './types/lunar';

const NAV_ITEMS: Array<{ id: AppPageId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'command-center', label: 'Mission Command Center', icon: LayoutDashboard },
  { id: 'lunar-explorer', label: 'Lunar Explorer', icon: Compass },
  { id: 'landing-intelligence', label: 'Landing Site Intelligence', icon: ShieldCheck },
  { id: 'terrain-intelligence', label: 'Terrain Intelligence', icon: Mountain },
  { id: 'environmental-explorer', label: 'Lunar Environmental', icon: Thermometer },
  { id: 'sunlight-analyzer', label: 'Sunlight & Illumination', icon: Sun },
  { id: 'earth-explorer', label: 'Earth Explorer', icon: Globe },
  { id: 'mission-planner', label: 'Mission Planner', icon: MapPin },
  { id: 'landing-simulator', label: 'Autonomous Landing Sim', icon: Rocket },
  { id: 'rover-explorer', label: 'Rover Explorer', icon: Truck },
  { id: 'ai-assistant', label: 'AI Mission Assistant', icon: Bot },
  { id: 'data-center', label: 'Data & Research Center', icon: Database },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function AppShell() {
  const {
    activePage,
    setActivePage,
    activeCoordinate,
    terrain,
    terrainLoading,
    aiDrawerOpen,
    setAiDrawerOpen,
    notifications,
    dismissNotification,
    formatLon,
  } = useMission();

  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  const renderPage = () => {
    switch (activePage) {
      case 'command-center':
        return <CommandCenterPage />;
      case 'lunar-explorer':
        return <LunarExplorerPage />;
      case 'landing-intelligence':
        return <LandingIntelligencePage />;
      case 'terrain-intelligence':
        return <TerrainIntelligencePage />;
      case 'environmental-explorer':
        return <EnvironmentalExplorerPage />;
      case 'sunlight-analyzer':
        return <SunlightAnalyzerPage />;
      case 'earth-explorer':
        return <EarthExplorerPage />;
      case 'mission-planner':
        return <MissionPlannerPage />;
      case 'landing-simulator':
        return <LandingSimulatorPage />;
      case 'rover-explorer':
        return <RoverExplorerPage />;
      case 'ai-assistant':
        return <AiAssistantPage />;
      case 'data-center':
        return <DataCenterPage />;
      case 'settings':
        return <SettingsPage />;
    }
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex">
      {/* Persistent Aerospace Sidebar (Desktop) */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-[#0B101B] border-r border-slate-800 flex flex-col transition-transform lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="font-display text-base font-bold tracking-wider text-slate-100 whitespace-nowrap">
              ARC LUNA
            </div>
            <div className="text-[11px] font-mono text-cyan-400 tracking-widest">
              LUNASIGHT
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActivePage(item.id);
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer text-left ${
                  active
                    ? 'bg-cyan-600/15 text-cyan-300 border border-cyan-700/50'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3.5 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div className="text-slate-300 font-medium">Primary Elevation Dataset</div>
          <div className="font-mono text-cyan-400">
            {terrain?.provenance.available ? 'NASA PDS LOLA LDEM_16' : terrainLoading ? 'Querying LOLA...' : 'Checking LOLA...'}
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Scientific Status Header */}
        <header className="sticky top-0 z-20 h-14 bg-[#0B101B] border-b border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 text-slate-300 hover:text-white border border-slate-700 rounded cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 text-xs min-w-0">
              <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-slate-200 font-medium truncate">{activeCoordinate.label}</span>
              <span className="hidden sm:inline text-slate-600" aria-hidden="true">·</span>
              <span className="hidden sm:inline font-mono text-slate-400 whitespace-nowrap">
                {activeCoordinate.lat.toFixed(3)}°, {formatLon(activeCoordinate.lon)}
              </span>
              {terrainLoading && (
                <span className="font-mono text-cyan-400 whitespace-nowrap ml-2">
                  Loading LOLA...
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline text-xs font-mono text-slate-400 whitespace-nowrap">
              {terrain ? `Elev ${terrain.centerElevationM.toFixed(1)} m · P95 ${terrain.slopeStats.p95Deg}°` : 'NASA PDS LOLA'}
            </span>
            <button
              type="button"
              onClick={() => setAiDrawerOpen(!aiDrawerOpen)}
              className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              LUNA AI
            </button>
          </div>
        </header>

        {/* Notifications Stack */}
        {notifications.length > 0 && (
          <div className="fixed top-16 right-4 z-50 space-y-2 w-80 max-w-[calc(100vw-2rem)]">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`px-3.5 py-2.5 rounded-md border text-xs flex items-center justify-between gap-2 shadow-lg ${
                  n.tone === 'error'
                    ? 'bg-rose-950 border-rose-700 text-rose-100'
                    : n.tone === 'warning'
                      ? 'bg-amber-950 border-amber-700 text-amber-100'
                      : 'bg-[#0B101B] border-cyan-700 text-slate-100'
                }`}
              >
                <span>{n.title}</span>
                <button
                  type="button"
                  onClick={() => dismissNotification(n.id)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
          {renderPage()}
        </main>
      </div>

      <LunaAiDrawer />
    </div>
  );
}

export default function App() {
  return (
    <MissionProvider>
      <AppShell />
    </MissionProvider>
  );
}
