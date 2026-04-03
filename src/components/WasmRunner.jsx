/**
 * WasmRunner — runs wllama on the MAIN THREAD (not worker)
 * Safari/iOS blocks dynamic import() of ES modules in workers
 * This component loads wllama via a <script type="module"> tag
 * and communicates via window events
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Cpu, X, Download } from 'lucide-react';

const WASM_MODELS = {
  'qwen2.5-coder-3b': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    label: 'Qwen2.5-Coder 3B',
    size: '~1.9GB',
  },
  'qwen2.5-coder-1.5b': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    label: 'Qwen2.5-Coder 1.5B',
    size: '~900MB',
  },
  'phi-3.5-mini': {
    url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
    label: 'Phi-3.5 Mini',
    size: '~2.2GB',
  },
};

const SYSTEM_PROMPT = `You are iclaw, a world-class AI coding assistant. Write complete, production-ready code. Always use fenced code blocks with language tags. Start every code block with a filename comment.`;

// Load wllama via dynamic script injection (works on iOS Safari main thread)
let wllamaInstance = null;
let wllamaLoading = false;

async function loadWllama() {
  if (wllamaInstance) return wllamaInstance;
  if (wllamaLoading) {
    // Wait for existing load
    await new Promise(r => {
      const check = setInterval(() => { if (!wllamaLoading) { clearInterval(check); r(); } }, 100);
    });
    return wllamaInstance;
  }
  wllamaLoading = true;
  try {
    // Use skypack which handles Safari ES module loading better
    const mod = await import('https://cdn.skypack.dev/@wllama/wllama@2.3.0');
    wllamaInstance = mod.Wllama || mod.default?.Wllama;
    wllamaLoading = false;
    return wllamaInstance;
  } catch (e1) {
    try {
      // Fallback: jsdelivr ESM
      const mod2 = await import('https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.0/dist/esm/index.js');
      wllamaInstance = mod2.Wllama || mod2.default?.Wllama;
      wllamaLoading = false;
      return wllamaInstance;
    } catch (e2) {
      wllamaLoading = false;
      throw new Error('Failed to load wllama: ' + e2.message);
    }
  }
}

export function useWasmLLM() {
  const [status, setStatus] = useState('idle'); // idle | loading | downloading | ready | generating | error
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState('qwen2.5-coder-1.5b');
  const engineRef = useRef(null);
  const abortRef = useRef(false);

  const loadModel = useCallback(async (modelId = selectedModel) => {
    setStatus('loading');
    setError(null);
    setProgress(0);
    abortRef.current = false;

    try {
      const WllamaClass = await loadWllama();
      if (!WllamaClass) throw new Error('Wllama class not found in module');

      const wllama = new WllamaClass({
        'single-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.0/dist/single-thread/wllama.wasm',
        'multi-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.0/dist/multi-thread/wllama.wasm',
        'multi-thread/wllama.worker.mjs': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.0/dist/multi-thread/wllama.worker.mjs',
      });

      const model = WASM_MODELS[modelId];
      setStatus('downloading');
      setProgressText(`Downloading ${model.label} (${model.size})...`);

      await wllama.loadModelFromUrl(model.url, {
        n_ctx: 4096,
        n_threads: 4,
        progressCallback: ({ loaded, total }) => {
          const pct = total > 0 ? loaded / total : 0;
          setProgress(pct);
          setProgressText(`${(loaded / 1024 / 1024).toFixed(0)} MB / ${(total / 1024 / 1024).toFixed(0)} MB`);
        },
      });

      engineRef.current = wllama;
      setStatus('ready');
      setProgressText(`${model.label} loaded — offline mode active`);
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  }, [selectedModel]);

  const generate = useCallback(async (messages, onChunk, onDone) => {
    if (!engineRef.current) { onDone('', null, 'Model not loaded'); return; }
    setStatus('generating');
    abortRef.current = false;

    let prompt = `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n`;
    for (const msg of messages) {
      prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
    }
    prompt += '<|im_start|>assistant\n';

    let fullText = '';
    let tokenCount = 0;
    const startTime = performance.now();

    try {
      await engineRef.current.createCompletion(prompt, {
        nPredict: 2048,
        temperature: 0.3,
        top_p: 0.9,
        repeat_penalty: 1.1,
        onNewToken: (_token, piece) => {
          if (abortRef.current) return;
          if (piece) {
            fullText += piece;
            tokenCount++;
            onChunk(piece, fullText);
          }
        },
        stopTokens: ['<|im_end|>', '<|endoftext|>'],
      });

      const elapsed = (performance.now() - startTime) / 1000;
      setStatus('ready');
      onDone(fullText, {
        tokens: tokenCount,
        elapsed: elapsed.toFixed(1),
        tokPerSec: (tokenCount / elapsed).toFixed(1),
        engine: 'wasm',
        model: selectedModel,
      }, null);
    } catch (err) {
      setStatus('ready');
      onDone(fullText, null, err.message);
    }
  }, [selectedModel]);

  const stop = useCallback(() => {
    abortRef.current = true;
    setStatus('ready');
  }, []);

  const unload = useCallback(async () => {
    if (engineRef.current) {
      try { await engineRef.current.exit(); } catch {}
      engineRef.current = null;
    }
    setStatus('idle');
  }, []);

  return {
    status, progress, progressText, error,
    selectedModel, setSelectedModel,
    loadModel, generate, stop, unload,
    isReady: status === 'ready',
    isLoading: status === 'loading' || status === 'downloading',
    isGenerating: status === 'generating',
    models: WASM_MODELS,
  };
}

export function WasmModelPicker({ wasmLLM, onClose }) {
  const { selectedModel, setSelectedModel, loadModel, status, progress, progressText, error, models } = wasmLLM;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-void-950 safe-top safe-bottom">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Cpu size={15} className="text-neon-green" />
          <h2 className="font-display text-sm font-semibold text-steel-100">Local WASM Model</h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5">
          <X size={16} className="text-steel-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="px-3 py-2 rounded-lg bg-neon-green/5 border border-neon-green/15">
          <p className="text-[10px] text-neon-green/80 font-mono">
            Runs 100% offline on your device after download. No API key needed.
          </p>
        </div>

        <div className="space-y-2">
          {Object.entries(models).map(([id, model]) => (
            <button key={id} onClick={() => setSelectedModel(id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.98] ${
                selectedModel === id
                  ? 'border-neon-green/30 bg-neon-green/[0.06]'
                  : 'border-white/[0.06] hover:border-white/10'
              }`}>
              <Cpu size={16} className={selectedModel === id ? 'text-neon-green' : 'text-steel-500'} />
              <div className="flex-1 text-left">
                <p className={`text-sm font-mono font-medium ${selectedModel === id ? 'text-neon-green' : 'text-steel-200'}`}>
                  {model.label}
                </p>
                <p className="text-[10px] text-steel-500">{model.size} · cached after first download</p>
              </div>
              {selectedModel === id && (
                <div className="w-2 h-2 rounded-full bg-neon-green" />
              )}
            </button>
          ))}
        </div>

        {(status === 'downloading' || status === 'loading') && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono text-neon-amber">
              <Loader2 size={12} className="animate-spin" />
              {progressText}
            </div>
            <div className="w-full h-2 bg-void-300 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-neon-green to-neon-cyan rounded-full transition-all duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="text-[9px] font-mono text-steel-600 text-center">{Math.round(progress * 100)}%</p>
          </div>
        )}

        {status === 'ready' && (
          <div className="px-3 py-2 rounded-lg bg-neon-green/5 border border-neon-green/20">
            <p className="text-[10px] text-neon-green font-mono">✓ {progressText}</p>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded-lg bg-neon-pink/5 border border-neon-pink/20">
            <p className="text-[10px] text-neon-pink font-mono">{error}</p>
          </div>
        )}

        <button
          onClick={() => loadModel(selectedModel)}
          disabled={status === 'loading' || status === 'downloading' || status === 'ready'}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-40 bg-neon-green/10 border border-neon-green/25 text-neon-green hover:bg-neon-green/15"
        >
          <Download size={14} />
          {status === 'ready' ? 'Model Ready' : status === 'downloading' ? 'Downloading...' : 'Download & Load'}
        </button>

        <p className="text-[9px] text-steel-600 text-center font-mono">
          Model cached in browser storage after first download
        </p>
      </div>
    </div>
  );
}
