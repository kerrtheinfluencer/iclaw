import React, { useState, useEffect } from 'react';
import { X, Check, ExternalLink } from 'lucide-react';
import { getSetting, setSetting } from '../utils/db.js';

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    keyPlaceholder: 'Paste Gemini API key (free at aistudio.google.com)',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Fast, capable, free' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Most capable' },
    ],
  },
  groq: {
    name: 'Groq',
    keyPlaceholder: 'Paste Groq API key (free at console.groq.com)',
    keyUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', desc: 'Best overall' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', desc: 'Fastest' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    keyPlaceholder: 'Paste OpenRouter key (free at openrouter.ai)',
    keyUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B', desc: 'Reliable free' },
      { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1', desc: 'Reasoning' },
    ],
  },
};

export default function SettingsPanel({ 
  onClose, 
  onSelectEngine, 
  onSetKey,
  activeEngine, 
  llmStatus,
  activeModel,
  onSelectModel
}) {
  const [keys, setKeys] = useState({ gemini: '', groq: '', openrouter: '' });
  const [showKey, setShowKey] = useState({});

  useEffect(() => {
    // Load saved keys
    Object.keys(PROVIDERS).forEach(async (id) => {
      const key = await getSetting(`key_${id}`, '');
      if (key) setKeys(prev => ({ ...prev, [id]: key }));
    });
  }, []);

  const handleSaveKey = (provider) => {
    const key = keys[provider].trim();
    if (key) {
      setSetting(`key_${provider}`, key);
      onSetKey(provider, key);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#0f0f16] border border-[#00ff88]/30 rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <h2 className="text-lg font-bold text-[#e0e0e0]">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-[#333] rounded">
            <X className="w-5 h-5 text-[#666]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="p-3 bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-lg">
            <p className="text-sm text-[#00ff88]">
              🆓 All engines are 100% free. No credit card required anywhere.
            </p>
          </div>

          {Object.entries(PROVIDERS).map(([id, prov]) => {
            const isActive = activeEngine === id;
            const hasKey = !!keys[id];

            return (
              <div key={id} className={`p-4 rounded-xl border ${isActive ? 'border-[#00ff88]/50 bg-[#00ff88]/5' : 'border-[#333] bg-[#1a1a24]'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-[#e0e0e0]">{prov.name}</h3>
                    <p className="text-xs text-[#666]">{isActive ? 'Active' : 'Click Save to activate'}</p>
                  </div>
                  {isActive && <Check className="w-5 h-5 text-[#00ff88]" />}
                </div>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type={showKey[id] ? 'text' : 'password'}
                      value={keys[id]}
                      onChange={(e) => setKeys({ ...keys, [id]: e.target.value })}
                      placeholder={prov.keyPlaceholder}
                      className="flex-1 bg-[#0a0a0f] border border-[#333] rounded-lg px-3 py-2 text-sm text-[#e0e0e0] placeholder-[#666] focus:outline-none focus:border-[#00ff88]"
                    />
                    <button
                      onClick={() => setShowKey({ ...showKey, [id]: !showKey[id] })}
                      className="px-3 py-2 text-xs text-[#666] hover:text-[#888]"
                    >
                      {showKey[id] ? 'Hide' : 'Show'}
                    </button>
                    <button
                      onClick={() => handleSaveKey(id)}
                      disabled={!keys[id].trim()}
                      className="px-4 py-2 bg-[#00ff88] text-[#0a0a0f] rounded-lg text-sm font-medium hover:bg-[#00ff88]/90 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                  
                  <a 
                    href={prov.keyUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#00ff88] hover:underline"
                  >
                    Get free API key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {isActive && hasKey && (
                  <div className="mt-4 pt-4 border-t border-[#333]">
                    <label className="text-xs text-[#888] uppercase tracking-wider mb-2 block">Model</label>
                    <div className="space-y-2">
                      {prov.models.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => onSelectModel(m.id)}
                          className={`w-full flex items-center justify-between p-3 rounded-lg border ${
                            activeModel === m.id 
                              ? 'border-[#00ff88] bg-[#00ff88]/10' 
                              : 'border-[#333] hover:border-[#555]'
                          }`}
                        >
                          <div className="text-left">
                            <div className="text-sm text-[#e0e0e0]">{m.label}</div>
                            <div className="text-xs text-[#666]">{m.desc}</div>
                          </div>
                          {activeModel === m.id && <Check className="w-4 h-4 text-[#00ff88]" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="p-4 rounded-xl border border-[#333] bg-[#1a1a24]">
            <h3 className="font-semibold text-[#e0e0e0] mb-2">WASM (Offline)</h3>
            <p className="text-sm text-[#666] mb-3">
              Runs entirely on your device. No API key needed.
            </p>
            <button
              onClick={() => onSelectEngine('wasm')}
              className={`w-full p-3 rounded-lg border ${
                activeEngine === 'wasm' 
                  ? 'border-[#00ff88] bg-[#00ff88]/10' 
                  : 'border-[#333] hover:border-[#555]'
              }`}
            >
              <div className="text-sm text-[#e0e0e0]">Qwen2.5-Coder 1.5B</div>
              <div className="text-xs text-[#666]">~900MB download · Fully offline</div>
            </button>
          </div>

          <div className="text-center text-xs text-[#666] pt-4 border-t border-[#333]">
            iclaw v1.4 — 100% free AI coding workspace
          </div>
        </div>
      </div>
    </div>
  );
}
