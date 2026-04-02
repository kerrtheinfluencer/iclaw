import React, { useState, useRef, useEffect } from 'react';
import {
  X, Play, Square, Trash2, ChevronDown, ChevronRight,
  FileText, Globe, Terminal, Check, AlertCircle, Loader2,
  Zap, FolderOpen, Eye, Bot, Archive,
} from 'lucide-react';

const STEP_ICONS = {
  plan:       { icon: Bot,       color: 'text-neon-cyan' },
  write_file: { icon: FileText,  color: 'text-neon-green' },
  read_file:  { icon: FileText,  color: 'text-steel-400' },
  list_files: { icon: FolderOpen,color: 'text-steel-400' },
  web_search: { icon: Globe,     color: 'text-blue-400' },
  run_code:   { icon: Terminal,  color: 'text-neon-amber' },
  finish:     { icon: Check,     color: 'text-neon-green' },
  error:      { icon: AlertCircle, color: 'text-neon-pink' },
};

const STATUS_ICONS = {
  running: <Loader2 size={11} className="text-neon-cyan animate-spin" />,
  done:    <Check size={11} className="text-neon-green" />,
  error:   <AlertCircle size={11} className="text-neon-pink" />,
  warn:    <AlertCircle size={11} className="text-neon-amber" />,
};

