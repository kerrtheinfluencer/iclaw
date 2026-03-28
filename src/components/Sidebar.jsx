import React, { useState } from 'react';
import {
  FolderOpen, File, GitBranch, Search, Settings,
  MessageSquare, Plus, ChevronRight, ChevronDown,
  Database, X, RefreshCw, Folder,
} from 'lucide-react';

function TreeNode({ node, depth = 0, onFileSelect, path = '' }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const fullPath = path ? `${path}/${node.name}` : node.name;

  if (node.kind === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/[0.03] transition-colors text-left group"
          style={{ paddingLeft: `${depth * 12 + 12}px` }}
        >
          {expanded ? (
            <ChevronDown size={12} className="text-steel-500 shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-steel-500 shrink-0" />
          )}
          <Folder size={13} className="text-neon-amber/60 shrink-0" />
          <span className="text-xs font-mono text-steel-300 truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map((child, i) => (
          <TreeNode
            key={`${fullPath}/${child.name}-${i}`}
            node={child}
            depth={depth + 1}
            onFileSelect={onFileSelect}
            path={fullPath}
          />
        ))}
      </div>
    );
  }

  // File icon color based on extension
  const ext = node.name.split('.').pop();
  const colorMap = {
    js: 'text-neon-amber', jsx: 'text-neon-cyan', ts: 'text-blue-400',
    tsx: 'text-blue-400', css: 'text-neon-pink', html: 'text-orange-400',
    json: 'text-neon-green', py: 'text-blue-300', md: 'text-steel-300',
  };
  const iconColor = colorMap[ext] || 'text-steel-400';

  return (
    <button
      onClick={() => onFileSelect(fullPath)}
      className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/[0.03] transition-colors text-left active:bg-neon-green/5"
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
    >
      <File size={12} className={`${iconColor} shrink-0`} />
      <span className="text-xs font-mono text-steel-300 truncate">{node.name}</span>
    </button>
  );
}

export default function Sidebar({
  isOpen,
  onClose,
  tree,
  projectName,
  onOpenProject,
  onFileSelect,
  onNewChat,
  indexStats,
  isIndexing,
  onReindex,
  hasGit,
  fsSupported,
}) {
  const [activeTab, setActiveTab] = useState('files');

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-[280px] z-50 glass-panel border-r border-white/5
          transform transition-transform duration-300 ease-out safe-top
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Close button */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="font-display text-sm font-semibold tracking-wider text-neon-green/80">
            Workspace
          </span>
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded">
            <X size={16} className="text-steel-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 mx-2">
          {[
            { id: 'files', icon: FolderOpen, label: 'Files' },
            { id: 'chat', icon: MessageSquare, label: 'Chat' },
            { id: 'git', icon: GitBranch, label: 'Git' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono
                transition-colors border-b-2 -mb-[1px]
                ${activeTab === tab.id
                  ? 'text-neon-green border-neon-green/60'
                  : 'text-steel-500 border-transparent hover:text-steel-300'
                }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-20" style={{ height: 'calc(100% - 120px)' }}>
          {activeTab === 'files' && (
            <div>
              {!projectName ? (
                <div className="p-4 space-y-3">
                  <p className="text-xs text-steel-400 leading-relaxed">
                    Open a local project folder to enable AI-powered coding with full file access.
                  </p>
                  {fsSupported ? (
                    <button
                      onClick={onOpenProject}
                      className="btn-neon w-full flex items-center justify-center gap-2"
                    >
                      <FolderOpen size={14} />
                      Open Project
                    </button>
                  ) : (
                    <div className="text-xs text-neon-pink/80 bg-neon-pink/5 border border-neon-pink/20 rounded-lg p-3">
                      File System Access API not available. Requires Safari 26+ or desktop Chrome.
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {/* Project header */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <FolderOpen size={13} className="text-neon-amber" />
                      <span className="text-xs font-mono text-steel-200 font-medium">{projectName}</span>
                    </div>
                    <button
                      onClick={onReindex}
                      className={`p-1 hover:bg-white/5 rounded ${isIndexing ? 'animate-spin' : ''}`}
                      title="Re-index files"
                    >
                      <RefreshCw size={12} className="text-steel-500" />
                    </button>
                  </div>

                  {/* Index stats */}
                  {indexStats && (
                    <div className="px-4 py-1.5 flex items-center gap-2 border-b border-white/[0.03]">
                      <Database size={10} className="text-neon-green/50" />
                      <span className="text-[10px] font-mono text-steel-500">
                        {indexStats.total} files indexed
                      </span>
                    </div>
                  )}

                  {/* File tree */}
                  <div className="py-1">
                    {tree.map((node, i) => (
                      <TreeNode
                        key={`${node.name}-${i}`}
                        node={node}
                        onFileSelect={onFileSelect}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="p-4 space-y-3">
              <button
                onClick={onNewChat}
                className="btn-neon w-full flex items-center justify-center gap-2"
              >
                <Plus size={14} />
                New Session
              </button>
              <p className="text-[10px] text-steel-500 text-center">
                Chat history saved locally via IndexedDB
              </p>
            </div>
          )}

          {activeTab === 'git' && (
            <div className="p-4 space-y-3">
              {hasGit ? (
                <div className="flex items-center gap-2">
                  <div className="status-dot active" />
                  <span className="text-xs text-steel-300 font-mono">Git repo detected</span>
                </div>
              ) : (
                <div className="text-xs text-steel-400">
                  No git repository found. Open a project with a .git folder to enable git features.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
