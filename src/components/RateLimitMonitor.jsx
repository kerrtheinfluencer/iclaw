import React, { useState, useEffect } from 'react';
import { BarChart2, RefreshCw, X } from 'lucide-react';

// Free tier daily limits per provider/model (requests/day)
const RATE_LIMITS = {
  gemini: {
    'gemini-2.5-flash': { rpm: 10, rpd: 500, tpm: 250000 },
    'gemini-2.5-pro':   { rpm: 5,  rpd: 25,  tpm: 1000000 },
  },
  groq: {
    'openai/gpt-oss-120b':                        { rpm: 30, rpd: 1000, tpm: 6000 },
    'qwen/qwen3-32b':                             { rpm: 30, rpd: 1000, tpm: 6000 },
    'moonshotai/kimi-k2-instruct-0905':           { rpm: 30, rpd: 1000, tpm: 6000 },
    'llama-3.3-70b-versatile':                    { rpm: 30, rpd: 14400, tpm: 6000 },
    'meta-llama/llama-4-scout-17b-16e-instruct':  { rpm: 30, rpd: 1000, tpm: 6000 },
    'llama-3.1-8b-instant':                       { rpm: 30, rpd: 14400, tpm: 131072 },
  },
  openrouter: {
    'mistralai/mistral-7b-instruct:free':         { rpm: 20, rpd: 200, tpm: 40000 },
    'google/gemma-3-27b-it:free':                 { rpm: 20, rpd: 200, tpm: 40000 },
    'qwen/qwen-2.5-coder-32b-instruct:free':      { rpm: 20, rpd: 200, tpm: 40000 },
    'deepseek/deepseek-r1:free':                  { rpm: 20, rpd: 200, tpm: 40000 },
    'meta-llama/llama-3.2-3b-instruct:free':      { rpm: 20, rpd: 200, tpm: 40000 },
  },
};

const STORAGE_KEY = 'iclaw-rate-usage';

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadUsage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    // Clear old days
    const today = getTodayKey();
    const cleaned = {};
    if (data[today]) cleaned[today] = data[today];
    return cleaned;
  } catch { return {}; }
}

function saveUsage(usage) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(usage)); } catch {}
}

// Call this when a request is made
export function trackRequest(provider, model) {
  const today = getTodayKey();
  const usage = loadUsage();
  if (!usage[today]) usage[today] = {};
  const key = `${provider}:${model}`;
  usage[today][key] = (usage[today][key] || 0) + 1;
  saveUsage(usage);
}

function UsageBar({ used, limit, color }) {
  const pct = Math.min((used / limit) * 100, 100);
  const isWarning = pct > 70;
  const isDanger = pct > 90;
  return (
    <div className="w-full h-1.5 bg-void-300 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          isDanger ? 'bg-neon-pink' : isWarning ? 'bg-neon-amber' : color
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function RateLimitMonitor({ isOpen, onClose, activeEngine, activeModel }) {
  const [usage, setUsage] = useState({});
  const [expanded, setExpanded] = useState({});

  const refresh = () => setUsage(loadUsage());

  useEffect(() => {
    if (isOpen) refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const today = getTodayKey();
  const todayUsage = usage[today] || {};

  const providerColors = {
    gemini: 'bg-blue-400',
    groq: 'bg-orange-400',
    openrouter: 'bg-purple-400',
  };

  const providerLabels = {
    gemini: '✦ Gemini',
    groq: '⚡ Groq',
    openrouter: '◈ OpenRouter',
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-void-950 safe-top safe-bottom">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 glass-panel shrink-0">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} className="text-neon-cyan" />
          <h2 className="font-display text-sm font-semibold tracking-wider text-steel-100">Rate Limits</h2>
          <span className="text-[9px] font-mono text-steel-600">{today}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            <RefreshCw size={13} className="text-steel-500" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            <X size={16} className="text-steel-400" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Active model highlight */}
        {activeEngine && activeModel && (
          <div className="px-3 py-2.5 rounded-xl border border-neon-green/20 bg-neon-green/[0.04]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-neon-green/80 uppercase tracking-wider">Active Model</span>
              <span className="text-[9px] font-mono text-steel-500">{activeEngine}</span>
            </div>
            <p className="text-xs font-mono text-steel-200 mb-2">{activeModel.split('/').pop().replace(':free','')}</p>
            {(() => {
              const limits = RATE_LIMITS[activeEngine]?.[activeModel];
              const used = todayUsage[`${activeEngine}:${activeModel}`] || 0;
              if (!limits) return <p className="text-[10px] text-steel-600">No limit data available</p>;
              return (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-steel-500">Requests today</span>
                    <span className={used > limits.rpd * 0.9 ? 'text-neon-pink' : used > limits.rpd * 0.7 ? 'text-neon-amber' : 'text-neon-green'}>
                      {used} / {limits.rpd}
                    </span>
                  </div>
                  <UsageBar used={used} limit={limits.rpd} color="bg-neon-green" />
                  <div className="flex gap-3 mt-1">
                    <span className="text-[9px] font-mono text-steel-600">{limits.rpm} req/min</span>
                    <span className="text-[9px] font-mono text-steel-600">{(limits.tpm/1000).toFixed(0)}K tok/min</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* All providers */}
        {Object.entries(RATE_LIMITS).map(([provider, models]) => {
          const color = providerColors[provider];
          const totalUsed = Object.entries(todayUsage)
            .filter(([k]) => k.startsWith(provider + ':'))
            .reduce((sum, [, v]) => sum + v, 0);

          return (
            <div key={provider} className="space-y-2">
              <button
                onClick={() => setExpanded(prev => ({ ...prev, [provider]: !prev[provider] }))}
                className="w-full flex items-center justify-between"
              >
                <span className="text-[11px] font-mono font-medium text-steel-300">
                  {providerLabels[provider]}
                </span>
                <span className="text-[9px] font-mono text-steel-600">
                  {totalUsed} reqs today
                </span>
              </button>

              {(expanded[provider] || activeEngine === provider) && (
                <div className="space-y-3 pl-2">
                  {Object.entries(models).map(([modelId, limits]) => {
                    const used = todayUsage[`${provider}:${modelId}`] || 0;
                    const pct = Math.round((used / limits.rpd) * 100);
                    const isActive = activeEngine === provider && activeModel === modelId;

                    return (
                      <div key={modelId} className={`space-y-1.5 ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {isActive && <div className="w-1 h-1 rounded-full bg-neon-green animate-pulse" />}
                            <span className="text-[10px] font-mono text-steel-300 truncate max-w-[180px]">
                              {modelId.split('/').pop().replace(':free', '')}
                            </span>
                          </div>
                          <span className={`text-[10px] font-mono ${
                            pct > 90 ? 'text-neon-pink' : pct > 70 ? 'text-neon-amber' : 'text-steel-500'
                          }`}>
                            {used}/{limits.rpd}
                          </span>
                        </div>
                        <UsageBar used={used} limit={limits.rpd} color={color} />
                        <div className="flex gap-3">
                          <span className="text-[9px] font-mono text-steel-700">{limits.rpm} rpm</span>
                          <span className="text-[9px] font-mono text-steel-700">{(limits.tpm/1000).toFixed(0)}K tpm</span>
                          {pct > 0 && <span className="text-[9px] font-mono text-steel-600">{pct}% used</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="text-[9px] font-mono text-steel-700 text-center pt-2">
          Limits reset daily at midnight UTC · Usage tracked locally
        </div>
      </div>
    </div>
  );
}
