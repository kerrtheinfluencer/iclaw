import { useState, useRef, useCallback, useEffect } from 'react';
import { getSetting, setSetting } from '../utils/db.js';
import { trackRequest } from '../utils/requestQueue.js';

const SYSTEM_PROMPT = `You are a helpful coding assistant. When creating web projects:

1. For simple demos: Provide a single HTML file with inline CSS and JavaScript
2. For complex projects: Separate into HTML, CSS, and JS files with clear filenames
3. Always use code blocks with filenames like:
   \`\`\`html
   // index.html
   <code here>
   \`\`\`
4. For 3D graphics, include Three.js from CDN
5. Make sure all file references match the filenames you provide`;

const PROVIDERS = {
  gemini: { name: 'Google Gemini', keyPrefix: 'key_gemini', defaultModel: 'gemini-2.5-flash' },
  groq: { name: 'Groq', keyPrefix: 'key_groq', defaultModel: 'llama-3.3-70b-versatile' },
  openrouter: { name: 'OpenRouter', keyPrefix: 'key_openrouter', defaultModel: 'mistralai/mistral-7b-instruct:free' }
};

export function useLLM() {
  const [status, setStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [activeEngine, setActiveEngine] = useState(null);
  const [activeModel, setActiveModel] = useState(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadText, setLoadText] = useState('');
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
  const workerRef = useRef(null);
  const streamCallbackRef = useRef(null);
  const doneCallbackRef = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/llm_worker.js', import.meta.url), { type: 'module' });
    workerRef.current.onmessage = (e) => {
      const { type, payload } = e.data;
      switch (type) {
        case 'status': 
          setStatus(payload.status); 
          setStatusMessage(payload.message || ''); 
          break;
        case 'progress': 
          setLoadProgress(payload.progress); 
          setLoadText(payload.text || ''); 
          break;
        case 'stream': 
          streamCallbackRef.current?.(payload.delta, payload.fullText); 
          break;
        case 'done': 
          setStatus('ready'); 
          doneCallbackRef.current?.(payload.fullText, payload.stats, payload.error); 
          break;
        case 'searchStatus': 
          setIsSearching(payload.isSearching); 
          break;
      }
    };
    return () => workerRef.current?.terminate();
  }, []);

  const initModel = useCallback(async (engine, apiKey) => {
    if (!apiKey) return;
    setStatus('loading');
    setActiveEngine(engine);
    setActiveModel(PROVIDERS[engine].defaultModel);
    workerRef.current?.postMessage({ type: 'init', engine, apiKey, model: PROVIDERS[engine].defaultModel });
    await setSetting(PROVIDERS[engine].keyPrefix, apiKey);
  }, []);

  const selectModel = useCallback((model) => {
    setActiveModel(model);
    workerRef.current?.postMessage({ type: 'setModel', model });
  }, []);

  const setKey = useCallback((engine, key) => {
    if (key) setSetting(PROVIDERS[engine].keyPrefix, key);
  }, []);

  const toggleSearch = useCallback((on) => {
    setWebSearchOn(on);
    workerRef.current?.postMessage({ type: 'toggleSearch', on });
  }, []);

  const generate = useCallback(async (messages, ragContext = [], onStream, onDone, attachments = []) => {
    if (!activeEngine) { onDone?.(null, null, 'No engine selected'); return; }
    
    trackRequest(activeEngine, activeModel);
    setStatus('generating');
    streamCallbackRef.current = onStream;
    doneCallbackRef.current = onDone;
    
    workerRef.current?.postMessage({ 
      type: 'generate', 
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      ragContext,
      attachments 
    });
  }, [activeEngine, activeModel]);

  const resetChat = useCallback(() => {
    workerRef.current?.postMessage({ type: 'reset' });
  }, []);

  return { 
    status, 
    statusMessage, 
    activeEngine, 
    activeModel, 
    loadProgress, 
    loadText,
    webSearchOn,
    isSearching,
    initModel, 
    selectModel, 
    setKey, 
    generate, 
    resetChat,
    toggleSearch 
  };
}
