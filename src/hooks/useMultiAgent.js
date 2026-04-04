/**
 * iclaw Multi-Agent v2
 * Phase 0: Intent + Search (new)
 * Phase 1: Planner — spec
 * Phase 2: Coder — implementation (with live stream)
 * Phase 3: Reviewer — quality check
 */
import { useState, useRef, useCallback } from 'react';
import { uid } from '../utils/codeParser.js';
import { getSetting } from '../utils/db.js';
import { callProviderQueued, delay } from '../utils/requestQueue.js';
import { callWasm } from '../components/WasmRunner.jsx';

const CORS_PROXY = 'https://corsproxy.io/?url=';

// ── Web search ────────────────────────────────────────────────────────
async function webSearch(query, tavilyKey) {
  // Tavily — best quality for agents (get free key at tavily.com)
  if (tavilyKey) {
    try {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query, max_results: 5, search_depth: 'basic' }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.results?.length) {
          return '[Tavily] ' + d.results.map((x, i) => '[' + (i+1) + '] ' + x.title + '\n' + (x.content || x.snippet || '') + '\nURL: ' + x.url).join('\n\n');
        }
      }
    } catch {}
  }
  // SearXNG fallback
  const instances = ['https://search.sapti.me', 'https://searx.be', 'https://paulgo.io'];
  for (const inst of instances) {
    try {
      const url = inst + '/search?q=' + encodeURIComponent(query) + '&format=json&categories=general';
      const r = await fetch(CORS_PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.results?.length) return '[SearXNG] ' + d.results.slice(0, 5).map((x, i) => '[' + (i+1) + '] ' + x.title + '\n' + (x.content || '') + '\nURL: ' + x.url).join('\n\n');
    } catch { continue; }
  }
  // DuckDuckGo instant
  try {
    const r = await fetch(CORS_PROXY + encodeURIComponent('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1'), { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      const parts = [];
      if (d.Abstract) parts.push('Summary: ' + d.Abstract);
      if (d.Answer) parts.push('Answer: ' + d.Answer);
      if (parts.length) return '[DuckDuckGo] ' + parts.join('\n\n');
    }
  } catch {}
  // Wikipedia last resort
  try {
    const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query.split(' ').slice(0,4).join('_')), { signal: AbortSignal.timeout(4000) });
    if (r.ok) { const d = await r.json(); if (d.extract) return '[Wikipedia] ' + d.title + '\n' + d.extract.slice(0, 600); }
  } catch {}
  return null;
}

const SEARCH_RE = /\b(latest|recent|current|today|news|price|stock|weather|who|what|when|where|search|find|how to|best|top|vs|compare|trending|2025|2026|live|release|update)\b/i;
const CODE_ONLY_RE = /^(build|create|make|write|implement)\s+(a|an)?\s*(app|game|tool|widget|calculator|timer|clock|todo|dashboard|form|component|animation)/i;

// ── Agent prompts ─────────────────────────────────────────────────────
const PLANNER = `You are a Senior Architect. Given a task and optional web research, write a precise technical specification.
Include: 1) Overview 2) Tech stack (exact CDN URLs) 3) File structure 4) Features 5) UI/UX spec (colors, layout) 6) Data model
Be exhaustive. The Coder implements EXACTLY what you specify.`;

const CODER = `You are an elite full-stack developer. Implement the spec exactly.
Output ONLY code files in this format:
\`\`\`html
// index.html
<!DOCTYPE html>...
\`\`\`
All CSS and JS must be inline in index.html. Complete, production-quality code. No placeholders.`;

const REVIEWER = `You are a senior code reviewer. Review the implementation for:
1. Bugs or broken logic
2. Missing features from the spec
3. Performance issues
4. UX problems
Output: SHORT bullet list of issues found (max 5). Then output fixed code if needed.`;

