import React from 'react';
import { ExternalLink } from 'lucide-react';

interface ProvenanceBarProps {
  sourceName: string;
  datasetId: string;
  classification: 'Measured NASA Data' | 'Derived Scientific Calculation' | 'Climatology / Historical Observation' | 'Simulated Environment';
  resolution?: string;
  units?: string;
  observationPeriod?: string;
  crs?: string;
  sourceUrl?: string;
}

export function ProvenanceBar({
  sourceName,
  datasetId,
  classification,
  resolution,
  units,
  observationPeriod,
  crs,
  sourceUrl,
}: ProvenanceBarProps) {
  const toneClass =
    classification === 'Measured NASA Data'
      ? 'text-cyan-400'
      : classification === 'Derived Scientific Calculation'
        ? 'text-sky-300'
        : classification === 'Climatology / Historical Observation'
          ? 'text-amber-300'
          : 'text-violet-300';

  return (
    <div className="border-t border-slate-800/80 pt-2.5 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
      <span className={`font-medium ${toneClass}`}>{classification}</span>
      <span aria-hidden="true">·</span>
      <span className="text-slate-300">{sourceName}</span>
      <span aria-hidden="true">·</span>
      <span className="font-mono text-slate-300">{datasetId}</span>
      {resolution && (
        <>
          <span aria-hidden="true">·</span>
          <span>Resolution: {resolution}</span>
        </>
      )}
      {units && (
        <>
          <span aria-hidden="true">·</span>
          <span>Units: {units}</span>
        </>
      )}
      {observationPeriod && (
        <>
          <span aria-hidden="true">·</span>
          <span>Period: {observationPeriod}</span>
        </>
      )}
      {crs && (
        <>
          <span aria-hidden="true">·</span>
          <span>CRS: {crs}</span>
        </>
      )}
      {sourceUrl && (
        <>
          <span aria-hidden="true">·</span>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
          >
            Source
            <ExternalLink className="w-3 h-3" />
          </a>
        </>
      )}
    </div>
  );
}
