import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Wllama } from '@wllama/wllama';
import { Loader2, Cpu, X, Download, Check, AlertTriangle, Zap } from 'lucide-react';

// ─── Models ──────────────────────────────────────────────────────────────────
const WEBGPU_MODELS = {
  'gemma-3-1b-webgpu': {
    mlcId: 'gemma-3-1b-it-q4f16_1-MLC',
    label: 'Gemma 3 1B ⚡ (Google)',
    size: '~700MB',
    desc: 'WebGPU · Google · best quality/size ratio',
    type: 'webgpu',
  },
  'qwen2.5-coder-1.5b-webgpu': {
    mlcId: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen2.5-Coder 1.5B ⚡',
    size: '~900MB',
    desc: 'WebGPU · best for coding',
    type: 'webgpu',
  },
  'llama3.2-1b-webgpu': {
    mlcId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.2 1B ⚡',
    size: '~700MB',
    desc: 'WebGPU · general purpose',
    type: 'webgpu',
  },
  'smollm2-1.7b-webgpu': {
    mlcId: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    label: 'SmolLM2 1.7B ⚡',
    size: '~1GB',
    desc: 'WebGPU · fast short tasks',
    type: 'webgpu',
  },
};

const CPU_MODELS = {
  'qwen2.5-coder-1.5b': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    label: 'Qwen2.5-Coder 1.5B (CPU)',
    size: '~900MB',
    desc: 'CPU fallback · ~2 tok/s',
    type: 'cpu',
  },
};

const SYSTEM_PROMPT = `You are iclaw, a helpful AI assistant and expert coder running locally on device.
For casual conversation: respond naturally and concisely.
For coding: write complete working code, no placeholders, use fenced code blocks with language tags.`;

// ─── Singleton engine ─────────────────────────────────────────────────────────
let _engine = null;
let _engineType = null; // 'webgpu' | 'cpu'
let _loadedModelId = null;
let _loading = false;
let _webgpuAvailable = null;

async function detectWebGPU() {
  if (_webgpuAvailable !== null) return _webgpuAvailable;
  try {
    if (!navigator.gpu) { _webgpuAvailable = false; return false; }
    const adapter = await navigator.gpu.requestAdapter();
    _webgpuAvailable = !!adapter;
  } catch { _webgpuAvailable = false; }
  return _webgpuAvailable;
}

// Load WebLLM from CDN — avoids Vite bundling issues
async function loadWebLLM() {
  // Use unpkg CDN for WebLLM — loaded at runtime, not bundled
  const mod = await import(/* @vite-ignore */ 'https://esm.run/@mlc-ai/web-llm@0.2.78');
  return mod;
}

// ─── Exported for agents ──────────────────────────────────────────────────────
export async function callWasm(messages, systemPrompt) {
  if (!_engine) throw new Error('No local model loaded. Open Local WASM to download a model first.');
  const sys = systemPrompt || SYSTEM_PROMPT;

  if (_engineType === 'webgpu') {
    const msgs = [{ role: 'system', content: sys }, ...messages];
    const reply = await _engine.chat.completions.create({
      messages: msgs, stream: false, temperature: 0.3, max_tokens: 4096,
    });
    return reply.choices[0].message.content || '';
  } else {
    let prompt = '<|im_start|>system\n' + sys + '<|im_end|>\n';
    for (const m of messages) {
      prompt += '<|im_start|>' + m.role + '\n' + m.content + '<|im_end|>\n';
    }
    prompt += '<|im_start|>assistant\n';
    let out = '';
    await _engine.createCompletion(prompt, {
      nPredict: 4096, temperature: 0.3,
      onNewToken: (_t, piece, cur) => {
        const text = typeof piece === 'string' ? piece
          : piece instanceof Uint8Array ? new TextDecoder().decode(piece)
          : typeof cur === 'string' ? cur.slice(out.length) : '';
        if (text) out += text;
      },
      stopTokens: ['<|im_end|>', '<|endoftext|>'],
    });
    return out;
  }
}

