import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatView from './components/ChatView.jsx';
import CodeEditor from './components/CodeEditor.jsx';
import HtmlPreview from './components/HtmlPreview.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import { useLLM } from './hooks/useLLM.js';
import { useWorkspace } from './hooks/useWorkspace.js';
import { uid } from './utils/codeParser.js';
import { saveChat, getSetting } from './utils/db.js';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatId, setChatId] = useState(() => uid());
  const [editingFile, setEditingFile] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const touchStartX = useRef(0);

  const llm = useLLM();
  const workspace = useWorkspace();

  // Auto-restore saved keys
  useEffect(() => {
    (async () => {
      for (const p of ['gemini', 'groq', 'openrouter']) {
        const key = await getSetting(`key_${p}`, '');
        if (key) { llm.setKey(p, key); break; }
      }
    })();
  }, []);

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

  // Load a saved chat
  const handleLoadChat = useCallback((chat) => {
    setChatId(chat.id);
    setMessages(chat.messages || []);
  }, []);

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
        activeEngine={llm.activeEngine} onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        onSettingsOpen={() => setSettingsOpen(true)} />

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
          onInitModel={llm.initModel} onResetChat={handleNewChat}
          onInject={handleInject} onPreview={handlePreview}
          projectOpen={workspace.isOpen} projectName={workspace.projectName}
          onOpenProject={workspace.openProject} fsSupported={workspace.fsSupported}
          onOpenSettings={() => setSettingsOpen(true)} />
      </main>

      {editingFile && <CodeEditor path={editingFile} initialContent={editingContent}
        onSave={handleEditorSave} onClose={() => setEditingFile(null)} />}
      {previewHtml && <HtmlPreview html={previewHtml} title={previewTitle}
        onClose={() => setPreviewHtml(null)} />}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)}
        onSelectEngine={llm.initModel} onSetKey={llm.setKey}
        activeEngine={llm.activeEngine} llmStatus={llm.status}
        activeModel={llm.activeModel} onSelectModel={llm.selectModel} />
    </div>
  );
}
