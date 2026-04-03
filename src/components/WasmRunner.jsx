import React, { useState, useRef, useCallback } from 'react';
import { Loader2, Cpu, X, Download, Check, AlertTriangle } from 'lucide-react';

// ─── Single-thread only — GitHub Pages has no COOP/COEP headers ──────────────
// Multi-thread requires SharedArrayBuffer which needs those headers.
// Single-thread works everywhere including iOS Safari with no crashes.

const WASM_MODELS = {
  'qwen2.5-coder-1.5b': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    label: 'Qwen2.5-Coder 1.5B',
    size: '~900MB',
    desc: 'Fastest · recommended for iPhone',
  },
  'qwen2.5-coder-3b': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    label: 'Qwen2.5-Coder 3B',
    size: '~1.9GB',
    desc: 'Better quality · needs 3GB free RAM',
  },
  'phi-3.5-mini': {
    url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
    label: 'Phi-3.5 Mini',
    size: '~2.2GB',
    desc: 'Strong reasoning · needs 3GB free RAM',
  },
};

const SYSTEM_PROMPT = `You are iclaw, a world-class AI coding assistant. Write complete, production-ready code with no placeholders. Always wrap code in fenced blocks with language tags and start with a filename comment.`;

// Singleton engine — persists across re-renders
let _engine = null;
let _loadedModelId = null;
let _loading = false;

// Load wllama dynamically — only import when needed to keep bundle light
async function getWllama() {
  // Use the npm-installed package via static import
  const mod = await import('@wllama/wllama');
  return mod.Wllama;
}

