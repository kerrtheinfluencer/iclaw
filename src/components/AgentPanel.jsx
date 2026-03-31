import React, { useState } from 'react';
import { X, Play, Square, Trash2, FileCode, Eye, Bot } from 'lucide-react';

export default function AgentPanel({ 
  onClose, 
  isRunning, 
  steps, 
  files,
  onRun,
  onStop,
  onClear,
  apiKey,
  activeModel,
  onPreviewFile
}) {
  const [task, setTask] = useState('');

  const handleRun = () => {
    if (!task.trim() || isRunning) return;
    onRun(task);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#0f0f16] border border-[#00ff88]/30 rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#333]">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-[#00ff88]" />
            <h2 className="text-lg font-bold text-[#e0e0e0]">Agent Mode</h2>
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

          <div className="space-y-2">
            <label className="text-sm text-[#888]">Task Description</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what you want the agent to build..."
              className="w-full h-24 bg-[#1a1a24] border border-[#333] rounded-lg p-3 text-sm text-[#e0e0e0] placeholder-[#666] focus:outline-none focus:border-[#00ff88] resize-none"
              disabled={isRunning}
            />
          </div>

          <div className="flex gap-2">
            {!isRunning ? (
              <button
                onClick={handleRun}
                disabled={!task.trim() || !apiKey}
                className="flex items-center gap-2 px-4 py-2 bg-[#00ff88] text-[#0a0a0f] rounded-lg font-medium hover:bg-[#00ff88]/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" />
                Run Agent
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

          {steps.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-[#888]">Progress</h3>
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <div key={step.id || i} className="flex items-start gap-3 p-3 bg-[#1a1a24] rounded-lg">
                    <div className={`w-2 h-2 mt-1.5 rounded-full ${
                      step.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                      step.status === 'done' ? 'bg-green-500' :
                      step.status === 'error' ? 'bg-red-500' : 'bg-[#666]'
                    }`} />
                    <div className="flex-1">
                      <div className="text-sm text-[#e0e0e0]">{step.label}</div>
                      {step.detail && (
                        <div className="text-xs text-[#666] mt-1">{step.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(files).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-[#888]">Generated Files</h3>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(files).map(([path, content]) => (
                  <div key={path} className="flex items-center justify-between p-3 bg-[#1a1a24] rounded-lg border border-[#333]">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-[#00ff88]" />
                      <span className="text-sm text-[#e0e0e0]">{path}</span>
                    </div>
                    <button
                      onClick={() => onPreviewFile?.(content, path)}
                      className="p-1.5 hover:bg-[#00ff88]/10 rounded text-[#00ff88]"
                      title="Preview"
                    >
                      <Eye className="w-4 h-4" />
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
