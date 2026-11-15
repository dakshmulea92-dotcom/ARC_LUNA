import React, { useEffect, useState } from 'react';

interface NasaVisualTileProps {
  src: string;
  alt: string;
  label: string;
  sublabel?: string;
  aspectClass?: string;
}

export function NasaVisualTile({
  src,
  alt,
  label,
  sublabel,
  aspectClass = 'aspect-video',
}: NasaVisualTileProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    setStatus('loading');
  }, [src]);

  return (
    <div className="bg-[#07090E] border border-slate-800 rounded-md overflow-hidden flex flex-col">
      <div className={`relative w-full ${aspectClass} bg-[#04060B] flex items-center justify-center overflow-hidden`}>
        {status !== 'error' && (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              status === 'ready' ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-cyan-300">
            Streaming NASA Visual...
          </div>
        )}
        {status === 'error' && (
          <div className="px-3 text-center text-[11px] font-mono text-rose-300">
            NASA DATA UNAVAILABLE
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-medium text-slate-200 truncate">{label}</span>
        {sublabel && <span className="font-mono text-slate-400 shrink-0">{sublabel}</span>}
      </div>
    </div>
  );
}
