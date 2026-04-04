import { useState, useRef, useCallback } from 'react';
import { uid } from '../utils/codeParser.js';
import { getSetting } from '../utils/db.js';
import { callProviderQueued, delay } from '../utils/requestQueue.js';
import { callWasm } from '../components/WasmRunner.jsx';

const CORS_PROXY = 'https://corsproxy.io/?url=';
const SEARXNG_INSTANCES = ['https://search.sapti.me', 'https://searx.be', 'https://paulgo.io'];

async function browserSearch(query) {
  // Try SearXNG
  for (const instance of SEARXNG_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en`;
      const res = await fetch(CORS_PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.results?.length > 0) {
        return data.results.slice(0, 4).map((r, i) => `[${i+1}] ${r.title}\n${r.content || ''}`).join('\n\n');
      }
    } catch { continue; }
  }
  // Fallback: DuckDuckGo
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(CORS_PROXY + encodeURIComponent(ddgUrl), { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const parts = [];
      if (data.Abstract) parts.push(`Summary: ${data.Abstract}`);
      if (data.Answer) parts.push(`Answer: ${data.Answer}`);
      if (parts.length > 0) return parts.join('\n\n');
    }
  } catch {}
  // Fallback: Wikipedia
  try {
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.split(' ').slice(0,3).join('_'))}`;
    const res = await fetch(wikiUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.extract) return `Wikipedia: ${data.title}\n${data.extract.slice(0, 500)}`;
    }
  } catch {}
  return null;
}

