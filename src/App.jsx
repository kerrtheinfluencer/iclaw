import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useWasmLLM, WasmModelPicker } from './components/WasmRunner.jsx';
import { useLLM } from './hooks/useLLM.js';
import { useAgent } from './hooks/useAgent.js';
import { useMultiAgent } from './hooks/useMultiAgent.js';
import AgentPanel from './components/AgentPanel.jsx';
import MultiAgentPanel from './components/MultiAgentPanel.jsx';
import HtmlPreview from './components/HtmlPreview.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import RateLimitMonitor from './components/RateLimitMonitor.jsx';
import ChatV2 from './components/ChatV2.jsx';
import { uid } from './utils/codeParser.js';
import { saveChat, getSetting } from './utils/db.js';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(e) { return { hasError: true, error: e }; }
  componentDidCatch(e, i) { console.error('iclaw v2 crash:', e, i); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ background: '#030712', color: '#22d3ee', fontFamily: 'monospace', padding: 32, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 40 }}>⚠</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>iclaw v2.0 — runtime error</div>
        <div style={{ fontSize: 11, color: '#f43f5e', maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>{this.state.error?.message}</div>
        <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 8, color: '#22d3ee', cursor: 'pointer', fontSize: 13 }}>Reload</button>
      </div>
    );
  }
}

