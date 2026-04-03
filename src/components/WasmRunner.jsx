import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Cpu, X, Download, Check, AlertTriangle } from 'lucide-react';

// Keep screen awake during model download/inference on iOS
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      const lock = await navigator.wakeLock.request('screen');
      return lock;
    }
  } catch {}
  return null;
}

// ─── Single-thread only — GitHub Pages has no COOP/COEP headers ──────────────
// Multi-thread requires SharedArrayBuffer which needs those headers.
// Single-thread works everywhere including iOS Safari with no crashes.

const WASM_MODELS = {
  'qwen2.5-coder-1.5b': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    label: 'Qwen2.5-Coder 1.5B',
    size: '~900MB',
    desc: 'Best for iPhone · fits in Safari RAM',
  },
  'qwen2.5-coder-1.5b-q8': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q8_0.gguf',
    label: 'Qwen2.5-Coder 1.5B Q8',
    size: '~1.6GB',
    desc: 'Higher quality · same model, better precision',
  },
  'smollm2-1.7b': {
    url: 'https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    label: 'SmolLM2 1.7B',
    size: '~1.1GB',
    desc: 'Fast · great for short tasks',
  },
};

const SYSTEM_PROMPT = `You are iclaw, a helpful AI assistant and world-class coding expert running locally on the user's device.

For casual conversation or questions: respond naturally and concisely in plain text.
For coding requests: write complete, production-ready code with no placeholders or TODOs. Wrap code in fenced blocks with language tags. Start each file with a filename comment.
Always match your response style to what the user is actually asking for.`;

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

// Standalone function for agent/multiagent to call WASM directly
export async function callWasm(messages, systemPrompt) {
  if (!_engine) throw new Error('No WASM model loaded. Open Local WASM in settings first.');
  let prompt = '<|im_start|>system\n' + (systemPrompt || SYSTEM_PROMPT) + '<|im_end|>\n';
  for (const msg of messages) {
    prompt += '<|im_start|>' + msg.role + '\n' + msg.content + '<|im_end|>\n';
  }
  prompt += '<|im_start|>assistant\n';
  let fullText = '';
  await _engine.createCompletion(prompt, {
    nPredict: 4096,
    temperature: 0.3,
    top_p: 0.9,
    repeat_penalty: 1.1,
    onNewToken: (_tok, piece, currentText) => {
      let text = '';
      if (typeof piece === 'string') text = piece;
      else if (piece instanceof Uint8Array) text = new TextDecoder().decode(piece);
      else if (typeof currentText === 'string') text = currentText.slice(fullText.length);
      if (text) fullText += text;
    },
    stopTokens: ['<|im_end|>', '<|endoftext|>'],
  });
  return fullText;
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

    // Prevent iOS from killing the page during download
    let wakeLock = await requestWakeLock();
    const releaseWakeLock = async () => {
      try { if (wakeLock) { await wakeLock.release(); wakeLock = null; } } catch {}
    };

    // Re-acquire wake lock if page becomes visible again
    const onVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && _loading) {
        wakeLock = await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    try {
      // Unload previous
      if (_engine) {
        try { await _engine.exit(); } catch {}
        _engine = null;
        _loadedModelId = null;
      }

      const Wllama = await getWllama();

      // Single-thread only — Safari on GitHub Pages can't use SharedArrayBuffer
      const isMultiThread = false;
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
        n_threads: 1,
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
      document.removeEventListener('visibilitychange', onVisibilityChange);
      await releaseWakeLock();
    } catch (err) {
      _loading = false;
      _engine = null;
      _loadedModelId = null;
      setStatus('error');
      setError(err.message);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      await releaseWakeLock();
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
            <p className="text-[10px] font-mono text-neon-amber/80 text-center">
              {Math.round(progress * 100)}%
            </p>
            <div className="px-3 py-2 rounded-lg bg-neon-amber/5 border border-neon-amber/20">
              <p className="text-[10px] font-mono text-neon-amber/90 text-center leading-relaxed">
                ⚠️ Keep this screen open — switching apps pauses the download on iOS
              </p>
            </div>
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