function extractFiles(response) {
  const files = {};
  // Try to find filename comments in code blocks
  const regex = /```[\w]*\n(?:\/\/\s*|#\s*|<!--\s*)?([^\s<>]+\.\w+)[^\n]*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    const path = match[1].replace(/-->.*/, '').trim();
    const content = match[2].trim();
    if (path && content && !path.includes(' ')) files[path] = content;
  }
  // Fallback: grab any code block
  if (Object.keys(files).length === 0) {
    const fallback = /```(\w+)\n([\s\S]*?)```/g;
    let i = 0;
    while ((match = fallback.exec(response)) !== null) {
      const lang = match[1];
      const content = match[2].trim();
      const extMap = { html:'index.html', css:'styles.css', javascript:'script.js', js:'script.js', python:'main.py', jsx:'app.jsx', ts:'script.ts', tsx:'app.tsx' };
      files[extMap[lang] || `file${i}.${lang}`] = content;
      i++;
    }
  }
  return files;
}

const PLANNER_SYSTEM = `You are a Senior Solutions Architect and Planner agent in an elite multi-agent coding system.
Research the task and produce a comprehensive technical specification.

Include:
1. PROJECT OVERVIEW — vision and goals
2. TECH STACK — exact CDN URLs, libraries needed
3. FILE STRUCTURE — every file with purpose
4. FEATURES — complete feature list with edge cases
5. UI/UX SPEC — exact colors (hex), typography, animations, layout
6. DATA MODEL — state shape, localStorage schema
7. IMPLEMENTATION NOTES — patterns, performance considerations

The Coder agent implements EXACTLY what you specify. Be exhaustive.`;

const CODER_SYSTEM = `You are a world-class Senior Frontend Engineer and Coder agent.
Implement the technical specification completely.

MANDATORY STANDARDS:
- Zero placeholders, zero TODOs — every line is real working code
- Every file starts with: // filename.ext or <!-- filename.html -->
- CDN links only — no npm imports in browser code
- CSS: CSS custom properties, smooth transitions, hover/focus states
- Animations: use CSS keyframes or requestAnimationFrame, never setTimeout
- Mobile-first responsive with CSS Grid/Flexbox
- Glassmorphism dark UI with depth and polish
- Handle empty states, loading states, error states
- Proper error handling and input validation

Write COMPLETE files. The Reviewer will reject any partial code.`;

const REVIEWER_SYSTEM = `You are a Principal Engineer and Reviewer agent with extremely high standards.
Audit and improve the Coder's work.

CHECK:
- Bugs, broken logic, undefined variables
- All features from spec are implemented
- Animations are smooth (transform/opacity, not layout props)
- All interactive elements have hover/focus states
- Error handling is comprehensive
- Code is clean and readable

IMPROVE:
- Add one micro-interaction that's missing
- Ensure keyboard navigation works
- Optimize any obvious performance issues

Rewrite any files that need fixes — COMPLETE rewrites only, no partials.
Start each rewritten file with: // filename.ext`;

export function useMultiAgent() {
  const [isRunning, setIsRunning] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [agents, setAgents] = useState({
    planner:  { status: 'idle', steps: [], output: null },
    coder:    { status: 'idle', steps: [], output: null },
    reviewer: { status: 'idle', steps: [], output: null },
  });
  const [files, setFiles] = useState({});
  const [activeAgent, setActiveAgent] = useState(null);
  const abortRef = useRef(false);

  const updateAgent = (name, update) =>
    setAgents(prev => ({ ...prev, [name]: { ...prev[name], ...update } }));

  const addStep = (agentName, step) =>
    setAgents(prev => ({
      ...prev,
      [agentName]: { ...prev[agentName], steps: [...(prev[agentName].steps || []), { id: uid(), ...step }] },
    }));

  const updateLastStep = (agentName, update) =>
    setAgents(prev => {
      const steps = [...(prev[agentName].steps || [])];
      if (steps.length > 0) steps[steps.length - 1] = { ...steps[steps.length - 1], ...update };
      return { ...prev, [agentName]: { ...prev[agentName], steps } };
    });

  const runAgent = async (agentName, system, userMessage, apiKey, engine, model) => {
    if (abortRef.current) throw new Error('Aborted');
    updateAgent(agentName, { status: 'running' });
    setActiveAgent(agentName);

    addStep(agentName, { type: 'think', status: 'running', label: 'Working...' });

    const onRetry = (msg) => {
      updateLastStep(agentName, { status: 'retrying', label: msg });
    };

    let result;
    if (engine === 'wasm' || apiKey === 'wasm') {
      result = await callWasm([{ role: 'user', content: userMessage }], system);
    } else {
      result = await callProviderQueued(
        apiKey, engine, model, system,
        [{ role: 'user', content: userMessage }],
        0.3, onRetry
      );
    }

    updateLastStep(agentName, { status: 'done', label: 'Complete', detail: result.slice(0, 200) + '...' });
    updateAgent(agentName, { status: 'done', output: result });
    return result;
  };

  const runMultiAgent = useCallback(async (task, apiKey, engine = 'gemini', model = 'gemini-2.5-flash', onFileWrite, onPreview) => {
    // Resolve key from DB if missing
    let resolvedKey = apiKey;
    let resolvedEngine = engine;
    if (!resolvedKey) {
      for (const p of ['groq', 'gemini', 'openrouter']) {
        const k = await getSetting(`key_${p}`, '');
        if (k) { resolvedKey = k; resolvedEngine = p; break; }
      }
    }
    if (!resolvedKey) return;

    const defaultModels = { gemini: 'gemini-2.5-flash', groq: 'openai/gpt-oss-120b', openrouter: 'mistralai/mistral-7b-instruct:free' };
    const resolvedModel = (model && model !== 'gemini-2.5-flash' || resolvedEngine === 'gemini') ? model : defaultModels[resolvedEngine];

    setIsRunning(true);
    setFiles({});
    abortRef.current = false;
    setAgents({
      planner:  { status: 'idle', steps: [], output: null },
      coder:    { status: 'idle', steps: [], output: null },
      reviewer: { status: 'idle', steps: [], output: null },
    });

    // ── LOCAL MODEL 3-PHASE PIPELINE ───────────────────────────────────
    if (resolvedEngine === 'wasm' || resolvedKey === 'wasm') {
      try {
        // PHASE 1: Planner — write a spec
        setActiveAgent('planner');
        updateAgent('planner', { status: 'running' });
        addStep('planner', { type: 'plan', status: 'running', label: 'Planning: ' + task.slice(0, 40) + '...' });

        const planPrompt = 'Task: ' + task + '\nWrite a short technical plan: what files are needed, what features to include, what libraries to use. Keep it under 200 words.';
        let spec = '';
        await callWasm([{ role: 'user', content: planPrompt }],
          'You are a software architect. Write a concise technical spec.',
          (chunk) => { spec += chunk; }
        );
        updateLastStep('planner', { status: 'done', label: 'Spec written', detail: spec.slice(0, 300) });
        updateAgent('planner', { status: 'done', output: spec });

        if (abortRef.current) { setIsRunning(false); setActiveAgent(null); return; }

        // PHASE 2: Coder — generate the actual code
        setActiveAgent('coder');
        updateAgent('coder', { status: 'running' });
        addStep('coder', { type: 'think', status: 'running', label: 'Coding...' });
        setStreamText('');

        const codePrompt = 'Spec:\n' + spec + '\n\nTask: ' + task + '\n\nWrite a complete self-contained HTML file. All CSS and JS inline. Dark theme. Polished UI.\n\nOutput ONLY the HTML starting with <!DOCTYPE html>:';
        let accumulated = '';
        const code = await callWasm(
          [{ role: 'user', content: codePrompt }],
          'You are an expert web developer. Output ONLY complete HTML. No explanation, no markdown fences. Start with <!DOCTYPE html>.',
          (chunk) => { accumulated += chunk; setStreamText(accumulated); }
        );
        updateLastStep('coder', { status: 'done', label: 'Code written' });
        updateAgent('coder', { status: 'done' });
        setStreamText('');

        // Extract HTML
        let html = code.trim();
        const fbStart = html.indexOf('```');
        const fbEnd = html.lastIndexOf('```');
        if (fbStart !== -1 && fbEnd > fbStart + 3) {
          const inner = html.slice(fbStart + 3, fbEnd);
          const nl = inner.indexOf("\n");
          html = (nl >= 0 ? inner.slice(nl + 1) : inner).trim();
        }
        if (!html.startsWith('<!') && !html.startsWith('<html')) {
          html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{background:#0a0a0f;color:#e8e8e8;font-family:sans-serif;padding:20px}</style></head><body>' + html + '</body></html>';
        }
        addStep('coder', { type: 'write_file', status: 'done', label: 'index.html written' });
        setFiles({ 'index.html': html });
        if (onFileWrite) await onFileWrite('index.html', html);
        if (onPreview) onPreview(html, 'index.html');

        if (abortRef.current) { setIsRunning(false); setActiveAgent(null); return; }

        // PHASE 3: Reviewer — quick quality check
        setActiveAgent('reviewer');
        updateAgent('reviewer', { status: 'running' });
        addStep('reviewer', { type: 'plan', status: 'running', label: 'Reviewing code...' });

        const reviewPrompt = 'Review this HTML briefly. List any obvious bugs or missing features in 3 bullet points:\n' + html.slice(0, 800);
        let review = '';
        await callWasm([{ role: 'user', content: reviewPrompt }],
          'You are a code reviewer. Be concise. List issues only.',
          (chunk) => { review += chunk; }
        );
        updateLastStep('reviewer', { status: 'done', label: 'Review complete', detail: review.slice(0, 400) });
        updateAgent('reviewer', { status: 'done', output: review });

      } catch (err) {
        addStep('coder', { type: 'error', status: 'error', label: err.message });
        setStreamText('');
      }
      setActiveAgent(null);
      setIsRunning(false);
      return;
    }
    // ── END LOCAL PIPELINE ─────────────────────────────────────────────

    try {
      // Phase 1: Planner
      if (abortRef.current) throw new Error('Aborted');
      addStep('planner', { type: 'search', status: 'running', label: 'Researching task...' });
      const searchResults = await browserSearch(task);
      updateLastStep('planner', { status: 'done', detail: searchResults ? 'Found context' : 'No results' });

      const plannerMsg = `Task: ${task}${searchResults ? `\n\nResearch:\n${searchResults}` : ''}\n\nWrite a complete technical specification.`;
      const spec = await runAgent('planner', PLANNER_SYSTEM, plannerMsg, resolvedKey, resolvedEngine, resolvedModel);

      // 800ms gap between agents
      await delay(800);

      // Phase 2: Coder
      if (abortRef.current) throw new Error('Aborted');
      const coderMsg = `Original task: ${task}\n\nSpec:\n${spec}\n\nImplement the complete project. Write ALL files with full code. Start each file with // filename.ext`;
      const implementation = await runAgent('coder', CODER_SYSTEM, coderMsg, resolvedKey, resolvedEngine, resolvedModel);

      // Extract files
      const writtenFiles = extractFiles(implementation);
      if (Object.keys(writtenFiles).length === 0) {
        const htmlMatch = implementation.match(/```html\n([\s\S]*?)```/);
        if (htmlMatch) writtenFiles['index.html'] = htmlMatch[1].trim();
        else writtenFiles['index.html'] = implementation;
      }
      setFiles(writtenFiles);

      for (const [path, content] of Object.entries(writtenFiles)) {
        if (onFileWrite) await onFileWrite(path, content);
        if (path.endsWith('.html') && onPreview) onPreview(content, path);
      }

      addStep('coder', { type: 'write_file', status: 'done', label: `${Object.keys(writtenFiles).length} file(s) written`, detail: Object.keys(writtenFiles).join(', ') });

      await delay(800);

      // Phase 3: Reviewer
      if (abortRef.current) throw new Error('Aborted');
      const fileContents = Object.entries(writtenFiles)
        .map(([p, c]) => `\`\`\`\n// ${p}\n${c.slice(0, 2000)}\n\`\`\``)
        .join('\n\n');

      const reviewerMsg = `Task: ${task}\n\nSpec summary:\n${spec.slice(0, 800)}\n\nCode:\n${fileContents}\n\nReview and fix any issues.`;
      const review = await runAgent('reviewer', REVIEWER_SYSTEM, reviewerMsg, resolvedKey, resolvedEngine, resolvedModel);

      const fixedFiles = extractFiles(review);
      if (Object.keys(fixedFiles).length > 0) {
        setFiles(prev => ({ ...prev, ...fixedFiles }));
        addStep('reviewer', { type: 'write_file', status: 'done', label: `Fixed ${Object.keys(fixedFiles).length} file(s)`, detail: Object.keys(fixedFiles).join(', ') });
        for (const [path, content] of Object.entries(fixedFiles)) {
          if (onFileWrite) await onFileWrite(path, content);
          if (path.endsWith('.html') && onPreview) onPreview(content, path);
        }
      } else {
        addStep('reviewer', { type: 'check', status: 'done', label: 'Code passed review' });
      }

    } catch (err) {
      if (err.message === 'Aborted') {
        // Clean stop
      } else {
        const current = activeAgent || 'planner';
        updateLastStep(current, { status: 'error', label: `Error: ${err.message.slice(0, 80)}`, detail: err.message });
        updateAgent(current, { status: 'error' });
      }
    }

    setActiveAgent(null);
    setIsRunning(false);
  }, []);

  const stopMultiAgent = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
    setActiveAgent(null);
  }, []);

  const clearMultiAgent = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
    setActiveAgent(null);
    setFiles({});
    setAgents({
      planner:  { status: 'idle', steps: [], output: null },
      coder:    { status: 'idle', steps: [], output: null },
      reviewer: { status: 'idle', steps: [], output: null },
    });
    setTimeout(() => { abortRef.current = false; }, 100);
  }, []);

  return { isRunning, streamText, agents, files, activeAgent, runMultiAgent, stopMultiAgent, clearMultiAgent };
}
