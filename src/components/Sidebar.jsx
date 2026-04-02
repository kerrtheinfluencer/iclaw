import React, { useState, useEffect, useRef } from 'react';
import {
  FolderOpen, File, GitBranch, MessageSquare,
  Plus, ChevronRight, ChevronDown, Database, X,
  RefreshCw, Folder, Trash2, Clock,
  Download, Upload, Archive,
} from 'lucide-react';
import { getAllChats, deleteChat, saveChat, getSetting, setSetting } from '../utils/db.js';

function TreeNode({ node, depth = 0, onFileSelect, path = '' }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const fullPath = path ? `${path}/${node.name}` : node.name;

  if (node.kind === 'directory') {
    return (
      <div>
        <button onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/[0.03] transition-colors text-left"
          style={{ paddingLeft: `${depth * 12 + 12}px` }}>
          {expanded ? <ChevronDown size={12} className="text-steel-500 shrink-0" /> : <ChevronRight size={12} className="text-steel-500 shrink-0" />}
          <Folder size={13} className="text-neon-amber/60 shrink-0" />
          <span className="text-xs font-mono text-steel-300 truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map((child, i) => (
          <TreeNode key={`${fullPath}/${child.name}-${i}`} node={child} depth={depth + 1} onFileSelect={onFileSelect} path={fullPath} />
        ))}
      </div>
    );
  }

  const ext = node.name.split('.').pop();
  const colorMap = { js: 'text-neon-amber', jsx: 'text-neon-cyan', ts: 'text-blue-400', tsx: 'text-blue-400', css: 'text-neon-pink', html: 'text-orange-400', json: 'text-neon-green', py: 'text-blue-300', md: 'text-steel-300' };

  return (
    <button onClick={() => onFileSelect(fullPath)}
      className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/[0.03] transition-colors text-left active:bg-neon-green/5"
      style={{ paddingLeft: `${depth * 12 + 24}px` }}>
      <File size={12} className={`${colorMap[ext] || 'text-steel-400'} shrink-0`} />
      <span className="text-xs font-mono text-steel-300 truncate">{node.name}</span>
    </button>
  );
}

