import React, { useState, useRef, useCallback, useEffect } from 'react';
// Wllama loaded dynamically to avoid static import crash
import { Loader2, Cpu, X, Download, Check, AlertTriangle, Zap, Globe } from 'lucide-react';

// ── WebGPU models (confirmed working MLC IDs) ────────────────────────
// All models use q4f16_1 (4-bit weights, 16-bit activations) — smallest possible for WebGPU
// Models are downloaded in shards by WebLLM — Safari may kill mid-download if screen locks
const WEBGPU_MODELS = {
  'llama3.2-1b-webgpu': {
    mlcId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.2 1B', size: '~700MB',
    desc: '4-bit · WebGPU · fastest · most stable', type: 'webgpu', safe: true,
  },
  'qwen2.5-coder-1.5b-webgpu': {
    mlcId: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen Coder 1.5B', size: '~850MB',
    desc: '4-bit · WebGPU · best for code', type: 'webgpu', safe: true,
  },
  'llama3.2-3b-webgpu': {
    mlcId: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.2 3B', size: '~1.7GB',
    desc: '4-bit · WebGPU · smarter · needs strong WiFi', type: 'webgpu', safe: false,
  },
  'phi3.5-mini-webgpu': {
    mlcId: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    label: 'Phi 3.5 Mini', size: '~2.1GB',
    desc: '4-bit · WebGPU · smartest · needs strong WiFi', type: 'webgpu', safe: false,
  },
};

// ── CPU fallback (wllama) ────────────────────────────────────────────
const CPU_MODELS = {
  'qwen2.5-coder-1.5b': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    label: 'Qwen Coder 1.5B (CPU)', size: '~900MB',
    desc: 'CPU fallback if WebGPU unavailable · ~2 tok/s', type: 'cpu',
  },
};

const SYSTEM_PROMPT = `You are iclaw, a helpful AI assistant and expert coder running locally on device.
For coding: write complete working code, no placeholders, use fenced code blocks.
CRITICAL RULE: When you see [Web search:...] or [LIVE] or [System:...] data in the context, you MUST use those exact numbers and facts in your answer. Never say "as of my last update" or reference 2023/2024 training data if search results are provided. The search results ARE the current answer. Quote them directly.`;

// ── Web search for local models ──────────────────────────────────────
const CORS = 'https://corsproxy.io/?url=';
const SEARXNG = ['https://search.sapti.me', 'https://searx.be', 'https://paulgo.io'];
const SEARCH_RE = /\b(latest|recent|today|current|news|price|weather|score|update|2025|2026|2024|now|live|who|what|when|where|why|how|best|top|vs|compare|check|search|find|look up|tell me|online|internet|google|real.?time|right now|this (week|month|year|moment)|date|time|available|release|version|still|anymore)\b/i;
const CODE_RE = /^(write|create|build|make|implement|fix|debug|refactor)\s/i;
const DATE_RE = /\b(date|time|today|now|current(ly)?|this (week|month|year)|what day|what time)\b/i;

