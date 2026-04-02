/**
 * iclaw v1.5 — Multi-Provider Free Inference Worker
 * Providers: Gemini, Groq, OpenRouter, Cerebras, SambaNova, Puter (no key!)
 */

let engine = null;
let engineType = null;
let isLoading = false;
let apiKeys = {};
let activeModel = null;

const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'Default + Internet' },
      { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   tier: 'Most Powerful' },
      { id: 'gemma-3-27b-it',   label: 'Gemma 3 27B',      tier: 'Open · Fast' },
    ],
  },
  groq: {
    name: 'Groq',
    defaultModel: 'openai/gpt-oss-120b',
    models: [
      { id: 'openai/gpt-oss-120b',                        label: 'GPT-OSS 120B',    tier: 'Best · Reasoning' },
      { id: 'qwen/qwen3-32b',                             label: 'Qwen 3 32B',      tier: 'Code · Thinking' },
      { id: 'moonshotai/kimi-k2-instruct-0905',           label: 'Kimi K2',         tier: '256K Context' },
      { id: 'llama-3.3-70b-versatile',                    label: 'Llama 3.3 70B',  tier: 'Reliable' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct',  label: 'Llama 4 Scout',  tier: 'Vision' },
      { id: 'llama-3.1-8b-instant',                       label: 'Llama 3.1 8B',   tier: 'Fastest' },
    ],
  },
  cerebras: {
    name: 'Cerebras',
    defaultModel: 'gpt-oss-120b',
    models: [
      { id: 'gpt-oss-120b',                      label: 'GPT-OSS 120B',   tier: 'Best · Reasoning' },
      { id: 'llama-3.3-70b',                     label: 'Llama 3.3 70B',  tier: '2000 tok/s' },
      { id: 'llama-4-scout-17b-16e-instruct',    label: 'Llama 4 Scout',  tier: 'Vision' },
      { id: 'llama3.1-8b',                       label: 'Llama 3.1 8B',   tier: 'Fastest' },
    ],
  },
  sambanova: {
    name: 'SambaNova',
    defaultModel: 'Meta-Llama-3.3-70B-Instruct',
    models: [
      { id: 'Meta-Llama-3.3-70B-Instruct',        label: 'Llama 3.3 70B',   tier: 'Best Free' },
      { id: 'Meta-Llama-4-Maverick-17B-128E-Instruct', label: 'Llama 4 Maverick', tier: '10M Context' },
      { id: 'DeepSeek-R1',                         label: 'DeepSeek R1',    tier: 'Thinking' },
      { id: 'DeepSeek-V3-0324',                    label: 'DeepSeek V3',    tier: 'Coding' },
      { id: 'Qwen3-32B',                           label: 'Qwen 3 32B',     tier: 'Multilingual' },
    ],
  },
  huggingface: {
    name: 'Hugging Face',
    defaultModel: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    models: [
      { id: 'Qwen/Qwen2.5-Coder-32B-Instruct',      label: 'Qwen2.5 Coder 32B', tier: 'Best Coding' },
      { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B', label: 'DeepSeek R1 32B', tier: 'Thinking' },
      { id: 'meta-llama/Llama-3.3-70B-Instruct',    label: 'Llama 3.3 70B',    tier: 'Powerful' },
      { id: 'google/gemma-3-27b-it',                label: 'Gemma 3 27B',      tier: 'Smart' },
      { id: 'mistralai/Mistral-7B-Instruct-v0.3',   label: 'Mistral 7B',       tier: 'Fast' },
      { id: 'microsoft/Phi-3.5-mini-instruct',      label: 'Phi-3.5 Mini',     tier: 'Efficient' },
    ],
  },
  together: {
    name: 'Together AI',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3',              label: 'DeepSeek V3',      tier: 'Best Coding' },
      { id: 'deepseek-ai/DeepSeek-R1',              label: 'DeepSeek R1',      tier: 'Thinking' },
      { id: 'Qwen/Qwen3-235B-A22B',                 label: 'Qwen 3 235B',      tier: 'Massive' },
      { id: 'Qwen/Qwen2.5-Coder-32B-Instruct',      label: 'Qwen2.5 Coder 32B',tier: 'Code' },
      { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', label: 'Llama 4 Maverick', tier: '10M ctx' },
      { id: 'google/gemma-3-27b-it',                label: 'Gemma 3 27B',      tier: 'Smart' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    defaultModel: 'mistralai/mistral-7b-instruct:free',
    models: [
      { id: 'mistralai/mistral-7b-instruct:free',          label: 'Mistral 7B',         tier: 'Most Reliable' },
      { id: 'microsoft/phi-3-mini-128k-instruct:free',     label: 'Phi-3 Mini 128K',   tier: 'Fast' },
      { id: 'google/gemma-3-27b-it:free',                  label: 'Gemma 3 27B',        tier: 'Smart' },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free',       label: 'Qwen 2.5 Coder 32B',tier: 'Code' },
      { id: 'deepseek/deepseek-r1:free',                   label: 'DeepSeek R1',        tier: 'Thinking' },
      { id: 'meta-llama/llama-3.2-3b-instruct:free',       label: 'Llama 3.2 3B',      tier: 'Compact' },
    ],
  },
};

// WASM model options — user can switch via settings
const WASM_MODELS = {
  'qwen2.5-coder-3b': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    name: 'Qwen2.5-Coder-3B-Q4',
    size: '~1.9GB',
    desc: 'Best coding — recommended',
  },
  'qwen2.5-coder-1.5b': {
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    name: 'Qwen2.5-Coder-1.5B-Q4',
    size: '~900MB',
    desc: 'Fast — low RAM',
  },
  'phi-3.5-mini': {
    url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
    name: 'Phi-3.5-Mini-Q4',
    size: '~2.2GB',
    desc: 'Fast reasoning',
  },
  'llama-3.2-3b': {
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    name: 'Llama-3.2-3B-Q4',
    size: '~2.0GB',
    desc: 'General purpose',
  },
};

let selectedWasmModelId = 'qwen2.5-coder-3b';
const WASM_MODEL = WASM_MODELS[selectedWasmModelId];

const SYSTEM_PROMPT = `You are iclaw, a world-class AI coding assistant with the expertise of a senior staff engineer at a top tech company.

CODE QUALITY — always produce:
- Complete, production-ready code with zero placeholders or TODOs
- Modern patterns: ES2024+, CSS custom properties, semantic HTML, ARIA
- Robust error handling and input validation
- For web apps: stunning visuals with animations, transitions, hover states
- Mobile-first responsive layouts using CSS Grid/Flexbox
- Performance-optimized code (debouncing, event delegation, RAF for animations)
- ALWAYS write self-contained single HTML files — all CSS and JS must be inline inside the HTML file, never reference external script.js or style.css files
- For Three.js/canvas apps: load THREE via CDN script tag, write all JS inline in a <script> tag at bottom of body

FORMATTING:
- Always wrap code in fenced blocks with language tags
- Start every code block with a filename comment: // filename.ext
- Keep explanations concise — lead with the code
- For multi-file projects, write each file in its own clearly labeled block

UI/UX — when building interfaces:
- Dark themes with glassmorphism, gradients, and depth
- Micro-interactions: smooth transitions, scale transforms on hover
- Typography hierarchy, consistent spacing (8px grid)
- Empty states, loading states, error states — handle all three`;

function report(type, payload) {
  self.postMessage({ type, ...payload });
}

// ─── Web Search ──────────────────────────────────────────────────────

let webSearchEnabled = true;
const SEARCH_TRIGGERS = /\b(latest|recent|today|current|news|price|weather|score|update|2025|2026|now|live|happening|who is|what is|search|look up|find out|check)\b/i;
const CORS_PROXY = 'https://corsproxy.io/?url=';
const SEARXNG_INSTANCES = ['https://search.sapti.me', 'https://searx.be', 'https://paulgo.io'];

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
        return data.results.slice(0, 6).map((r, i) => `[${i + 1}] ${r.title}\n${r.content || ''}\nSource: ${r.url}`).join('\n\n');
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
    if (data.Abstract) results.push(`Summary: ${data.Abstract}`);
    if (data.Answer) results.push(`Answer: ${data.Answer}`);
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
  const query = lastMsg.replace(/^(search|look up|find|check|what is|who is|tell me about)\s+/i, '').slice(0, 120).replace(/[^\w\s.'-]/g, '').trim();
  if (!query) return messages;
  const searchResults = await webSearch(query);
  if (!searchResults) return messages;
  const enriched = [...messages];
  enriched.splice(enriched.length - 1, 0, { role: 'user', content: `[Live web search results — ${new Date().toLocaleDateString()}]\n\n${searchResults}` });
  enriched.splice(enriched.length - 1, 0, { role: 'assistant', content: 'I have current web search results. I will reference them for accuracy.' });
  return enriched;
}

// ─── Gemini ──────────────────────────────────────────────────────────

async function inferGemini(messages, model, attachments) {
  const key = apiKeys.gemini;
  if (!key) throw new Error('Gemini API key not set. Get one free at aistudio.google.com/apikey');
  const modelId = model || PROVIDERS.gemini.defaultModel;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`;
  const contents = [
    { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: 'Understood. I am iclaw, ready to help.' }] },
  ];
  for (const msg of messages) {
    const parts = [{ text: msg.content }];
    if (msg.attachments?.length > 0) {
      for (const att of msg.attachments) parts.push({ inline_data: { mime_type: att.mimeType, data: att.base64 } });
    }
    contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
  }
  if (attachments?.length > 0) {
    const lastUser = contents.findLast(c => c.role === 'user');
    if (lastUser) for (const att of attachments) lastUser.parts.push({ inline_data: { mime_type: att.mimeType, data: att.base64 } });
  }
  const requestBody = {
    contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, topP: 0.9 },
    tools: [{ google_search: {} }],
  };
  const startTime = performance.now();
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const fullText = parts.map(p => p.text || '').join('');
  const sources = data.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(c => c.web?.uri).filter(Boolean) || [];
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
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...enrichedMessages.map(({ role, content }) => ({ role, content }))],
      temperature: 0.3, max_tokens: 8192, top_p: 0.9,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const fullText = data.choices?.[0]?.message?.content || '';
  const elapsed = (performance.now() - startTime) / 1000;
  return { fullText, tokens: data.usage?.completion_tokens || fullText.split(' ').length, elapsed };
}

// ─── Cerebras ────────────────────────────────────────────────────────

async function inferCerebras(messages, model) {
  const key = apiKeys.cerebras;
  if (!key) throw new Error('Cerebras API key not set. Get one free at cloud.cerebras.ai');
  const enrichedMessages = await enrichWithSearch(messages);
  const startTime = performance.now();
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: model || PROVIDERS.cerebras.defaultModel,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...enrichedMessages.map(({ role, content }) => ({ role, content }))],
      temperature: 0.3, max_tokens: 8192,
    }),
  });
  if (!res.ok) throw new Error(`Cerebras ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const fullText = data.choices?.[0]?.message?.content || '';
  const elapsed = (performance.now() - startTime) / 1000;
  return { fullText, tokens: data.usage?.completion_tokens || fullText.split(' ').length, elapsed };
}

// ─── SambaNova ───────────────────────────────────────────────────────

async function inferSambaNova(messages, model) {
  const key = apiKeys.sambanova;
  if (!key) throw new Error('SambaNova API key not set. Get one free at cloud.sambanova.ai');
  const enrichedMessages = await enrichWithSearch(messages);
  const startTime = performance.now();
  const res = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: model || PROVIDERS.sambanova.defaultModel,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...enrichedMessages.map(({ role, content }) => ({ role, content }))],
      temperature: 0.3, max_tokens: 8192,
    }),
  });
  if (!res.ok) throw new Error(`SambaNova ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const fullText = data.choices?.[0]?.message?.content || '';
  const elapsed = (performance.now() - startTime) / 1000;
  return { fullText, tokens: data.usage?.completion_tokens || fullText.split(' ').length, elapsed };
}

// ─── Hugging Face Inference API ─────────────────────────────────────

async function inferHuggingFace(messages, model) {
  const key = apiKeys.huggingface;
  if (!key) throw new Error('HuggingFace token not set. Get one free at huggingface.co/settings/tokens');
  const m = model || PROVIDERS.huggingface.defaultModel;
  const startTime = performance.now();
  const enrichedMessages = await enrichWithSearch(messages);
  // Use serverless inference API (OpenAI compatible)
  const res = await fetch(`https://api-inference.huggingface.co/models/${m}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: m,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...enrichedMessages.map(({ role, content }) => ({ role, content }))],
      temperature: 0.3, max_tokens: 4096,
    }),
  });
  if (!res.ok) throw new Error(`HuggingFace ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const fullText = data.choices?.[0]?.message?.content || '';
  const elapsed = (performance.now() - startTime) / 1000;
  return { fullText, tokens: data.usage?.completion_tokens || fullText.split(' ').length, elapsed };
}

// ─── Together AI ─────────────────────────────────────────────────────

async function inferTogether(messages, model) {
  const key = apiKeys.together;
  if (!key) throw new Error('Together AI key not set. Get $25 free at api.together.ai');
  const m = model || PROVIDERS.together.defaultModel;
  const startTime = performance.now();
  const enrichedMessages = await enrichWithSearch(messages);
  const res = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: m,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...enrichedMessages.map(({ role, content }) => ({ role, content }))],
      temperature: 0.3, max_tokens: 8192,
    }),
  });
  if (!res.ok) throw new Error(`Together ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'HTTP-Referer': 'https://kerrtheinfluencer.github.io/iclaw/', 'X-Title': 'iclaw' },
    body: JSON.stringify({
      model: model || PROVIDERS.openrouter.defaultModel,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...enrichedMessages.map(({ role, content }) => ({ role, content }))],
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

async function initWASM(modelId) {
  if (modelId) selectedWasmModelId = modelId;
  const model = WASM_MODELS[selectedWasmModelId] || WASM_MODELS['qwen2.5-coder-3b'];
  report('status', { status: 'loading', message: `Loading ${model.name}...` });
  try {
    const { Wllama } = await import('https://esm.run/@wllama/wllama@2.3.0');
    engine = new Wllama({
      'single-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.0/src/single-thread/wllama.wasm',
      'multi-thread/wllama.wasm': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.0/src/multi-thread/wllama.wasm',
      'multi-thread/wllama.worker.mjs': 'https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.0/src/multi-thread/wllama.worker.mjs',
    });
    report('status', { status: 'loading', message: `Downloading ${model.name} (${model.size})...` });
    await engine.loadModelFromUrl(model.url, {
      n_ctx: 4096, n_threads: 4,
      progressCallback: ({ loaded, total }) => {
        report('loadProgress', { progress: total > 0 ? loaded / total : 0, text: `${(loaded / 1024 / 1024).toFixed(0)}MB / ${(total / 1024 / 1024).toFixed(0)}MB` });
      },
    });
    engineType = 'wasm';
    activeModel = selectedWasmModelId;
    report('status', { status: 'ready', message: `${model.name} loaded. Fully offline. ${model.desc}` });
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
    onNewToken: (_t, piece) => { if (piece) { fullText += piece; tokenCount++; report('streamChunk', { requestId: 'current', delta: piece, fullText }); } },
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
      engine = null; // always reload when switching wasm models
      await initWASM(activeModel);
    } else if (engineId === 'huggingface') {
      if (!apiKeys.huggingface) { report('status', { status: 'needsKey', message: 'Enter your free HuggingFace token.', provider: 'huggingface' }); } else { engineType = 'huggingface'; activeModel = activeModel || PROVIDERS.huggingface.defaultModel; report('status', { status: 'ready', message: 'HuggingFace ready.' }); }
    } else if (engineId === 'together') {
      if (!apiKeys.together) { report('status', { status: 'needsKey', message: 'Enter your Together AI key.', provider: 'together' }); } else { engineType = 'together'; activeModel = activeModel || PROVIDERS.together.defaultModel; report('status', { status: 'ready', message: 'Together AI ready.' }); }
    } else if (PROVIDERS[engineId]) {
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
    const block = ragContext.map(c => `--- ${c.filename} ---\n${c.content}`).join('\n\n');
    contextMessages.unshift({ role: 'user', content: `[Project files]\n\n${block}` });
    contextMessages.splice(1, 0, { role: 'assistant', content: 'I can see the project files.' });
  }

  report('streamStart', { requestId });
  try {
    let result;
    const m = model || activeModel;
    if (engineType === 'wasm')        result = await inferWASM(contextMessages);
    else if (engineType === 'gemini') result = await inferGemini(contextMessages, m, attachments);
    else if (engineType === 'groq')   result = await inferGroq(contextMessages, m);
    else if (engineType === 'cerebras')  result = await inferCerebras(contextMessages, m);
    else if (engineType === 'sambanova') result = await inferSambaNova(contextMessages, m);
    else if (engineType === 'huggingface') result = await inferHuggingFace(contextMessages, m);
    else if (engineType === 'together')    result = await inferTogether(contextMessages, m);
    else if (engineType === 'openrouter') result = await inferOpenRouter(contextMessages, m);

    // Simulate streaming for cloud providers
    if (engineType !== 'wasm') {
      const words = result.fullText.split(' ');
      let acc = '';
      for (let i = 0; i < words.length; i++) {
        acc += (i > 0 ? ' ' : '') + words[i];
        report('streamChunk', { requestId, delta: words[i] + ' ', fullText: acc });
        if (i % 6 === 0) await new Promise(r => setTimeout(r, 5));
      }
    }

    report('streamEnd', {
      requestId, fullText: result.fullText,
      stats: { tokens: result.tokens, elapsed: result.elapsed.toFixed(1), tokPerSec: (result.tokens / result.elapsed).toFixed(1), engine: engineType, model: m },
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
      activeModel = activeModel || PROVIDERS[payload.provider]?.defaultModel;
      report('status', { status: 'ready', message: `${PROVIDERS[payload.provider]?.name || payload.provider} ready.` });
      break;
    case 'setModel':
      activeModel = payload.model;
      if (engineType === 'wasm' || payload.model?.startsWith('qwen2.5') || payload.model?.startsWith('phi') || payload.model?.startsWith('llama-3.2')) {
        selectedWasmModelId = payload.model;
        engine = null; // will reload on next inference
      }
      report('modelChanged', { model: payload.model }); break;
    case 'inference': await runInference(payload); break;
    case 'toggleSearch': webSearchEnabled = payload.enabled; report('searchToggled', { enabled: webSearchEnabled }); break;
    case 'reset': report('status', { status: engineType ? 'ready' : 'idle', message: engineType ? 'Ready.' : '' }); break;
    default: report('error', { message: `Unknown: ${type}` });
  }
};
