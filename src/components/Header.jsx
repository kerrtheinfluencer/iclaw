import React, { useState, useEffect } from 'react';
import { Settings, Zap, Users, Activity, Menu, ChevronDown, Sparkles } from 'lucide-react';

const PROVIDERS = {
  gemini: { 
    name: 'Google Gemini', 
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'Default + Internet', badge: 'Free' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'Most Powerful', badge: 'Free' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', tier: 'Fast', badge: 'Free' }
    ]
  },
  groq: { 
    name: 'Groq (Ultra-Fast)', 
    models: [
      { id: 'moonshotai/kimi-k2-instruct-0905', label: 'Kimi K2', tier: '256K Context · Advanced', badge: 'Free' },
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', tier: 'Best Reasoning', badge: 'Free' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', tier: 'Vision + Function Calling', badge: 'Free' },
      { id: 'qwen/qwen3-32b', label: 'Qwen 3 32B', tier: 'Code Expert', badge: 'Free' },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tier: 'Reliable', badge: 'Free' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', tier: 'Fastest', badge: 'Free' }
    ]
  },
  openrouter: { 
    name: 'OpenRouter', 
    models: [
      { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1', tier: 'Chain-of-Thought', badge: 'Free' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen 2.5 Coder 32B', tier: 'Code Specialist', badge: 'Free' },
      { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B', tier: 'Google', badge: 'Free' },
      { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B', tier: 'Most Reliable', badge: 'Free' },
      { id: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B', tier: 'Compact', badge: 'Free' },
      { id: 'microsoft/phi-3-mini-128k-instruct:free', label: 'Phi-3 Mini 128K', tier: '128K Context', badge: 'Free' }
    ]
  }
};

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

  const currentProvider = activeEngine ? PROVIDERS[activeEngine] : null;
  const models = currentProvider?.models || [];
  const currentModelLabel = models.find(m => m.id === activeModel)?.label || activeModel || 'Select Model';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modelMenuOpen && !e.target.closest('.model-dropdown')) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [modelMenuOpen]);

  return (
    <header className="h-14 bg-[#0f0f16] border-b border-[#00ff88]/20 flex items-center justify-between px-4 relative z-50">
      <div className="flex items-center gap-3">
        <button 
          onClick={onMenuToggle}
          className="p-2 hover:bg-[#00ff88]/10 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5 text-[#00ff88]" />
        </button>
        <h1 className="text-lg font-bold text-[#00ff88]">iclaw</h1>
      </div>

      <div className="flex items-center gap-2">
        {activeEngine && models.length > 0 && (
          <div className="relative model-dropdown">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setModelMenuOpen(!modelMenuOpen);
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a24] border border-[#00ff88]/30 rounded-lg text-xs text-[#00ff88] hover:bg-[#00ff88]/10 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span className="max-w-[120px] truncate">{currentModelLabel}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {modelMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-[#0f0f16] border border-[#00ff88]/30 rounded-xl shadow-2xl z-50 max-h-[70vh] overflow-y-auto">
                <div className="p-3 text-xs text-[#666] uppercase tracking-wider border-b border-[#333] font-semibold">
                  {currentProvider.name} Models
                </div>
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectModel(m.id);
                      setModelMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-[#00ff88]/10 transition-colors border-b border-[#222] last:border-0 ${
                      activeModel === m.id ? 'bg-[#00ff88]/10' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${activeModel === m.id ? 'text-[#00ff88]' : 'text-[#e0e0e0]'}`}>
                        {m.label}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-[#00ff88]/20 text-[#00ff88] rounded">
                        {m.badge}
                      </span>
                    </div>
                    <div className="text-xs text-[#666] mt-1">{m.tier}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={`w-2 h-2 rounded-full ${
          llmStatus === 'ready' ? 'bg-green-500 animate-pulse' : 
          llmStatus === 'generating' ? 'bg-yellow-500 animate-pulse' : 
          llmStatus === 'error' ? 'bg-red-500' : 'bg-gray-500'
        }`} title={`Status: ${llmStatus}`} />

        <button 
          onClick={onOpenMultiAgent} 
          className="p-2 hover:bg-[#00ff88]/10 rounded-lg transition-colors relative group"
          title="Multi-Agent Mode"
        >
          <Users className="w-4 h-4 text-[#00ff88]" />
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#1a1a24] text-[#00ff88] text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Multi-Agent
          </span>
        </button>
        
        <button 
          onClick={onOpenAgent} 
          className="p-2 hover:bg-[#00ff88]/10 rounded-lg transition-colors relative group"
          title="Agent Mode"
        >
          <Zap className="w-4 h-4 text-[#00ff88]" />
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#1a1a24] text-[#00ff88] text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Agent Mode
          </span>
        </button>
        
        <button 
          onClick={onOpenRateLimit} 
          className="p-2 hover:bg-[#00ff88]/10 rounded-lg transition-colors relative group"
          title="Rate Limits"
        >
          <Activity className="w-4 h-4 text-[#00ff88]" />
        </button>
        
        <button 
          onClick={onSettingsOpen} 
          className="p-2 hover:bg-[#00ff88]/10 rounded-lg transition-colors relative group"
          title="Settings"
        >
          <Settings className="w-4 h-4 text-[#00ff88]" />
        </button>
      </div>
    </header>
  );
}
