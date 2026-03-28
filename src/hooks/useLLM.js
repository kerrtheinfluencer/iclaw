import { useState, useRef, useCallback, useEffect } from 'react';

export function useLLM() {
  const workerRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadText, setLoadText] = useState('');
  const [activeEngine, setActiveEngine] = useState(null);
  const [activeModel, setActiveModel] = useState(null);
  const [needsKey, setNeedsKey] = useState(null);
  const [webSearchOn, setWebSearchOn] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const streamCallbackRef = useRef(null);
  const completionCallbackRef = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/llm.worker.js', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (e) => {
      const { type, ...payload } = e.data;

      switch (type) {
        case 'status':
          if (payload.status === 'needsKey') {
            setNeedsKey(payload.provider);
            setStatus('needsKey');
          } else {
            setNeedsKey(null);
            setStatus(payload.status);
          }
          setStatusMessage(payload.message);
          break;
        case 'loadProgress':
          setLoadProgress(payload.progress);
          setLoadText(payload.text);
          break;
        case 'streamStart':
          setStatus('generating');
          break;
        case 'streamChunk':
          streamCallbackRef.current?.(payload.delta, payload.fullText);
          break;
        case 'streamEnd':
          setStatus('ready');
          if (payload.stats?.engine) setActiveEngine(payload.stats.engine);
          if (payload.stats?.model) setActiveModel(payload.stats.model);
          completionCallbackRef.current?.(payload.fullText, payload.stats);
          break;
        case 'modelChanged':
          setActiveModel(payload.model);
          break;
        case 'searchStatus':
          setIsSearching(payload.searching);
          break;
        case 'searchToggled':
          setWebSearchOn(payload.enabled);
          break;
        case 'error':
          setStatus((prev) => prev === 'generating' ? 'ready' : 'error');
          setStatusMessage(payload.message);
          completionCallbackRef.current?.(null, null, payload.message);
          break;
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  const initModel = useCallback((engineId = 'gemini') => {
    setActiveEngine(engineId);
    workerRef.current?.postMessage({ type: 'init', engine: engineId });
  }, []);

  const setKey = useCallback((provider, key) => {
    workerRef.current?.postMessage({ type: 'setKey', provider, key });
    setActiveEngine(provider);
    setNeedsKey(null);
  }, []);

  const selectModel = useCallback((model) => {
    setActiveModel(model);
    workerRef.current?.postMessage({ type: 'setModel', model });
  }, []);

  const generate = useCallback(
    (messages, ragContext = [], onStream, onComplete, attachments = []) => {
      streamCallbackRef.current = onStream;
      completionCallbackRef.current = onComplete;
      const requestId = Date.now().toString(36);
      workerRef.current?.postMessage({
        type: 'inference',
        messages,
        requestId,
        ragContext,
        model: activeModel,
        attachments,
      });
      return requestId;
    },
    [activeModel]
  );

  const resetChat = useCallback(() => {
    workerRef.current?.postMessage({ type: 'reset' });
  }, []);

  const toggleSearch = useCallback((enabled) => {
    workerRef.current?.postMessage({ type: 'toggleSearch', enabled });
    setWebSearchOn(enabled);
  }, []);

  return {
    status, statusMessage, loadProgress, loadText,
    activeEngine, activeModel, needsKey,
    webSearchOn, isSearching,
    initModel, setKey, selectModel, generate, resetChat, toggleSearch,
  };
}
