import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Mic, MicOff, Settings, Zap, Globe, Users, BarChart2,
  RotateCcw, ChevronDown, Cpu, Wifi, WifiOff, Plus, X,
  MessageSquare, Search, Code2, Bot, Sparkles, Shield,
} from 'lucide-react';
import ChatMessage from './ChatMessage.jsx';

// Wrap JS for preview
function wrapJs(code) {
  const libs = [];
  if (code.includes('THREE')) libs.push('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
  if (code.includes('Chart'))  libs.push('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js');
  if (code.includes('d3.'))    libs.push('https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js');
  const cleaned = code.replace(/^import\s+.*$/gm,'').replace(/^export\s+/gm,'');
  const libsJ = JSON.stringify(libs), codeJ = JSON.stringify(cleaned);
  return ['<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0}body{background:#030712;color:#e2e8f0;font-family:sans-serif}</style></head><body>',
    '<div id="app"></div><canvas id="c" style="display:none"></canvas><script>',
    '(function(){var L='+libsJ+',C='+codeJ+';',
    'function run(){try{new Function(C)();}catch(e){document.body.textContent="Error: "+e.message;}}',
    'function load(i){if(i>=L.length){run();return;}var s=document.createElement("script");s.src=L[i];s.onload=function(){load(i+1);};document.head.appendChild(s);}load(0);',
    '})();<\/script></body></html>'].join('');
}

const SUGGESTIONS = [
  { icon: Code2,     label: 'Build a 3D animation', color: 'text-violet-400' },
  { icon: Globe,     label: 'Search latest AI news', color: 'text-cyan-400' },
  { icon: BarChart2, label: 'Create a dashboard UI', color: 'text-emerald-400' },
  { icon: Bot,       label: 'Write a Python script', color: 'text-amber-400' },
];

export default function ChatV2({
  messages, onSend, onNewChat, llm, wasmLLM,
  isOnDevice, isWasm,
  onOpenSettings, onOpenAgent, onOpenMultiAgent, onOpenWasmPicker,
  onInitModel, onSelectModel, onPreview, onOpenRateLimit,
}) {
  const [input, setInput]               = useState('');
  const [streaming, setStreaming]       = useState('');
  const [isListening, setIsListening]   = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const scrollRef   = useRef(null);
  const textRef     = useRef(null);
  const streamRef   = useRef(null);
  const recogRef    = useRef(null);
  streamRef.current = setStreaming;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  // Auto-preview HTML in responses
  useEffect(() => {
    const last = messages[messages.length-1];
    if (!last || last.role !== 'assistant') return;
    const htmlMatch = last.content.match(/```html\n([\s\S]+?)```/);
    const jsMatch   = last.content.match(/```(?:javascript|js)\n([\s\S]+?)```/);
    if (htmlMatch) onPreview(htmlMatch[1], 'index.html');
    else if (jsMatch) onPreview(wrapJs(jsMatch[1]), 'script.js');
  }, [messages]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setStreaming('');
    onSend(text, streamRef);
    setTimeout(() => textRef.current?.focus(), 100);
  }, [input, onSend]);

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const toggleVoice = () => {
    if (isListening) { recogRef.current?.stop(); setIsListening(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'en-US'; r.continuous = false; r.interimResults = false;
    r.onresult = (e) => setInput(prev => prev + e.results[0][0].transcript);
    r.onend = () => setIsListening(false);
    recogRef.current = r; r.start(); setIsListening(true);
  };

  const isEmpty = messages.length === 0 && !streaming;
  const engineLabel = isWasm
    ? (wasmLLM.loadedModelId?.replace('-webgpu','').replace('llama3.2','Llama 3.2').replace('qwen2.5-coder','Qwen').replace('phi3.5-mini','Phi 3.5') || 'Local AI')
    : (llm.activeEngine || 'AI');

  const statusColor = isOnDevice ? 'bg-emerald-400' : llm.status === 'generating' ? 'bg-cyan-400 animate-pulse' : llm.status === 'idle' || llm.status === 'ready' ? 'bg-emerald-400' : 'bg-amber-400';

  return (
    <div className="flex flex-col h-full bg-[#030712] text-slate-100 relative">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#030712]/90 backdrop-blur shrink-0 safe-top">
        <div className="flex items-center gap-2.5">
          {/* Logo */}
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Cpu size={14} className="text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-white">iclaw</span>
            <span className="text-[10px] font-mono text-cyan-400/60 bg-cyan-400/10 px-1.5 py-0.5 rounded-full">v2</span>
          </div>
        </div>

        {/* Model pill */}
        <button onClick={() => setShowModelMenu(!showModelMenu)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-all active:scale-95">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} />
          {isWasm && <Shield size={11} className="text-emerald-400 shrink-0" />}
          <span className="text-[11px] font-mono text-slate-300 max-w-[90px] truncate">{engineLabel}</span>
          <ChevronDown size={11} className="text-slate-500" />
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button onClick={onNewChat} className="p-2 rounded-lg hover:bg-white/[0.05] transition active:scale-90">
            <Plus size={16} className="text-slate-400" />
          </button>
          <button onClick={onOpenSettings} className="p-2 rounded-lg hover:bg-white/[0.05] transition active:scale-90">
            <Settings size={16} className="text-slate-400" />
          </button>
        </div>
      </div>

      {/* ── Model menu ── */}
      {showModelMenu && (
        <div className="absolute top-16 left-4 right-4 z-50 rounded-2xl border border-white/[0.08] bg-[#0f172a]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="p-3 border-b border-white/[0.05]">
            <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">On-Device (Private)</p>
          </div>
          {[
            { id:'llama3.2-1b-webgpu', label:'Llama 3.2 1B ⚡', sub:'Fastest · WebGPU' },
            { id:'qwen2.5-coder-1.5b-webgpu', label:'Qwen Coder 1.5B ⚡', sub:'Best for code · WebGPU' },
            { id:'llama3.2-3b-webgpu', label:'Llama 3.2 3B ⚡', sub:'Smartest local · WebGPU' },
          ].map(m => (
            <button key={m.id} onClick={() => { onSelectModel(m.id); llm.initModel?.('wasm'); setShowModelMenu(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition text-left">
              <Shield size={13} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs font-mono text-slate-200">{m.label}</p>
                <p className="text-[10px] text-slate-500">{m.sub}</p>
              </div>
            </button>
          ))}
          <div className="p-3 border-t border-b border-white/[0.05]">
            <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">Cloud Providers</p>
          </div>
          {[
            { id:'gemini', label:'Gemini 2.5 Flash', sub:'Google · Fast · Free tier' },
            { id:'groq', label:'Llama 3.3 70B', sub:'Groq · Ultra fast' },
            { id:'cerebras', label:'GPT-OSS 120B', sub:'Cerebras · Fastest cloud' },
          ].map(m => (
            <button key={m.id} onClick={() => { llm.initModel(m.id); setShowModelMenu(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition text-left">
              <Wifi size={13} className="text-cyan-400 shrink-0" />
              <div>
                <p className="text-xs font-mono text-slate-200">{m.label}</p>
                <p className="text-[10px] text-slate-500">{m.sub}</p>
              </div>
            </button>
          ))}
          <button onClick={() => { setShowModelMenu(false); onOpenWasmPicker(); }}
            className="w-full flex items-center gap-2 px-3 py-3 border-t border-white/[0.05] hover:bg-emerald-500/5 transition">
            <Cpu size={13} className="text-emerald-400" />
            <span className="text-[11px] font-mono text-emerald-400">Manage local models →</span>
          </button>
        </div>
      )}

      {/* ── Messages ── */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-1">

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full pb-20 px-2 gap-8">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-600/20 border border-cyan-500/20 flex items-center justify-center">
                {isOnDevice
                  ? <Shield size={28} className="text-emerald-400" />
                  : <Sparkles size={28} className="text-cyan-400" />}
              </div>
              <div className="text-center">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {isOnDevice ? 'Running on your device' : 'iclaw v2.0'}
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  {isOnDevice
                    ? `${engineLabel} · Private · No API key · Works offline`
                    : 'On-device AI + internet agents + modern tools'}
                </p>
              </div>
              {isOnDevice && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] font-mono text-emerald-400">100% on-device · data never leaves your phone</span>
                </div>
              )}
            </div>

            {/* Capability cards */}
            <div className="w-full max-w-sm grid grid-cols-2 gap-2">
              {[
                { icon: Shield,  label: 'On-Device AI', sub: 'Private · Offline', color: 'border-emerald-500/20 text-emerald-400', bg: 'bg-emerald-500/5', action: onOpenWasmPicker },
                { icon: Globe,   label: 'Web Search',   sub: 'Live internet data', color: 'border-cyan-500/20 text-cyan-400', bg: 'bg-cyan-500/5', action: null },
                { icon: Zap,     label: 'AI Agent',     sub: 'Build & browse', color: 'border-violet-500/20 text-violet-400', bg: 'bg-violet-500/5', action: onOpenAgent },
                { icon: Users,   label: 'Multi-Agent',  sub: 'Plan → Code → Review', color: 'border-amber-500/20 text-amber-400', bg: 'bg-amber-500/5', action: onOpenMultiAgent },
              ].map(({ icon: Icon, label, sub, color, bg, action }) => (
                <button key={label} onClick={action || undefined}
                  className={`flex flex-col gap-1.5 p-3 rounded-xl border ${color} ${bg} text-left transition active:scale-95 ${action ? 'hover:opacity-80' : ''}`}>
                  <Icon size={16} />
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{label}</p>
                    <p className="text-[10px] text-slate-500 leading-tight">{sub}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Suggestions */}
            <div className="w-full max-w-sm space-y-1.5">
              {SUGGESTIONS.map(({ icon: Icon, label, color }) => (
                <button key={label} onClick={() => setInput(label)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] transition active:scale-[0.98] text-left">
                  <Icon size={13} className={color} />
                  <span className="text-sm text-slate-400">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} onPreview={onPreview} />
        ))}

        {/* Streaming */}
        {streaming && (
          <ChatMessage message={{ id:'stream', role:'assistant', content: streaming }} onPreview={onPreview} isStreaming />
        )}

        {/* Thinking indicator */}
        {(llm.status === 'generating' || wasmLLM.isGenerating) && !streaming && (
          <div className="flex items-center gap-2 py-3 px-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-600/20 border border-cyan-500/20 flex items-center justify-center shrink-0">
              <Cpu size={12} className="text-cyan-400" />
            </div>
            <div className="flex gap-1">
              {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{animationDelay: i*0.15+'s'}} />)}
            </div>
            {wasmLLM.isSearching && (
              <span className="text-[10px] font-mono text-cyan-400/70 flex items-center gap-1">
                <Search size={9} className="animate-spin" />Searching...
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Quick action bar ── */}
      <div className="shrink-0 px-4 py-2 flex items-center gap-2 border-t border-white/[0.04]">
        <button onClick={onOpenAgent}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[11px] font-mono transition hover:bg-violet-500/15 active:scale-95">
          <Zap size={11} />Agent
        </button>
        <button onClick={onOpenMultiAgent}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-mono transition hover:bg-amber-500/15 active:scale-95">
          <Users size={11} />Team
        </button>
        <button onClick={onOpenWasmPicker}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-mono transition active:scale-95 ${isOnDevice ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15' : 'bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:bg-white/[0.06]'}`}>
          <Shield size={11} />
          {isOnDevice ? 'On-Device' : 'Local AI'}
        </button>
        <div className="flex-1" />
        <button onClick={onOpenRateLimit}
          className="p-1.5 rounded-full hover:bg-white/[0.05] transition active:scale-90">
          <BarChart2 size={14} className="text-slate-500" />
        </button>
      </div>

      {/* ── Input ── */}
      <div className="shrink-0 px-3 pb-3 safe-bottom">
        <div className={`flex items-end gap-2 rounded-2xl border transition-all ${input ? 'border-cyan-500/30 bg-[#0f172a]' : 'border-white/[0.06] bg-white/[0.03]'} p-2`}>
          <button onClick={toggleVoice}
            className={`p-2 rounded-xl transition active:scale-90 shrink-0 ${isListening ? 'bg-red-500/20 text-red-400' : 'hover:bg-white/[0.05] text-slate-500'}`}>
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <textarea
            ref={textRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder={isOnDevice ? '🔒 Ask anything privately...' : 'Ask iclaw anything...'}
            style={{ resize:'none', minHeight:36, maxHeight:120 }}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none leading-relaxed py-1.5 px-1"
          />
          <button
            onClick={send}
            disabled={!input.trim()}
            className="p-2 rounded-xl transition active:scale-90 shrink-0 disabled:opacity-30 bg-gradient-to-br from-cyan-500 to-violet-600 text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30">
            <Send size={15} />
          </button>
        </div>
        {isOnDevice && (
          <p className="text-center text-[10px] text-emerald-400/40 font-mono mt-1.5">🔒 running locally · no data sent anywhere</p>
        )}
      </div>

      {/* Tap outside to close model menu */}
      {showModelMenu && <div className="fixed inset-0 z-40" onClick={() => setShowModelMenu(false)} />}
    </div>
  );
}
