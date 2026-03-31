import React, { useState, useEffect } from 'react';
import { FolderOpen, MessageSquare, GitBranch, X, Plus, RefreshCw, Database, Download, Upload, Trash2 } from 'lucide-react';
import { getAllChats, deleteChat, getAllProjects } from '../utils/db.js';

export default function Sidebar({ 
  isOpen, 
  onClose,
  tree, 
  projectName,
  onOpenProject,
  onFileSelect, 
  onNewChat, 
  onLoadChat,
  indexStats, 
  isIndexing,
  onReindex, 
  hasGit, 
  fsSupported,
  messages,
  chatId
}) {
  const [activeTab, setActiveTab] = useState('files');
  const [chatHistory, setChatHistory] = useState([]);
  const [backupStatus, setBackupStatus] = useState(null);

  useEffect(() => {
    if (isOpen) loadChatHistory();
  }, [isOpen, messages]);

  const loadChatHistory = async () => {
    const chats = await getAllChats();
    setChatHistory(chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
  };

  const handleDeleteChat = async (id) => {
    await deleteChat(id);
    await loadChatHistory();
  };

  const renderFileTree = (nodes, depth = 0) => {
    return nodes.map((node, i) => (
      <div key={`${node.name}-${i}`} style={{ paddingLeft: depth * 12 }}>
        {node.kind === 'directory' ? (
          <div>
            <div className="flex items-center gap-1 py-1 text-[#888] text-sm">
              <span>📁</span>
              <span>{node.name}</span>
            </div>
            {node.children && renderFileTree(node.children, depth + 1)}
          </div>
        ) : (
          <button
            onClick={() => onFileSelect(node.name)}
            className="flex items-center gap-1 py-1 text-[#e0e0e0] text-sm hover:text-[#00ff88] w-full text-left"
          >
            <span>📄</span>
            <span className="truncate">{node.name}</span>
          </button>
        )}
      </div>
    ));
  };

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      <aside className={`
        fixed lg:static inset-y-0 left-0 w-80 bg-[#0f0f16] border-r border-[#333] z-50
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:hidden'}
        flex flex-col
      `}>
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <h2 className="font-bold text-[#e0e0e0]">Workspace</h2>
          <button onClick={onClose} className="lg:hidden p-1 hover:bg-[#333] rounded">
            <X className="w-5 h-5 text-[#666]" />
          </button>
        </div>

        <div className="flex border-b border-[#333]">
          {[
            { id: 'files', icon: FolderOpen, label: 'Files' },
            { id: 'chat', icon: MessageSquare, label: 'History' },
            { id: 'git', icon: GitBranch, label: 'Git' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm ${
                activeTab === tab.id 
                  ? 'text-[#00ff88] border-b-2 border-[#00ff88]' 
                  : 'text-[#666] hover:text-[#888]'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'files' && (
            <div>
              {!projectName ? (
                <div className="text-center py-8">
                  <FolderOpen className="w-12 h-12 text-[#333] mx-auto mb-4" />
                  <p className="text-[#888] text-sm mb-4">
                    Open a project folder for AI-powered coding with file access.
                  </p>
                  {fsSupported ? (
                    <button
                      onClick={onOpenProject}
                      className="px-4 py-2 bg-[#00ff88] text-[#0a0a0f] rounded-lg font-medium hover:bg-[#00ff88]/90"
                    >
                      Open Project Folder
                    </button>
                  ) : (
                    <p className="text-yellow-400 text-sm">
                      File System Access API not available on this browser yet.
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-[#e0e0e0]">{projectName}</h3>
                    <div className="flex gap-2">
                      {isIndexing && <RefreshCw className="w-4 h-4 text-[#00ff88] animate-spin" />}
                      <button onClick={onReindex} className="p-1 hover:bg-[#333] rounded" title="Reindex">
                        <Database className="w-4 h-4 text-[#666]" />
                      </button>
                    </div>
                  </div>
                  {indexStats && (
                    <div className="text-xs text-[#666] mb-2">
                      {indexStats.total} files indexed
                    </div>
                  )}
                  <div className="space-y-1">
                    {renderFileTree(tree)}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={onNewChat}
                  className="flex items-center gap-2 px-3 py-2 bg-[#00ff88]/10 text-[#00ff88] rounded-lg text-sm hover:bg-[#00ff88]/20"
                >
                  <Plus className="w-4 h-4" />
                  New Chat
                </button>
              </div>

              {backupStatus === 'error' && (
                <div className="mb-4 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs">
                  Backup operation failed.
                </div>
              )}

              {chatHistory.length > 0 && (
                <div className="mb-4 text-xs text-[#666]">
                  {chatHistory.length} saved chat{chatHistory.length !== 1 ? 's' : ''} · {chatHistory.reduce((s, c) => s + (c.messages?.length || 0), 0)} total msgs
                </div>
              )}

              {chatHistory.length === 0 ? (
                <p className="text-center text-[#666] py-8">No saved chats yet.</p>
              ) : (
                <div className="space-y-2">
                  {chatHistory.map((chat) => (
                    <div
                      key={chat.id}
                      onClick={() => onLoadChat(chat)}
                      className={`p-3 rounded-lg cursor-pointer group ${
                        chat.id === chatId ? 'bg-[#00ff88]/20 border border-[#00ff88]/30' : 'bg-[#1a1a24] hover:bg-[#222]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#e0e0e0] truncate flex-1">
                          {chat.title || 'Untitled Chat'}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-xs text-[#666] mt-1">
                        {new Date(chat.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'git' && (
            <div className="text-center py-8">
              {hasGit ? (
                <div>
                  <GitBranch className="w-12 h-12 text-[#00ff88] mx-auto mb-4" />
                  <p className="text-[#888]">Git repo detected</p>
                </div>
              ) : (
                <div>
                  <GitBranch className="w-12 h-12 text-[#333] mx-auto mb-4" />
                  <p className="text-[#666] text-sm">
                    No git repo found. Open a project with a .git folder.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
