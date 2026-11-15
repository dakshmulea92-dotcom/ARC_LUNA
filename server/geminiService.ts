import { GoogleGenAI } from '@google/genai';

const SYSTEM_INSTRUCTION = `You are LUNA AI, the internal planetary science and aerospace engineering assistant of ARC LUNA — LUNASIGHT.

STRICT SCIENTIFIC & DATA PROVENANCE RULES:
1. You MUST rely strictly on the real NASA telemetry, LOLA LDEM_16 measurements, JPL/IAU ephemeris illumination calculations, and NASA POWER atmospheric data provided in the context JSON, plus verified planetary science principles.
2. NEVER invent, estimate, or hallucinate NASA measurements (elevations, slopes, crater depths, temperatures, launch weather, or spacecraft telemetry) that are not in the provided context or verified scientific constants.
3. If data is missing or marked "NASA DATA UNAVAILABLE" (such as sub-1.9 km meter-scale boulder density without local LROC NAC stereo DEMs, or live launch-day operational weather forecasts), explicitly state that it is unavailable.
4. Always distinguish clearly between:
   - [MEASURED NASA DATA] (e.g., LRO LOLA LDEM_16 elevation, NASA POWER historical climatology)
   - [DERIVED PHYSICAL CALCULATION] (e.g., Horn 3x3 slope from LOLA, JPL ephemeris solar incidence, radiative equilibrium temperature)
   - [SIMULATED] (e.g., autonomous descent trajectory or rover traverse)
5. Cite the dataset IDs (e.g., LRO-L-LOLA-4-GDR-V1.0 LDEM_16, NASA Moon Trek, NASA POWER, JPL/IAU Ephemeris) concisely and clearly.
6. Format responses cleanly with short structured sections, exact units (m, km, deg, K, W/m^2), and actionable aerospace insight.`;

export interface LunaAiRequest {
  prompt: string;
  activeModule: string;
  contextData: Record<string, unknown>;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
}

export async function queryLunaAi(req: LunaAiRequest): Promise<{
  answer: string;
  model: string;
  groundedSources: string[];
  aiAvailable: boolean;
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      aiAvailable: false,
      model: 'offline-deterministic-fallback',
      groundedSources: ['LRO-L-LOLA-4-GDR-V1.0 (LDEM_16)', 'JPL/IAU Ephemeris'],
      answer: buildDeterministicFallback(req),
      error: 'GEMINI_API_KEY is not configured in environment secrets. Showing deterministic telemetry summary.',
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const contextBlock = JSON.stringify(req.contextData, null, 2).slice(0, 14000);
  const historyLines = (req.history ?? [])
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'ENGINEER' : 'LUNA AI'}: ${h.text}`)
    .join('\n');

  const fullPrompt = [
    `ACTIVE MODULE: ${req.activeModule}`,
    `VERIFIED APPLICATION TELEMETRY & NASA CONTEXT:\n${contextBlock}`,
    historyLines ? `RECENT CONVERSATION:\n${historyLines}` : '',
    `USER REQUEST: ${req.prompt}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: fullPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });
      const text = response.text?.trim();
      if (!text) {
        throw new Error('Empty response from Gemini model.');
      }
      return {
        answer: text,
        model: 'gemini-4-hydrogen',
        groundedSources: [
          'LRO-L-LOLA-4-GDR-V1.0 (LDEM_16)',
          'JPL/IAU Ephemeris (astronomy-engine)',
          'NASA Moon Trek / POWER',
        ],
        aiAvailable: true,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Gemini request failed';
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  return {
    aiAvailable: false,
    model: 'offline-deterministic-fallback',
    groundedSources: ['LRO-L-LOLA-4-GDR-V1.0 (LDEM_16)'],
    answer: buildDeterministicFallback(req),
    error: lastError,
  };
}

function buildDeterministicFallback(req: LunaAiRequest): string {
  const ctx = req.contextData as Record<string, unknown>;
  const coord = ctx.coordinate as { lat?: number; lon?: number; label?: string } | undefined;
  const terrain = ctx.terrain as {
    centerElevationM?: number;
    slopeStats?: { meanDeg?: number; maxDeg?: number; p95Deg?: number; suitabilityClass?: string };
    roughness?: { triMeters?: number; subMeterBoulderData?: string };
  } | undefined;

  const lines = [
    `LUNA AI (Deterministic Grounded Telemetry Summary — ${req.activeModule})`,
    '',
  ];
  if (coord) {
    lines.push(`Target Coordinate: ${coord.label ?? 'Custom'} (${coord.lat}°, ${coord.lon}° E)`);
  }
  if (terrain) {
    lines.push(
      `[MEASURED NASA DATA — LOLA LDEM_16] Center Elevation: ${terrain.centerElevationM ?? 'N/A'} m relative to 1,737.4 km reference sphere.`,
    );
    if (terrain.slopeStats) {
      lines.push(
        `[DERIVED FROM LOLA LDEM_16] Slope: Mean ${terrain.slopeStats.meanDeg}°, P95 ${terrain.slopeStats.p95Deg}°, Max ${terrain.slopeStats.maxDeg}° (${terrain.slopeStats.suitabilityClass}).`,
      );
    }
    if (terrain.roughness) {
      lines.push(
        `[DATA LIMITATION] Sub-meter boulder density: ${terrain.roughness.subMeterBoulderData ?? 'NASA DATA UNAVAILABLE'} at 1,895 m/px LOLA global baseline.`,
      );
    }
  } else {
    lines.push('No active terrain telemetry patch was attached to this query.');
  }
  return lines.join('\n');
}