// ── Extract files from text ────────────────────────────────────────────
function extractFiles(text) {
  const files = {};
  const re = /```[\w]*\n(?:\/\/\s*|#\s*)?([^\s<>]+\.\w+)[^\n]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const p = m[1].trim();
    if (p && !p.includes(' ')) files[p] = m[2].trim();
  }
  if (!Object.keys(files).length) {
    const fb = /```(\w+)\n([\s\S]*?)```/g;
    let i = 0;
    while ((m = fb.exec(text)) !== null) {
      const ext = { html: 'index.html', css: 'styles.css', javascript: 'script.js', js: 'script.js', python: 'main.py', jsx: 'app.jsx' };
      files[ext[m[1]] || 'file' + i + '.' + m[1]] = m[2].trim();
      i++;
    }
  }
  return files;
}

// ── Hook ──────────────────────────────────────────────────────────────
export function useMultiAgent() {
  const [isRunning, setIsRunning]   = useState(false);
  const [agents, setAgents]         = useState({ planner: { status: 'idle', steps: [], output: null }, coder: { status: 'idle', steps: [], output: null }, reviewer: { status: 'idle', steps: [], output: null } });
  const [activeAgent, setActiveAgent] = useState(null);
  const [files, setFiles]           = useState({});
  const [streamText, setStreamText] = useState('');
  const abortRef = useRef(false);
  const filesRef = useRef({});
  filesRef.current = files;

  const updateAgent = (name, update) => setAgents(prev => ({ ...prev, [name]: { ...prev[name], ...update } }));
  const addStep     = (name, step)   => setAgents(prev => ({ ...prev, [name]: { ...prev[name], steps: [...(prev[name].steps||[]), { id: uid(), ...step }] } }));
  const updateLastStep = (name, upd) => setAgents(prev => {
    const steps = [...(prev[name].steps||[])];
    if (steps.length) steps[steps.length-1] = { ...steps[steps.length-1], ...upd };
    return { ...prev, [name]: { ...prev[name], steps } };
  });

  const runMultiAgent = useCallback(async (task, apiKey, engine, model, onFileWrite, onPreview) => {
    setIsRunning(true); setFiles({}); filesRef.current = {}; setStreamText('');
    abortRef.current = false;
    setAgents({ planner: { status: 'idle', steps: [], output: null }, coder: { status: 'idle', steps: [], output: null }, reviewer: { status: 'idle', steps: [], output: null } });

    // Key resolution
    let resolvedKey = apiKey, resolvedEngine = engine;
    if (!resolvedKey || resolvedKey === '') {
      for (const p of ['gemini','groq','cerebras','openrouter']) {
        const k = await getSetting('key_' + p, '');
        if (k) { resolvedKey = k; resolvedEngine = p; break; }
      }
    }
    const isLocal = resolvedEngine === 'wasm' || resolvedKey === 'wasm';

    // ── Helper: call model ────────────────────────────────────────────
    const callModel = async (system, userMsg, onChunk) => {
      if (isLocal) return await callWasm([{ role: 'user', content: userMsg }], system, onChunk);
      return await callProviderQueued(resolvedKey, resolvedEngine, model, system, [{ role: 'user', content: userMsg }], 0.3, () => {});
    };

    try {
      // ── Phase 0: Intent + Web Search ─────────────────────────────
      setActiveAgent('planner');
      updateAgent('planner', { status: 'running' });
      addStep('planner', { type: 'plan', status: 'running', label: 'Detecting intent...' });

      let searchContext = '';
      const needsSearch = SEARCH_RE.test(task) && !CODE_ONLY_RE.test(task.trim());

      if (needsSearch) {
        const query = task.replace(/^(search for|find|look up|tell me about)\s+/i, '').slice(0, 120).trim();
        updateLastStep('planner', { status: 'running', label: 'Searching web: ' + query.slice(0,40) });
        const tavilyKey = await getSetting('key_tavily', '');
        const results = await webSearch(query, tavilyKey);
        if (results) {
          searchContext = '\n\n=== WEB SEARCH RESULTS (' + new Date().toLocaleDateString() + ') ===\n' + results + '\n=== END RESULTS ===\n\n';
          updateLastStep('planner', { status: 'done', label: 'Web data fetched', detail: results.slice(0, 400) });
        } else {
          updateLastStep('planner', { status: 'done', label: 'No web results — using model knowledge' });
        }
      } else {
        updateLastStep('planner', { status: 'done', label: 'Code task — no search needed' });
      }

      if (abortRef.current) { setIsRunning(false); setActiveAgent(null); return; }

      // ── Phase 1: Planner ─────────────────────────────────────────
      addStep('planner', { type: 'plan', status: 'running', label: 'Writing spec...' });
      const planPrompt = searchContext + 'Task: ' + task + '\n\nWrite a detailed technical specification for implementing this.';
      const spec = await callModel(PLANNER, planPrompt);
      updateLastStep('planner', { status: 'done', label: 'Spec complete', detail: spec.slice(0, 400) });
      updateAgent('planner', { status: 'done', output: spec });

      if (abortRef.current) { setIsRunning(false); setActiveAgent(null); return; }

      // ── Phase 2: Coder ───────────────────────────────────────────
      setActiveAgent('coder');
      updateAgent('coder', { status: 'running' });
      addStep('coder', { type: 'think', status: 'running', label: 'Implementing...' });
      setStreamText('');
      let accumulated = '';

      const coderPrompt = searchContext + 'SPEC:\n' + spec + '\n\nOriginal task: ' + task + '\n\nImplement this now. Output complete code files:';
      const implementation = await callModel(CODER, coderPrompt, (chunk) => { accumulated += chunk; setStreamText(accumulated); });
      setStreamText('');

      // Extract and write files
      const extractedFiles = extractFiles(implementation);
      if (Object.keys(extractedFiles).length > 0) {
        for (const [path, content] of Object.entries(extractedFiles)) {
          addStep('coder', { type: 'write_file', status: 'done', label: 'Wrote ' + path });
          filesRef.current = { ...filesRef.current, [path]: content };
          setFiles({ ...filesRef.current });
          if (onFileWrite) await onFileWrite(path, content).catch(() => {});
          if (path.endsWith('.html') && onPreview) onPreview(content, path);
        }
      } else {
        // Local model may output raw HTML without filename markers
        let html = implementation.trim();
        const fbStart = html.indexOf('```');
        const fbEnd = html.lastIndexOf('```');
        if (fbStart !== -1 && fbEnd > fbStart + 3) {
          const inner = html.slice(fbStart + 3, fbEnd);
          const nl = inner.indexOf('\n');
          html = (nl >= 0 ? inner.slice(nl + 1) : inner).trim();
        }
        if (html.includes('<!DOCTYPE') || html.includes('<html')) {
          filesRef.current = { 'index.html': html };
          setFiles(filesRef.current);
          addStep('coder', { type: 'write_file', status: 'done', label: 'Wrote index.html' });
          if (onFileWrite) await onFileWrite('index.html', html).catch(() => {});
          if (onPreview) onPreview(html, 'index.html');
        } else {
          addStep('coder', { type: 'error', status: 'warn', label: 'Could not extract files from response', detail: implementation.slice(0,200) });
        }
      }

      updateLastStep('coder', { status: 'done', label: 'Implementation complete' });
      updateAgent('coder', { status: 'done', output: implementation });

      if (abortRef.current) { setIsRunning(false); setActiveAgent(null); return; }
      if (!isLocal) await delay(800);

      // ── Phase 3: Reviewer ────────────────────────────────────────
      setActiveAgent('reviewer');
      updateAgent('reviewer', { status: 'running' });
      addStep('reviewer', { type: 'plan', status: 'running', label: 'Reviewing...' });

      const mainFile = filesRef.current['index.html'] || Object.values(filesRef.current)[0] || '';
      const reviewPrompt = 'SPEC:\n' + spec.slice(0, 600) + '\n\nIMPLEMENTATION (first 1000 chars):\n' + mainFile.slice(0, 1000) + '\n\nList issues found:';
      const review = await callModel(REVIEWER, reviewPrompt);
      updateLastStep('reviewer', { status: 'done', label: 'Review complete', detail: review.slice(0, 500) });
      updateAgent('reviewer', { status: 'done', output: review });

    } catch (err) {
      addStep('coder', { type: 'error', status: 'error', label: 'Error: ' + err.message });
      setStreamText('');
    }

    setActiveAgent(null);
    setIsRunning(false);
  }, []);

  const stopMultiAgent  = useCallback(() => { abortRef.current = true; setIsRunning(false); setActiveAgent(null); setStreamText(''); }, []);
  const clearMultiAgent = useCallback(() => {
    setAgents({ planner: { status: 'idle', steps: [], output: null }, coder: { status: 'idle', steps: [], output: null }, reviewer: { status: 'idle', steps: [], output: null } });
    setFiles({}); setStreamText(''); setActiveAgent(null);
  }, []);

  return { isRunning, agents, activeAgent, files, streamText, runMultiAgent, stopMultiAgent, clearMultiAgent };
}
