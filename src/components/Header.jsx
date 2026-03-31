import React, { useState } from 'react';
import { Settings, Zap, Users, Activity, Menu } from 'lucide-react';

export default function Header({ 
  onMenuToggle, 
  onSettingsOpen, 
  onSelectModel,
  onOpenAgent,
  onOpenMultiAgent,
  onOpenRateLimit,
  llmStatus,
  activeEngine,
  activeModel
}) {
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const PROVIDERS = {
    gemini: { 
      name: 'Google Gemini', 
      models: [
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
      ]
    },
    groq: { 
      name: 'Groq', 
      models: [
        { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
        { id: 'qwen/qwen3-32b', label: 'Qwen 3 32B' }
      ]
    },
    openrouter: { 
      name: 'OpenRouter', 
      models: [
        { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B' }
      ]
    }
  };

  const eng = activeEngine;
  const models = eng ? PROVIDERS[eng]?.models || [] : [];

  return (
    <header className="h-14 bg-[#0f0f16] border-b border-[#00ff88]/20 flex items-center justify-between px-4">
      {/* Left: hamburger + title */}
      <div className="flex items-center gap-3">
        <button 
          onClick={onMenuToggle}
          className="p-2 hover:bg-[#00ff88]/10 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5 text-[#00ff88]" />
        </button>
        <h1 className="text-lg font-bold text-[#00ff88]">iclaw</h1>
      </div>

      {/* Right: model picker + status + settings */}
      <div className="flex items-center gap-2">
        {/* Model switcher */}
        {eng && models.length > 0 && (
          <div className="relative">
            <button 
              onClick={() => setModelMenuOpen(!modelMenuOpen)}
              className="px-3 py-1.5 bg-[#1a1a24] border border-[#00ff88]/30 rounded text-xs text-[#00ff88] hover:bg-[#00ff88]/10"
            >
              {activeModel || 'Select Model'}
            </button>
            
            {modelMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#0f0f16] border border-[#00ff88]/30 rounded-lg shadow-xl z-50">
                <div className="p-2 text-xs text-[#888] uppercase tracking-wider">Select Model</div>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { onSelectModel(m.id); setModelMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-[#e0e0e0] hover:bg-[#00ff88]/10"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Status dot */}
        <div className={`w-2 h-2 rounded-full ${
          llmStatus === 'ready' ? 'bg-green-500' : 
          llmStatus === 'generating' ? 'bg-yellow-500 animate-pulse' : 
          llmStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'
        }`} />

        {/* Action buttons */}
        <button onClick={onOpenMultiAgent} className="p-2 hover:bg-[#00ff88]/10 rounded-lg">
          <Users className="w-4 h-4 text-[#00ff88]" />
        </button>
        <button onClick={onOpenAgent} className="p-2 hover:bg-[#00ff88]/10 rounded-lg">
          <Zap className="w-4 h-4 text-[#00ff88]" />
        </button>
        <button onClick={onOpenRateLimit} className="p-2 hover:bg-[#00ff88]/10 rounded-lg">
          <Activity className="w-4 h-4 text-[#00ff88]" />
        </button>
        <button onClick={onSettingsOpen} className="p-2 hover:bg-[#00ff88]/10 rounded-lg">
          <Settings className="w-4 h-4 text-[#00ff88]" />
        </button>
      </div>
    </header>
  );
}
