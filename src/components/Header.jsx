import React from 'react';
import { Cpu, Wifi, WifiOff, Settings } from 'lucide-react';

const engineMeta = {
  gemini: { icon: '✦', label: 'Gemini', color: 'text-blue-400' },
  groq: { icon: '⚡', label: 'Groq', color: 'text-orange-400' },
  openrouter: { icon: '◈', label: 'Router', color: 'text-purple-400' },
  wasm: { icon: null, label: 'WASM', color: 'text-neon-green' },
};

const statusConfig = {
  idle: { dot: 'bg-steel-400', label: 'Offline' },
  loading: { dot: 'bg-neon-amber animate-pulse', label: 'Loading' },
  ready: { dot: 'bg-neon-green shadow-[0_0_6px_#00ff88]', label: 'Ready' },
  generating: { dot: 'bg-neon-cyan animate-pulse', label: 'Thinking' },
  error: { dot: 'bg-neon-pink shadow-[0_0_6px_#ff006e]', label: 'Error' },
  needsKey: { dot: 'bg-neon-amber', label: 'Key needed' },
};

export default function Header({ llmStatus, projectName, activeEngine, onMenuToggle, onSettingsOpen }) {
  const s = statusConfig[llmStatus] || statusConfig.idle;
  const eng = activeEngine ? engineMeta[activeEngine] : null;

  return (
    <header className="safe-top glass-panel border-b border-white/5 z-40 relative">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onMenuToggle}
            className="w-8 h-8 flex flex-col items-center justify-center gap-[5px] active:scale-90 transition-transform">
            <span className="w-5 h-[1.5px] bg-neon-green/70 rounded-full" />
            <span className="w-4 h-[1.5px] bg-neon-green/50 rounded-full" />
            <span className="w-3 h-[1.5px] bg-neon-green/30 rounded-full" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-lg font-bold tracking-[0.15em] bg-gradient-to-r from-neon-green to-neon-cyan bg-clip-text text-transparent">
              iclaw
            </h1>
            {projectName && (
              <span className="text-[10px] font-mono text-steel-500 truncate max-w-[100px]">/{projectName}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {eng && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06]">
              {eng.icon ? (
                <span className="text-[10px]">{eng.icon}</span>
              ) : (
                <Cpu size={10} className={eng.color} />
              )}
              <span className={`text-[9px] font-mono ${eng.color} uppercase`}>{eng.label}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${s.dot}`} />
            <span className="text-[9px] font-mono text-steel-500 uppercase tracking-wider">{s.label}</span>
          </div>
          <div className="text-steel-600">
            {navigator.onLine ? <Wifi size={12} /> : <WifiOff size={12} />}
          </div>
          <button onClick={onSettingsOpen} className="p-1.5 rounded-lg hover:bg-white/5 active:scale-90">
            <Settings size={16} className="text-steel-400" />
          </button>
        </div>
      </div>
    </header>
  );
}