export const callLocalModel = callWasm;

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useWasmLLM() {
  const [status, setStatus] = useState(() => _engine ? 'ready' : 'idle');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState(null);
  const [hasWebGPU, setHasWebGPU] = useState(null);
  const [selectedModel, setSelectedModel] = useState('qwen2.5-coder-1.5b-webgpu');
  const [loadedModelId, setLoadedModelId] = useState(_loadedModelId);
  const abortRef = useRef(false);

  useEffect(() => {
    detectWebGPU().then(ok => {
      setHasWebGPU(ok);
      if (!ok) setSelectedModel('qwen2.5-coder-1.5b');
    });
    if (_engine && _loadedModelId) { setLoadedModelId(_loadedModelId); setStatus('ready'); }
  }, []);

  const allModels = hasWebGPU ? { ...WEBGPU_MODELS, ...CPU_MODELS } : CPU_MODELS;

  const loadModel = useCallback(async (modelId) => {
    const id = modelId || selectedModel;
    if (_engine && _loadedModelId === id) {
      setStatus('ready'); setLoadedModelId(id);
      setProgressText((allModels[id]?.label || id) + ' ready ✓');
      return;
    }
    if (_loading) return;
    _loading = true;
    setStatus('loading'); setError(null); setProgress(0);

    try {
      // Unload previous
      if (_engine) {
        try {
          if (_engineType === 'webgpu') await _engine.unload();
          else await _engine.exit();
        } catch {}
        _engine = null; _loadedModelId = null; _engineType = null;
      }

      const isWebGPUModel = !!WEBGPU_MODELS[id];
      const gpuOk = await detectWebGPU();

      if (isWebGPUModel && gpuOk) {
        // ── WebGPU via CDN ────────────────────────────────────
        setStatus('downloading');
        setProgressText('Loading WebLLM engine...');
        const webllm = await loadWebLLM();
        const model = WEBGPU_MODELS[id];
        setProgressText('Loading ' + model.label + '...');

        const engine = await webllm.CreateMLCEngine(model.mlcId, {
          initProgressCallback: (info) => {
            setProgress(info.progress || 0);
            setProgressText(info.text || 'Loading...');
          },
        });
        _engine = engine;
        _engineType = 'webgpu';
      } else {
        // ── wllama CPU ────────────────────────────────────────
        const model = CPU_MODELS[id] || CPU_MODELS['qwen2.5-coder-1.5b'];
        setStatus('downloading');
        setProgressText('Downloading ' + model.label + ' (' + model.size + ')...');

        const wllama = new Wllama({
          'single-thread/wllama.wasm': new URL(
            '@wllama/wllama/src/single-thread/wllama.wasm',
            import.meta.url
          ).href,
        });
        await wllama.loadModelFromUrl(model.url, {
          n_ctx: 2048, n_threads: 1,
          progressCallback: ({ loaded, total }) => {
            setProgress(total > 0 ? loaded / total : 0);
            setProgressText((loaded / 1048576).toFixed(0) + ' MB / ' + (total / 1048576).toFixed(0) + ' MB');
          },
        });
        _engine = wllama;
        _engineType = 'cpu';
      }

      _loadedModelId = id;
      _loading = false;
      setLoadedModelId(id);
      setStatus('ready');
      setProgressText((allModels[id]?.label || id) + ' loaded ✓');
    } catch (err) {
      _loading = false; _engine = null; _loadedModelId = null; _engineType = null;
      setStatus('error');
      setError(err.message);
    }
  }, [selectedModel, allModels]);

  const generate = useCallback(async (messages, onChunk, onDone) => {
    if (!_engine) {
      onDone('', null, 'No model loaded. Open Local WASM to download a model first.');
      return;
    }
    setStatus('generating');
    abortRef.current = false;
    let fullText = '';
    let tokenCount = 0;
    const t0 = performance.now();

    try {
      if (_engineType === 'webgpu') {
        const msgs = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
        const stream = await _engine.chat.completions.create({
          messages: msgs, stream: true, temperature: 0.3, max_tokens: 2048,
        });
        for await (const chunk of stream) {
          if (abortRef.current) break;
          const piece = chunk.choices[0]?.delta?.content || '';
          if (piece) { fullText += piece; tokenCount++; onChunk(piece, fullText); }
        }
      } else {
        let prompt = '<|im_start|>system\n' + SYSTEM_PROMPT + '<|im_end|>\n';
        for (const m of messages) {
          prompt += '<|im_start|>' + m.role + '\n' + m.content + '<|im_end|>\n';
        }
        prompt += '<|im_start|>assistant\n';
        await _engine.createCompletion(prompt, {
          nPredict: 2048, temperature: 0.3, top_p: 0.9, repeat_penalty: 1.1,
          onNewToken: (_t, piece, cur) => {
            if (abortRef.current) return;
            const text = typeof piece === 'string' ? piece
              : piece instanceof Uint8Array ? new TextDecoder().decode(piece)
              : typeof cur === 'string' ? cur.slice(fullText.length) : '';
            if (text) { fullText += text; tokenCount++; onChunk(text, fullText); }
          },
          stopTokens: ['<|im_end|>', '<|endoftext|>'],
        });
      }

      const elapsed = (performance.now() - t0) / 1000;
      setStatus('ready');
      onDone(fullText, {
        tokens: tokenCount,
        elapsed: elapsed.toFixed(1),
        tokPerSec: (tokenCount / Math.max(elapsed, 0.1)).toFixed(1),
        engine: 'wasm/' + _engineType,
        model: _loadedModelId,
      }, null);
    } catch (err) {
      setStatus('ready');
      onDone(fullText || '', null, err.message);
    }
  }, []);

  const stop = useCallback(() => { abortRef.current = true; setStatus('ready'); }, []);

  return {
    status, progress, progressText, error,
    selectedModel, setSelectedModel,
    loadModel, generate, stop,
    loadedModelId, hasWebGPU, allModels,
    isReady: !!_engine && !['loading', 'downloading'].includes(status),
    isLoading: ['loading', 'downloading'].includes(status),
    isGenerating: status === 'generating',
  };
}

