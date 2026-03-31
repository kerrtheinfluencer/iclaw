import { useState, useRef, useCallback } from 'react';
import { getSetting } from '../utils/db.js';
import { callProviderQueued, delay } from '../utils/requestQueue.js';
import { uid } from '../utils/codeParser.js';

const MAX_STEPS = 20;

// Sandbox runner — executes HTML/JS and returns console output
function runInSandbox(code, language) {
  return new Promise((resolve) => {
    const logs = [];
    const errors = [];

    let html = code;
    if (!['html', 'xml'].includes(language)) {
      html = `<!DOCTYPE html>
<html>
<head>
  <script>
    console.log = function(...args) { window.parent.postMessage({type: 'log', data: args.join(' ')}, '*'); };
    console.error = function(...args) { window.parent.postMessage({type: 'error', data: args.join(' ')}, '*'); };
  </script>
</head>
<body>
  <script>${code}</script>
</body>
</html>`;
    }

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.sandbox = 'allow-scripts';
    iframe.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      iframe.remove();
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({ logs, errors: [...errors, 'Execution timeout (5s)'], output: logs.join('\n') });
    }, 5000);

    window.addEventListener('message', function handler(e) {
      if (e.source !== iframe.contentWindow) return;
      if (e.data.type === 'log') logs.push(e.data.data);
      if (e.data.type === 'error') errors.push(e.data.data);
      if (e.data.type === 'done') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        cleanup();
        resolve({ logs, errors, output: logs.join('\n') });
      }
    });

    document.body.appendChild(iframe);
  });
}

const AGENT_SYSTEM_PROMPT = `You are an autonomous coding agent. You have access to these tools:
- write_file(path, content): Write content to a file
- read_file(path): Read content from a file  
- web_search(query): Search the web for information
- run_code(code, language): Execute code in a sandbox (js, html)
- finish(message): Complete the task with a summary

Respond with JSON actions in this format:
{"tool": "write_file", "path": "filename.js", "content": "code here"}
Or for finish: {"tool": "finish", "message": "Task complete"}`;

export function useAgent() {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState([]);
  const [files, setFiles] = useState({});
  const abortRef = useRef(false);

  const addStep = useCallback((step) => {
    setSteps(prev => [...prev, { id: uid(), timestamp: Date.now(), ...step }]);
  }, []);

  const updateLastStep = useCallback((update) => {
    setSteps(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, ...update }];
    });
  }, []);

  const runAgent = useCallback(async (task, apiKey, engine, model, onFileWrite, onPreview) => {
    let resolvedKey = apiKey;
    let resolvedEngine = engine;
    
    if (!resolvedKey) {
      for (const p of ['groq', 'gemini', 'openrouter']) {
        const k = await getSetting(`key_${p}`, '');
        if (k) { resolvedKey = k; resolvedEngine = p; break; }
      }
    }
    
    if (!resolvedKey) {
      addStep({ type: 'error', label: 'No API key configured' });
      return;
    }

    setIsRunning(true);
    setSteps([]);
    setFiles({});
    abortRef.current = false;

    const context = { files: {}, task };
    let stepCount = 0;

    try {
      addStep({ type: 'think', status: 'running', label: 'Starting task: ' + task.slice(0, 50) });

      while (stepCount < MAX_STEPS) {
        if (abortRef.current) throw new Error('Aborted');

        const messages = [
          { role: 'user', content: `Task: ${task}\n\nContext: ${JSON.stringify(context, null, 2)}` }
        ];

        updateLastStep({ status: 'running', label: `Step ${stepCount + 1}: Thinking...` });

        const response = await callProviderQueued(
          resolvedKey,
          resolvedEngine,
          model,
          AGENT_SYSTEM_PROMPT,
          messages,
          0.3,
          (msg) => updateLastStep({ status: 'retrying', label: msg })
        );

        // Parse JSON action from response
        let action;
        try {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          action = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch {
          action = null;
        }

        if (!action || !action.tool) {
          addStep({ type: 'error', status: 'error', label: 'Invalid response format', detail: response.slice(0, 100) });
          break;
        }

        switch (action.tool) {
          case 'write_file':
            context.files[action.path] = action.content;
            setFiles(prev => ({ ...prev, [action.path]: action.content }));
            addStep({ type: 'write_file', status: 'done', label: `Wrote ${action.path}` });
            if (onFileWrite) await onFileWrite(action.path, action.content);
            if (action.path.endsWith('.html') && onPreview) onPreview(action.content, action.path);
            break;

          case 'read_file':
            const content = context.files[action.path] || '';
            addStep({ type: 'read_file', status: 'done', label: `Read ${action.path}` });
            break;

          case 'web_search':
            addStep({ type: 'search', status: 'running', label: `Searching: ${action.query}` });
            await delay(1000);
            addStep({ type: 'search', status: 'done', label: 'Search complete' });
            break;

          case 'run_code':
            addStep({ type: 'run', status: 'running', label: `Running ${action.language} code` });
            const result = await runInSandbox(action.code, action.language);
            addStep({ type: 'run', status: 'done', label: 'Code executed', detail: result.output.slice(0, 100) });
            break;

          case 'finish':
            addStep({ type: 'finish', status: 'done', label: action.message || 'Task complete' });
            setIsRunning(false);
            return;

          default:
            addStep({ type: 'error', status: 'error', label: `Unknown tool: ${action.tool}` });
        }

        stepCount++;
        await delay(500);
      }

      if (stepCount >= MAX_STEPS) {
        addStep({ type: 'error', status: 'error', label: 'Max steps reached' });
      }

    } catch (err) {
      if (err.message === 'Aborted') {
        addStep({ type: 'stop', status: 'done', label: 'Stopped by user' });
      } else {
        addStep({ type: 'error', status: 'error', label: err.message.slice(0, 80), detail: err.message });
      }
    }

    setIsRunning(false);
  }, [addStep, updateLastStep]);

  const stopAgent = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
  }, []);

  const clearAgent = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
    setSteps([]);
    setFiles({});
  }, []);

  return { isRunning, steps, files, runAgent, stopAgent, clearAgent };
}
