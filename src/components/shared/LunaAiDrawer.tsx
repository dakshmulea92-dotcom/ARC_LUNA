import React, { useState } from 'react';
import { Bot, Send, X } from 'lucide-react';
import { useMission } from '../../context/MissionContext';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  model?: string;
  sources?: string[];
}

const PAGE_LABELS: Record<string, string> = {
  'command-center': 'Mission Command Center',
  'lunar-explorer': 'Lunar Explorer (3D Globe)',
  'landing-intelligence': 'Landing Site Intelligence',
  'terrain-intelligence': 'Terrain Intelligence (NASA LOLA)',
  'environmental-explorer': 'Lunar Environmental Explorer',
  'sunlight-analyzer': 'Sunlight & Illumination Analyzer',
  'earth-explorer': 'Earth Explorer & Launch Facilities',
  'mission-planner': 'Mission Planner',
  'landing-simulator': 'Autonomous Landing Simulator',
  'rover-explorer': 'Rover Explorer',
  'ai-assistant': 'LUNA AI Assistant',
  'data-center': 'Data & Research Center',
  settings: 'Settings',
};

export function LunaAiDrawer() {
  const {
    aiDrawerOpen,
    setAiDrawerOpen,
    activePage,
    activeCoordinate,
    terrain,
    illuminationNow,
    suitability,
    selectedFacility,
  } = useMission();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'LUNA AI connected to active NASA LOLA LDEM_16 telemetry and JPL/IAU ephemeris. Ask about terrain slopes, crater hazards, solar illumination windows, or landing site suitability.',
    },
  ]);

  if (!aiDrawerOpen) return null;

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      const contextData = {
        coordinate: activeCoordinate,
        terrain: terrain
          ? {
              centerElevationM: terrain.centerElevationM,
              elevationStats: terrain.elevationStats,
              slopeStats: terrain.slopeStats,
              roughness: terrain.roughness,
              detectedCratersCount: terrain.detectedCraters.length,
              nearestCraters: terrain.detectedCraters.slice(0, 4),
              horizonAnalysis: {
                meanHorizonDeg: terrain.horizonAnalysis.meanHorizonDeg,
                maxHorizonDeg: terrain.horizonAnalysis.maxHorizonDeg,
                skyViewFactor: terrain.horizonAnalysis.skyViewFactor,
              },
              provenance: {
                datasetId: terrain.provenance.datasetId,
                productId: terrain.provenance.productId,
                resolutionM: terrain.provenance.resolutionMetersAtEquator,
              },
            }
          : null,
        illuminationNow,
        suitability,
        selectedLaunchFacility: selectedFacility,
      };

      const res = await fetch('/api/luna-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          activeModule: PAGE_LABELS[activePage] ?? activePage,
          contextData,
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = (await res.json()) as {
        answer: string;
        model: string;
        groundedSources?: string[];
      };
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: data.answer,
          model: data.model,
          sources: data.groundedSources,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: 'Unable to reach server LUNA AI endpoint. Check server logs or network status.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    'Interpret LOLA slope and roughness here',
    'Explain sunlight & horizon obstruction at this coordinate',
    'What data is missing before committing a lander?',
  ];

  return (
    <aside className="fixed right-4 bottom-4 z-40 w-[400px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[80vh] bg-[#0B101B] border border-slate-700 rounded-lg shadow-2xl flex flex-col">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-cyan-400" />
          <span className="font-display text-sm font-semibold text-slate-100">LUNA AI · Contextual Brief</span>
        </div>
        <button
          type="button"
          onClick={() => setAiDrawerOpen(false)}
          className="text-slate-400 hover:text-slate-100 p-1 cursor-pointer"
          aria-label="Close LUNA AI drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2 bg-[#07090E] border-b border-slate-800 text-xs text-slate-400 flex items-center justify-between">
        <span className="truncate">{activeCoordinate.label}</span>
        <span className="font-mono shrink-0">
          {activeCoordinate.lat.toFixed(2)}°, {activeCoordinate.lon.toFixed(2)}°
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-xs leading-relaxed rounded-md p-3 ${
              m.role === 'user'
                ? 'bg-cyan-950/50 border border-cyan-800/60 text-slate-100 ml-6'
                : 'bg-[#07090E] border border-slate-800 text-slate-200 mr-2'
            }`}
          >
            <div className="whitespace-pre-wrap">{m.text}</div>
            {m.sources && m.sources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                Sources: {m.sources.join(' · ')}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-xs text-cyan-400 font-mono px-1">Analyzing NASA telemetry context...</div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-slate-800 flex flex-wrap gap-1.5">
        {quickPrompts.map((qp) => (
          <button
            key={qp}
            type="button"
            onClick={() => void sendPrompt(qp)}
            className="text-[11px] px-2 py-1 bg-[#07090E] hover:bg-slate-800 border border-slate-700 rounded text-slate-300 cursor-pointer"
          >
            {qp}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendPrompt(input);
        }}
        className="p-3 border-t border-slate-800 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask LUNA AI about this site..."
          className="flex-1 bg-[#07090E] border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 rounded-md text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </aside>
  );
}
