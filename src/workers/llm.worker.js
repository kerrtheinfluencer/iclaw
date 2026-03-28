/**
 * iclaw v1.3 — 100% Free Inference Worker
 * 
 * Fixes: Gemini model IDs updated, doc upload support added
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
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'Fast' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'Best' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', tier: 'Legacy' },
    ],
  },
  groq: {
    name: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tier: 'Best' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', tier: 'Fastest' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', tier: 'Code' },
      { id: 'qwen-qwq-32b', label: 'Qwen QWQ 32B', tier: 'Reasoning' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    defaultModel: 'deepseek/deepseek-chat-v3-0324:free',
    models: [
      { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3', tier: 'Best Free' },
      { id: 'qwen/qwen3-32b:free', label: 'Qwen 3 32B', tier: 'Code' },
      { id: 'mistralai/mistral-small-3.1-24b-instruct:free', label: 'Mistral Small 3.1', tier: 'Fast' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', tier: 'Open' },
    ],
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
- When the user uploads a document, analyze its content thoroughly

You have access to the user's local project files for context.`;

function report(type, payload) {
  self.postMessage({ type, ...payload });
}

// ─── Free Web Search (DuckDuckGo, no key needed) ───────────────────

const SEARCH_TRIGGERS = /\b(latest|recent|today|current|news|price|weather|score|update|2025|2026|now|live|happening|who is|what is)\b/i;

async function webSearch(query) {
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const results = [];

    if (data.Abstract) results.push(`Summary: ${data.Abstract}`);
    if (data.Answer) results.push(`Answer: ${data.Answer}`);

    if (data.RelatedTopics?.length > 0) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text) results.push(topic.Text);
      }
    }

    return results.length > 0 ? results.join('\n\n') : null;
  } catch {
    return null;
  }
}

async function enrichWithSearch(messages) {
  const lastMsg = messages[messages.length - 1]?.content || '';
  if (!SEARCH_TRIGGERS.test(lastMsg)) return messages;

  // Extract a search query from the message (first 100 chars)
  const query = lastMsg.slice(0, 100).replace(/[^\w\s]/g, '');
  const searchResults = await webSearch(query);

  if (!searchResults) return messages;

  // Inject search context before the last message
  const enriched = [...messages];
  enriched.splice(enriched.length - 1, 0, {
    role: 'user',
    content: `[Web search results for context — use if relevant]\n\n${searchResults}`,
  });
  enriched.splice(enriched.length - 1, 0, {
    role: 'assistant',
    content: 'I have the search results. I will use them to give an up-to-date answer.',
  });

  return enriched;
}

// ─── Gemini API ─────────────────────────────────────────────────────

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

    // Attach docs if present on this message
    if (msg.attachments?.length > 0) {
      for (const att of msg.attachments) {
        parts.push({
          inline_data: {
            mime_type: att.mimeType,
            data: att.base64,
          },
        });
      }
    }

    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    });
  }

  // Also attach top-level attachments to last user message
  if (attachments?.length > 0) {
    const lastUser = contents.findLast((c) => c.role === 'user');
    if (lastUser) {
      for (const att of attachments) {
        lastUser.parts.push({
          inline_data: { mime_type: att.mimeType, data: att.base64 },
        });
      }
    }
  }

  // Detect if user likely wants real-time info
  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
  const needsSearch = /\b(latest|recent|today|current|news|price|weather|score|update|2025|2026|now|live|happening|who is|what is)\b/i.test(lastMsg);

  const requestBody = {
    contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, topP: 0.9 },
  };

  // Add Google Search grounding when real-time data is needed
  if (needsSearch) {
    requestBody.tools = [{ google_search: {} }];
  }

  const startTime = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const fullText = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const elapsed = (performance.now() - startTime) / 1000;
  const tokens = data.usageMetadata?.candidatesTokenCount || fullText.split(' ').length;

  return { fullText, tokens, elapsed };
}

// ─── Groq API ───────────────────────────────────────────────────────

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

// ─── OpenRouter API ─────────────────────────────────────────────────

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
      'HTTP-Referer': 'https://iclaw.app',
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

// ─── WASM ───────────────────────────────────────────────────────────

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
    onNewToken: (_t, piece) => { if (piece) { fullText += piece; tokenCount++; report('streamChunk', { requestId: 'current', delta: piece, fullText }); } },
    stopTokens: ['<|im_end|>', '<|endoftext|>'],
  });
  return { fullText, tokens: tokenCount, elapsed: (performance.now() - startTime) / 1000 };
}

// ─── Controller ─────────────────────────────────────────────────────

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
  } catch (err) { report('status', { status: 'error', message: err.message }); engine = null; engineType = null; }
  finally { isLoading = false; }
}

async function runInference({ messages, requestId, ragContext, model, attachments }) {
  if (!engineType) { report('error', { requestId, message: 'No engine selected.' }); return; }

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

    if (engineType === 'wasm') { result = await inferWASM(contextMessages); }
    else if (engineType === 'gemini') { result = await inferGemini(contextMessages, m, attachments); }
    else if (engineType === 'groq') { result = await inferGroq(contextMessages, m); }
    else if (engineType === 'openrouter') { result = await inferOpenRouter(contextMessages, m); }

    // Simulate streaming for cloud
    if (engineType !== 'wasm') {
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
      activeModel = activeModel || PROVIDERS[payload.provider].defaultModel;
      report('status', { status: 'ready', message: `${PROVIDERS[payload.provider].name} ready.` });
      break;
    case 'setModel': activeModel = payload.model; report('modelChanged', { model: payload.model }); break;
    case 'inference': await runInference(payload); break;
    case 'reset': report('status', { status: 'ready', message: 'Reset.' }); break;
    default: report('error', { message: `Unknown: ${type}` });
  }
};