export default function Sidebar({
  isOpen, onClose, tree, projectName, onOpenProject, onFileSelect,
  onNewChat, onLoadChat, indexStats, isIndexing, onReindex, hasGit, fsSupported,
}) {
  const [activeTab, setActiveTab] = useState('files');
  const [chatHistory, setChatHistory] = useState([]);
  const [backupStatus, setBackupStatus] = useState(null);
  const restoreInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && activeTab === 'chat') loadHistory();
  }, [isOpen, activeTab]);

  const loadHistory = async () => {
    try {
      const chats = await getAllChats();
      setChatHistory(chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    } catch { setChatHistory([]); }
  };

  const handleDeleteChat = async (id, e) => {
    e.stopPropagation();
    try { await deleteChat(id); } catch {}
    setChatHistory(prev => prev.filter(c => c.id !== id));
  };

  const handleExportBackup = async () => {
    try {
      const chats = await getAllChats().catch(() => []);
      const settings = {};
      for (const key of ['key_gemini', 'key_groq', 'key_openrouter', 'key_cerebras', 'key_sambanova', 'apiProvider', 'apiModel']) {
        try { const val = await getSetting(key, null); if (val !== null) settings[key] = val; } catch {}
      }
      const backup = {
        version: '1.5', app: 'iclaw',
        exportedAt: new Date().toISOString(),
        chats, settings,
        stats: { totalChats: chats.length, totalMessages: chats.reduce((s, c) => s + (c.messages?.length || 0), 0) },
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iclaw-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      setBackupStatus('exported');
      setTimeout(() => setBackupStatus(null), 3000);
    } catch (err) {
      setBackupStatus('error');
      setTimeout(() => setBackupStatus(null), 3000);
    }
  };

  const handleRestoreBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const backup = JSON.parse(await file.text());
      if (backup.app !== 'iclaw' || !backup.chats) throw new Error('Invalid backup file');
      let imported = 0;
      for (const chat of backup.chats) {
        if (chat.id && chat.messages) { try { await saveChat(chat); imported++; } catch {} }
      }
      if (backup.settings) {
        for (const [key, value] of Object.entries(backup.settings)) {
          try { if (value) await setSetting(key, value); } catch {}
        }
      }
      await loadHistory();
      setBackupStatus('imported');
      setTimeout(() => setBackupStatus(null), 3000);
      alert(`Restored ${imported} chats from backup (${backup.exportedAt?.slice(0, 10) || 'unknown'}).`);
    } catch (err) {
      setBackupStatus('error');
      setTimeout(() => setBackupStatus(null), 3000);
      alert('Restore failed: ' + err.message);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const diff = Date.now() - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />}
      <div className={`fixed top-0 left-0 h-full w-[280px] z-50 glass-panel border-r border-white/5 transform transition-transform duration-300 ease-out safe-top ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>

        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="font-display text-sm font-semibold tracking-wider text-neon-green/80">Workspace</span>
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded"><X size={16} className="text-steel-400" /></button>
        </div>

        <div className="flex border-b border-white/5 mx-2">
          {[
            { id: 'files', icon: FolderOpen, label: 'Files' },
            { id: 'chat', icon: MessageSquare, label: 'History' },
            { id: 'git', icon: GitBranch, label: 'Git' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono transition-colors border-b-2 -mb-[1px] ${activeTab === tab.id ? 'text-neon-green border-neon-green/60' : 'text-steel-500 border-transparent hover:text-steel-300'}`}>
              <tab.icon size={13} />{tab.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto pb-20" style={{ height: 'calc(100% - 120px)' }}>

          {/* FILES TAB */}
          {activeTab === 'files' && (
            <div>
              {!projectName ? (
                <div className="p-4 space-y-3">
                  <p className="text-xs text-steel-400 leading-relaxed">Open a project folder for AI-powered coding with file access.</p>
                  {fsSupported ? (
                    <button onClick={onOpenProject}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-mono border border-neon-green/25 bg-neon-green/5 text-neon-green hover:bg-neon-green/10 active:scale-[0.98] transition-all">
                      <FolderOpen size={14} /> Open Project
                    </button>
                  ) : (
                    <div className="text-xs text-neon-pink/80 bg-neon-pink/5 border border-neon-pink/20 rounded-lg p-3">
                      File System Access API not available on this browser.
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <FolderOpen size={13} className="text-neon-amber" />
                      <span className="text-xs font-mono text-steel-200 font-medium">{projectName}</span>
                    </div>
                    <button onClick={onReindex} className={`p-1 hover:bg-white/5 rounded ${isIndexing ? 'animate-spin' : ''}`}>
                      <RefreshCw size={12} className="text-steel-500" />
                    </button>
                  </div>
                  {indexStats && (
                    <div className="px-4 py-1.5 flex items-center gap-2 border-b border-white/[0.03]">
                      <Database size={10} className="text-neon-green/50" />
                      <span className="text-[10px] font-mono text-steel-500">{indexStats.total} files indexed</span>
                    </div>
                  )}
                  <div className="py-1">
                    {tree.map((node, i) => <TreeNode key={`${node.name}-${i}`} node={node} onFileSelect={onFileSelect} />)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'chat' && (
            <div className="p-3 space-y-2">
              {/* New Chat */}
              <button onClick={() => { onNewChat(); onClose(); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-mono border border-neon-green/25 bg-neon-green/5 text-neon-green hover:bg-neon-green/10 active:scale-[0.98] transition-all">
                <Plus size={14} /> New Chat
              </button>

              {/* Backup / Restore — always visible */}
              <div className="flex gap-2">
                <button onClick={handleExportBackup}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-mono border transition-all active:scale-[0.97] ${
                    backupStatus === 'exported' ? 'border-neon-green/30 bg-neon-green/5 text-neon-green' : 'border-white/[0.08] bg-white/[0.02] text-steel-400 hover:border-neon-cyan/30 hover:text-steel-200'
                  }`}>
                  <Download size={12} />
                  {backupStatus === 'exported' ? 'Saved!' : 'Backup'}
                </button>
                <button onClick={() => restoreInputRef.current?.click()}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-mono border transition-all active:scale-[0.97] ${
                    backupStatus === 'imported' ? 'border-neon-green/30 bg-neon-green/5 text-neon-green' : 'border-white/[0.08] bg-white/[0.02] text-steel-400 hover:border-neon-amber/30 hover:text-steel-200'
                  }`}>
                  <Upload size={12} />
                  {backupStatus === 'imported' ? 'Restored!' : 'Restore'}
                </button>
                <input ref={restoreInputRef} type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
              </div>

              {backupStatus === 'error' && (
                <p className="text-[10px] text-neon-pink text-center font-mono">Operation failed — try regular (non-incognito) mode</p>
              )}

              {/* Chat list */}
              {chatHistory.length > 0 && (
                <div className="flex items-center justify-between px-1 pt-1">
                  <span className="text-[9px] font-mono text-steel-600 flex items-center gap-1">
                    <Archive size={9} /> {chatHistory.length} chat{chatHistory.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[9px] font-mono text-steel-700">
                    {chatHistory.reduce((s, c) => s + (c.messages?.length || 0), 0)} msgs
                  </span>
                </div>
              )}

              {chatHistory.length === 0 ? (
                <div className="pt-4 text-center space-y-1">
                  <p className="text-[10px] text-steel-500">No saved chats yet.</p>
                  <p className="text-[9px] text-steel-700">Chats save automatically as you talk.</p>
                </div>
              ) : (
                <div className="space-y-1 pt-1">
                  {chatHistory.map(chat => (
                    <button key={chat.id} onClick={() => { onLoadChat(chat); onClose(); }}
                      className="w-full flex items-start justify-between gap-2 p-2.5 rounded-lg hover:bg-white/[0.03] transition-colors text-left group active:bg-neon-green/5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-steel-200 truncate font-medium">{chat.title || 'Untitled'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-mono text-steel-600 flex items-center gap-1">
                            <Clock size={8} /> {formatTime(chat.updatedAt)}
                          </span>
                          <span className="text-[9px] font-mono text-steel-700">{chat.messages?.length || 0} msgs</span>
                          {chat.project && <span className="text-[9px] font-mono text-neon-amber/40">/{chat.project}</span>}
                        </div>
                      </div>
                      <button onClick={e => handleDeleteChat(chat.id, e)}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-neon-pink/10 transition-all shrink-0">
                        <Trash2 size={11} className="text-neon-pink/50" />
                      </button>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* GIT TAB */}
          {activeTab === 'git' && (
            <div className="p-4 space-y-3">
              {hasGit ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-neon-green" />
                  <span className="text-xs text-steel-300 font-mono">Git repo detected</span>
                </div>
              ) : (
                <p className="text-xs text-steel-400">No git repo found. Open a project with a .git folder.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
