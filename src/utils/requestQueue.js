/**
 * Global API Request Queue
 * - 800ms minimum spacing between all API calls
 * - Exponential backoff: 2s, 4s, 8s on 429/503
 * - Shared across single agent and multi-agent
 */

let lastCallTime = 0;
const MIN_SPACING = 800;

export async function queuedFetch(url, options, retries = 3) {
  // Enforce minimum spacing
  const now = Date.now();
  const wait = Math.max(0, lastCallTime + MIN_SPACING - now);
  if (wait > 0) await delay(wait);
  lastCallTime = Date.now();

  let backoff = 2000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      
      if (res.status === 429 || res.status === 503) {
        if (attempt < retries) {
          // Report retry status
          self._retryCallback?.(`${res.status} — retrying in ${backoff/1000}s...`);
          await delay(backoff);
          backoff *= 2;
          lastCallTime = Date.now();
          continue;
        }
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        await delay(backoff);
        backoff *= 2;
        continue;
      }
      throw err;
    }
  }
}

export function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Multi-provider call with queue + backoff
export async function callProviderQueued(apiKey, engine, model, systemPrompt, messages, temperature = 0.3, onRetry = null) {
  const defaultModels = {
    gemini: 'gemini-2.5-flash',
    groq: 'openai/gpt-oss-120b',
    openrouter: 'mistralai/mistral-7b-instruct:free',
  };
  const resolvedModel = model || defaultModels[engine] || 'gemini-2.5-flash';

  let url, options;

  if (engine === 'groq') {
    url = 'https://api.groq.com/openai/v1/chat/completions';
    options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [{ role: 'system', content: systemPrompt }, ...messages.map(({ role, content }) => ({ role, content }))],
        temperature, max_tokens: 8192,
      }),
    };
  } else if (engine === 'openrouter') {
    url = 'https://openrouter.ai/api/v1/chat/completions';
    options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'X-Title': 'iclaw' },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [{ role: 'system', content: systemPrompt }, ...messages.map(({ role, content }) => ({ role, content }))],
        temperature, max_tokens: 8192,
      }),
    };
  } else {
    // Gemini
    url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`;
    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood.' }] },
      ...messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    ];
    options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { temperature, maxOutputTokens: 8192 } }),
    };
  }

  let backoff = 2000;
  let lastErr = null;

  for (let attempt = 0; attempt <= 3; attempt++) {
    // Enforce spacing
    const now = Date.now();
    const wait = Math.max(0, lastCallTime + MIN_SPACING - now);
    if (wait > 0) await delay(wait);
    lastCallTime = Date.now();

    try {
      const res = await fetch(url, options);

      if (res.status === 429 || res.status === 503) {
        if (attempt < 3) {
          onRetry?.(`${res.status} error — retrying in ${backoff / 1000}s`);
          await delay(backoff);
          backoff *= 2;
          lastCallTime = Date.now();
          continue;
        }
        const txt = await res.text();
        throw new Error(`API error: ${res.status}: ${txt.slice(0, 150)}`);
      }

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`API error: ${res.status}: ${txt.slice(0, 150)}`);
      }

      const data = await res.json();

      // Parse response by provider
      if (engine === 'groq' || engine === 'openrouter') {
        return data.choices?.[0]?.message?.content || '';
      } else {
        return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      }
    } catch (err) {
      lastErr = err;
      if (attempt < 3 && (err.message?.includes('429') || err.message?.includes('503') || err.name === 'TypeError')) {
        onRetry?.(`Network error — retrying in ${backoff / 1000}s`);
        await delay(backoff);
        backoff *= 2;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('Max retries exceeded');
}
