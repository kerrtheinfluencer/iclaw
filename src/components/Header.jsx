import React, { useState, useRef, useEffect } from 'react';
import { Cpu, Wifi, WifiOff, Settings, ChevronDown, Check } from 'lucide-react';

const engineMeta = {
  gemini: { // Always-on Google Search
    icon: '✦', label: 'Gemini', color: 'text-blue-400', border: 'border-blue-400/30',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: '⚡ Default · Internet' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: '🧠 Most Powerful' },
    ],
  },
  groq: {
    icon: '⚡', label: 'Groq', color: 'text-orange-400', border: 'border-orange-400/30',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tier: 'Best' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', tier: 'Fastest' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', tier: 'Vision' },
      { id: 'qwen-qwq-32b', label: 'Qwen QwQ 32B', tier: 'Thinking' },
    ],
  },
  openrouter: {
    icon: '◈', label: 'Router', color: 'text-purple-400', border: 'border-purple-400/30',
    models: [
      { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B', tier: 'Most Reliable' },
      { id: 'microsoft/phi-3-mini-128k-instruct:free', label: 'Phi-3 Mini 128K', tier: 'Fast' },
      { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B', tier: 'Smart' },
      { id: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B', tier: 'Compact' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen 2.5 Coder 32B', tier: 'Code' },
      { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1', tier: 'Thinking' },
    ],
  },
  wasm: {
    icon: null, label: 'WASM', color: 'text-neon-green', border: 'border-neon-green/30',
    models: [
      { id: 'qwen2.5-coder-1.5b', label: 'Qwen 1.5B', tier: 'Offline' },
    ],
  },
};

const statusConfig = {
  idle:       { dot: 'bg-steel-400',                           label: 'Offline'  },
  loading:    { dot: 'bg-neon-amber animate-pulse',            label: 'Loading'  },
  ready:      { dot: 'bg-neon-green shadow-[0_0_6px_#00ff88]', label: 'Ready'   },
  generating: { dot: 'bg-neon-cyan animate-pulse',             label: 'Thinking' },
  error:      { dot: 'bg-neon-pink shadow-[0_0_6px_#ff006e]', label: 'Error'    },
  needsKey:   { dot: 'bg-neon-amber',                          label: 'Key needed' },
};

export default function Header({
  llmStatus, projectName, activeEngine, activeModel,
  onMenuToggle, onSettingsOpen, onSelectModel,
}) {
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const s = statusConfig[llmStatus] || statusConfig.idle;
  const eng = activeEngine ? engineMeta[activeEngine] : null;
  const models = eng?.models || [];
  const currentModel = models.find((m) => m.id === activeModel);
  const modelLabel = currentModel?.label || (activeModel ? activeModel.split('/').pop().replace(':free','') : null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setModelMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, []);

  return (
    <header className="safe-top glass-panel border-b border-white/5 z-40 relative">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: hamburger + title */}
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
              <span className="text-[10px] font-mono text-steel-500 truncate max-w-[80px]">/{projectName}</span>
            )}
          </div>
        </div>

        {/* Right: model picker + status + settings */}
        <div className="flex items-center gap-2">

          {/* Model switcher — only when engine is active */}
          {eng && models.length > 0 && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setModelMenuOpen((v) => !v)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.03] border ${eng.border} hover:bg-white/[0.06] active:scale-95 transition-all`}
              >
                {eng.icon ? (
                  <span className="text-[11px]">{eng.icon}</span>
                ) : (
                  <Cpu size={10} className={eng.color} />
                )}
                <span className={`text-[9px] font-mono ${eng.color} uppercase max-w-[80px] truncate`}>
                  {modelLabel || eng.label}
                </span>
                <ChevronDown size={9} className={`${eng.color} opacity-60 ${modelMenuOpen ? 'rotate-180' : ''} transition-transform`} />
              </button>

              {/* Dropdown */}
              {modelMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-white/10 bg-void-950/95 backdrop-blur-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/5">
                    <span className="text-[9px] font-mono text-steel-500 uppercase tracking-wider">Select Model</span>
                  </div>
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { onSelectModel(m.id); setModelMenuOpen(false); }}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.04] active:bg-white/[0.07] transition-colors"
                    >
                      <div className="text-left">
                        <span className={`text-xs ${activeModel === m.id ? eng.color : 'text-steel-200'}`}>{m.label}</span>
                        <p className="text-[9px] font-mono text-steel-600">{m.tier}</p>
                      </div>
                      {activeModel === m.id && <Check size={12} className={eng.color} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Status dot */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${s.dot}`} />
            <span className="text-[9px] font-mono text-steel-500 uppercase tracking-wider hidden sm:inline">{s.label}</span>
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
