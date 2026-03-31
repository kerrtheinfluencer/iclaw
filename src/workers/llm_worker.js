/**
 * iclaw v1.4 — 100% Free Inference Worker
 */

let engine = null;
let engineType = null;
let isLoading = false;
let apiKeys = {};
let activeModel = null;

const DEFAULT_PROVIDER = 'gemini'; // Gemini 2.5 Flash = best free coding model with real internet

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'Default + Internet' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'Most Powerful' },
    ],
  },
  groq: {
    name: 'Groq',
    defaultModel: 'openai/gpt-oss-120b',
    models: [
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', tier: 'Best · Reasoning' },
      { id: 'qwen/qwen3-32b', label: 'Qwen 3 32B', tier: 'Code · Thinking' },
      { id: 'moonshotai/kimi-k2-instruct-0905', label: 'Kimi K2', tier: '256K Context' },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tier: 'Reliable' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', tier: 'Vision' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', tier: 'Fastest' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    defaultModel: 'mistralai/mistral-7b-instruct:free',
    models: [
      { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B', tier: 'Most Reliable' },
      { id: 'microsoft/phi-3-mini-128k-instruct:free', label: 'Phi-3 Mini 128K', tier: 'Fast' },
      { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B', tier: 'Smart' },
      { id: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B', tier: 'Compact' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen 2.5 Coder 32B', tier: 'Code' },
      { id: 'deepseek/deepseek-r1:free', label: 'DeepSeek R1', tier: 'Thinking' },
    ],
  },
};

const WASM_MODEL = {
  url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
  name: 'Qwen2.5-Coder-1.5B-Q4',
  size: '~900MB',
};

const SYSTEM_PROMPT = `You are iclaw, a world-class AI coding assistant with the expertise of a senior staff engineer at a top tech company.

CODE QUALITY — always produce:
- Complete, production-ready code with zero placeholders or TODOs
- Modern patterns: ES2024+, CSS custom properties, semantic HTML, ARIA
- Robust error handling and input validation
- For web apps: stunning visuals with animations, transitions, hover states
- Mobile-first responsive layouts using CSS Grid/Flexbox
- Performance-optimized code (debouncing, event delegation, RAF for animations)

FORMATTING:
- Always wrap code in fenced blocks with language tags: \`\`\`html, \`\`\`js, \`\`\`css
- Start every code block with a filename comment: // filename.ext or <!-- filename.html -->
- Keep explanations concise — lead with the code, explain after
- For multi-file projects, write each file in its own clearly labeled block

UI/UX — when building interfaces:
- Dark themes with glassmorphism, gradients, and depth
- Micro-interactions: smooth transitions (0.2-0.3s ease), scale transforms on hover
- Typography hierarchy, consistent spacing (8px grid)
- Empty states, loading states, error states — handle all three
- CSS animations using keyframes or Web Animations API

When the user asks to improve or fix code: rewrite the complete file, never partial snippets.
When given project files as context: use them to maintain consistency with existing patterns.`;

function report(type, payload) {
  self.postMessage({ type, ...payload });
}

// Expose provider/model list so UI can read it
report('providerList', { providers: PROVIDERS });

// ─── Free Web Search ─────────────────────────────────────────────────

let webSearchEnabled = true;

const SEARCH_TRIGGERS = /\b(latest|recent|today|current|news|price|weather|score|update|2025|2026|now|live|happening|who is|what is|search|look up|find out|check)\b/i;
const SEARXNG_INSTANCES = [
  'https://search.sapti.me',
  'https://searx.be',
  'https://search.bus-hit.me',
  'https://paulgo.io',
];
const CORS_PROXY = 'https://corsproxy.io/?url=';

async function searchSearXNG(query) {
  for (const instance of SEARXNG_INSTANCES) {
    try {
      const targetUrl = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en&pageno=1`;
      const res = await fetch(CORS_PROXY + encodeURIComponent(targetUrl), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.results?.length > 0) {
        return data.results.slice(0, 6).map((r, i) => {
          const snippet = r.content || r.title || '';
          return `[${i + 1}] ${r.title}\n${snippet}\nSource: ${r.url}`;
        }).join('\n\n');
      }
    } catch { continue; }
  }
  return null;
}

async function searchDuckDuckGo(query) {
  try {
    const targetUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(CORS_PROXY + encodeURIComponent(targetUrl), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const results = [];
    if (data.Abstract) results.push(`Summary: ${data.Abstract} (Source: ${data.AbstractURL})`);
    if (data.Answer) results.push(`Answer: ${data.Answer}`);
    if (data.RelatedTopics?.length > 0) {
      for (const t of data.RelatedTopics.slice(0, 5)) {
        if (t.Text) results.push(`${t.Text} ${t.FirstURL ? `(${t.FirstURL})` : ''}`);
      }
    }
    return results.length > 0 ? results.join('\n\n') : null;
  } catch { return null; }
}

async function webSearch(query) {
  report('searchStatus', { searching: true, query });
  const results = await searchSearXNG(query) || await searchDuckDuckGo(query);
  report('searchStatus', { searching: false, found: !!results });
  return results;
}

async function enrichWithSearch(messages, forceSearch = false) {
  if (!webSearchEnabled && !forceSearch) return messages;
  const lastMsg = messages[messages.length - 1]?.content || '';
  if (!forceSearch && !SEARCH_TRIGGERS.test(lastMsg)) return messages;
  const query = lastMsg
    .replace(/^(search|look up|find|check|what is|who is|tell me about)\s+/i, '')
    .slice(0, 120).replace(/[^\w\s.'-]/g, '').trim();
  if (!query) return messages;
  const searchResults = await webSearch(query);
  if (!searchResults) return messages;
  const enriched = [...messages];
  enriched.splice(enriched.length - 1, 0, {
    role: 'user',
    content: `[Live web search results — ${new Date().toLocaleDateString()} — use these to give an accurate, up-to-date answer]\n\n${searchResults}`,
  });
  enriched.splice(enriched.length - 1, 0, {
    role: 'assistant',
    content: 'I have current web search results. I will reference them for accuracy.',
  });
  return enriched;
}

// ─── Gemini ──────────────────────────────────────────────────────────

async function inferGemini(messages, model, attachments) {
  const key = apiKeys.gemini;
  if (!key) throw new Error('Gemini API key not set. Get one free at aistudio.google.com/apikey');
  const modelId = model || PROVIDERS.gemini.defaultModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`;
  const contents = [];
  contents.push({ role: 'user', parts: [{ text: SYSTEM_PROMPT }] });
  contents.push({ role: 'model', parts: [{ text: 'Understood. I am iclaw, ready to help.' }] });
  for (const msg of messages) {
    const parts = [{ text: msg.content }];
    if (msg.attachments?.length > 0) {
      for (const att of msg.attachments) {
        parts.push({ inline_data: { mime_type: att.mimeType, data: att.base64 } });
      }
    }
    contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
  }
  if (attachments?.length > 0) {
    const lastUser = contents.findLast((c) => c.role === 'user');
    if (lastUser) {
      for (const att of attachments) {
        lastUser.parts.push({ inline_data: { mime_type: att.mimeType, data: att.base64 } });
      }
    }
  }
  // Always use Google Search grounding — real internet, no proxy needed
  const requestBody = {
    contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, topP: 0.9 },
    tools: [{ google_search: {} }],
  };
  const startTime = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const fullText = parts.map((p) => p.text || '').join('');
  const sources = data.candidates?.[0]?.groundingMetadata?.groundingChunks
    ?.map((c) => c.web?.uri).filter(Boolean) || [];
  const elapsed = (performance.now() - startTime) / 1000;
  const tokens = data.usageMetadata?.candidatesTokenCount || fullText.split(' ').length;
  const textWithSources = sources.length > 0
    ? fullText + `\n\n---\n🌐 **Sources:** ${sources.slice(0, 3).map((s, i) => `[${i+1}] ${s}`).join(' · ')}`
    : fullText;
  return { fullText: textWithSources, tokens, elapsed };
}

// ─── Groq ────────────────────────────────────────────────────────────

async function inferGroq(messages, model) {
  const key = apiKeys.groq;
  if (!key) throw new Error('Groq API key not set. Get one free at console.groq.com/keys');
  const enrichedMessages = await enrichWithSearch(messages);
  const startTime = performance.now();
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: model || PROVIDERS.groq.defaultModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...enrichedMessages.map(({ role, content }) => ({ role, content })),
      ],
      temperature: 0.3, max_tokens: 8192, top_p: 0.9,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const fullText = data.choices?.[0]?.message?.content || '';
  const elapsed = (performance.now() - startTime) / 1000;
  return { fullText, tokens: data.usage?.completion_tokens || fullText.split(' ').length, elapsed };
}

// ─── OpenRouter ──────────────────────────────────────────────────────

async function inferOpenRouter(messages, model) {
  const key = apiKeys.openrouter;
  if (!key) throw new Error('OpenRouter key not set. Get one free at openrouter.ai/keys');
  const enrichedMessages = await enrichWithSearch(messages);
  const startTime = performance.now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://kerrtheinfluencer.github.io/iclaw/',
      'X-Title': 'iclaw',
    },
    body: JSON.stringify({
      model: model || PROVIDERS.openrouter.defaultModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...enrichedMessages.map(({ role, content }) => ({ role, content })),
      ],
      temperature: 0.3, max_tokens: 8192,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const fullText = data.choices?.[0]?.message?.content || '';
  const elapsed = (performance.now() - startTime) / 1000;
  return { fullText, tokens: data.usage?.completion_tokens || fullText.split(' ').length, elapsed };
}

// ─── WASM ────────────────────────────────────────────────────────────

async function initWASM() {
  report('status', { status: 'loading', message: 'Loading WASM engine...' });
  try {
    const { Wllama } = await import(
      /* webpackIgnore: true */
      'https://cdn.jsdelivr.net/npm/@nicepkg/wllama@latest/dist/index.esm.js'
    );
    engine = new Wllama({
      'single-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@nicepkg/wllama@latest/dist/single-thread/wllama.wasm',
      'multi-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@nicepkg/wllama@latest/dist/multi-thread/wllama.wasm',
      'multi-thread/wllama.worker.mjs': 'https://cdn.jsdelivr.net/npm/@nicepkg/wllama@latest/dist/multi-thread/wllama.worker.mjs',
    });
    report('status', { status: 'loading', message: `Downloading model (${WASM_MODEL.size})...` });
    await engine.loadModelFromUrl(WASM_MODEL.url, {
      n_ctx: 2048, n_threads: 4,
      progressCallback: ({ loaded, total }) => {
        report('loadProgress', { progress: total > 0 ? loaded / total : 0, text: `${(loaded / 1024 / 1024).toFixed(0)}MB / ${(total / 1024 / 1024).toFixed(0)}MB` });
      },
    });
    engineType = 'wasm';
    report('status', { status: 'ready', message: `${WASM_MODEL.name} loaded. Fully offline.` });
  } catch (err) { throw new Error(`WASM failed: ${err.message}`); }
}

async function inferWASM(messages) {
  let prompt = `<|im_start|>system\n${SYSTEM_PROMPT}<|im_end|>\n`;
  for (const msg of messages) prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
  prompt += '<|im_start|>assistant\n';
  let fullText = '', tokenCount = 0;
  const startTime = performance.now();
  await engine.createCompletion(prompt, {
    nPredict: 2048, temperature: 0.3, top_p: 0.9, repeat_penalty: 1.1,
    onNewToken: (_t, piece) => {
      if (piece) {
        fullText += piece;
        tokenCount++;
        report('streamChunk', { requestId: 'current', delta: piece, fullText });
      }
    },
    stopTokens: ['<|im_end|>', '<|endoftext|>'],
  });
  return { fullText, tokens: tokenCount, elapsed: (performance.now() - startTime) / 1000 };
}

// ─── Controller ──────────────────────────────────────────────────────

async function initEngine(engineId) {
  if (isLoading) return;
  isLoading = true;
  try {
    if (engineId === 'wasm') {
      if (!engine) await initWASM();
      else report('status', { status: 'ready', message: 'WASM loaded.' });
    } else if (['gemini', 'groq', 'openrouter'].includes(engineId)) {
      if (!apiKeys[engineId]) {
        report('status', { status: 'needsKey', message: `Enter your free ${PROVIDERS[engineId].name} API key.`, provider: engineId });
      } else {
        engineType = engineId;
        activeModel = activeModel || PROVIDERS[engineId].defaultModel;
        report('status', { status: 'ready', message: `${PROVIDERS[engineId].name} ready.` });
      }
    }
  } catch (err) {
    report('status', { status: 'error', message: err.message });
    engine = null; engineType = null;
  } finally { isLoading = false; }
}

async function runInference({ messages, requestId, ragContext, model, attachments }) {
  if (!engineType) { report('error', { requestId, message: 'No engine selected. Open Settings and save your API key.' }); return; }

  const contextMessages = [...messages];
  if (ragContext?.length > 0) {
    const block = ragContext.map((c) => `--- ${c.filename} ---\n${c.content}`).join('\n\n');
    contextMessages.unshift({ role: 'user', content: `[Project files]\n\n${block}` });
    contextMessages.splice(1, 0, { role: 'assistant', content: 'I can see the project files.' });
  }

  report('streamStart', { requestId });
  try {
    let result;
    const m = model || activeModel;
    if (engineType === 'wasm') result = await inferWASM(contextMessages);
    else if (engineType === 'gemini') result = await inferGemini(contextMessages, m, attachments);
    else if (engineType === 'groq') result = await inferGroq(contextMessages, m);
    else if (engineType === 'openrouter') result = await inferOpenRouter(contextMessages, m);

    // Simulate streaming for cloud providers
    if (engineType !== 'wasm') {
      // Split on spaces but preserve <think> blocks for live streaming
      const words = result.fullText.split(' ');
      let acc = '';
      for (let i = 0; i < words.length; i++) {
        acc += (i > 0 ? ' ' : '') + words[i];
        report('streamChunk', { requestId, delta: words[i] + ' ', fullText: acc });
        if (i % 6 === 0) await new Promise((r) => setTimeout(r, 5));
      }
    }

    report('streamEnd', {
      requestId, fullText: result.fullText,
      stats: {
        tokens: result.tokens,
        elapsed: result.elapsed.toFixed(1),
        tokPerSec: (result.tokens / result.elapsed).toFixed(1),
        engine: engineType,
        model: m,
      },
    });
  } catch (err) { report('error', { requestId, message: err.message }); }
}

self.onmessage = async (e) => {
  const { type, ...payload } = e.data;
  switch (type) {
    case 'init': await initEngine(payload.engine || 'gemini'); break;
    case 'setKey':
      apiKeys[payload.provider] = payload.key;
      engineType = payload.provider;
      activeModel = activeModel || PROVIDERS[payload.provider].defaultModel;
      report('status', { status: 'ready', message: `${PROVIDERS[payload.provider].name} ready.` });
      break;
    case 'setModel':
      activeModel = payload.model;
      report('modelChanged', { model: payload.model });
      break;
    case 'inference': await runInference(payload); break;
    case 'toggleSearch':
      webSearchEnabled = payload.enabled;
      report('searchToggled', { enabled: webSearchEnabled });
      break;
    case 'reset':
      report('status', { status: engineType ? 'ready' : 'idle', message: engineType ? 'Ready.' : '' });
      break;
    default: report('error', { message: `Unknown: ${type}` });
  }
};