function AgentStep({ step, index }) {
  const [expanded, setExpanded] = useState(false);
  const meta = STEP_ICONS[step.type] || STEP_ICONS.plan;
  const Icon = meta.icon;
  const hasDetail = step.detail || step.thought;

  return (
    <div className={`rounded-lg border overflow-hidden transition-all ${
      step.status === 'running' ? 'border-neon-cyan/30 bg-neon-cyan/[0.03]' :
      step.status === 'error'   ? 'border-neon-pink/20 bg-neon-pink/[0.02]' :
      step.status === 'warn'    ? 'border-neon-amber/20 bg-neon-amber/[0.02]' :
                                  'border-white/[0.05] bg-white/[0.01]'
    }`}>
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${hasDetail ? 'hover:bg-white/[0.02]' : ''}`}
      >
        <span className="text-[10px] font-mono text-steel-600 w-4 shrink-0">{index + 1}</span>
        <Icon size={13} className={`shrink-0 ${meta.color}`} />
        <span className="flex-1 text-xs font-mono text-steel-200 truncate">{step.label}</span>
        <span className="shrink-0">{STATUS_ICONS[step.status] || null}</span>
        {hasDetail && (
          expanded
            ? <ChevronDown size={11} className="text-steel-600 shrink-0" />
            : <ChevronRight size={11} className="text-steel-600 shrink-0" />
        )}
      </button>

      {expanded && hasDetail && (
        <div className="px-3 pb-2 border-t border-white/[0.04] space-y-1.5 pt-2">
          {step.thought && (
            <p className="text-[10px] text-steel-500 italic leading-relaxed">
              💭 {step.thought}
            </p>
          )}
          {step.detail && (
            <pre className="text-[10px] font-mono text-steel-400 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
              {step.detail}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// Zip download using JSZip via CDN
async function downloadFilesAsZip(files) {
  // Dynamically load JSZip
  if (!window.JSZip) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const zip = new window.JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `iclaw-agent-${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AgentPanel({
  isOpen, onClose,
  isRunning, steps, files,
  onRun, onStop, onClear,
  apiKey, activeModel,
  onPreviewFile,
}) {
  const [task, setTask] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const stepsEndRef = useRef(null);

  useEffect(() => {
    if (stepsEndRef.current) {
      stepsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [steps]);

  const handleRun = () => {
    if (!task.trim() || isRunning) return;
    onRun(task.trim());
    setTask('');
  };

  const fileList = Object.keys(files);
  const doneSteps = steps.filter(s => s.status === 'done').length;
  const hasError = steps.some(s => s.status === 'error');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void-950 safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 glass-panel shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-neon-amber" />
          <h2 className="font-display text-sm font-semibold tracking-wider text-steel-100">Agent Mode</h2>
          {isRunning && (
            <span className="text-[9px] font-mono text-neon-cyan bg-neon-cyan/10 px-1.5 py-0.5 rounded-full animate-pulse">
              RUNNING
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {steps.length > 0 && !isRunning && (
            <button onClick={onClear} className="p-1.5 rounded hover:bg-white/5 active:scale-90" title="Clear">
              <Trash2 size={14} className="text-steel-500" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            <X size={16} className="text-steel-400" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Task input */}
        {!isRunning && steps.length === 0 && (
          <div className="px-4 py-4 space-y-3 shrink-0">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-steel-500 uppercase tracking-wider">Task</label>
              <textarea
                value={task}
                onChange={e => setTask(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleRun(); }}
                placeholder="e.g. Build a Pomodoro timer app with dark theme and sound alerts"
                rows={4}
                className="w-full input-stealth text-sm py-2.5 resize-none rounded-xl"
              />
            </div>

            {!apiKey && (
              <div className="px-3 py-2 rounded-lg bg-neon-amber/5 border border-neon-amber/15">
                <p className="text-[10px] text-neon-amber/80 font-mono">
                  ⚠ Gemini API key required. Set it in Settings first.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {[
                'Build a todo app with localStorage',
                'Create a CSS animation showcase',
                'Build a calculator with history',
                'Make a weather dashboard UI',
              ].map(t => (
                <button key={t} onClick={() => setTask(t)}
                  className="text-[10px] font-mono text-steel-500 bg-white/[0.02] border border-white/[0.05] rounded-lg px-2.5 py-2 hover:border-neon-green/20 hover:text-steel-300 transition-all text-left leading-tight active:scale-95">
                  {t}
                </button>
              ))}
            </div>

            <button
              onClick={handleRun}
              disabled={!task.trim() || !apiKey}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-30
                bg-neon-green/10 border border-neon-green/25 text-neon-green hover:bg-neon-green/15"
            >
              <Play size={14} />
              Run Agent
            </button>
          </div>
        )}

        {/* Steps */}
        {steps.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
            {/* Progress bar */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-1 bg-void-300 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    hasError ? 'bg-neon-pink' : 'bg-gradient-to-r from-neon-green to-neon-cyan'
                  }`}
                  style={{ width: `${Math.min((doneSteps / Math.max(steps.length, 1)) * 100, 100)}%` }}
                />
              </div>
              <span className="text-[9px] font-mono text-steel-500 shrink-0">{doneSteps}/{steps.length}</span>
            </div>

            {steps.map((step, i) => (
              <AgentStep key={step.id} step={step} index={i} />
            ))}
            <div ref={stepsEndRef} />
          </div>
        )}

        {/* Files written */}
        {fileList.length > 0 && (
          <div className="shrink-0 border-t border-white/5 px-4 py-3 space-y-2">
            <span className="text-[10px] font-mono text-steel-500 uppercase tracking-wider">
              Files Written ({fileList.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {fileList.map(path => (
                <button
                  key={path}
                  onClick={() => {
                    setSelectedFile(selectedFile === path ? null : path);
                    if (path.endsWith('.html') && onPreviewFile) {
                      onPreviewFile(files[path], path);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono transition-all active:scale-95 ${
                    selectedFile === path
                      ? 'bg-neon-green/10 border border-neon-green/25 text-neon-green'
                      : 'bg-white/[0.03] border border-white/[0.06] text-steel-300 hover:border-neon-green/20'
                  }`}
                >
                  <FileText size={10} />
                  {path.split('/').pop()}
                  {path.endsWith('.html') && <Eye size={9} className="text-neon-green/60" />}
                </button>
              ))}
            </div>
            {fileList.length > 0 && (
              <button
                onClick={() => downloadFilesAsZip(files)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-mono border border-neon-cyan/20 text-neon-cyan/80 bg-neon-cyan/5 hover:bg-neon-cyan/10 active:scale-[0.98] transition-all mt-1"
              >
                <Archive size={12} />
                Download all as .zip
              </button>
            )}
          </div>
        )}

        {/* Bottom actions */}
        <div className="shrink-0 border-t border-white/5 px-4 py-3 flex gap-2">
          {isRunning ? (
            <button onClick={onStop}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-sm border border-neon-pink/25 text-neon-pink bg-neon-pink/5 hover:bg-neon-pink/10 active:scale-[0.98] transition-all">
              <Square size={13} />
              Stop Agent
            </button>
          ) : steps.length > 0 ? (
            <>
              <button onClick={onClear}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-mono text-sm border border-white/[0.06] text-steel-400 bg-white/[0.02] hover:bg-white/[0.04] active:scale-[0.98] transition-all">
                <Trash2 size={13} />
                Clear
              </button>
              <button
                onClick={() => { onClear(); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-sm border border-neon-green/25 text-neon-green bg-neon-green/5 hover:bg-neon-green/10 active:scale-[0.98] transition-all">
                <Play size={13} />
                New Task
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
