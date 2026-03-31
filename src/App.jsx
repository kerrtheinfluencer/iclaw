import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatView from './components/ChatView.jsx';
import CodeEditor from './components/CodeEditor.jsx';
import HtmlPreview from './components/HtmlPreview.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import AgentPanel from './components/AgentPanel.jsx';
import MultiAgentPanel from './components/MultiAgentPanel.jsx';
import RateLimitMonitor from './components/RateLimitMonitor.jsx';
import { useLLM } from './hooks/useLLM.js';
import { useWorkspace } from './hooks/useWorkspace.js';
import { useAgent } from './hooks/useAgent.js';
import { useMultiAgent } from './hooks/useMultiAgent.js';
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
  const agent = useAgent();
  const multiAgent = useMultiAgent();

  useEffect(() => {
    if (keyRestoredRef.current) return;
    if (llm.status !== 'idle' && llm.status !== 'needsKey') return;
    keyRestoredRef.current = true;
    (async () => {
      for (const p of ['gemini', 'groq', 'openrouter']) {
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

  useEffect(() => {
    const onStart = (e) => { touchStartX.current = e.touches[0].clientX; };
    const onEnd = (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (touchStartX.current < 30 && dx > 80) setSidebarOpen(true);
      if (sidebarOpen && dx < -80) setSidebarOpen(false);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => { 
      document.removeEventListener('touchstart', onStart); 
      document.removeEventListener('touchend', onEnd); 
    };
  }, [sidebarOpen]);

  const handleSend = useCallback(async (text, streamRef, attachments = []) => {
    const userMsg = { id: uid(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);

    const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
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
  }, [messages, llm, workspace, chatId]);

  const handleLoadChat = useCallback((chat) => {
    setChatId(chat.id);
    setMessages(chat.messages || []);
    if (llm.status === 'idle' || llm.status === 'needsKey') {
      getSetting('key_gemini', '').then(k => { if (k) { llm.setKey('gemini', k); setAgentApiKey(k); } });
    }
  }, [llm]);

  const handleInject = useCallback(async (path, code) => {
    if (!workspace.isOpen) return false;
    const ok = await workspace.saveFile(path, code);
    if (ok) workspace.reindex();
    return ok;
  }, [workspace]);

  const handlePreview = useCallback((html, title) => { 
    setPreviewHtml(html); 
    setPreviewTitle(title || 'Preview'); 
  }, []);

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
    <div className="min-h-screen bg-[#0a0a0f] text-[#e0e0e0] overflow-hidden">
      <Header 
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        onSettingsOpen={() => setSettingsOpen(true)}
        onSelectModel={llm.selectModel}
        onOpenAgent={() => setAgentOpen(true)}
        onOpenMultiAgent={() => setMultiAgentOpen(true)}
        onOpenRateLimit={() => setRateLimitOpen(true)}
        llmStatus={llm.status}
        activeEngine={llm.activeEngine}
        activeModel={llm.activeModel}
      />
      
      <Sidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        tree={workspace.tree} 
        projectName={workspace.projectName}
        onOpenProject={async () => { await workspace.openProject(); setSidebarOpen(false); }}
        onFileSelect={handleFileSelect} 
        onNewChat={handleNewChat} 
        onLoadChat={handleLoadChat}
        indexStats={workspace.indexStats} 
        isIndexing={workspace.isIndexing}
        onReindex={workspace.reindex} 
        hasGit={workspace.hasGit} 
        fsSupported={workspace.fsSupported}
        messages={messages}
        chatId={chatId}
      />

      <main className="h-[calc(100vh-56px)] overflow-hidden">
        <ChatView 
          messages={messages}
          onSend={handleSend}
          onPreview={handlePreview}
          llmStatus={llm.status}
          statusMessage={llm.statusMessage}
          loadProgress={llm.loadProgress}
          loadText={llm.loadText}
          onSettingsOpen={() => setSettingsOpen(true)}
          onOpenAgent={() => setAgentOpen(true)}
          webSearchOn={llm.webSearchOn} 
          isSearching={llm.isSearching}
          onToggleSearch={llm.toggleSearch}
          projectOpen={workspace.isOpen}
        />
      </main>

      {editingFile && (
        <CodeEditor 
          filePath={editingFile} 
          content={editingContent}
          onClose={() => setEditingFile(null)}
          onSave={handleEditorSave}
        />
      )}
      
      {previewHtml && (
        <HtmlPreview 
          html={previewHtml} 
          title={previewTitle}
          onClose={() => setPreviewHtml(null)} 
        />
      )}

      {settingsOpen && (
        <SettingsPanel 
          onClose={() => setSettingsOpen(false)}
          onSelectEngine={llm.initModel} 
          onSetKey={(p, k) => { 
            llm.setKey(p, k); 
            setAgentKeys(prev => ({...prev, [p]: k})); 
            setAgentApiKey(k); 
          }}
          activeEngine={llm.activeEngine} 
          llmStatus={llm.status}
          activeModel={llm.activeModel} 
          onSelectModel={llm.selectModel}
        />
      )}

      {rateLimitOpen && (
        <RateLimitMonitor 
          isOpen={rateLimitOpen}
          onClose={() => setRateLimitOpen(false)}
          activeEngine={llm.activeEngine} 
          activeModel={llm.activeModel}
        />
      )}

      {multiAgentOpen && (
        <MultiAgentPanel 
          onClose={() => setMultiAgentOpen(false)}
          isRunning={multiAgent.isRunning} 
          agents={multiAgent.agents}
          files={multiAgent.files} 
          activeAgent={multiAgent.activeAgent}
          onRun={(task) => {
            const eng = llm.activeEngine || 'gemini';
            const key = agentKeys[eng] || agentApiKey;
            const defaultModels = { 
              gemini: 'gemini-2.5-flash', 
              groq: 'llama-3.3-70b-versatile', 
              openrouter: 'mistralai/mistral-7b-instruct:free' 
            };
            const model = llm.activeModel || defaultModels[eng] || 'gemini-2.5-flash';
            multiAgent.runMultiAgent(task, key, eng, model, handleInject, handlePreview);
          }}
          onStop={multiAgent.stopMultiAgent} 
          onClear={multiAgent.clearMultiAgent}
          apiKey={agentKeys[llm.activeEngine] || agentApiKey} 
          onPreviewFile={handlePreview}
        />
      )}

      {agentOpen && (
        <AgentPanel 
          onClose={() => setAgentOpen(false)}
          isRunning={agent.isRunning} 
          steps={agent.steps} 
          files={agent.files}
          onRun={(task) => {
            const eng = llm.activeEngine || 'gemini';
            const key = agentKeys[eng] || agentApiKey;
            const defaultModels = { 
              gemini: 'gemini-2.5-flash', 
              groq: 'llama-3.3-70b-versatile', 
              openrouter: 'mistralai/mistral-7b-instruct:free' 
            };
            const model = llm.activeModel || defaultModels[eng] || 'gemini-2.5-flash';
            agent.runAgent(task, key, eng, model, handleInject, handlePreview);
          }}
          onStop={agent.stopAgent} 
          onClear={agent.clearAgent}
          apiKey={agentKeys[llm.activeEngine] || agentApiKey} 
          activeModel={llm.activeModel}
          onPreviewFile={handlePreview}
        />
      )}
    </div>
  );
}
