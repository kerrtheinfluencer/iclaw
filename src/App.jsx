import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatView from './components/ChatView.jsx';
import CodeEditor from './components/CodeEditor.jsx';
import HtmlPreview from './components/HtmlPreview.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { useWasmLLM, WasmModelPicker } from './components/WasmRunner.jsx';
import { useLLM } from './hooks/useLLM.js';
import { useWorkspace } from './hooks/useWorkspace.js';
import { useAgent } from './hooks/useAgent.js';
import AgentPanel from './components/AgentPanel.jsx';
import { useMultiAgent } from './hooks/useMultiAgent.js';
import RateLimitMonitor from './components/RateLimitMonitor.jsx';
import MultiAgentPanel from './components/MultiAgentPanel.jsx';
import { uid } from './utils/codeParser.js';
import { saveChat, getSetting } from './utils/db.js';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [multiAgentOpen, setMultiAgentOpen] = useState(false);
  const [rateLimitOpen, setRateLimitOpen] = useState(false);
  const [agentApiKey, setAgentApiKey] = useState('');
  const [agentKeys, setAgentKeys] = useState({});
  const [messages, setMessages] = useState([]);
  const [chatId, setChatId] = useState(() => uid());
  const [editingFile, setEditingFile] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const touchStartX = useRef(0);
  const keyRestoredRef = useRef(false);

  const llm = useLLM();
  const workspace = useWorkspace();
  const wasmLLM = useWasmLLM();
  const [wasmPickerOpen, setWasmPickerOpen] = useState(false);
  const agent = useAgent();
  const multiAgent = useMultiAgent();

  // Auto-restore saved keys — triggered once worker reports idle status
  useEffect(() => {
    if (keyRestoredRef.current) return;
    if (llm.status !== 'idle' && llm.status !== 'needsKey') return;
    keyRestoredRef.current = true;
    (async () => {
      for (const p of ['gemini', 'groq', 'cerebras', 'sambanova', 'huggingface', 'openrouter']) {
        const key = await getSetting(`key_${p}`, '');
        if (key) {
          llm.setKey(p, key);
          setAgentApiKey(key);
          setAgentKeys(prev => ({...prev, [p]: key}));
          break;
        }
      }
    })();
  }, [llm.status]);

  // Swipe gestures
  useEffect(() => {
    const onStart = (e) => { touchStartX.current = e.touches[0].clientX; };
    const onEnd = (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (touchStartX.current < 30 && dx > 80) setSidebarOpen(true);
      if (sidebarOpen && dx < -80) setSidebarOpen(false);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => { document.removeEventListener('touchstart', onStart); document.removeEventListener('touchend', onEnd); };
  }, [sidebarOpen]);

  // Send message with optional attachments
  const handleSend = useCallback(async (text, streamRef, attachments = []) => {
    const userMsg = { id: uid(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));

    // Route to WASM if active
    if (llm.activeEngine === 'wasm' && wasmLLM.isReady) {
      await wasmLLM.generate(
        history,
        (delta, fullText) => { streamRef.current?.(fullText); },
        (fullText, stats, error) => {
          streamRef.current?.('');
          if (fullText) {
            const msg = { id: uid(), role: 'assistant', content: fullText, stats };
            setMessages((prev) => {
              const updated = [...prev, msg];
              saveChat({ id: chatId, messages: updated, title: text.slice(0, 50), project: workspace.projectName || null }).catch(() => {});
              return updated;
            });
          } else if (error) {
            setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: `⚠️ ${error}` }]);
          }
        }
      );
      return;
    }

    let ragContext = [];
    if (workspace.isOpen) {
      try { ragContext = await workspace.searchContext(text); } catch {}
    }
    llm.generate(history, ragContext,
      (delta, fullText) => { streamRef.current?.(fullText); },
      (fullText, stats, error) => {
        streamRef.current?.('');
        if (fullText) {
          const msg = { id: uid(), role: 'assistant', content: fullText, stats };
          setMessages((prev) => {
            const updated = [...prev, msg];
            saveChat({ id: chatId, messages: updated, title: text.slice(0, 50), project: workspace.projectName || null }).catch(() => {});
            return updated;
          });
        } else if (error) {
          setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: `⚠️ ${error}` }]);
        }
      },
      attachments
    );
  }, [messages, llm, workspace, chatId, wasmLLM]);

  // Load a saved chat
  const handleLoadChat = useCallback((chat) => {
    setChatId(chat.id);
    setMessages(chat.messages || []);
    // Ensure engine is active after load
    if (llm.status === 'idle' || llm.status === 'needsKey') {
      // try to restore key
      getSetting('key_gemini', '').then(k => { if (k) { llm.setKey('gemini', k); setAgentApiKey(k); } });
    }
  }, [llm]);

  const handleInject = useCallback(async (path, code) => {
    if (!workspace.isOpen) return false;
    const ok = await workspace.saveFile(path, code);
    if (ok) workspace.reindex();
    return ok;
  }, [workspace]);

  const handlePreview = useCallback((html, title) => { setPreviewHtml(html); setPreviewTitle(title); }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setChatId(uid());
    llm.resetChat();
    setSidebarOpen(false);
  }, [llm]);

  const handleFileSelect = useCallback(async (path) => {
    const content = await workspace.openFile(path);
    if (content !== null) { setEditingFile(path); setEditingContent(content); }
    setSidebarOpen(false);
  }, [workspace]);

  const handleEditorSave = useCallback(async (path, content) => {
    const ok = await workspace.saveFile(path, content);
    if (ok) { setEditingContent(content); workspace.reindex(); }
    return ok;
  }, [workspace]);

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-void-950 text-steel-100 overflow-hidden scan-overlay hex-bg">
      <Header llmStatus={llm.status} projectName={workspace.projectName}
        activeEngine={llm.activeEngine} activeModel={llm.activeModel}
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        onSettingsOpen={() => setSettingsOpen(true)}
        onSelectModel={llm.selectModel}
        onOpenAgent={() => setAgentOpen(true)}
        onOpenMultiAgent={() => setMultiAgentOpen(true)}
        onOpenRateLimit={() => setRateLimitOpen(true)} />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}
        tree={workspace.tree} projectName={workspace.projectName}
        onOpenProject={async () => { await workspace.openProject(); setSidebarOpen(false); }}
        onFileSelect={handleFileSelect} onNewChat={handleNewChat} onLoadChat={handleLoadChat}
        indexStats={workspace.indexStats} isIndexing={workspace.isIndexing}
        onReindex={workspace.reindex} hasGit={workspace.hasGit} fsSupported={workspace.fsSupported} />

      <main className="flex-1 min-h-0 relative">
        <ChatView messages={messages} onSend={handleSend}
          llmStatus={llm.status} loadProgress={llm.loadProgress} loadText={llm.loadText}
          statusMessage={llm.statusMessage} activeEngine={llm.activeEngine}
          onInitModel={(engine) => { if (engine === 'wasm') { setWasmPickerOpen(true); } else { llm.initModel(engine); } }} onResetChat={handleNewChat}
          onInject={handleInject} onPreview={handlePreview}
          projectOpen={workspace.isOpen} projectName={workspace.projectName}
          onOpenProject={workspace.openProject} fsSupported={workspace.fsSupported}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAgent={() => setAgentOpen(true)}
          webSearchOn={llm.webSearchOn} isSearching={llm.isSearching}
          onToggleSearch={llm.toggleSearch} />
      </main>

      {editingFile && <CodeEditor path={editingFile} initialContent={editingContent}
        onSave={handleEditorSave} onClose={() => setEditingFile(null)} />}
      {previewHtml && <HtmlPreview html={previewHtml} title={previewTitle}
        onClose={() => setPreviewHtml(null)} />}
      {wasmPickerOpen && (
        <WasmModelPicker wasmLLM={wasmLLM} onClose={() => setWasmPickerOpen(false)} />
      )}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)}
        onSelectEngine={llm.initModel} onSetKey={(p, k) => { llm.setKey(p, k); setAgentKeys(prev => ({...prev, [p]: k})); setAgentApiKey(k); }}
        activeEngine={llm.activeEngine} llmStatus={llm.status}
        activeModel={llm.activeModel} onSelectModel={llm.selectModel} />
      <RateLimitMonitor
        isOpen={rateLimitOpen} onClose={() => setRateLimitOpen(false)}
        activeEngine={llm.activeEngine} activeModel={llm.activeModel}
      />
      <MultiAgentPanel
        isOpen={multiAgentOpen} onClose={() => setMultiAgentOpen(false)}
        isRunning={multiAgent.isRunning} agents={multiAgent.agents}
        files={multiAgent.files} activeAgent={multiAgent.activeAgent}
        onRun={(task) => {
              const eng = llm.activeEngine || 'gemini';
              const key = agentKeys[eng] || agentApiKey;
              const defaultModels = { gemini: 'gemini-2.5-flash', groq: 'llama-3.3-70b-versatile', openrouter: 'mistralai/mistral-7b-instruct:free' };
              const model = llm.activeModel || defaultModels[eng] || 'gemini-2.5-flash';
              multiAgent.runMultiAgent(task, key, eng, model, handleInject, handlePreview);
            }}
        onStop={multiAgent.stopMultiAgent} onClear={multiAgent.clearMultiAgent}
        apiKey={agentKeys[llm.activeEngine] || agentApiKey} onPreviewFile={handlePreview}
      />
      <AgentPanel
        isOpen={agentOpen} onClose={() => setAgentOpen(false)}
        isRunning={agent.isRunning} steps={agent.steps} files={agent.files}
        onRun={(task) => {
              const eng = llm.activeEngine || 'gemini';
              const key = agentKeys[eng] || agentApiKey;
              const defaultModels = { gemini: 'gemini-2.5-flash', groq: 'llama-3.3-70b-versatile', openrouter: 'mistralai/mistral-7b-instruct:free' };
              const model = llm.activeModel || defaultModels[eng] || 'gemini-2.5-flash';
              agent.runAgent(task, key, eng, model, handleInject, handlePreview);
            }}
        onStop={agent.stopAgent} onClear={agent.clearAgent}
        apiKey={agentKeys[llm.activeEngine] || agentApiKey} activeModel={llm.activeModel}
        onPreviewFile={handlePreview}
      />
    </div>
  );
}
// Agent panel appended via patch
