import React, { useState, useEffect } from 'react';
import { X, Play, Square, Trash2, FileCode, Eye, Users, Bot, Code, CheckCircle, ExternalLink } from 'lucide-react';

const AGENT_ICONS = {
  planner: Bot,
  coder: Code,
  reviewer: CheckCircle
};

const AGENT_COLORS = {
  planner: 'text-blue-400',
  coder: 'text-[#00ff88]',
  reviewer: 'text-purple-400'
};

export default function MultiAgentPanel({ 
  onClose, 
  isRunning, 
  agents,
  files,
  activeAgent,
  onRun,
  onStop,
  onClear,
  apiKey,
  onPreviewFile
}) {
  const [task, setTask] = useState('');
  const [autoPreview, setAutoPreview] = useState(true);

  // Auto-preview HTML files
  useEffect(() => {
    if (!autoPreview || !onPreviewFile) return;
    
    const htmlFiles = Object.entries(files).filter(([path]) => path.endsWith('.html'));
    if (htmlFiles.length > 0) {
      // Preview the last generated HTML file
      const [path, content] = htmlFiles[htmlFiles.length - 1];
      onPreviewFile(content, path);
    }
  }, [files, autoPreview, onPreviewFile]);

  const handleRun = () => {
    if (!task.trim() || isRunning) return;
    onRun(task);
  };

  const getFileIcon = (filename) => {
    if (filename.endsWith('.html')) return '🌐';
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return '⚡';
    if (filename.endsWith('.css')) return '🎨';
    return '📄';
  };

  const allSteps = Object.entries(agents).flatMap(([name, agent]) => 
    (agent.steps || []).map(step => ({ ...step, agentName: name }))
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[90vh] bg-[#0f0f16] border border-[#00ff88]/30 rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#00ff88]" />
            <h2 className="text-lg font-bold text-[#e0e0e0]">Multi-Agent Mode</h2>
            <span className="text-xs text-[#666] bg-[#1a1a24] px-2 py-0.5 rounded">Planner → Coder → Reviewer</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[#333] rounded">
            <X className="w-5 h-5 text-[#666]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!apiKey && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
              ⚠️ No API key configured. Please set up an API key in Settings first.
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {Object.entries(agents).map(([name, agent]) => {
              const Icon = AGENT_ICONS[name];
              return (
                <div 
                  key={name} 
                  className={`p-3 rounded-lg border ${
                    activeAgent === name ? 'border-[#00ff88] bg-[#00ff88]/10' : 
                    agent.status === 'done' ? 'border-green-500/30 bg-green-500/10' :
                    agent.status === 'error' ? 'border-red-500/30 bg-red-500/10' :
                    'border-[#333] bg-[#1a1a24]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${AGENT_COLORS[name]}`} />
                    <span className="text-sm font-medium text-[#e0e0e0] capitalize">{name}</span>
                  </div>
                  <div className="text-xs text-[#666] mt-1 capitalize">{agent.status}</div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <label className="text-sm text-[#888]">Describe your project</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="e.g., Build a complete task management app with local storage, dark mode, and animations..."
              className="w-full h-24 bg-[#1a1a24] border border-[#333] rounded-lg p-3 text-sm text-[#e0e0e0] placeholder-[#666] focus:outline-none focus:border-[#00ff88] resize-none"
              disabled={isRunning}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {!isRunning ? (
                <button
                  onClick={handleRun}
                  disabled={!task.trim() || !apiKey}
                  className="flex items-center gap-2 px-4 py-2 bg-[#00ff88] text-[#0a0a0f] rounded-lg font-medium hover:bg-[#00ff88]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4" />
                  Run Multi-Agent
                </button>
              ) : (
                <button
                  onClick={onStop}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg font-medium hover:bg-red-500/30"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              )}
              <button
                onClick={onClear}
                className="flex items-center gap-2 px-4 py-2 bg-[#1a1a24] text-[#666] border border-[#333] rounded-lg hover:bg-[#222]"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            </div>
            
            <label className="flex items-center gap-2 text-sm text-[#888] cursor-pointer">
              <input
                type="checkbox"
                checked={autoPreview}
                onChange={(e) => setAutoPreview(e.target.checked)}
                className="w-4 h-4 rounded border-[#333] bg-[#1a1a24] text-[#00ff88] focus:ring-[#00ff88]"
              />
              Auto-preview HTML
            </label>
          </div>

          {allSteps.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-[#888]">Activity Log</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {allSteps.map((step, i) => {
                  const Icon = AGENT_ICONS[step.agentName];
                  return (
                    <div key={step.id || i} className="flex items-start gap-3 p-3 bg-[#1a1a24] rounded-lg border border-[#333]">
                      <Icon className={`w-4 h-4 mt-0.5 ${AGENT_COLORS[step.agentName]}`} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#666] capitalize font-medium">{step.agentName}</span>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            step.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                            step.status === 'done' ? 'bg-green-500' :
                            step.status === 'error' ? 'bg-red-500' : 'bg-[#666]'
                          }`} />
                        </div>
                        <div className="text-sm text-[#e0e0e0] mt-0.5">{step.label}</div>
                        {step.detail && (
                          <div className="text-xs text-[#666] mt-1 line-clamp-1">{step.detail}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {Object.keys(files).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-[#888]">Generated Files</h3>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(files).map(([path, content]) => (
                  <div key={path} className="flex items-center justify-between p-3 bg-[#1a1a24] rounded-lg border border-[#333] hover:border-[#00ff88]/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getFileIcon(path)}</span>
                      <div>
                        <span className="text-sm text-[#e0e0e0] font-mono">{path}</span>
                        {path.endsWith('.html') && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-[#00ff88]/20 text-[#00ff88] rounded">Preview Ready</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onPreviewFile?.(content, path)}
                      className="p-1.5 hover:bg-[#00ff88]/10 rounded text-[#00ff88]"
                      title="Preview"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
