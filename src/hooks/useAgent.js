/**
 * iclaw Agent v2 — Agentic loop with intent-based web search
 * Tools: write_file, read_file, web_search, run_code, finish
 * Local fast path: intent detect → search → generate → done (no JSON loop)
 */
import { useState, useRef, useCallback } from 'react';
import { uid } from '../utils/codeParser.js';
import { getSetting } from '../utils/db.js';
import { callProviderQueued } from '../utils/requestQueue.js';
import { callWasm } from '../components/WasmRunner.jsx';

// ── Smart web search — Tavily first, SearXNG fallback ────────────────
const CORS = 'https://corsproxy.io/?url=';
const SEARXNG = ['https://search.sapti.me', 'https://searx.be', 'https://paulgo.io'];

async function smartSearch(query, tavilyKey) {
  // Tavily — best for agents, returns clean snippets
  if (tavilyKey && tavilyKey !== 'wasm') {
    try {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: 5, search_depth: 'basic' }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.results?.length > 0) {
          const out = d.results.map((x, i) => '[' + (i+1) + '] ' + x.title + '\n' + (x.content || x.snippet || '') + '\nURL: ' + x.url).join('\n\n');
          return { results: out, source: 'Tavily' };
        }
      }
    } catch {}
  }
  // SearXNG fallback
  for (const inst of SEARXNG) {
    try {
      const url = inst + '/search?q=' + encodeURIComponent(query) + '&format=json&categories=general&language=en';
      const r = await fetch(CORS + encodeURIComponent(url), { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.results?.length > 0) {
        const out = d.results.slice(0, 5).map((x, i) => '[' + (i+1) + '] ' + x.title + '\n' + (x.content || '') + '\nURL: ' + x.url).join('\n\n');
        return { results: out, source: 'SearXNG' };
      }
    } catch { continue; }
  }
  // DuckDuckGo instant answer
  try {
    const r = await fetch(CORS + encodeURIComponent('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1'), { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      const parts = [];
      if (d.Abstract) parts.push('Summary: ' + d.Abstract);
      if (d.Answer) parts.push('Answer: ' + d.Answer);
      if (parts.length) return { results: parts.join('\n'), source: 'DuckDuckGo' };
    }
  } catch {}
  return { results: null, source: null };
}

// Intent detection — does this task need web search?
const NEEDS_SEARCH_RE = /\b(latest|current|today|now|news|price|stock|weather|score|2025|2026|search|find|look up|who is|what is|when|how to|best|top|vs|compare|release|version|review|available|trending)\b/i;

const MAX_STEPS = 15;
const CORS_PROXY = 'https://corsproxy.io/?url=';

// ── Web search (3-tier fallback) ─────────────────────────────────────
async function webSearch(query) {
  const instances = ['https://search.sapti.me', 'https://searx.be', 'https://paulgo.io'];
  for (const inst of instances) {
    try {
      const url = inst + '/search?q=' + encodeURIComponent(query) + '&format=json&categories=general&language=en';
      const r = await fetch(CORS_PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.results?.length > 0) {
        return d.results.slice(0, 5).map((x, i) =>
          '[' + (i+1) + '] ' + x.title + '\n' + (x.content || '') + '\nURL: ' + x.url
        ).join('\n\n');
      }
    } catch { continue; }
  }
  // DuckDuckGo instant answers
  try {
    const r = await fetch(CORS_PROXY + encodeURIComponent('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1'), { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      const parts = [];
      if (d.Abstract) parts.push('Summary: ' + d.Abstract + '\nSource: ' + d.AbstractURL);
      if (d.Answer) parts.push('Answer: ' + d.Answer);
      if (d.RelatedTopics?.length) parts.push(d.RelatedTopics.slice(0,4).filter(t=>t.Text).map(t=>t.Text).join('\n'));
      if (parts.length) return parts.join('\n\n');
    }
  } catch {}
  // Wikipedia
  try {
    const q = query.split(' ').slice(0,4).join('_');
    const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(q), { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const d = await r.json();
      if (d.extract) return 'Wikipedia: ' + d.title + '\n' + d.extract.slice(0, 600) + '\nURL: ' + (d.content_urls?.desktop?.page || '');
    }
  } catch {}
  return null;
}

// ── Intent detection — does this task need web data? ─────────────────
const SEARCH_INTENT_RE = /\b(latest|recent|current|today|news|price|stock|weather|score|who won|release|update|2025|2026|now|live|search|find|look up|what is|who is|how to|best|top|vs|compare|trending)\b/i;
const CODE_ONLY_RE = /^(build|create|make|write|code|implement)\s+(a|an|the)?\s*(app|game|tool|widget|calculator|timer|clock|todo|dashboard|form|ui|component|animation)/i;

async function detectIntent(task) {
  // Pure coding task — no search needed
  if (CODE_ONLY_RE.test(task.trim()) && !SEARCH_INTENT_RE.test(task)) return { needsSearch: false, query: null };
  if (SEARCH_INTENT_RE.test(task)) {
    // Extract clean query
    const query = task.replace(/^(search for|find|look up|tell me about)\s+/i, '').slice(0, 120).trim();
    return { needsSearch: true, query };
  }
  return { needsSearch: false, query: null };
}

// ── Extract files from model response ────────────────────────────────
function extractFiles(text) {
  const files = {};
  const re = /```[\w]*\n(?:\/\/\s*|#\s*|<!--\s*)?([^\s<>]+\.\w+)[^\n]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const path = m[1].replace(/-->.*/, '').trim();
    if (path && !path.includes(' ')) files[path] = m[2].trim();
  }
  if (Object.keys(files).length === 0) {
    const fb = /```(\w+)\n([\s\S]*?)```/g;
    let i = 0;
    while ((m = fb.exec(text)) !== null) {
      const ext = { html:'index.html', css:'styles.css', javascript:'script.js', js:'script.js', python:'main.py', jsx:'app.jsx', ts:'script.ts' };
      files[ext[m[1]] || 'file' + i + '.' + m[1]] = m[2].trim();
      i++;
    }
  }
  return files;
}

// ── Tool executor ─────────────────────────────────────────────────────
function useToolExecutor(files, setFiles, onFileWrite, onPreview) {
  return useCallback(async (tool, args) => {
    switch (tool) {
      case 'write_file': {
        const { path, content } = args;
        if (!path || content == null) return 'Error: missing path or content';
        setFiles(prev => ({ ...prev, [path]: content }));
        if (onFileWrite) await onFileWrite(path, content).catch(() => {});
        if (path.endsWith('.html') && onPreview) onPreview(content, path);
        return 'Written: ' + path + ' (' + content.length + ' chars)';
      }
      case 'read_file': {
        const c = files[args.path];
        return c ? c.slice(0, 4000) : 'File not found: ' + args.path;
      }
      case 'list_files':
        return Object.keys(files).length ? Object.keys(files).join('\n') : 'No files yet.';
      case 'web_search': {
        const results = await webSearch(args.query || '');
        return results || 'No results for: ' + args.query;
      }
      case 'run_code': {
        try {
          const fn = new Function('return (async () => { ' + (args.code || '') + ' })()');
          const out = await fn();
          return 'Result: ' + JSON.stringify(out ?? 'done');
        } catch (e) { return 'Error: ' + e.message; }
      }
      case 'finish':
        return args.summary || 'Done.';
      default:
        return 'Unknown tool: ' + tool;
    }
  }, [files, setFiles, onFileWrite, onPreview]);
}

// ── Robust JSON parser ────────────────────────────────────────────────
function parseToolCall(text) {
  // Strategy 1: find JSON with "tool" key
  const matches = text.match(/\{[^{}]*"tool"[^{}]*\}/g) || [];
  for (const m of matches) {
    try { const j = JSON.parse(m); if (j.tool) return j; } catch {}
  }
  // Strategy 2: greedy match
  const greedy = text.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
  if (greedy) { try { const j = JSON.parse(greedy[0]); if (j.tool) return j; } catch {} }
  // Strategy 3: extract write_file manually
  if (text.includes('write_file')) {
    const pathM = text.match(/"path"\s*:\s*"([^"]+)"/);
    const htmlM = text.match(/<!DOCTYPE[\s\S]+?<\/html>/i);
    if (pathM && htmlM) return { tool: 'write_file', args: { path: pathM[1], content: htmlM[0] }, thought: 'extracted' };
  }
  // Strategy 4: raw HTML/JS code blocks
  const htmlM = text.match(/```html\n([\s\S]+?)```/);
  if (htmlM) return { tool: 'write_file', args: { path: 'index.html', content: htmlM[1].trim() }, thought: 'extracted html' };
  const jsM = text.match(/```(?:js|javascript)\n([\s\S]+?)```/);
  if (jsM) return { tool: 'write_file', args: { path: 'script.js', content: jsM[1].trim() }, thought: 'extracted js' };
  // Strategy 5: finish intent
  const low = text.toLowerCase();
  if (low.includes('finish') || low.includes('complete') || low.includes('done')) {
    return { tool: 'finish', args: { summary: text.slice(0, 200) }, thought: 'detected finish' };
  }
  return null;
}

// ── System prompts ────────────────────────────────────────────────────
const CLOUD_SYSTEM = `You are iclaw, an autonomous coding agent. You MUST complete tasks and ALWAYS call finish() when done.

TOOLS — output exactly ONE JSON object per turn, nothing else:
{"tool":"write_file","args":{"path":"index.html","content":"FULL CONTENT"},"thought":"why"}
{"tool":"web_search","args":{"query":"specific query"},"thought":"why"}
{"tool":"finish","args":{"summary":"what was done"},"thought":"done"}

STRICT RULES:
1. Output ONLY a single JSON object — no text before or after
2. For ANY web/UI task: write ONE complete index.html with ALL CSS+JS inline
3. IMMEDIATELY call finish() after writing files — never loop back
4. If task needs current info: web_search first, then write_file, then finish()
5. Never ask for clarification — just do the task decisively
6. Max ${MAX_STEPS} steps`;

const LOCAL_SEARCH_SYSTEM = 'You are a helpful assistant. Using ONLY the search results provided, answer the question accurately and concisely. Do not use training data. Quote specific facts from the results.';
const LOCAL_CODE_SYSTEM = 'You are an expert web developer. Output ONLY complete HTML with all CSS and JS inline. No explanation, no markdown fences. Start with <!DOCTYPE html>.';

// ── Main hook ─────────────────────────────────────────────────────────
export function useAgent() {
  const [isRunning, setIsRunning]   = useState(false);
  const [steps, setSteps]           = useState([]);
  const [files, setFiles]           = useState({});
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef(false);
  const filesRef = useRef({});
  filesRef.current = files;

  const addStep    = s => setSteps(prev => [...prev, { id: uid(), ...s }]);
  const updateLast = u => setSteps(prev => { const a = [...prev]; if (a.length) a[a.length-1] = { ...a[a.length-1], ...u }; return a; });

  const runAgent = useCallback(async (task, apiKey, engine, model, onFileWrite, onPreview) => {
    setIsRunning(true); setSteps([]); setFiles({}); setStreamText('');
    filesRef.current = {};
    abortRef.current = false;

    // ── Shared file ops ──────────────────────────────────────────────
    const setFilesSync = (updater) => {
      filesRef.current = typeof updater === 'function' ? updater(filesRef.current) : updater;
      setFiles(filesRef.current);
    };

    // ── Key resolution ───────────────────────────────────────────────
    let resolvedKey = apiKey, resolvedEngine = engine;
    if (!resolvedKey || resolvedKey === '') {
      for (const p of ['gemini','groq','cerebras','openrouter']) {
        const k = await getSetting('key_' + p, '');
        if (k) { resolvedKey = k; resolvedEngine = p; break; }
      }
    }

    const isLocal = resolvedEngine === 'wasm' || resolvedKey === 'wasm';

    // ════════════════════════════════════════════════════════════════
    // LOCAL MODEL PATH — intent detect → optional search → generate
    // ════════════════════════════════════════════════════════════════
    if (isLocal) {
      try {
        // Step 1: Detect intent
        addStep({ type: 'plan', status: 'running', label: 'Detecting intent...' });
        const { needsSearch, query } = await detectIntent(task);
        updateLast({ status: 'done', label: needsSearch ? 'Needs web data: ' + (query||'').slice(0,40) : 'Code task — no search needed' });

        // Step 2: Web search if needed
        let searchContext = '';
        if (needsSearch && query) {
          addStep({ type: 'web_search', status: 'running', label: 'Searching: ' + query.slice(0, 40) });
          const results = await webSearch(query);
          if (results) {
            searchContext = '\n\n=== LIVE WEB DATA (' + new Date().toLocaleDateString() + ') ===\n' + results + '\n=== END WEB DATA ===\n';
            updateLast({ status: 'done', label: 'Found results for: ' + query.slice(0,40), detail: results.slice(0,300) });
          } else {
            updateLast({ status: 'warn', label: 'No results — answering from model knowledge' });
          }
        }

        // Step 3: Generate
        addStep({ type: 'think', status: 'running', label: needsSearch ? 'Summarizing search results...' : 'Generating code...' });
        setStreamText('');
        let accumulated = '';

        let prompt, sysPrompt;
        if (needsSearch) {
          prompt = searchContext + '\nQuestion: ' + task + '\n\nAnswer using ONLY the web data above:';
          sysPrompt = LOCAL_SEARCH_SYSTEM;
        } else {
          prompt = 'Task: ' + task + '\n\nWrite a complete self-contained HTML file. All CSS and JS inline. Dark theme. Output ONLY the HTML starting with <!DOCTYPE html>:';
          sysPrompt = LOCAL_CODE_SYSTEM;
        }

        const result = await callWasm(
          [{ role: 'user', content: prompt }],
          sysPrompt,
          (chunk) => { accumulated += chunk; setStreamText(accumulated); }
        );
        updateLast({ status: 'done', label: needsSearch ? 'Answer ready' : 'Code generated' });
        setStreamText('');

        // Step 4: Output
        if (needsSearch) {
          // Text answer — inject into chat via onPreview as a readable page
          addStep({ type: 'finish', status: 'done', label: 'Done', detail: result });
          if (onPreview) {
            const answerHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:#030712;color:#e2e8f0;font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto;line-height:1.6}h1{color:#22d3ee;font-size:1.1rem}p{margin:8px 0}</style></head><body><h1>' + task.slice(0,60) + '</h1><p>' + result.replace(/\n/g,'</p><p>') + '</p></body></html>';
            onPreview(answerHtml, 'answer.html');
          }
        } else {
          let html = result.trim();
          // Strip markdown fences if model added them
          const fenceStart = html.indexOf('```');
          const fenceEnd = html.lastIndexOf('```');
          if (fenceStart !== -1 && fenceEnd > fenceStart + 3) {
            const inner = html.slice(fenceStart + 3, fenceEnd);
            const nl = inner.indexOf('\n');
            html = (nl >= 0 ? inner.slice(nl + 1) : inner).trim();
          }
          if (!html.startsWith('<!') && !html.startsWith('<html')) {
            html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:#0a0a0f;color:#e8e8e8;font-family:sans-serif;padding:20px}</style></head><body>' + html + '</body></html>';
          }
          addStep({ type: 'write_file', status: 'done', label: 'index.html written' });
          setFilesSync(prev => ({ ...prev, 'index.html': html }));
          if (onFileWrite) await onFileWrite('index.html', html).catch(() => {});
          if (onPreview) onPreview(html, 'index.html');
          addStep({ type: 'finish', status: 'done', label: 'Done — tap to preview' });
        }
      } catch (err) {
        addStep({ type: 'error', status: 'error', label: err.message });
        setStreamText('');
      }
      setIsRunning(false);
      return;
    }

    // ════════════════════════════════════════════════════════════════
    // CLOUD MODEL PATH — full JSON tool-call agentic loop
    // ════════════════════════════════════════════════════════════════
    if (!resolvedKey) {
      addStep({ type: 'error', status: 'error', label: 'No API key. Set one in Settings.' });
      setIsRunning(false); return;
    }

    // Tool executor using ref for latest files
    const executeTool = async (tool, args) => {
      switch (tool) {
        case 'write_file': {
          const { path, content } = args;
          if (!path || content == null) return 'Error: missing args';
          setFilesSync(prev => ({ ...prev, [path]: content }));
          if (onFileWrite) await onFileWrite(path, content).catch(() => {});
          if (path.endsWith('.html') && onPreview) onPreview(content, path);
          return 'Written: ' + path;
        }
        case 'read_file': return filesRef.current[args.path] || 'Not found';
        case 'list_files': return Object.keys(filesRef.current).join('\n') || 'No files yet';
        case 'web_search': return await webSearch(args.query || '') || 'No results';
        case 'run_code': {
          try { return 'Result: ' + JSON.stringify(await new Function('return (async()=>{' + args.code + '})()')() ?? 'done'); }
          catch(e) { return 'Error: ' + e.message; }
        }
        case 'finish': return args.summary || 'Done';
        default: return 'Unknown tool: ' + tool;
      }
    };

    const messages = [{ role: 'user', content: 'Task: ' + task + '\n\nStart now. Use write_file to create files, then finish() when done.' }];
    addStep({ type: 'plan', status: 'done', label: 'Starting agent' });

    let stepCount = 0;
    let consecutiveFailures = 0;

    while (stepCount < MAX_STEPS && !abortRef.current) {
      stepCount++;

      let rawText;
      try {
        rawText = await callProviderQueued(
          resolvedKey, resolvedEngine, model, CLOUD_SYSTEM, messages, 0.2,
          (msg) => updateLast({ status: 'retrying', label: msg })
        );
      } catch (e) {
        addStep({ type: 'error', status: 'error', label: 'API: ' + e.message.slice(0,80) });
        break;
      }

      messages.push({ role: 'assistant', content: rawText });

      const toolCall = parseToolCall(rawText);

      if (!toolCall) {
        consecutiveFailures++;
        // Try to extract files from free-form response
        const extracted = extractFiles(rawText);
        if (Object.keys(extracted).length > 0) {
          for (const [path, content] of Object.entries(extracted)) {
            addStep({ type: 'write_file', status: 'running', label: 'Extracting ' + path });
            await executeTool('write_file', { path, content });
            updateLast({ status: 'done', label: 'Extracted ' + path });
          }
          addStep({ type: 'finish', status: 'done', label: 'Files extracted from response' });
          break;
        }
        if (consecutiveFailures >= 2) {
          addStep({ type: 'finish', status: 'warn', label: 'Could not parse response — stopping' });
          break;
        }
        messages.push({ role: 'user', content: 'Respond with ONLY a JSON tool call. Example: {"tool":"write_file","args":{"path":"index.html","content":"..."},"thought":"..."}' });
        continue;
      }

      consecutiveFailures = 0;
      const { tool, args, thought } = toolCall;

      const stepLabel = tool === 'web_search' ? 'Searching: ' + (args.query||'').slice(0,40)
        : tool === 'write_file' ? 'Writing: ' + (args.path||'')
        : tool === 'finish' ? 'Finishing'
        : tool;

      addStep({ type: tool, status: 'running', label: stepLabel, thought });

      const result = await executeTool(tool, args);
      updateLast({ status: 'done', detail: typeof result === 'string' ? result.slice(0,300) : '' });

      if (tool === 'finish') {
        addStep({ type: 'finish', status: 'done', label: 'Task complete' });
        break;
      }

      messages.push({ role: 'user', content: 'Tool result: ' + (typeof result === 'string' ? result.slice(0,2000) : JSON.stringify(result)) });
    }

    if (stepCount >= MAX_STEPS) addStep({ type: 'finish', status: 'warn', label: 'Max steps reached' });
    setIsRunning(false);
  }, []);

  const stopAgent  = useCallback(() => { abortRef.current = true; setIsRunning(false); }, []);
  const clearAgent = useCallback(() => { setSteps([]); setFiles({}); setStreamText(''); }, []);

  return { isRunning, steps, files, streamText, runAgent, stopAgent, clearAgent };
}