export default function App() {
  const [settingsOpen, setSettingsOpen]       = useState(false);
  const [agentOpen, setAgentOpen]             = useState(false);
  const [multiAgentOpen, setMultiAgentOpen]   = useState(false);
  const [rateLimitOpen, setRateLimitOpen]     = useState(false);
  const [wasmPickerOpen, setWasmPickerOpen]   = useState(false);
  const [previewHtml, setPreviewHtml]         = useState(null);
  const [previewTitle, setPreviewTitle]       = useState('');
  const [messages, setMessages]               = useState([]);
  const [chatId, setChatId]                   = useState(() => uid());
  const [agentApiKey, setAgentApiKey]         = useState('');
  const [agentKeys, setAgentKeys]             = useState({});
  const keyRestoredRef = useRef(false);

  const llm       = useLLM();
  const wasmLLM   = useWasmLLM();
  const agent     = useAgent();
  const multiAgent = useMultiAgent();

  useEffect(() => {
    if (keyRestoredRef.current) return;
    if (llm.status !== 'idle' && llm.status !== 'needsKey') return;
    keyRestoredRef.current = true;
    (async () => {
      for (const p of ['gemini','groq','cerebras','sambanova','huggingface','openrouter','together']) {
        const k = await getSetting(`key_${p}`, '');
        if (k) { llm.setKey(p, k); setAgentApiKey(k); setAgentKeys(prev => ({...prev, [p]: k})); break; }
      }
    })();
  }, [llm.status]);

  const handleSend = useCallback(async (text, streamRef) => {
    const userMsg = { id: uid(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    const history = [...messages, userMsg].map(({role,content}) => ({role,content}));

    if (llm.activeEngine === 'wasm') {
      if (!wasmLLM.isReady) {
        setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: '⚡ No local model loaded yet. Tap **Local AI** to download one.' }]);
        return;
      }
      await wasmLLM.generate(history,
        (delta, full) => streamRef.current?.(full),
        (full, stats, err) => {
          streamRef.current?.('');
          if (full) setMessages(prev => { const u = [...prev, {id:uid(),role:'assistant',content:full,stats}]; saveChat({id:chatId,messages:u,title:text.slice(0,50)}).catch(()=>{}); return u; });
          else if (err) setMessages(prev => [...prev, {id:uid(),role:'assistant',content:'⚠️ '+err}]);
        }
      );
      return;
    }
    llm.generate(history, [],
      (delta, full) => streamRef.current?.(full),
      (full, stats, err) => {
        streamRef.current?.('');
        if (full) setMessages(prev => { const u = [...prev, {id:uid(),role:'assistant',content:full,stats}]; saveChat({id:chatId,messages:u,title:text.slice(0,50)}).catch(()=>{}); return u; });
        else if (err) setMessages(prev => [...prev, {id:uid(),role:'assistant',content:'⚠️ '+err}]);
      }
    );
  }, [messages, llm, wasmLLM, chatId]);

  const handlePreview = useCallback((html, title) => { setPreviewHtml(html); setPreviewTitle(title || 'Preview'); }, []);
  const handleNewChat = useCallback(() => { setMessages([]); setChatId(uid()); llm.resetChat?.(); }, [llm]);

  const getAgentConfig = () => {
    const eng = llm.activeEngine || 'gemini';
    const key = eng === 'wasm' ? 'wasm' : (agentKeys[eng] || agentApiKey);
    const models = { gemini:'gemini-2.5-flash', groq:'llama-3.3-70b-versatile', openrouter:'mistralai/mistral-7b-instruct:free', wasm:'local' };
    return { eng, key, model: llm.activeModel || models[eng] || 'gemini-2.5-flash' };
  };

  const isWasm = llm.activeEngine === 'wasm';
  const isOnDevice = isWasm && wasmLLM.isReady;

  return (
    <ErrorBoundary>
      <div className="h-screen h-[100dvh] flex flex-col bg-void-950 text-steel-100 overflow-hidden">
        <ChatV2
          messages={messages}
          onSend={handleSend}
          onNewChat={handleNewChat}
          llm={llm}
          wasmLLM={wasmLLM}
          isOnDevice={isOnDevice}
          isWasm={isWasm}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAgent={() => setAgentOpen(true)}
          onOpenMultiAgent={() => setMultiAgentOpen(true)}
          onOpenWasmPicker={() => setWasmPickerOpen(true)}
          onInitModel={(engine) => engine === 'wasm' ? setWasmPickerOpen(true) : llm.initModel(engine)}
          onSelectModel={(id) => {
            const wasmIds = ['llama3.2-1b-webgpu','qwen2.5-coder-1.5b-webgpu','llama3.2-3b-webgpu','phi3.5-mini-webgpu','qwen2.5-coder-1.5b'];
            wasmIds.includes(id) ? (wasmLLM.setSelectedModel(id), wasmLLM.loadModel(id)) : llm.selectModel(id);
          }}
          onPreview={handlePreview}
          onOpenRateLimit={() => setRateLimitOpen(true)}
        />

        {wasmPickerOpen && <WasmModelPicker wasmLLM={wasmLLM} onClose={() => setWasmPickerOpen(false)} />}
        {previewHtml && <HtmlPreview html={previewHtml} title={previewTitle} onClose={() => setPreviewHtml(null)} />}

        <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)}
          onSelectEngine={llm.initModel} activeEngine={llm.activeEngine} llmStatus={llm.status}
          activeModel={llm.activeModel}
          onSetKey={(p,k) => { llm.setKey(p,k); setAgentKeys(prev=>({...prev,[p]:k})); setAgentApiKey(k); }}
          onSelectModel={(id) => {
            const wasmIds = ['llama3.2-1b-webgpu','qwen2.5-coder-1.5b-webgpu','llama3.2-3b-webgpu','phi3.5-mini-webgpu','qwen2.5-coder-1.5b'];
            wasmIds.includes(id) ? (wasmLLM.setSelectedModel(id), wasmLLM.loadModel(id)) : llm.selectModel(id);
          }}
        />
        <RateLimitMonitor isOpen={rateLimitOpen} onClose={() => setRateLimitOpen(false)} activeEngine={llm.activeEngine} activeModel={llm.activeModel} />
        <AgentPanel isOpen={agentOpen} onClose={() => setAgentOpen(false)}
          isRunning={agent.isRunning} steps={agent.steps} files={agent.files} streamText={agent.streamText}
          onRun={(task) => { const {eng,key,model} = getAgentConfig(); agent.runAgent(task,key,eng,model,null,handlePreview); }}
          onStop={agent.stopAgent} onClear={agent.clearAgent}
          apiKey={agentKeys[llm.activeEngine]||agentApiKey} activeEngine={llm.activeEngine} activeModel={llm.activeModel}
          onPreviewFile={handlePreview}
        />
        <MultiAgentPanel isOpen={multiAgentOpen} onClose={() => setMultiAgentOpen(false)}
          isRunning={multiAgent.isRunning} agents={multiAgent.agents} files={multiAgent.files}
          activeAgent={multiAgent.activeAgent} streamText={multiAgent.streamText}
          onRun={(task) => { const {eng,key,model} = getAgentConfig(); multiAgent.runMultiAgent(task,key,eng,model,null,handlePreview); }}
          onStop={multiAgent.stopMultiAgent} onClear={multiAgent.clearMultiAgent}
          apiKey={agentKeys[llm.activeEngine]||agentApiKey} activeEngine={llm.activeEngine}
          onPreviewFile={handlePreview}
        />
      </div>
    </ErrorBoundary>
  );
}