// ─── Picker UI ────────────────────────────────────────────────────────────────
export function WasmModelPicker({ wasmLLM, onClose }) {
  const {
    selectedModel, setSelectedModel, loadModel,
    status, progress, progressText, error,
    loadedModelId, allModels, hasWebGPU,
  } = wasmLLM;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-void-950 safe-top safe-bottom">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 glass-panel shrink-0">
        <div className="flex items-center gap-2">
          {hasWebGPU ? <Zap size={15} className="text-neon-cyan" /> : <Cpu size={15} className="text-neon-green" />}
          <h2 className="font-display text-sm font-semibold text-steel-100">
            Local AI — {hasWebGPU ? 'WebGPU ⚡' : 'CPU Mode'}
          </h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
          <X size={16} className="text-steel-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {hasWebGPU && (
          <div className="px-3 py-2.5 rounded-xl bg-neon-cyan/5 border border-neon-cyan/20 flex items-center gap-2">
            <Zap size={13} className="text-neon-cyan shrink-0" />
            <p className="text-[11px] text-neon-cyan/90 font-mono">
              WebGPU detected on A18 — expect 15-30 tok/s vs 2 tok/s CPU
            </p>
          </div>
        )}
        <div className="px-3 py-2 rounded-xl bg-neon-green/5 border border-neon-green/15">
          <p className="text-[10px] text-neon-green/80 font-mono">100% offline after download · No API key · Cached permanently</p>
        </div>
        {['downloading', 'loading'].includes(status) && (
          <div className="px-3 py-2 rounded-xl bg-neon-amber/5 border border-neon-amber/15 flex items-start gap-2">
            <AlertTriangle size={11} className="text-neon-amber shrink-0 mt-0.5" />
            <p className="text-[10px] text-neon-amber/80 font-mono">Keep screen on during download — switching tabs pauses it</p>
          </div>
        )}

        {Object.entries(allModels || {}).map(([id, model]) => {
          const isSelected = selectedModel === id;
          const isLoaded = loadedModelId === id;
          const isGPU = model.type === 'webgpu';
          return (
            <button key={id} onClick={() => setSelectedModel(id)}
              className={'w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all active:scale-[0.98] text-left ' +
                (isSelected ? 'border-neon-green/30 bg-neon-green/[0.06]' : 'border-white/[0.06] hover:border-white/10')}>
              {isGPU
                ? <Zap size={16} className={isSelected ? 'text-neon-cyan' : 'text-steel-500'} />
                : <Cpu size={16} className={isSelected ? 'text-neon-green' : 'text-steel-500'} />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={'text-sm font-mono font-medium ' + (isSelected ? (isGPU ? 'text-neon-cyan' : 'text-neon-green') : 'text-steel-200')}>
                    {model.label}
                  </p>
                  {isLoaded && <span className="text-[9px] font-mono text-neon-green bg-neon-green/10 px-1.5 py-0.5 rounded-full">LOADED</span>}
                  {isGPU && <span className="text-[9px] font-mono text-neon-cyan bg-neon-cyan/10 px-1.5 py-0.5 rounded-full">WebGPU</span>}
                </div>
                <p className="text-[10px] text-steel-500 mt-0.5">{model.size} · {model.desc}</p>
              </div>
              {isLoaded
                ? <Check size={14} className="text-neon-green shrink-0" />
                : isSelected ? <div className="w-2 h-2 rounded-full bg-neon-green/50 shrink-0" /> : null}
            </button>
          );
        })}

        {['downloading', 'loading'].includes(status) && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2 text-xs font-mono text-neon-amber">
              <Loader2 size={12} className="animate-spin shrink-0" />
              <span className="truncate">{progressText}</span>
            </div>
            <div className="w-full h-2 bg-void-300 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-neon-green to-neon-cyan rounded-full transition-all duration-300"
                style={{ width: Math.round(progress * 100) + '%' }} />
            </div>
            <p className="text-[9px] font-mono text-steel-600 text-center">{Math.round(progress * 100)}%</p>
          </div>
        )}

        {status === 'ready' && loadedModelId && (
          <div className="px-3 py-2.5 rounded-xl bg-neon-green/5 border border-neon-green/20">
            <p className="text-[11px] text-neon-green font-mono">✓ {progressText}</p>
          </div>
        )}

        {error && status === 'error' && (
          <div className="px-3 py-2.5 rounded-xl bg-neon-pink/5 border border-neon-pink/20">
            <p className="text-[10px] text-neon-pink font-mono leading-relaxed">{error}</p>
            <p className="text-[10px] text-steel-500 mt-1">Try the CPU fallback model if WebGPU fails.</p>
          </div>
        )}

        <button onClick={() => loadModel(selectedModel)}
          disabled={['loading', 'downloading'].includes(status) || loadedModelId === selectedModel}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-40 bg-neon-green/10 border border-neon-green/25 text-neon-green hover:bg-neon-green/15">
          {['loading', 'downloading'].includes(status)
            ? <><Loader2 size={14} className="animate-spin" />Loading...</>
            : loadedModelId === selectedModel
              ? <><Check size={14} />Ready</>
              : <><Download size={14} />Download &amp; Load</>}
        </button>

        {loadedModelId && (
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl font-mono text-xs border border-neon-green/20 text-neon-green/70 hover:bg-neon-green/5 active:scale-[0.98] transition-all">
            Start chatting offline →
          </button>
        )}
      </div>
    </div>
  );
}
