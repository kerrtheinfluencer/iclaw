import { getSetting } from '../utils/db.js';
/**
 * iclaw Agent — Browser-side agentic loop
 * Tools: write_file, read_file, web_search, run_code, finish
 */
import { useState, useRef, useCallback } from 'react';
import { uid } from '../utils/codeParser.js';

const MAX_STEPS = 20;

// Sandbox runner — executes HTML/JS and returns console output
function runInSandbox(code, language) {
  return new Promise((resolve) => {
    const logs = [];
    const errors = [];

    // Wrap JS in a full HTML doc if not already HTML
    let html = code;
    if (!['html', 'xml'].includes(language)) {
      html = `<!DOCTYPE html><html><head></head><body><script>
const _logs = [];
const _orig = { log: console.log, error: console.error, warn: console.warn };
console.log = (...a) => { _logs.push({t:'log', v: a.map(String).join(' ')}); _orig.log(...a); };
console.error = (...a) => { _logs.push({t:'error', v: a.map(String).join(' ')}); _orig.error(...a); };
console.warn = (...a) => { _logs.push({t:'warn', v: a.map(String).join(' ')}); _orig.warn(...a); };
window.onerror = (msg,_,line) => { _logs.push({t:'error', v: \`Line \${line}: \${msg}\`}); };
try {
${code}
} catch(e) { _logs.push({t:'error', v: e.message}); }
setTimeout(() => parent.postMessage({type:'sandboxResult', logs: _logs}, '*'), 100);
<\/script></body></html>`;
    } else {
      // Inject logger into HTML
      const loggerScript = `<script>
const _logs = [];
const _orig = { log: console.log, error: console.error };
console.log = (...a) => { _logs.push({t:'log', v: a.map(String).join(' ')}); _orig.log(...a); };
console.error = (...a) => { _logs.push({t:'error', v: a.map(String).join(' ')}); _orig.error(...a); };
window.onerror = (msg,_,line) => { _logs.push({t:'error', v: \`Line \${line}: \${msg}\`}); };
setTimeout(() => parent.postMessage({type:'sandboxResult', logs: _logs}, '*'), 500);
<\/script>`;
      html = html.replace('</head>', loggerScript + '</head>');
    }

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
    iframe.sandbox = 'allow-scripts allow-same-origin';

    const timeout = setTimeout(() => {
      cleanup();
      resolve({ output: '(timeout — no output after 3s)', errors: [] });
    }, 3000);

    const handler = (e) => {
      if (e.data?.type === 'sandboxResult') {
        cleanup();
        const output = e.data.logs.map(l => `[${l.t}] ${l.v}`).join('\n') || '(no output)';
        const errs = e.data.logs.filter(l => l.t === 'error').map(l => l.v);
        resolve({ output, errors: errs });
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    };

    window.addEventListener('message', handler);
    document.body.appendChild(iframe);
    iframe.src = url;
  });
}

// SearXNG search (reuse from worker pattern)
const CORS_PROXY = 'https://corsproxy.io/?url=';
const SEARXNG_INSTANCES = ['https://search.sapti.me', 'https://searx.be', 'https://paulgo.io'];

async function browserSearch(query) {
  for (const instance of SEARXNG_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en`;
      const res = await fetch(CORS_PROXY + encodeURIComponent(url), {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.results?.length > 0) {
        return data.results.slice(0, 5)
          .map((r, i) => `[${i+1}] ${r.title}\n${r.content || ''}\nURL: ${r.url}`)
          .join('\n\n');
      }
    } catch { continue; }
  }
  return 'No results found.';
}


// Multi-provider LLM call for agents
async function callProvider(apiKey, engine, model, systemPrompt, messages) {
  try {
    if (engine === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(({ role, content }) => ({ role, content })),
          ],
          temperature: 0.2, max_tokens: 4096,
        }),
      });
      if (!res.ok) return `__ERROR__API error: ${res.status}: ${(await res.text()).slice(0,150)}`;
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
    if (engine === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'X-Title': 'iclaw' },
        body: JSON.stringify({
          model: model || 'mistralai/mistral-7b-instruct:free',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(({ role, content }) => ({ role, content })),
          ],
          temperature: 0.2, max_tokens: 4096,
        }),
      });
      if (!res.ok) return `__ERROR__API error: ${res.status}: ${(await res.text()).slice(0,150)}`;
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }
    // Default: Gemini
    const geminiModel = model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood.' }] },
      ...messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    ];
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } }),
    });
    if (!res.ok) return `__ERROR__API error: ${res.status}: ${(await res.text()).slice(0,150)}`;
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  } catch(e) { return `__ERROR__${e.message}`; }
}


// Wrap JS code in a runnable HTML document for preview
function wrapJsForPreview(code, filename) {
  const CDN_MAP = {
    'THREE': 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'gsap': 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js',
    'anime': 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js',
    'Chart': 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
    'd3.': 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
    'Matter': 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js',
    'PIXI': 'https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.2/pixi.min.js',
    'p5': 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js',
  };
  const scripts = Object.entries(CDN_MAP)
    .filter(([token]) => code.includes(token))
    .map(([, url]) => `<script src="${url}"></script>`)
    .join('\n');
  const needsCanvas = code.includes('canvas') || code.includes('THREE') || code.includes('PIXI') || code.includes('getContext');
  const processed = code
    .replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, 'const __default__ = ')
    .replace(/^export\s+/gm, '');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{margin:0;background:#0a0a0f;color:#e8e8e8;font-family:sans-serif;}canvas{display:block;}</style>
${scripts}
</head><body>
${needsCanvas ? '<canvas id="canvas" style="width:100vw;height:100vh;display:block;"></canvas>' : '<div id="app" style="padding:20px;"></div>'}
<script>
const canvas = document.getElementById('canvas');
if(canvas){canvas.width=window.innerWidth;canvas.height=window.innerHeight;window.addEventListener('resize',()=>{canvas.width=window.innerWidth;canvas.height=window.innerHeight;});}
try{${processed}}catch(e){document.body.innerHTML='<div style="color:#f87171;padding:20px;font-family:monospace"><h3>Error</h3><pre>'+e.message+'</pre></div>';}
<\/script></body></html>`;
}

function wrapCssForPreview(code, filename) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{margin:0;background:#0a0a0f;color:#e8e8e8;font-family:sans-serif;padding:20px;}</style>
<style>${code}</style>
</head><body>
<h1>Heading 1</h1><h2>Heading 2</h2><p>Paragraph text with <a href="#">a link</a>.</p>
<button class="btn">Button</button><button class="btn btn-primary">Primary</button>
<div class="card" style="margin:16px 0;padding:16px">Card element</div>
<div class="container"><div class="row"><div class="col">Col 1</div><div class="col">Col 2</div></div></div>
</body></html>`;
}

export function useAgent() {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState([]);
  const [files, setFiles] = useState({}); // virtual file system: { path: content }
  const abortRef = useRef(false);
  const workerRef = useRef(null);

  const addStep = (step) => {
    setSteps(prev => [...prev, { id: uid(), ...step }]);
  };

  const updateLastStep = (update) => {
    setSteps(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[updated.length - 1] = { ...updated[updated.length - 1], ...update };
      }
      return updated;
    });
  };

  // Execute a single tool call
  const executeTool = useCallback(async (tool, args) => {
    switch (tool) {
      case 'write_file': {
        const { path, content } = args;
        setFiles(prev => ({ ...prev, [path]: content }));
        return `File written: ${path} (${content.split('\n').length} lines)`;
      }

      case 'read_file': {
        const { path } = args;
        const content = files[path];
        if (!content) return `File not found: ${path}`;
        return `Content of ${path}:\n\`\`\`\n${content}\n\`\`\``;
      }

      case 'list_files': {
        const fileList = Object.keys(files);
        if (fileList.length === 0) return 'No files written yet.';
        return 'Files:\n' + fileList.map(f => `- ${f}`).join('\n');
      }

      case 'web_search': {
        const { query } = args;
        const results = await browserSearch(query);
        return `Search results for "${query}":\n\n${results}`;
      }

      case 'run_code': {
        const { code, language = 'javascript' } = args;
        const { output, errors } = await runInSandbox(code, language);
        if (errors.length > 0) {
          return `Output:\n${output}\n\nErrors:\n${errors.join('\n')}`;
        }
        return `Output:\n${output}`;
      }

      case 'finish': {
        return '__DONE__';
      }

      default:
        return `Unknown tool: ${tool}`;
    }
  }, [files]);

  // Main agent loop
  const runAgent = useCallback(async (task, apiKey, engine = 'gemini', model = 'gemini-2.5-flash', onFileWrite, onPreview) => {
    // If no key provided, try to read from DB
    let resolvedKey = apiKey;
    let resolvedEngine = engine;
    if (!resolvedKey) {
      for (const p of ['groq', 'gemini', 'openrouter']) {
        const k = await getSetting(`key_${p}`, '');
        if (k) { resolvedKey = k; resolvedEngine = p; break; }
      }
    }
    apiKey = resolvedKey;
    engine = resolvedEngine;
    setIsRunning(true);
    setSteps([]);
    setFiles({});
    abortRef.current = false;

    const AGENT_SYSTEM = `You are iclaw, an elite autonomous coding agent built by a world-class engineering team. You produce professional, portfolio-worthy code.

Available tools (respond with JSON tool calls ONLY):
- write_file(path, content) — write code to a file
- read_file(path) — read a file you wrote
- list_files() — list all written files
- web_search(query) — search the web for current info, libraries, APIs
- run_code(code, language) — execute JS/HTML and see console output
- finish(summary) — call when task is complete

TOOL CALL FORMAT (strict JSON, no markdown around it):
{"tool":"tool_name","args":{"param":"value"},"thought":"why you are doing this"}

CODE QUALITY STANDARDS — non-negotiable:
- Zero placeholders or TODOs — every line is real, working code
- CSS must have: smooth transitions, hover/focus/active states, animations
- Use CSS custom properties for colors and spacing
- Mobile-first responsive design
- Proper error handling and input validation
- Semantic HTML with ARIA labels
- Use requestAnimationFrame for animations, never setTimeout
- CSS Grid/Flexbox for layouts
- Glassmorphism, gradients, shadows for visual depth

WORKFLOW:
1. web_search if you need current info, library docs, or inspiration
2. write_file for each file with complete production code
3. run_code to test — fix any errors automatically
4. finish() with summary of what was built

Max ${MAX_STEPS} steps. Be efficient but never sacrifice quality.`;

    const messages = [
      { role: 'user', content: `Task: ${task}\n\nStart by planning, then execute step by step using tools.` }
    ];

    addStep({ type: 'plan', status: 'done', label: 'Starting agent loop', thought: '' });

    let stepCount = 0;

    while (stepCount < MAX_STEPS && !abortRef.current) {
      stepCount++;

      try {
        // Call active provider
        const rawText = await callProvider(apiKey, engine, model, AGENT_SYSTEM, messages);
        if (rawText.startsWith('__ERROR__')) {
          addStep({ type: 'error', status: 'error', label: rawText.replace('__ERROR__',''), detail: '' });
          break;
        }

        // Parse JSON tool call from response
        let toolCall = null;
        const jsonMatch = rawText.match(/\{[\s\S]*"tool"[\s\S]*\}/);
        if (jsonMatch) {
          try { toolCall = JSON.parse(jsonMatch[0]); } catch {}
        }

        if (!toolCall) {
          // Model gave a text response, treat as finish
          addStep({ type: 'finish', status: 'done', label: 'Agent finished', detail: rawText });
          messages.push({ role: 'assistant', content: rawText });
          break;
        }

        const { tool, args = {}, thought = '' } = toolCall;

        // Add step to UI
        const stepLabel = getStepLabel(tool, args);
        addStep({ type: tool, status: 'running', label: stepLabel, thought, detail: '' });

        // Execute tool
        const result = await executeTool(tool, args);

        if (result === '__DONE__') {
          updateLastStep({ status: 'done', detail: args.summary || 'Task complete' });
          break;
        }

        updateLastStep({ status: 'done', detail: result.slice(0, 300) });

        // Special handling for write_file — notify parent
        if (tool === 'write_file' && onFileWrite) {
          await onFileWrite(args.path, args.content);
          // Auto-preview HTML, JS, CSS, SVG files
          if (onPreview) {
            const p = args.path;
            const c = args.content;
            if (p.endsWith('.html') || p.endsWith('.svg')) {
              onPreview(c, p);
            } else if (p.endsWith('.js') || p.endsWith('.ts') || p.endsWith('.jsx') || p.endsWith('.tsx')) {
              // Wrap JS in runnable HTML doc
              const html = wrapJsForPreview(c, p);
              onPreview(html, p);
            } else if (p.endsWith('.css')) {
              const html = wrapCssForPreview(c, p);
              onPreview(html, p);
            }
          }
        }

        // Add result to message history
        messages.push({ role: 'assistant', content: JSON.stringify(toolCall) });
        messages.push({ role: 'user', content: `Tool result: ${result}` });

        // Check if done
        if (tool === 'finish') break;

      } catch (err) {
        addStep({ type: 'error', status: 'error', label: 'Error', detail: err.message });
        break;
      }
    }

    if (stepCount >= MAX_STEPS) {
      addStep({ type: 'finish', status: 'warn', label: `Max steps (${MAX_STEPS}) reached`, detail: 'Agent stopped.' });
    }

    setIsRunning(false);
    return Object.keys(files).length > 0 ? files : null;
  }, [executeTool]);

  const stopAgent = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
  }, []);

  const clearAgent = useCallback(() => {
    setSteps([]);
    setFiles({});
  }, []);

  return { isRunning, steps, files, runAgent, stopAgent, clearAgent };
}

function getStepLabel(tool, args) {
  switch (tool) {
    case 'write_file': return `Writing ${args.path || 'file'}`;
    case 'read_file': return `Reading ${args.path || 'file'}`;
    case 'list_files': return 'Listing files';
    case 'web_search': return `Searching: ${(args.query || '').slice(0, 40)}`;
    case 'run_code': return `Running ${args.language || 'code'}`;
    case 'finish': return 'Finishing up';
    default: return tool;
  }
}
