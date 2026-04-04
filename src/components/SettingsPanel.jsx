import React, { useState, useEffect } from 'react';
import { X, Cpu, Check, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { getSetting, setSetting, getStorageEstimate } from '../utils/db.js';

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini', icon: '✦', color: 'text-blue-400',
    borderColor: 'border-blue-400/30', bgColor: 'bg-blue-400/5', tagColor: 'text-blue-400 bg-blue-400/10',
    keyUrl: 'https://aistudio.google.com/apikey', keyPlaceholder: 'AIza...',
    limits: '🌐 Google Search built-in · 1500 req/day free',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'Default + Internet' },
      { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   tier: 'Most Powerful' },
    ],
  },
  groq: {
    name: 'Groq', icon: '⚡', color: 'text-orange-400',
    borderColor: 'border-orange-400/30', bgColor: 'bg-orange-400/5', tagColor: 'text-orange-400 bg-orange-400/10',
    keyUrl: 'https://console.groq.com/keys', keyPlaceholder: 'gsk_...',
    limits: '14,400 req/day · Fastest LPU inference',
    models: [
      { id: 'openai/gpt-oss-120b',                       label: 'GPT-OSS 120B',   tier: 'Best · Reasoning' },
      { id: 'qwen/qwen3-32b',                            label: 'Qwen 3 32B',     tier: 'Code · Thinking' },
      { id: 'moonshotai/kimi-k2-instruct-0905',          label: 'Kimi K2',        tier: '256K Context' },
      { id: 'llama-3.3-70b-versatile',                   label: 'Llama 3.3 70B', tier: 'Reliable' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', tier: 'Vision' },
      { id: 'llama-3.1-8b-instant',                      label: 'Llama 3.1 8B',  tier: 'Fastest' },
    ],
  },
  cerebras: {
    name: 'Cerebras', icon: '🧠', color: 'text-cyan-400',
    borderColor: 'border-cyan-400/30', bgColor: 'bg-cyan-400/5', tagColor: 'text-cyan-400 bg-cyan-400/10',
    keyUrl: 'https://cloud.cerebras.ai', keyPlaceholder: 'csk-...',
    limits: '⚡ 2000 tokens/sec · Fastest inference on earth',
    models: [
      { id: 'llama3.3-70b',      label: 'Llama 3.3 70B', tier: '2000 tok/s' },
      { id: 'llama-4-scout-17b', label: 'Llama 4 Scout', tier: 'Vision' },
      { id: 'qwen-3-32b',        label: 'Qwen 3 32B',    tier: 'Thinking' },
    ],
  },
  sambanova: {
    name: 'SambaNova', icon: '⚙', color: 'text-emerald-400',
    borderColor: 'border-emerald-400/30', bgColor: 'bg-emerald-400/5', tagColor: 'text-emerald-400 bg-emerald-400/10',
    keyUrl: 'https://cloud.sambanova.ai', keyPlaceholder: 'snova-...',
    limits: 'Free tier · Llama 4 Maverick · 10M context',
    models: [
      { id: 'Meta-Llama-3.3-70B-Instruct',             label: 'Llama 3.3 70B',    tier: 'Best Free' },
      { id: 'Meta-Llama-4-Maverick-17B-128E-Instruct', label: 'Llama 4 Maverick', tier: '10M Context' },
      { id: 'DeepSeek-R1',                             label: 'DeepSeek R1',      tier: 'Thinking' },
      { id: 'DeepSeek-V3-0324',                        label: 'DeepSeek V3',      tier: 'Coding' },
      { id: 'Qwen3-32B',                               label: 'Qwen 3 32B',       tier: 'Multilingual' },
    ],
  },
  openrouter: {
    name: 'OpenRouter', icon: '◈', color: 'text-purple-400',
    borderColor: 'border-purple-400/30', bgColor: 'bg-purple-400/5', tagColor: 'text-purple-400 bg-purple-400/10',
    keyUrl: 'https://openrouter.ai/keys', keyPlaceholder: 'sk-or-...',
    limits: 'Free models · Must enable free endpoints in guardrails',
    models: [
      { id: 'mistralai/mistral-7b-instruct:free',     label: 'Mistral 7B',          tier: 'Reliable' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free',  label: 'Qwen 2.5 Coder 32B', tier: 'Code' },
      { id: 'deepseek/deepseek-r1:free',              label: 'DeepSeek R1',         tier: 'Thinking' },
      { id: 'google/gemma-3-27b-it:free',             label: 'Gemma 3 27B',         tier: 'Smart' },
      { id: 'meta-llama/llama-3.2-3b-instruct:free',  label: 'Llama 3.2 3B',        tier: 'Compact' },
    ],
  },
};

export default function SettingsPanel({ isOpen, onClose, onSelectEngine, onSetKey, activeEngine, llmStatus, activeModel, onSelectModel }) {
  const [keys, setKeys] = useState({ gemini: '', groq: '', cerebras: '', sambanova: '', openrouter: '', huggingface: '', together: '', tavily: '' });
  const [showKeys, setShowKeys] = useState({});
  const [storage, setStorage] = useState(null);
  const [savedProvider, setSavedProvider] = useState(null);

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        getSetting('key_gemini', ''),
        getSetting('key_groq', ''),
        getSetting('key_cerebras', ''),
        getSetting('key_sambanova', ''),
        getSetting('key_openrouter', ''),
        getSetting('key_huggingface', ''),
        getSetting('key_together', ''),
        getSetting('key_tavily', ''),
      ]).then(([g, gr, c, s, or, hf, tog, tav]) => setKeys({ gemini: g, groq: gr, cerebras: c, sambanova: s, openrouter: or, huggingface: hf, together: tog, tavily: tav }));
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

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Free badge */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neon-green/[0.04] border border-neon-green/15">
          <span className="text-sm">🆓</span>
          <p className="text-[11px] text-neon-green/80 font-medium">All engines are 100% free. No credit card required.</p>
        </div>

        {/* Chutes — no key needed */}
        <section className={`rounded-xl border p-3 space-y-2 transition-all ${activeEngine === 'chutes' ? 'border-neon-green/30 bg-neon-green/[0.04]' : 'border-white/[0.06]'}`}>
          <button onClick={() => onSelectEngine('chutes')} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🆓</span>
              <div className="text-left">
                <span className={`text-sm font-medium ${activeEngine === 'chutes' ? 'text-neon-green' : 'text-steel-200'}`}>Chutes AI — No API Key!</span>
                <p className="text-[10px] text-steel-500">DeepSeek V3/R1 · Qwen 3 235B · Gemma 3 · Llama 4 — zero setup</p>
              </div>
            </div>
            {activeEngine === 'chutes' && <Check size={14} className="text-neon-green" />}
          </button>
          {activeEngine === 'chutes' && (
            <div className="space-y-1 pt-1 border-t border-white/[0.04]">
              <span className="text-[10px] font-mono text-steel-500 uppercase">Model</span>
              {[
                { id: 'deepseek-ai/DeepSeek-V3-0324', label: 'DeepSeek V3', tier: 'Best Coding' },
                { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1', tier: 'Thinking' },
                { id: 'Qwen/Qwen3-235B-A22B', label: 'Qwen 3 235B', tier: 'Massive' },
                { id: 'Qwen/Qwen3-32B', label: 'Qwen 3 32B', tier: 'Fast' },
                { id: 'google/gemma-3-27b-it', label: 'Gemma 3 27B', tier: 'Smart' },
                { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', label: 'Llama 4 Maverick', tier: '10M ctx' },
              ].map(m => (
                <button key={m.id} onClick={() => onSelectModel(m.id)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${activeModel === m.id ? 'bg-neon-green/[0.08] border border-neon-green/20' : 'hover:bg-white/[0.02]'}`}>
                  <span className={`text-xs ${activeModel === m.id ? 'text-neon-green' : 'text-steel-300'}`}>{m.label}</span>
                  <span className="text-[9px] font-mono text-steel-600">{m.tier}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* All other providers */}
        {Object.entries(PROVIDERS).map(([id, prov]) => {
          const isActive = activeEngine === id;
          const hasKey = !!keys[id];
          return (
            <section key={id} className={`rounded-xl border p-3 space-y-3 transition-all ${isActive ? prov.borderColor + ' ' + prov.bgColor : 'border-white/[0.06]'}`}>
              <button onClick={() => { if (hasKey) onSelectEngine(id); }} className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{prov.icon}</span>
                  <div className="text-left">
                    <span className={`text-sm font-medium ${isActive ? prov.color : 'text-steel-200'}`}>{prov.name}</span>
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
                  <input type={showKeys[id] ? 'text' : 'password'} value={keys[id] || ''}
                    onChange={e => setKeys({ ...keys, [id]: e.target.value })}
                    placeholder={prov.keyPlaceholder}
                    className="input-stealth text-xs pr-8 py-2" />
                  <button onClick={() => setShowKeys({ ...showKeys, [id]: !showKeys[id] })}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1">
                    {showKeys[id] ? <EyeOff size={12} className="text-steel-600" /> : <Eye size={12} className="text-steel-600" />}
                  </button>
                </div>
                <button onClick={() => handleSaveKey(id)} disabled={!keys[id]?.trim()}
                  className={`px-3 py-2 rounded-lg text-[10px] font-mono font-medium transition-all active:scale-95 disabled:opacity-20 ${savedProvider === id ? 'bg-neon-green/15 text-neon-green' : 'bg-white/5 text-steel-300'}`}>
                  {savedProvider === id ? '✓' : 'Save'}
                </button>
              </div>

              <a href={prov.keyUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] text-steel-500 hover:text-steel-300 transition-colors">
                <ExternalLink size={10} />
                Get free API key → {prov.keyUrl.replace('https://', '')}
              </a>

              {isActive && hasKey && (
                <div className="space-y-1 pt-1 border-t border-white/[0.04]">
                  <span className="text-[10px] font-mono text-steel-500 uppercase">Model</span>
                  {prov.models.map(m => (
                    <button key={m.id} onClick={() => onSelectModel(m.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg transition-all ${activeModel === m.id ? prov.bgColor + ' ' + prov.borderColor + ' border' : 'hover:bg-white/[0.02]'}`}>
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
        <section className={`rounded-xl border p-3 space-y-2 transition-all ${activeEngine === 'wasm' ? 'border-neon-green/30 bg-neon-green/[0.03]' : 'border-white/[0.06]'}`}>
          <button onClick={() => onSelectEngine('wasm')} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu size={16} className={activeEngine === 'wasm' ? 'text-neon-green' : 'text-steel-400'} />
              <div className="text-left">
                <span className={`text-sm font-medium ${activeEngine === 'wasm' ? 'text-neon-green' : 'text-steel-200'}`}>Local WASM (Offline)</span>
                <p className="text-[10px] text-steel-500">Qwen 1.5B · No internet · ~900MB · Private</p>
              </div>
            </div>
            {activeEngine === 'wasm' && <Check size={14} className="text-neon-green" />}
          </button>
        </section>

        {/* Tavily Search */}
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">🔍 Tavily Search API</p>
              <p className="text-[10px] text-steel-500 mt-0.5">Powers agent web search · Free at tavily.com · Optional</p>
            </div>
            {keys.tavily && <span className="text-[9px] font-mono text-neon-green bg-neon-green/10 px-2 py-0.5 rounded-full">Active</span>}
          </div>
          <div className="flex gap-1.5">
            <input type={showKeys.tavily ? 'text' : 'password'} value={keys.tavily}
              onChange={e => setKeys(p => ({...p, tavily: e.target.value}))}
              placeholder="tvly-xxxxxxxx"
              className="flex-1 bg-void-300/30 border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-steel-300 placeholder-steel-600 outline-none focus:border-cyan-500/30" />
            <button onClick={() => setShowKeys(p => ({...p, tavily: !p.tavily}))}
              className="px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-steel-500 text-[10px] hover:text-steel-300 transition">
              {showKeys.tavily ? 'Hide' : 'Show'}
            </button>
            <button onClick={async () => { await saveSetting('key_tavily', keys.tavily); setSavedProvider('tavily'); setTimeout(() => setSavedProvider(null), 2000); }}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[11px] font-mono hover:bg-cyan-500/15 transition">
              {savedProvider === 'tavily' ? '✓' : 'Save'}
            </button>
          </div>
          <a href="https://tavily.com" target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400/50 hover:text-cyan-400 transition block">Get free key → tavily.com</a>
        </div>

        {storage && (
          <section>
            <h3 className="text-xs font-mono text-steel-400 uppercase tracking-wider mb-2">Storage</h3>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-steel-400">Used</span>
              <span className="text-steel-200">{storage.usedMB} MB</span>
            </div>
            <div className="w-full h-1.5 bg-void-300 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-neon-green to-neon-cyan rounded-full"
                style={{ width: `${Math.min(parseFloat(storage.percentUsed), 100)}%` }} />
            </div>
          </section>
        )}

        <p className="text-[10px] text-steel-600 pb-8">iclaw v1.5 — Keys stored locally in IndexedDB on your device.</p>
      </div>
    </div>
  );
}