async function doSearch(query) {
  // For stock/price queries, try Yahoo Finance first
  const isFinancial = /\b(stock|price|share|market|nasdaq|nyse|ticker|tsla|aapl|googl|amzn|btc|bitcoin|crypto|usd|jmd|forex|rate)\b/i.test(query);
  if (isFinancial) {
    const tickers = query.match(/\b[A-Z]{1,5}\b/g) || [];
    const commonTickers = ['TSLA','AAPL','GOOGL','AMZN','MSFT','META','NVDA','BTC','ETH'];
    const ticker = tickers.find(t => commonTickers.includes(t)) || tickers[0];
    if (ticker) {
      try {
        const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '?interval=1d&range=1d', { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const d = await r.json();
          const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
          const prev = d?.chart?.result?.[0]?.meta?.previousClose;
          const name = d?.chart?.result?.[0]?.meta?.longName || ticker;
          if (price) {
            const change = prev ? ((price - prev) / prev * 100).toFixed(2) : null;
            return '[LIVE] ' + name + ' (' + ticker + ') — $' + price.toFixed(2) + (change ? ' (' + (change > 0 ? '+' : '') + change + '% today)' : '') + '\nSource: Yahoo Finance, fetched ' + new Date().toLocaleTimeString();
          }
        }
      } catch {}
    }
  }

  for (const inst of SEARXNG) {
    try {
      const url = inst + '/search?q=' + encodeURIComponent(query) + '&format=json&categories=general&language=en';
      const r = await fetch(CORS + encodeURIComponent(url), { signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.results?.length > 0) {
        return d.results.slice(0, 4).map((x, i) => '[' + (i+1) + '] ' + x.title + '\n' + (x.content || '') + '\nURL: ' + x.url).join('\n\n');
      }
    } catch { continue; }
  }
  try {
    const r = await fetch(CORS + encodeURIComponent('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1'), { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      const parts = [];
      if (d.Abstract) parts.push('Summary: ' + d.Abstract);
      if (d.Answer) parts.push('Answer: ' + d.Answer);
      if (d.RelatedTopics?.length) parts.push(d.RelatedTopics.slice(0,3).filter(t=>t.Text).map(t=>t.Text).join('\n'));
      if (parts.length) return parts.join('\n\n');
    }
  } catch {}
  try {
    const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query.split(' ').slice(0,4).join('_')), { signal: AbortSignal.timeout(4000) });
    if (r.ok) { const d = await r.json(); if (d.extract) return 'Wikipedia: ' + d.title + '\n' + d.extract.slice(0, 600); }
  } catch {}
  return null;
}

async function enrichWithSearch(messages, onSearching) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return messages;
  const text = last.content || '';

  // Never search for pure coding tasks
  if (CODE_RE.test(text.trim()) && !DATE_RE.test(text) && !SEARCH_RE.test(text)) return messages;

  // Always search if it looks like a question needing real-world data
  const needsSearch = SEARCH_RE.test(text) || DATE_RE.test(text) || text.includes('?') || text.toLowerCase().includes('online');
  if (!needsSearch) return messages;

  // Build a clean search query
  let query = text
    .replace(/^(search|look up|find|check|what is|who is|tell me about|google|check online)\s+/i, '')
    .replace(/\?$/, '')
    .slice(0, 120).trim();
  if (!query || query.length < 2) return messages;

  // For date queries, add today's actual date context directly without searching
  if (DATE_RE.test(text) && text.split(' ').length < 6) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
    const enriched = [...messages.slice(0, -1)];
    enriched.push({ role: 'user', content: '[System: Current date and time = ' + dateStr + ', ' + timeStr + '. Jamaica timezone (EST-1).]' });
    enriched.push({ role: 'assistant', content: 'Noted, today is ' + dateStr + '.' });
    enriched.push(last);
    return enriched;
  }

  onSearching?.(true, query);
  const results = await doSearch(query).catch(() => null);
  onSearching?.(false, query);
  if (!results) {
    // Even if search fails, inject the date
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const enriched = [...messages.slice(0, -1)];
    enriched.push({ role: 'user', content: '[System: Today is ' + dateStr + '. Web search returned no results for: "' + query + '"]' });
    enriched.push({ role: 'assistant', content: 'Understood.' });
    enriched.push(last);
    return enriched;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const enriched = [...messages.slice(0, -1)];
  enriched.push({
    role: 'user',
    content: '=== LIVE WEB DATA (fetched ' + new Date().toLocaleTimeString() + ', ' + dateStr + ') ===\n\n' + results + '\n\n=== END WEB DATA ===\nIMPORTANT: Answer using ONLY the data above. Do not use your training data for this question.'
  });
  enriched.push({ role: 'assistant', content: 'I have live web data. I will answer using only those current results.' });
  enriched.push(last);
  return enriched;
}

