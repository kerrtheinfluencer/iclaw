import React, { useState, useEffect } from 'react';
import {
  X, Cpu, Check, Eye, EyeOff,
  ExternalLink, HardDrive,
} from 'lucide-react';
import { getSetting, setSetting, getStorageEstimate } from '../utils/db.js';

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    icon: '✦',
    color: 'text-blue-400',
    borderColor: 'border-blue-400/30',
    bgColor: 'bg-blue-400/5',
    tagColor: 'text-blue-400 bg-blue-400/10',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza...',
    limits: '🌐 Always-on Google Search · 1500 req/day free',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: '⚡ Default · Internet' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: '🧠 Most Powerful' },
    ],
  },
  groq: {
    name: 'Groq',
    icon: '⚡',
    color: 'text-orange-400',
    borderColor: 'border-orange-400/30',
    bgColor: 'bg-orange-400/5',
    tagColor: 'text-orange-400 bg-orange-400/10',
    keyUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_...',
    limits: 'Free: 14400 req/day · Fastest inference',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tier: 'Best' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', tier: 'Fastest' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', tier: 'Vision' },
      { id: 'qwen-qwq-32b', label: 'Qwen QwQ 32B', tier: 'Thinking' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    icon: '◈',
    color: 'text-purple-400',
    borderColor: 'border-purple-400/30',
    bgColor: 'bg-purple-400/5',
    tagColor: 'text-purple-400 bg-purple-400/10',
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-...',
    limits: 'Free models · Must enable free endpoints in guardrails',
    models: [
      { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B', tier: 'Most Reliable' },
      { id: 'microsoft/phi-3-mini-128k-instruct:free', label: 'Phi-3 Mini 128K', tier: 'Fast' },
      { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B', tier: 'Smart' },
      { id: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B', tier: 'Compact' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen 2.5 Coder 32B', tier: 'Code' },
      { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1', tier: 'Thinking' },
    ],
  },
};

export default function SettingsPanel({
  isOpen, onClose, onSelectEngine, onSetKey,
  activeEngine, llmStatus, activeModel, onSelectModel,
}) {
  const [keys, setKeys] = useState({ gemini: '', groq: '', openrouter: '' });
  const [showKeys, setShowKeys] = useState({});
  const [storage, setStorage] = useState(null);
  const [savedProvider, setSavedProvider] = useState(null);

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        getSetting('key_gemini', ''),
        getSetting('key_groq', ''),
        getSetting('key_openrouter', ''),
      ]).then(([g, gr, or]) => setKeys({ gemini: g, groq: gr, openrouter: or }));
      getStorageEstimate().then(setStorage);
    }
  }, [isOpen]);

  const handleSaveKey = async (provider) => {
    const key = keys[provider];
    await setSetting(`key_${provider}`, key);
    onSetKey(provider, key);
    setSavedProvider(provider);
    setTimeout(() => setSavedProvider(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void-950 safe-top safe-bottom">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 glass-panel">
        <h2 className="font-display text-sm font-semibold tracking-wider text-steel-100">Settings</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 active:scale-90">
          <X size={18} className="text-steel-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neon-green/[0.04] border border-neon-green/15">
          <span className="text-sm">🆓</span>
          <p className="text-[11px] text-neon-green/80 font-medium">
            All engines are 100% free. No credit card required anywhere.
          </p>
        </div>

        {Object.entries(PROVIDERS).map(([id, prov]) => {
          const isActive = activeEngine === id;
          const hasKey = !!keys[id];

          return (
            <section key={id} className={`rounded-xl border p-3 space-y-3 transition-all ${
              isActive ? prov.borderColor + ' ' + prov.bgColor : 'border-white/[0.06]'
            }`}>
              <button
                onClick={() => { if (hasKey) onSelectEngine(id); }}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{prov.icon}</span>
                  <div className="text-left">
                    <span className={`text-sm font-medium ${isActive ? prov.color : 'text-steel-200'}`}>
                      {prov.name}
                    </span>
                    <p className="text-[10px] text-steel-500">{prov.limits}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasKey && <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${prov.tagColor}`}>Key set</span>}
                  {isActive && <Check size={14} className={prov.color} />}
                </div>
              </button>

              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showKeys[id] ? 'text' : 'password'}
                    value={keys[id]}
                    onChange={(e) => setKeys({ ...keys, [id]: e.target.value })}
                    placeholder={prov.keyPlaceholder}
                    className="input-stealth text-xs pr-8 py-2"
                  />
                  <button
                    onClick={() => setShowKeys({ ...showKeys, [id]: !showKeys[id] })}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1"
                  >
                    {showKeys[id] ? <EyeOff size={12} className="text-steel-600" /> : <Eye size={12} className="text-steel-600" />}
                  </button>
                </div>
                <button
                  onClick={() => handleSaveKey(id)}
                  disabled={!keys[id].trim()}
                  className={`px-3 py-2 rounded-lg text-[10px] font-mono font-medium transition-all active:scale-95
                    disabled:opacity-20 ${savedProvider === id ? 'bg-neon-green/15 text-neon-green' : 'bg-white/5 text-steel-300'}`}
                >
                  {savedProvider === id ? '✓' : 'Save'}
                </button>
              </div>

              <a
                href={prov.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] text-steel-500 hover:text-steel-300 transition-colors"
              >
                <ExternalLink size={10} />
                Get free API key → {prov.keyUrl.replace('https://', '')}
              </a>

              {isActive && hasKey && (
                <div className="space-y-1 pt-1 border-t border-white/[0.04]">
                  <span className="text-[10px] font-mono text-steel-500 uppercase">Model</span>
                  {prov.models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onSelectModel(m.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg transition-all active:scale-[0.98]
                        ${activeModel === m.id ? prov.bgColor + ' ' + prov.borderColor + ' border' : 'hover:bg-white/[0.02]'}`}
                    >
                      <span className={`text-xs ${activeModel === m.id ? prov.color : 'text-steel-300'}`}>{m.label}</span>
                      <span className="text-[9px] font-mono text-steel-600">{m.tier}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {/* WASM */}
        <section className={`rounded-xl border p-3 space-y-2 transition-all ${
          activeEngine === 'wasm' ? 'border-neon-green/30 bg-neon-green/[0.03]' : 'border-white/[0.06]'
        }`}>
          <button onClick={() => onSelectEngine('wasm')} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu size={16} className={activeEngine === 'wasm' ? 'text-neon-green' : 'text-steel-400'} />
              <div className="text-left">
                <span className={`text-sm font-medium ${activeEngine === 'wasm' ? 'text-neon-green' : 'text-steel-200'}`}>
                  Local WASM (Offline)
                </span>
                <p className="text-[10px] text-steel-500">Qwen 1.5B · No internet needed · ~900MB</p>
              </div>
            </div>
            {activeEngine === 'wasm' && <Check size={14} className="text-neon-green" />}
          </button>
          <p className="text-[10px] text-steel-600 leading-relaxed pl-6">
            Runs entirely on your device. No API key, no account, no internet.
          </p>
        </section>

        {/* OpenRouter note */}
        <div className="px-3 py-2 rounded-lg bg-neon-amber/[0.04] border border-neon-amber/15">
          <p className="text-[10px] text-neon-amber/80 leading-relaxed">
            <strong>OpenRouter users:</strong> Go to openrouter.ai/workspaces/default/guardrails and enable both <em>"free endpoints that may train on inputs"</em> toggles to unlock all free models.
          </p>
        </div>

        <section className="pb-8">
          <p className="text-[10px] text-steel-600 leading-relaxed">
            iclaw v1.4 — 100% free AI coding workspace. Keys stored locally in IndexedDB.
          </p>
        </section>
      </div>
    </div>
  );
}
