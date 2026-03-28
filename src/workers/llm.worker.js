/**
 * iclaw — 100% Free Inference Worker
 * 
 * ALL engines are completely free with no credit card:
 * 
 *  1. Google Gemini (Free Tier) — Gemini 2.5 Flash, no CC, 1500 RPD
 *  2. Groq (Free Tier) — Llama 3.3 70B, blazing fast, no CC
 *  3. OpenRouter (Free Models) — DeepSeek, Mistral, Qwen free models
 *  4. Local WASM — Qwen 1.5B offline, zero internet needed
 * 
 * Get free keys at:
 *  - Gemini: https://aistudio.google.com/apikey
 *  - Groq: https://console.groq.com/keys
 *  - OpenRouter: https://openrouter.ai/keys
 */

let engine = null;
let engineType = null; // 'gemini' | 'groq' | 'openrouter' | 'wasm'
let isLoading = false;
let apiKeys = {}; // { gemini, groq, openrouter }

// ─── Free Model Configs ─────────────────────────────────────────────

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    defaultModel: 'gemini-2.5-flash-preview-05-20',
    models: [
      { id: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash', tier: 'Fast' },
      { id: 'gemini-2.5-pro-preview-05-06', label: 'Gemini 2.5 Pro', tier: 'Best' },
    ],
    keyUrl: 'https://aistudio.google.com/apikey',
    limits: '1500 req/day, 15 RPM',
  },
  groq: {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tier: 'Best' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', tier: 'Fastest' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', tier: 'Code' },
      { id: 'qwen-qwq-32b', label: 'Qwen QWQ 32B', tier: 'Reasoning' },
    ],
    keyUrl: 'https://console.groq.com/keys',
    limits: '30 RPM, 14400 req/day',
  },
  openrouter: {
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'deepseek/deepseek-chat-v3-0324:free',
    models: [
      { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3', tier: 'Best Free' },
      { id: 'qwen/qwen3-32b:free', label: 'Qwen 3 32B', tier: 'Code' },
      { id: 'mistralai/mistral-small-3.1-24b-instruct:free', label: 'Mistral Small 3.1', tier: 'Fast' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', tier: 'Open' },
    ],
    keyUrl: 'https://openrouter.ai/keys',
    limits: '200 req/min (free models)',
  },
};

const WASM_MODEL = {
  url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
  name: 'Qwen2.5-Coder-1.5B-Q4',
  size: '~900MB',
};

const SYSTEM_PROMPT = `You are iclaw, an expert coding assistant. You are precise, concise, and write production-quality code. Rules:
- Always wrap code in markdown fenced code blocks with language tags
- Include the target filename as a comment at the top when relevant
- Use modern best practices for the detected language
- Keep explanations brief — the user is a developer
- For HTML/web apps, write complete self-contained HTML files

You have access to the user's local project files for context.`;

function report(type, payload) {
  self.postMessage({ type, ...payload });
}

// ─── Gemini API (Free, no CC) ───────────────────────────────────────

async function inferGemini(messages, model) {
  const key = apiKeys.gemini;
  if (!key) throw new Error('Gemini API key not set. Get one free at aistudio.google.com/apikey');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || PROVIDERS.gemini.defaultModel}:generateContent?key=${key}`;

  // Convert messages to Gemini format
  const contents = [];
  contents.push({ role: 'user', parts: [{ text: SYSTEM_PROMPT }] });
  contents.push({ role: 'model', parts: [{ text: 'Understood. I am iclaw, ready to help with code.' }] });

  for (const msg of messages) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  const startTime = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        topP: 0.9,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const fullText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const elapsed = (performance.now() - startTime) / 1000;
  const tokens = data.usageMetadata?.candidatesTokenCount || fullText.split(' ').length;

  return { fullText, tokens, elapsed };
}

// ─── Groq API (Free, no CC, OpenAI-compatible) ─────────────────────

async function inferGroq(messages, model) {
  const key = apiKeys.groq;
  if (!key) throw new Error('Groq API key not set. Get one free at console.groq.com/keys');

  const startTime = performance.now();
  const res = await fetch(PROVIDERS.groq.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model || PROVIDERS.groq.defaultModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(({ role, content }) => ({ role, content })),
      ],
      temperature: 0.3,
      max_tokens: 4096,
      top_p: 0.9,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const fullText = data.choices?.[0]?.message?.content || '';
  const elapsed = (performance.now() - startTime) / 1000;
  const tokens = data.usage?.completion_tokens || fullText.split(' ').length;

  return { fullText, tokens, elapsed };
}

// ─── OpenRouter API (Free models, no CC) ────────────────────────────

async function inferOpenRouter(messages, model) {
  const key = apiKeys.openrouter;
  if (!key) throw new Error('OpenRouter API key not set. Get one free at openrouter.ai/keys');

  const startTime = performance.now();
  const res = await fetch(PROVIDERS.openrouter.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://iclaw.app',
      'X-Title': 'iclaw',
    },
    body: JSON.stringify({
      model: model || PROVIDERS.openrouter.defaultModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(({ role, content }) => ({ role, content })),
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const fullText = data.choices?.[0]?.message?.content || '';
  const elapsed = (performance.now() - startTime) / 1000;
  const tokens = data.usage?.completion_tokens || fullText.split(' ').length;

  return { fullText, tokens, elapsed };
}

// ─── Local WASM (llama.cpp, completely offline) ─────────────────────

async function initWASM() {
  report('status', { status: 'loading', message: 'Loading WASM engine (llama.cpp)...' });

  try {
    const { Wllama } = await import(
      /* webpackIgnore: true */
      'https://cdn.jsdelivr.net/npm/@nicepkg/wllama@latest/dist/index.esm.js'
    );

    engine = new Wllama({
      'single-thread/wllama.wasm':
        'https://cdn.jsdelivr.net/npm/@nicepkg/wllama@latest/dist/single-thread/wllama.wasm',
      'multi-thread/wllama.wasm':
        'https://cdn.jsdelivr.net/npm/@nicepkg/wllama@latest/dist/multi-thread/wllama.wasm',
      'multi-thread/wllama.worker.mjs':
        'https://cdn.jsdelivr.net/npm/@nicepkg/wllama@latest/dist/multi-thread/wllama.worker.mjs',
    });

    report('status', { status: 'loading', message: `Downloading model (${WASM_MODEL.size})...` });

    await engine.loadModelFromUrl(WASM_MODEL.url, {
      n_ctx: 2048,
      n_threads: 4,
      progressCallback: ({ loaded, total }) => {
        const progress = total > 0 ? loaded / total : 0;
        report('loadProgress', {
          progress,
          text: `${(loaded / 1024 / 1024).toFixed(0)}MB / ${(total / 1024 / 1024).toFixed(0)}MB`,
        });
      },
    });

    engineType = 'wasm';
    report('status', { status: 'ready', message: `${WASM_MODEL.name} loaded. Fully offline.` });
  } catch (err) {
    throw new Error(`WASM failed: ${err.message}`);
  }
}

async function inferWASM(messages) {
  let prompt = `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n`;
  for (const msg of messages) {
    prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
  }
  prompt += '<|im_start|>assistant\n';

  let fullText = '';
  let tokenCount = 0;
  const startTime = performance.now();

  await engine.createCompletion(prompt, {
    nPredict: 2048,
    temperature: 0.3,
    top_p: 0.9,
    repeat_penalty: 1.1,
    onNewToken: (_token, piece) => {
      if (piece) {
        fullText += piece;
        tokenCount++;
        report('streamChunk', { requestId: 'current', delta: piece, fullText });
      }
    },
    stopTokens: ['<|im_end|>', '<|endoftext|>'],
  });

  const elapsed = (performance.now() - startTime) / 1000;
  return { fullText, tokens: tokenCount, elapsed };
}

// ─── Controller ─────────────────────────────────────────────────────

async function initEngine(engineId, model) {
  if (isLoading) return;
  isLoading = true;

  try {
    if (engineId === 'wasm') {
      if (!engine) await initWASM();
      else report('status', { status: 'ready', message: 'WASM already loaded.' });
    } else if (['gemini', 'groq', 'openrouter'].includes(engineId)) {
      const key = apiKeys[engineId];
      if (!key) {
        const provider = PROVIDERS[engineId];
        report('status', {
          status: 'needsKey',
          message: `Enter your free ${provider.name} API key. Get one at ${provider.keyUrl}`,
          provider: engineId,
        });
      } else {
        engineType = engineId;
        report('status', {
          status: 'ready',
          message: `${PROVIDERS[engineId].name} ready (free tier).`,
        });
      }
    }
  } catch (err) {
    report('status', { status: 'error', message: err.message });
    engine = null;
    engineType = null;
  } finally {
    isLoading = false;
  }
}

async function runInference({ messages, requestId, ragContext, model }) {
  if (!engineType) {
    report('error', { requestId, message: 'No engine selected.' });
    return;
  }

  // Inject RAG context
  const contextMessages = [...messages];
  if (ragContext?.length > 0) {
    const block = ragContext.map((c) => `--- ${c.filename} ---\n${c.content}`).join('\n\n');
    contextMessages.unshift({ role: 'user', content: `[Project files for reference]\n\n${block}` });
    contextMessages.splice(1, 0, { role: 'assistant', content: 'I can see the project files. I will reference them as needed.' });
  }

  report('streamStart', { requestId });

  try {
    let result;

    if (engineType === 'wasm') {
      result = await inferWASM(contextMessages);
    } else {
      // Cloud APIs — simulate streaming for UI
      if (engineType === 'gemini') result = await inferGemini(contextMessages, model);
      else if (engineType === 'groq') result = await inferGroq(contextMessages, model);
      else if (engineType === 'openrouter') result = await inferOpenRouter(contextMessages, model);

      // Simulate streaming for cloud responses
      const words = result.fullText.split(' ');
      let accumulated = '';
      for (let i = 0; i < words.length; i++) {
        accumulated += (i > 0 ? ' ' : '') + words[i];
        report('streamChunk', { requestId, delta: words[i] + ' ', fullText: accumulated });
        if (i % 6 === 0) await new Promise((r) => setTimeout(r, 5));
      }
    }

    report('streamEnd', {
      requestId,
      fullText: result.fullText,
      stats: {
        tokens: result.tokens,
        elapsed: result.elapsed.toFixed(1),
        tokPerSec: (result.tokens / result.elapsed).toFixed(1),
        engine: engineType,
        model: model || PROVIDERS[engineType]?.defaultModel || 'local',
      },
    });
  } catch (err) {
    report('error', { requestId, message: err.message });
  }
}

// ─── Message Handler ────────────────────────────────────────────────

self.onmessage = async (e) => {
  const { type, ...payload } = e.data;

  switch (type) {
    case 'init':
      await initEngine(payload.engine || 'gemini', payload.model);
      break;
    case 'setKey':
      apiKeys[payload.provider] = payload.key;
      engineType = payload.provider;
      report('status', {
        status: 'ready',
        message: `${PROVIDERS[payload.provider].name} ready (free tier).`,
      });
      break;
    case 'setModel':
      // Just update the active model, no re-init needed
      report('modelChanged', { model: payload.model, engine: engineType });
      break;
    case 'inference':
      await runInference(payload);
      break;
    case 'reset':
      report('status', { status: 'ready', message: 'Conversation reset.' });
      break;
    case 'getProviders':
      report('providers', { providers: PROVIDERS });
      break;
    default:
      report('error', { message: `Unknown: ${type}` });
  }
};
