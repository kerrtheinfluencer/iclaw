import React, { useState, useRef, useEffect } from 'react';
import {
  X, Play, Square, Trash2, ChevronDown, ChevronRight,
  FileText, Globe, Terminal, Check, AlertCircle, Loader2,
  Zap, FolderOpen, Eye, Bot, Archive, Code2, RefreshCw,
} from 'lucide-react';

const STEP_ICONS = {
  plan:       { icon: Bot,        color: 'text-neon-cyan' },
  think:      { icon: Bot,        color: 'text-neon-cyan' },
  write_file: { icon: FileText,   color: 'text-neon-green' },
  read_file:  { icon: FileText,   color: 'text-steel-400' },
  list_files: { icon: FolderOpen, color: 'text-steel-400' },
  web_search: { icon: Globe,      color: 'text-blue-400' },
  run_code:   { icon: Terminal,   color: 'text-neon-amber' },
  finish:     { icon: Check,      color: 'text-neon-green' },
  error:      { icon: AlertCircle,color: 'text-neon-pink' },
  retrying:   { icon: RefreshCw,  color: 'text-neon-amber' },
};

function AgentStep({ step, index }) {
  const [expanded, setExpanded] = useState(step.status === 'running');
  const meta = STEP_ICONS[step.type] || STEP_ICONS.plan;
  const Icon = meta.icon;
  const hasDetail = step.detail || step.thought;

  // Auto-expand running steps
  useEffect(() => {
    if (step.status === 'running') setExpanded(true);
  }, [step.status]);

  return (
    <div className={`rounded-lg border overflow-hidden transition-all ${
      step.status === 'running'  ? 'border-neon-cyan/30 bg-neon-cyan/[0.03]' :
      step.status === 'error'    ? 'border-neon-pink/20 bg-neon-pink/[0.02]' :
      step.status === 'warn'     ? 'border-neon-amber/20 bg-neon-amber/[0.02]' :
      step.status === 'retrying' ? 'border-neon-amber/20 bg-neon-amber/[0.02]' :
                                   'border-white/[0.05] bg-white/[0.01]'
    }`}>
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${hasDetail ? 'hover:bg-white/[0.02]' : ''}`}
      >
        <span className="text-[10px] font-mono text-steel-600 w-4 shrink-0">{index + 1}</span>
        <Icon size={13} className={`shrink-0 ${meta.color} ${step.status === 'running' ? 'animate-pulse' : ''}`} />
        <span className="flex-1 text-xs font-mono text-steel-200 truncate">{step.label}</span>
        {step.status === 'running'  && <Loader2 size={11} className="text-neon-cyan animate-spin shrink-0" />}
        {step.status === 'retrying' && <RefreshCw size={11} className="text-neon-amber animate-spin shrink-0" />}
        {step.status === 'done'     && <Check size={11} className="text-neon-green shrink-0" />}
        {step.status === 'error'    && <AlertCircle size={11} className="text-neon-pink shrink-0" />}
        {hasDetail && (expanded
          ? <ChevronDown size={11} className="text-steel-600 shrink-0" />
          : <ChevronRight size={11} className="text-steel-600 shrink-0" />
        )}
      </button>
      {expanded && hasDetail && (
        <div className="px-3 pb-2 border-t border-white/[0.04]">
          <pre className="text-[11px] font-mono text-steel-400 whitespace-pre-wrap pt-2 leading-relaxed max-h-40 overflow-y-auto">
            {step.detail || step.thought}
          </pre>
        </div>
      )}
    </div>
  );
}

// Live streaming code window
function LiveCodeWindow({ streamText, isActive }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (isActive) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamText, isActive]);

  if (!streamText && !isActive) return null;

  return (
    <div className="rounded-xl border border-neon-green/20 bg-[#0a0f0a] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neon-green/10 bg-neon-green/[0.03]">
        <Code2 size={11} className="text-neon-green" />
        <span className="text-[10px] font-mono text-neon-green/80">Live Output</span>
        {isActive && <span className="ml-auto flex items-center gap-1 text-[9px] font-mono text-neon-cyan/70"><span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />generating...</span>}
      </div>
      <div className="p-3 max-h-64 overflow-y-auto">
        <pre className="text-[11px] font-mono text-neon-green/80 whitespace-pre-wrap leading-relaxed break-all">
          {streamText || ' '}
        </pre>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

async function downloadFilesAsZip(files) {
  if (!window.JSZip) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const zip = new window.JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `iclaw-agent-${Date.now()}.zip`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

const EXAMPLE_TASKS = [
  'Build a todo app with localStorage',
  'Create a CSS animation showcase',
  'Build a calculator with history',
  'Make a weather dashboard UI',
];

export default function AgentPanel({
  isOpen, onClose,
  isRunning, steps, files,
  onRun, onStop, onClear,
  apiKey, activeEngine, activeModel,
  onPreviewFile, streamText,
}) {
  const [task, setTask] = useState('');
  const stepsEndRef = useRef(null);
  const fileList = Object.keys(files || {});
  const hasStarted = isRunning || steps.length > 0;

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  if (!isOpen) return null;

  const isWasm = activeEngine === 'wasm';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void-950 safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 glass-panel shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-neon-amber/80" />
          <h2 className="font-display text-sm font-semibold tracking-wider text-steel-100">Agent Mode</h2>
          {isRunning && <span className="text-[9px] font-mono text-neon-cyan bg-neon-cyan/10 px-1.5 py-0.5 rounded-full animate-pulse">RUNNING</span>}
          {isWasm && <span className="text-[9px] font-mono text-neon-green bg-neon-green/10 px-1.5 py-0.5 rounded-full">⚡ LOCAL</span>}
        </div>
        <div className="flex items-center gap-1">
          {hasStarted && !isRunning && (
            <button onClick={onClear} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
              <Trash2 size={14} className="text-steel-500" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            <X size={16} className="text-steel-400" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Task input */}
        {!hasStarted && (
          <div className="px-4 py-4 space-y-3">
            {isWasm ? (
              <div className="px-3 py-2 rounded-lg bg-neon-green/5 border border-neon-green/15">
                <p className="text-[10px] text-neon-green/80 font-mono">⚡ Offline mode — using local model. Will stream output live.</p>
              </div>
            ) : !apiKey ? (
              <div className="px-3 py-2 rounded-lg bg-neon-amber/5 border border-neon-amber/15">
                <p className="text-[10px] text-neon-amber/80 font-mono">⚠ API key required. Set in Settings, or switch to Local WASM.</p>
              </div>
            ) : null}

            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="e.g. Build a Pomodoro timer app with dark theme and sound alerts"
              rows={4}
              className="w-full input-stealth text-sm py-2.5 resize-none rounded-xl"
            />

            <div className="grid grid-cols-2 gap-2">
              {EXAMPLE_TASKS.map(t => (
                <button key={t} onClick={() => setTask(t)}
                  className="text-[10px] font-mono text-steel-500 bg-white/[0.02] border border-white/[0.05] rounded-lg px-2.5 py-2 hover:border-neon-amber/20 hover:text-steel-300 transition-all text-left leading-tight active:scale-95">
                  {t}
                </button>
              ))}
            </div>

            <button
              onClick={() => { if (task.trim() && (apiKey || isWasm)) { onRun(task.trim()); setTask(''); } }}
              disabled={!task.trim() || (!apiKey && !isWasm)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-30 bg-neon-amber/10 border border-neon-amber/25 text-neon-amber hover:bg-neon-amber/15"
            >
              <Play size={14} />
              Run Agent
            </button>
          </div>
        )}

        {/* Steps */}
        {hasStarted && (
          <div className="px-4 py-3 space-y-2">
            {/* Progress bar */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-1 bg-void-300 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-neon-amber to-neon-green rounded-full transition-all duration-500"
                  style={{ width: steps.length > 0 ? Math.min((steps.filter(s => s.status === 'done').length / Math.max(steps.length, 1)) * 100, 95) + '%' : '0%' }} />
              </div>
              <span className="text-[9px] font-mono text-steel-500">{steps.filter(s => s.status === 'done').length}/{steps.length}</span>
            </div>

            {steps.map((step, i) => <AgentStep key={step.id || i} step={step} index={i} />)}
            <div ref={stepsEndRef} />

            {/* Live code stream window */}
            <LiveCodeWindow streamText={streamText} isActive={isRunning} />

            {/* Files written */}
            {fileList.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-mono text-steel-500 uppercase tracking-wider">Files Written ({fileList.length})</span>
                <div className="flex flex-wrap gap-1.5">
                  {fileList.map(path => (
                    <button key={path}
                      onClick={() => path.endsWith('.html') && onPreviewFile?.(files[path], path)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono bg-white/[0.03] border border-white/[0.06] text-steel-300 hover:border-neon-green/20 transition-all active:scale-95">
                      <FileText size={10} />
                      {path.split('/').pop()}
                      {path.endsWith('.html') && <Eye size={9} className="text-neon-green/60" />}
                    </button>
                  ))}
                </div>
                <button onClick={() => downloadFilesAsZip(files)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-mono border border-neon-cyan/20 text-neon-cyan/80 bg-neon-cyan/5 hover:bg-neon-cyan/10 active:scale-[0.98] transition-all">
                  <Archive size={12} />
                  Download all as .zip
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 border-t border-white/5 px-4 py-3 flex gap-2">
        {isRunning ? (
          <button onClick={onStop}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-sm border border-neon-pink/25 text-neon-pink bg-neon-pink/5 hover:bg-neon-pink/10 active:scale-[0.98] transition-all">
            <Square size={13} />
            Stop Agent
          </button>
        ) : hasStarted ? (
          <button onClick={onClear}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-sm border border-white/[0.06] text-steel-400 bg-white/[0.02] active:scale-[0.98] transition-all">
            <Trash2 size={13} />
            New Task
          </button>
        ) : null}
      </div>
    </div>
  );
}
