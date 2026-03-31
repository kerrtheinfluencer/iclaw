import React, { useState, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';

const RATE_LIMITS = {
  gemini: {
    'gemini-2.5-flash': { rpd: 1500, rpm: 15, tpm: 1000000 },
    'gemini-2.5-pro': { rpd: 1500, rpm: 10, tpm: 800000 },
  },
  groq: {
    'llama-3.3-70b-versatile': { rpd: 14400, rpm: 30, tpm: 6000 },
    'llama-3.1-8b-instant': { rpd: 14400, rpm: 60, tpm: 8000 },
  },
  openrouter: {
    'mistralai/mistral-7b-instruct:free': { rpd: 200, rpm: 20, tpm: 100000 },
    'deepseek/deepseek-r1:free': { rpd: 200, rpm: 10, tpm: 50000 },
  },
};

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function loadUsage() {
  try {
    return JSON.parse(localStorage.getItem('iclaw-usage') || '{}');
  } catch {
    return {};
  }
}

function saveUsage(usage) {
  localStorage.setItem('iclaw-usage', JSON.stringify(usage));
}

function trackRequest(engine, model) {
  const key = `${engine}:${model}`;
  const today = getTodayKey();
  const usage = loadUsage();
  
  if (!usage[today]) usage[today] = {};
  if (!usage[today][key]) usage[today][key] = 0;
  usage[today][key]++;
  
  // Cleanup old entries
  Object.keys(usage).forEach(k => {
    if (k !== today) delete usage[k];
  });
  
  saveUsage(usage);
}

export { trackRequest };

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#0f0f16] border border-[#00ff88]/30 rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <h2 className="text-lg font-bold text-[#e0e0e0]">Rate Limits</h2>
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="p-2 hover:bg-[#333] rounded-lg">
              <RefreshCw className="w-4 h-4 text-[#666]" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-[#333] rounded-lg">
              <X className="w-5 h-5 text-[#666]" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Active model highlight */}
          {activeEngine && activeModel && (
            <div className="p-4 rounded-xl border border-[#00ff88]/30 bg-[#00ff88]/5">
              <div className="text-xs text-[#00ff88] uppercase tracking-wider mb-2">Active Model</div>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${providerColors[activeEngine]}`} />
                <span className="text-[#e0e0e0] font-medium">{activeEngine}</span>
                <span className="text-[#666]">·</span>
                <span className="text-[#888]">{activeModel.split('/').pop().replace(':free','')}</span>
              </div>
              
              {(() => {
                const limits = RATE_LIMITS[activeEngine]?.[activeModel];
                const used = todayUsage[`${activeEngine}:${activeModel}`] || 0;
                if (!limits) return <div className="text-sm text-[#666]">No limit data available</div>;
                
                const pct = (used / limits.rpd) * 100;
                
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#888]">Requests today</span>
                      <span className={pct > 90 ? 'text-red-400' : pct > 70 ? 'text-yellow-400' : 'text-[#00ff88]'}>
                        {used} / {limits.rpd}
                      </span>
                    </div>
                    <div className="h-2 bg-[#1a1a24] rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${pct > 90 ? 'bg-red-400' : pct > 70 ? 'bg-yellow-400' : 'bg-[#00ff88]'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex gap-4 text-xs text-[#666]">
                      <span>{limits.rpm} req/min</span>
                      <span>{(limits.tpm/1000).toFixed(0)}K tok/min</span>
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
              <div key={provider} className="border border-[#333] rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded({ ...expanded, [provider]: !expanded[provider] })}
                  className="w-full flex items-center justify-between p-4 bg-[#1a1a24] hover:bg-[#222]"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${color}`} />
                    <span className="text-[#e0e0e0] font-medium">{providerLabels[provider]}</span>
                  </div>
                  <div className="text-sm text-[#666]">{totalUsed} requests today</div>
                </button>
                
                {(expanded[provider] || activeEngine === provider) && (
                  <div className="p-4 space-y-3">
                    {Object.entries(models).map(([modelId, limits]) => {
                      const used = todayUsage[`${provider}:${modelId}`] || 0;
                      const pct = Math.round((used / limits.rpd) * 100);
                      const isActive = activeEngine === provider && activeModel === modelId;

                      return (
                        <div 
                          key={modelId} 
                          className={`p-3 rounded-lg border ${isActive ? 'border-[#00ff88]/30 bg-[#00ff88]/5' : 'border-[#333] bg-[#0f0f16]'}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" />}
                              <span className="text-sm text-[#e0e0e0]">
                                {modelId.split('/').pop().replace(':free', '')}
                              </span>
                            </div>
                            <span className={`text-sm ${pct > 90 ? 'text-red-400' : pct > 70 ? 'text-yellow-400' : 'text-[#666]'}`}>
                              {used}/{limits.rpd}
                            </span>
                          </div>
                          <div className="h-1 bg-[#1a1a24] rounded-full overflow-hidden mb-2">
                            <div 
                              className={`h-full rounded-full ${pct > 90 ? 'bg-red-400' : pct > 70 ? 'bg-yellow-400' : color}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-[#666]">
                            <span>{limits.rpm} rpm · {(limits.tpm/1000).toFixed(0)}K tpm</span>
                            {pct > 0 && <span>{pct}% used</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-[#333] text-center text-xs text-[#666]">
          Limits reset daily at midnight UTC · Usage tracked locally
        </div>
      </div>
    </div>
  );
}
