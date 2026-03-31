import { useState, useRef, useCallback } from 'react';
import { getSetting } from '../utils/db.js';
import { callProviderQueued, delay } from '../utils/requestQueue.js';
import { uid } from '../utils/codeParser.js';

const MAX_STEPS = 20;

// Extract HTML from response
function extractHtml(content) {
  // Match ```html blocks
  const htmlMatch = content.match(/```html\n([\s\S]*?)```/);
  if (htmlMatch) return htmlMatch[1].trim();
  
  // Match complete HTML documents
  if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
    const match = content.match(/(<!DOCTYPE html>[\s\S]*?<\/html>)/);
    if (match) return match[1].trim();
  }
  
  return null;
}

const AGENT_SYSTEM_PROMPT = `You are an autonomous coding agent. Create complete, working code.
When generating HTML/JS projects, provide the complete code in a single HTML file using:
- Three.js for 3D graphics
- Canvas API for 2D graphics  
- CSS animations for effects

Always wrap HTML code in \`\`\`html blocks.`;

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
      addStep({ type: 'think', status: 'running', label: 'Starting: ' + task.slice(0, 50) });

      while (stepCount < MAX_STEPS) {
        if (abortRef.current) throw new Error('Aborted');

        const messages = [
          { role: 'system', content: AGENT_SYSTEM_PROMPT },
          { role: 'user', content: `Task: ${task}\n\nContext: ${JSON.stringify(context, null, 2)}` }
        ];

        updateLastStep({ status: 'running', label: `Step ${stepCount + 1}: Generating...` });

        const response = await callProviderQueued(
          resolvedKey,
          resolvedEngine,
          model,
          AGENT_SYSTEM_PROMPT,
          messages,
          0.3,
          (msg) => updateLastStep({ status: 'retrying', label: msg })
        );

        // Extract HTML immediately if present
        const htmlContent = extractHtml(response);
        if (htmlContent) {
          const filename = 'index.html';
          context.files[filename] = htmlContent;
          setFiles(prev => ({ ...prev, [filename]: htmlContent }));
          addStep({ type: 'write_file', status: 'done', label: `Created ${filename}` });
          
          // Trigger preview immediately
          if (onPreview) {
            onPreview(htmlContent, filename);
          }
          
          addStep({ type: 'finish', status: 'done', label: 'Preview ready!' });
          setIsRunning(false);
          return;
        }

        // Check for completion
        if (response.toLowerCase().includes('finish') || stepCount >= 3) {
          addStep({ type: 'finish', status: 'done', label: 'Task complete' });
          setIsRunning(false);
          return;
        }

        stepCount++;
        await delay(500);
      }

    } catch (err) {
      if (err.message === 'Aborted') {
        addStep({ type: 'stop', status: 'done', label: 'Stopped by user' });
      } else {
        addStep({ type: 'error', status: 'error', label: err.message.slice(0, 80) });
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