// ── WebLLM CDN loader ────────────────────────────────────────────────
let _webllmReady = false;
function loadWebLLM() {
  return new Promise((resolve, reject) => {
    if (_webllmReady && window.__webllm__) { resolve(window.__webllm__); return; }
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent = "import * as w from 'https://esm.run/@mlc-ai/web-llm@0.2.78'; window.__webllm__=w; window.dispatchEvent(new Event('webllm-ready'));";
    window.addEventListener('webllm-ready', () => { _webllmReady = true; resolve(window.__webllm__); }, { once: true });
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── Singleton engine ─────────────────────────────────────────────────
let _engine = null, _engineType = null, _loadedModelId = null, _loading = false, _gpuOk = null;

async function checkGPU() {
  if (_gpuOk !== null) return _gpuOk;
  try { _gpuOk = !!navigator.gpu && !!(await navigator.gpu.requestAdapter()); } catch { _gpuOk = false; }
  return _gpuOk;
}

// ── Public API for agents ────────────────────────────────────────────
export async function callWasm(messages, systemPrompt, onChunk) {
  if (!_engine) throw new Error('No local model loaded. Open Local WASM to download a model first.');
  const sys = systemPrompt || SYSTEM_PROMPT;
  const enriched = await enrichWithSearch(messages, null).catch(() => messages);
  if (_engineType === 'webgpu') {
    // Stream token by token if callback provided
    if (onChunk) {
      const stream = await _engine.chat.completions.create({
        messages: [{ role: 'system', content: sys }, ...enriched],
        stream: true, temperature: 0.3, max_tokens: 4096,
      });
      let out = '';
      for await (const chunk of stream) {
        const piece = chunk.choices[0]?.delta?.content || '';
        if (piece) { out += piece; onChunk(piece); }
      }
      return out;
    }
    const r = await _engine.chat.completions.create({ messages: [{ role: 'system', content: sys }, ...enriched], stream: false, temperature: 0.3, max_tokens: 4096 });
    return r.choices[0].message.content || '';
  } else {
    let prompt = '<|im_start|>system\n' + sys + '<|im_end|>\n';
    for (const m of enriched) prompt += '<|im_start|>' + m.role + '\n' + m.content + '<|im_end|>\n';
    prompt += '<|im_start|>assistant\n';
    let out = '';
    await _engine.createCompletion(prompt, {
      nPredict: 4096, temperature: 0.3,
      onNewToken: (_t, piece, cur) => {
        const text = typeof piece === 'string' ? piece : piece instanceof Uint8Array ? new TextDecoder().decode(piece) : typeof cur === 'string' ? cur.slice(out.length) : '';
        if (text) { out += text; onChunk?.(text); }
      },
      stopTokens: ['<|im_end|>', '<|endoftext|>'],
    });
    return out;
  }
}
export const callLocalModel = callWasm;

// ── Hook ─────────────────────────────────────────────────────────────
export function useWasmLLM() {
  const [status, setStatus] = useState(() => _engine ? 'ready' : 'idle');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState(null);
  const [hasGPU, setHasGPU] = useState(null);
  const [selectedModel, setSelectedModel] = useState('llama3.2-1b-webgpu');
  const [loadedModelId, setLoadedModelId] = useState(_loadedModelId);
  const [isModelReady, setIsModelReady] = useState(!!_engine && !!_loadedModelId);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const abortRef = useRef(false);

  useEffect(() => {
    checkGPU().then(ok => { setHasGPU(ok); if (!ok) setSelectedModel('qwen2.5-coder-1.5b'); });
    if (_engine && _loadedModelId) { setLoadedModelId(_loadedModelId); setStatus('ready'); setIsModelReady(true); }
  }, []);

  const allModels = hasGPU ? { ...WEBGPU_MODELS, ...CPU_MODELS } : CPU_MODELS;

  const loadModel = useCallback(async (modelId) => {
    const id = modelId || selectedModel;
    if (_engine && _loadedModelId === id) { setStatus('ready'); setLoadedModelId(id); setIsModelReady(true); return; }
    if (_loading) return;
    _loading = true;
    setStatus('loading'); setError(null); setProgress(0);

    try {
      if (_engine) { try { _engineType === 'webgpu' ? await _engine.unload() : await _engine.exit(); } catch {} _engine = null; _loadedModelId = null; _engineType = null; }

      const isGPUModel = !!WEBGPU_MODELS[id];
      const gpuOk = await checkGPU();

      if (isGPUModel && gpuOk) {
        setStatus('downloading'); setProgressText('Loading WebLLM...');

        // Keep screen alive during download — Safari kills fetch streams if screen locks
        let wakeLock = null;
        try {
          if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
        } catch {}
        const releaseWake = async () => { try { await wakeLock?.release(); } catch {} };

        // Re-acquire wake lock if user returns to tab
        const onVisible = async () => {
          if (document.visibilityState === 'visible' && _loading) {
            try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch {}
          }
        };
        document.addEventListener('visibilitychange', onVisible);

        const webllm = await loadWebLLM();
        const model = WEBGPU_MODELS[id];
        setProgressText('Downloading ' + model.label + '...');
        let engine;
        try {
          engine = await webllm.CreateMLCEngine(model.mlcId, {
            initProgressCallback: (info) => { setProgress(info.progress || 0); setProgressText(info.text || '...'); },
          });
        } catch (mlcErr) {
          // Large models crash Safari with out-of-memory
          _loading = false;
          setStatus('error');
          setError(model.safe === false
            ? 'Not enough RAM or download interrupted. Try Llama 3.2 1B (700MB) — most stable on iPhone.'
            : 'Download failed: ' + mlcErr.message + '. Check WiFi and try again.');
          document.removeEventListener('visibilitychange', onVisible);
          await releaseWake();
          return;
        }
        _engine = engine; _engineType = 'webgpu'; _loadedModelId = id;
        _loading = false; setLoadedModelId(id); setStatus('ready'); setIsModelReady(true);
        setProgressText(model.label + ' — ready ⚡');
        document.removeEventListener('visibilitychange', onVisible);
        await releaseWake();
      } else {
        const model = CPU_MODELS[id] || CPU_MODELS['qwen2.5-coder-1.5b'];
        setStatus('downloading'); setProgressText('Downloading ' + model.label + ' (' + model.size + ')...');
        const { Wllama } = await import('@wllama/wllama');
        const wasmUrl = new URL('@wllama/wllama/src/single-thread/wllama.wasm', import.meta.url).href;
        const wllama = new Wllama({ 'single-thread/wllama.wasm': wasmUrl });
        await wllama.loadModelFromUrl(model.url, {
          n_ctx: 2048, n_threads: 1,
          progressCallback: ({ loaded, total }) => { setProgress(total > 0 ? loaded / total : 0); setProgressText((loaded/1048576).toFixed(0) + ' MB / ' + (total/1048576).toFixed(0) + ' MB'); },
        });
        _engine = wllama; _engineType = 'cpu'; _loadedModelId = id;
        _loading = false; setLoadedModelId(id); setStatus('ready'); setIsModelReady(true);
        setProgressText(model.label + ' loaded ✓');
      }
    } catch (err) {
      _loading = false; _engine = null; _loadedModelId = null; _engineType = null;
      setStatus('error'); setError(err.message);
    }
  }, [selectedModel]);

  const onSearching = useCallback((active, query) => {
    setIsSearching(active);
    if (query) setSearchQuery(query);
  }, []);

  const generate = useCallback(async (messages, onChunk, onDone) => {
    if (!_engine) { onDone('', null, 'No model loaded. Open Local WASM to download first.'); return; }
    setStatus('generating'); abortRef.current = false;
    const enriched = await enrichWithSearch(messages, onSearching).catch(() => messages);
    let fullText = '', tokenCount = 0;
    const t0 = performance.now();
    try {
      if (_engineType === 'webgpu') {
        const stream = await _engine.chat.completions.create({
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...enriched],
          stream: true, temperature: 0.3, max_tokens: 2048,
        });
        for await (const chunk of stream) {
          if (abortRef.current) break;
          const piece = chunk.choices[0]?.delta?.content || '';
          if (piece) { fullText += piece; tokenCount++; onChunk(piece, fullText); }
        }
      } else {
        let prompt = '<|im_start|>system\n' + SYSTEM_PROMPT + '<|im_end|>\n';
        for (const m of enriched) prompt += '<|im_start|>' + m.role + '\n' + m.content + '<|im_end|>\n';
        prompt += '<|im_start|>assistant\n';
        await _engine.createCompletion(prompt, {
          nPredict: 2048, temperature: 0.3, top_p: 0.9, repeat_penalty: 1.1,
          onNewToken: (_t, piece, cur) => {
            if (abortRef.current) return;
            const text = typeof piece === 'string' ? piece : piece instanceof Uint8Array ? new TextDecoder().decode(piece) : typeof cur === 'string' ? cur.slice(fullText.length) : '';
            if (text) { fullText += text; tokenCount++; onChunk(text, fullText); }
          },
          stopTokens: ['<|im_end|>', '<|endoftext|>'],
        });
      }
      const elapsed = (performance.now() - t0) / 1000;
      setStatus('ready');
      onDone(fullText, { tokens: tokenCount, elapsed: elapsed.toFixed(1), tokPerSec: (tokenCount / Math.max(elapsed, 0.1)).toFixed(1), engine: 'local/' + _engineType, model: _loadedModelId }, null);
    } catch (err) { setStatus('ready'); onDone(fullText || '', null, err.message); }
  }, [onSearching]);

  const stop = useCallback(() => { abortRef.current = true; setStatus('ready'); }, []);

  return {
    status, progress, progressText, error, selectedModel, setSelectedModel,
    loadModel, generate, stop, loadedModelId, hasGPU, allModels,
    isReady: isModelReady && !!_engine && !['loading', 'downloading'].includes(status),
    isLoading: ['loading', 'downloading'].includes(status),
    isGenerating: status === 'generating',
    isSearching, searchQuery,
  };
}

// ── Model Picker UI ──────────────────────────────────────────────────
export function WasmModelPicker({ wasmLLM, onClose }) {
  const { selectedModel, setSelectedModel, loadModel, status, progress, progressText, error, loadedModelId, hasGPU, allModels } = wasmLLM;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-void-950 safe-top safe-bottom">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 glass-panel shrink-0">
        <div className="flex items-center gap-2">
          {hasGPU ? <Zap size={15} className="text-neon-cyan" /> : <Cpu size={15} className="text-neon-green" />}
          <h2 className="font-display text-sm font-semibold text-steel-100">Local AI Model</h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 active:scale-90"><X size={16} className="text-steel-400" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {hasGPU && (
          <div className="px-3 py-2.5 rounded-xl bg-neon-cyan/5 border border-neon-cyan/20 flex items-center gap-2">
            <Zap size={13} className="text-neon-cyan shrink-0" />
            <p className="text-[11px] text-neon-cyan/90 font-mono">A18 WebGPU detected — expect 15-30 tok/s on ⚡ models</p>
          </div>
        )}
        <div className="px-3 py-2 rounded-xl bg-neon-green/5 border border-neon-green/15 flex items-center gap-2">
          <Globe size={12} className="text-neon-green shrink-0" />
          <p className="text-[10px] text-neon-green/80 font-mono">Auto web search — local models fetch live data for current questions</p>
        </div>

        {Object.entries(allModels || {}).map(([id, model]) => {
          const isSelected = selectedModel === id;
          const isLoaded = loadedModelId === id;
          const isGPU = model.type === 'webgpu';
          return (
            <button key={id} onClick={() => setSelectedModel(id)}
              className={'w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all active:scale-[0.98] text-left ' + (isSelected ? (isGPU ? 'border-neon-cyan/30 bg-neon-cyan/[0.05]' : 'border-neon-green/30 bg-neon-green/[0.05]') : 'border-white/[0.06] hover:border-white/10')}>
              {isGPU ? <Zap size={16} className={isSelected ? 'text-neon-cyan' : 'text-steel-500'} /> : <Cpu size={16} className={isSelected ? 'text-neon-green' : 'text-steel-500'} />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className={'text-sm font-mono font-medium ' + (isSelected ? (isGPU ? 'text-neon-cyan' : 'text-neon-green') : 'text-steel-200')}>{model.label}</p>
                  {isLoaded && <span className="text-[9px] font-mono text-neon-green bg-neon-green/10 px-1.5 py-0.5 rounded-full">LOADED</span>}
                  {model.safe === true && <span className="text-[9px] font-mono text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">✓ STABLE</span>}
                  {model.safe === false && <span className="text-[9px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">⚠ HIGH RAM</span>}
                </div>
                <p className="text-[10px] text-steel-500 mt-0.5">{model.size} · {model.desc}</p>
              </div>
              {isLoaded ? <Check size={14} className="text-neon-green shrink-0" /> : isSelected ? <div className={'w-2 h-2 rounded-full shrink-0 ' + (isGPU ? 'bg-neon-cyan/50' : 'bg-neon-green/50')} /> : null}
            </button>
          );
        })}

        {['downloading', 'loading'].includes(status) && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 text-xs font-mono text-neon-amber">
              <Loader2 size={12} className="animate-spin shrink-0" />
              <span className="truncate">{progressText}</span>
            </div>
            <div className="w-full h-2.5 bg-void-300 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-neon-cyan to-neon-green rounded-full transition-all duration-500" style={{ width: Math.round(progress * 100) + '%' }} />
            </div>
            <p className="text-[11px] font-mono text-neon-amber text-center font-semibold">{Math.round(progress * 100)}%</p>
            <div className="rounded-xl bg-neon-amber/5 border border-neon-amber/20 px-3 py-2.5 space-y-1">
              <p className="text-[11px] font-mono text-neon-amber font-semibold">⚠ Keep this screen open</p>
              <p className="text-[10px] text-steel-400 leading-relaxed">Safari will pause the download if you switch apps or lock your screen. Stay on this page until 100%.</p>
            </div>
          </div>
        )}
        {status === 'ready' && loadedModelId && <div className="px-3 py-2.5 rounded-xl bg-neon-green/5 border border-neon-green/20"><p className="text-[11px] text-neon-green font-mono">✓ {progressText}</p></div>}
        {error && status === 'error' && (
          <div className="px-3 py-3 rounded-xl bg-neon-pink/5 border border-neon-pink/20 space-y-2">
            <p className="text-[11px] text-neon-pink font-mono font-semibold">Download failed</p>
            <p className="text-[10px] text-steel-400 leading-relaxed">{error}</p>
            <div className="text-[10px] text-steel-500 space-y-1 pt-1 border-t border-white/5">
              <p className="font-semibold text-steel-400">Tips to fix:</p>
              <p>• Stay on screen during entire download</p>
              <p>• Use strong WiFi (models are 700MB–2GB)</p>
              <p>• Try Llama 3.2 1B (smallest, most stable)</p>
              <p>• Close other apps to free RAM</p>
            </div>
          </div>
        )}

        <button onClick={() => loadModel(selectedModel)}
          disabled={['loading', 'downloading'].includes(status) || loadedModelId === selectedModel}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-40 bg-neon-green/10 border border-neon-green/25 text-neon-green hover:bg-neon-green/15">
          {['loading', 'downloading'].includes(status) ? <><Loader2 size={14} className="animate-spin" />Loading...</> : loadedModelId === selectedModel ? <><Check size={14} />Ready</> : <><Download size={14} />Download &amp; Load</>}
        </button>
        {loadedModelId && <button onClick={onClose} className="w-full py-2.5 rounded-xl font-mono text-xs border border-neon-green/20 text-neon-green/70 hover:bg-neon-green/5 active:scale-[0.98] transition-all">Start chatting →</button>}
      </div>
    </div>
  );
}
