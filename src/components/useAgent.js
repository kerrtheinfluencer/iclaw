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
    setIsRunning(true);
    setSteps([]);
    setFiles({});
    abortRef.current = false;

    const AGENT_SYSTEM = `You are iclaw, an autonomous coding agent. You complete tasks step by step using tools.

Available tools (respond with JSON tool calls):
- write_file(path, content) — write code to a file
- read_file(path) — read a file you wrote
- list_files() — list all written files
- web_search(query) — search the web for info
- run_code(code, language) — execute JS/HTML and see console output
- finish(summary) — call when task is complete

RULES:
1. Always respond with a JSON tool call in this exact format:
{"tool":"tool_name","args":{"param":"value"},"thought":"why you're doing this"}
2. After writing all files, call finish() with a summary
3. For web apps: write a complete index.html first, then test it with run_code
4. Fix errors automatically — read the error, fix the code, run again
5. Max ${MAX_STEPS} steps then auto-finish
6. Be efficient — don't repeat steps unnecessarily`;

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
          // Auto-preview HTML files
          if (args.path.endsWith('.html') && onPreview) {
            onPreview(args.content, args.path);
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