export function useWasmLLM() {
  const [status, setStatus] = useState(() => _engine ? 'ready' : 'idle');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState('qwen2.5-coder-1.5b');
  const [loadedModelId, setLoadedModelId] = useState(_loadedModelId);
  const abortRef = useRef(false);

  const loadModel = useCallback(async (modelId) => {
    const id = modelId || selectedModel;

    // Already loaded
    if (_engine && _loadedModelId === id) {
      setStatus('ready');
      setLoadedModelId(id);
      setProgressText(WASM_MODELS[id].label + ' ready ✓');
      return;
    }

    if (_loading) return;
    _loading = true;
    setStatus('loading');
    setError(null);
    setProgress(0);

    try {
      // Unload previous
      if (_engine) {
        try { await _engine.exit(); } catch {}
        _engine = null;
        _loadedModelId = null;
      }

      const Wllama = await getWllama();

      // CRITICAL: single-thread only config
      // Multi-thread crashes on GitHub Pages (no COOP/COEP = no SharedArrayBuffer)
      const wllama = new Wllama({
        'single-thread/wllama.wasm': new URL(
          '@wllama/wllama/src/single-thread/wllama.wasm',
          import.meta.url
        ).href,
      });

      const model = WASM_MODELS[id];
      setStatus('downloading');
      setProgressText('Downloading ' + model.label + ' (' + model.size + ')...');

      await wllama.loadModelFromUrl(model.url, {
        n_ctx: 2048,
        n_threads: 1, // single thread
        progressCallback: ({ loaded, total }) => {
          const pct = total > 0 ? loaded / total : 0;
          setProgress(pct);
          const mb = (loaded / 1048576).toFixed(0);
          const tmb = total > 0 ? (total / 1048576).toFixed(0) : '?';
          setProgressText(mb + ' MB / ' + tmb + ' MB');
        },
      });

      _engine = wllama;
      _loadedModelId = id;
      _loading = false;
      setLoadedModelId(id);
      setStatus('ready');
      setProgressText(model.label + ' loaded — offline ready ✓');
    } catch (err) {
      _loading = false;
      _engine = null;
      _loadedModelId = null;
      setStatus('error');
      setError(err.message);
    }
  }, [selectedModel]);

  const generate = useCallback(async (messages, onChunk, onDone) => {
    if (!_engine) {
      onDone('', null, 'No model loaded. Open Settings → Local WASM to download a model first.');
      return;
    }

    setStatus('generating');
    abortRef.current = false;

    let prompt = '<|im_start|>system\n' + SYSTEM_PROMPT + '<|im_end|>\n';
    for (const msg of messages) {
      prompt += '<|im_start|>' + msg.role + '\n' + msg.content + '<|im_end|>\n';
    }
    prompt += '<|im_start|>assistant\n';

    let fullText = '';
    let tokenCount = 0;
    const t0 = performance.now();

    try {
      await _engine.createCompletion(prompt, {
        nPredict: 2048,
        temperature: 0.3,
        top_p: 0.9,
        repeat_penalty: 1.1,
        onNewToken: (_tok, piece, currentText) => {
          if (abortRef.current) return;
          // wllama passes piece as Uint8Array — decode to string
          let text = '';
          if (typeof piece === 'string') {
            text = piece;
          } else if (piece instanceof Uint8Array) {
            text = new TextDecoder().decode(piece);
          } else if (typeof currentText === 'string') {
            // fallback: use the full running text and diff it
            text = currentText.slice(fullText.length);
          }
          if (text) {
            fullText += text;
            tokenCount++;
            onChunk(text, fullText);
          }
        },
        stopTokens: ['<|im_end|>', '<|endoftext|>'],
      });

      const elapsed = (performance.now() - t0) / 1000;
      setStatus('ready');
      onDone(fullText, {
        tokens: tokenCount,
        elapsed: elapsed.toFixed(1),
        tokPerSec: (tokenCount / Math.max(elapsed, 0.1)).toFixed(1),
        engine: 'wasm',
        model: _loadedModelId,
      }, null);
    } catch (err) {
      setStatus('ready');
      onDone(fullText || '', null, err.message);
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current = true;
    setStatus('ready');
  }, []);

  return {
    status, progress, progressText, error,
    selectedModel, setSelectedModel,
    loadModel, generate, stop,
    loadedModelId,
    isReady: !!_engine && status !== 'loading' && status !== 'downloading',
    isLoading: status === 'loading' || status === 'downloading',
    isGenerating: status === 'generating',
    models: WASM_MODELS,
  };
}

export function WasmModelPicker({ wasmLLM, onClose }) {
  const {
    selectedModel, setSelectedModel, loadModel,
    status, progress, progressText, error, loadedModelId, models,
  } = wasmLLM;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-void-950 safe-top safe-bottom">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 glass-panel shrink-0">
        <div className="flex items-center gap-2">
          <Cpu size={15} className="text-neon-green" />
          <h2 className="font-display text-sm font-semibold text-steel-100">Local WASM Model</h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
          <X size={16} className="text-steel-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="px-3 py-2.5 rounded-xl bg-neon-green/5 border border-neon-green/15">
          <p className="text-[11px] text-neon-green/80 font-mono leading-relaxed">
            Runs 100% offline after download. No API key needed. Single-thread mode for iOS compatibility.
          </p>
        </div>

        <div className="px-3 py-2 rounded-xl bg-neon-amber/5 border border-neon-amber/15 flex items-start gap-2">
          <AlertTriangle size={12} className="text-neon-amber shrink-0 mt-0.5" />
          <p className="text-[10px] text-neon-amber/80 font-mono leading-relaxed">
            3B+ models need ~3GB free RAM. If the app crashes, use Qwen 1.5B instead.
          </p>
        </div>

        {Object.entries(models).map(([id, model]) => {
          const isSelected = selectedModel === id;
          const isLoaded = loadedModelId === id;
          return (
            <button key={id} onClick={() => setSelectedModel(id)}
              className={'w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all active:scale-[0.98] text-left ' + (
                isSelected ? 'border-neon-green/30 bg-neon-green/[0.06]' : 'border-white/[0.06] hover:border-white/10'
              )}>
              <Cpu size={16} className={isSelected ? 'text-neon-green' : 'text-steel-500'} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={'text-sm font-mono font-medium ' + (isSelected ? 'text-neon-green' : 'text-steel-200')}>
                    {model.label}
                  </p>
                  {isLoaded && (
                    <span className="text-[9px] font-mono text-neon-green bg-neon-green/10 px-1.5 py-0.5 rounded-full">
                      LOADED
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-steel-500 mt-0.5">{model.size} · {model.desc}</p>
              </div>
              {isLoaded
                ? <Check size={14} className="text-neon-green shrink-0" />
                : isSelected
                  ? <div className="w-2 h-2 rounded-full bg-neon-green/50 shrink-0" />
                  : null
              }
            </button>
          );
        })}

        {(status === 'downloading' || status === 'loading') && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2 text-xs font-mono text-neon-amber">
              <Loader2 size={12} className="animate-spin shrink-0" />
              <span className="truncate">{progressText}</span>
            </div>
            <div className="w-full h-2 bg-void-300 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-neon-green to-neon-cyan rounded-full transition-all duration-300"
                style={{ width: Math.round(progress * 100) + '%' }} />
            </div>
            <p className="text-[9px] font-mono text-steel-600 text-center">
              {Math.round(progress * 100)}% — keep app open, don't switch tabs
            </p>
          </div>
        )}

        {status === 'ready' && loadedModelId && (
          <div className="px-3 py-2.5 rounded-xl bg-neon-green/5 border border-neon-green/20">
            <p className="text-[11px] text-neon-green font-mono">✓ {progressText}</p>
            <p className="text-[10px] text-steel-500 mt-0.5">Close and start chatting offline</p>
          </div>
        )}

        {error && status === 'error' && (
          <div className="px-3 py-2.5 rounded-xl bg-neon-pink/5 border border-neon-pink/20">
            <p className="text-[10px] text-neon-pink font-mono leading-relaxed">{error}</p>
            <p className="text-[10px] text-steel-500 mt-1">If crashed, try Qwen 1.5B — it fits in iPhone memory.</p>
          </div>
        )}

        <button
          onClick={() => loadModel(selectedModel)}
          disabled={status === 'loading' || status === 'downloading' || loadedModelId === selectedModel}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-40 bg-neon-green/10 border border-neon-green/25 text-neon-green hover:bg-neon-green/15"
        >
          {(status === 'loading' || status === 'downloading')
            ? <><Loader2 size={14} className="animate-spin" /> Downloading...</>
            : loadedModelId === selectedModel
              ? <><Check size={14} /> Model Ready</>
              : <><Download size={14} /> Download &amp; Load</>
          }
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
