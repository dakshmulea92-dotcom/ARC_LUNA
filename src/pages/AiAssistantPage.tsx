import React, { useState } from 'react';
import { Bot, Send } from 'lucide-react';
import { useMission } from '../context/MissionContext';
import { CoordinateSelectorBar } from '../components/shared/CoordinateSelectorBar';

interface Message {
  role: 'user' | 'model';
  text: string;
  model?: string;
  sources?: string[];
}

export function AiAssistantPage() {
  const { activeCoordinate, terrain, illuminationNow, illuminationTimeline, suitability, selectedFacility, missions } =
    useMission();

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: 'Welcome to LUNA AI. Every answer is grounded strictly in your active NASA LOLA LDEM_16 measurements, JPL/IAU ephemeris illumination window, and NASA POWER atmospheric registry. Select a sample command below or ask a mission question.',
    },
  ]);

  const commands = [
    'Analyze the lunar south pole terrain and slope suitability at this coordinate.',
    'Explain the sunlight conditions and horizon obstructions at this coordinate.',
    'Explain what crater depth and boulder measurements are available vs unavailable here.',
    'Summarize how to set up an Apollo 11 landing simulation and what is historical vs simulated.',
  ];

  const handleSend = async (textToSend: string) => {
    const clean = textToSend.trim();
    if (!clean || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text: clean }]);
    setPrompt('');
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
              detectedCraters: terrain.detectedCraters.slice(0, 6),
              horizonAnalysis: {
                meanHorizonDeg: terrain.horizonAnalysis.meanHorizonDeg,
                maxHorizonDeg: terrain.horizonAnalysis.maxHorizonDeg,
                skyViewFactor: terrain.horizonAnalysis.skyViewFactor,
              },
              provenance: terrain.provenance,
            }
          : null,
        illuminationNow,
        illumination30Day: {
          illuminationPct: illuminationTimeline.illuminationPct,
          sunlitHours: illuminationTimeline.sunlitHours,
          maxSolarElevationDeg: illuminationTimeline.maxSolarElevationDeg,
          peakSunlightUtc: illuminationTimeline.peakSunlightUtc,
        },
        suitability,
        selectedLaunchFacility: selectedFacility,
        savedMissionsCount: missions.length,
      };

      const res = await fetch('/api/luna-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: clean,
          activeModule: 'AI Mission Assistant (Full Workspace)',
          contextData,
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = (await res.json()) as { answer: string; model: string; groundedSources?: string[] };
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
        { role: 'model', text: 'Failed to reach LUNA AI server endpoint.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight text-slate-100">
          LUNA AI — Internal Scientific Mission Assistant
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Modular server-side AI intelligence grounded in live NASA LOLA, JPL ephemeris, and Moon Trek data with explicit source citations.
        </p>
      </div>

      <CoordinateSelectorBar compact />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-[#0D121C] border border-slate-800 rounded-lg flex flex-col h-[560px]">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
              <Bot className="w-4 h-4 text-cyan-400" />
              LUNA AI Scientific Session
            </div>
            <span className="text-xs font-mono text-slate-400">
              Target: {activeCoordinate.lat.toFixed(2)}°, {activeCoordinate.lon.toFixed(2)}°
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`rounded-md p-3.5 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-cyan-950/40 border border-cyan-800/60 text-slate-100 ml-10'
                    : 'bg-[#07090E] border border-slate-800 text-slate-200 mr-6'
                }`}
              >
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.sources && (
                  <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono">
                    Grounded Sources: {m.sources.join(' · ')}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="text-xs font-mono text-cyan-400">Synthesizing NASA dataset context...</div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend(prompt);
            }}
            className="p-3 border-t border-slate-800 flex gap-2"
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask LUNA AI to interpret elevation, slope, sunlight, or mission trade-offs..."
              className="flex-1 bg-[#07090E] border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-medium text-xs rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          </form>
        </div>

        <div className="bg-[#0D121C] border border-slate-800 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-display font-semibold text-slate-100">
            Example Mission Commands
          </h2>
          <div className="space-y-2">
            {commands.map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => void handleSend(cmd)}
                className="w-full text-left p-2.5 bg-[#07090E] hover:bg-slate-900 border border-slate-800 hover:border-cyan-700 rounded text-xs text-slate-300 cursor-pointer"
              >
                {cmd}
              </button>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-800 space-y-2 text-xs">
            <div className="font-medium text-slate-200">Live Grounded Telemetry Attached</div>
            <div className="bg-[#07090E] border border-slate-800 rounded p-3 font-mono text-[11px] text-slate-300 space-y-1">
              <div>Site: {activeCoordinate.label}</div>
              <div>LOLA Elev: {terrain ? `${terrain.centerElevationM} m` : 'Pending'}</div>
              <div>Slope P95: {terrain ? `${terrain.slopeStats.p95Deg}°` : 'Pending'}</div>
              <div>Solar Elev: {illuminationNow.solarElevationDeg}°</div>
              <div>Suitability: {suitability ? `${suitability.overallScore}/100` : 'Pending'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
