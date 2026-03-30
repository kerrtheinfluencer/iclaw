import React, { useState, useRef, useEffect } from 'react';
import {
  X, Play, Square, Trash2, ChevronDown, ChevronRight,
  FileText, Globe, Terminal, Check, AlertCircle, Loader2,
  Users, Eye, Archive, Bot, Code2, Search, Sparkles,
} from 'lucide-react';

const AGENT_META = {
  planner:  { label: 'Planner',  color: 'text-blue-400',     border: 'border-blue-400/30',     bg: 'bg-blue-400/[0.04]',     icon: Search,   desc: 'Researches & writes spec' },
  coder:    { label: 'Coder',    color: 'text-neon-green',   border: 'border-neon-green/30',   bg: 'bg-neon-green/[0.04]',   icon: Code2,    desc: 'Implements all files' },
  reviewer: { label: 'Reviewer', color: 'text-neon-amber',   border: 'border-neon-amber/30',   bg: 'bg-neon-amber/[0.04]',   icon: Sparkles, desc: 'Audits & fixes code' },
};

const STEP_ICONS = {
  think:      Bot,
  search:     Globe,
  plan:       Bot,
  write_file: FileText,
  check:      Check,
  finish:     Check,
  error:      AlertCircle,
};

const STATUS_ICONS = {
  running: <Loader2 size={11} className="text-neon-cyan animate-spin shrink-0" />,
  done:    <Check size={11} className="text-neon-green shrink-0" />,
  error:   <AlertCircle size={11} className="text-neon-pink shrink-0" />,
  warn:    <AlertCircle size={11} className="text-neon-amber shrink-0" />,
};

async function downloadFilesAsZip(files) {
  if (!window.JSZip) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const zip = new window.JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `iclaw-multiagent-${Date.now()}.zip`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function AgentLane({ name, agent, isActive }) {
  const meta = AGENT_META[name];
  const Icon = meta.icon;
  const [expanded, setExpanded] = useState(false);

  const statusColor =
    agent.status === 'running' ? 'text-neon-cyan' :
    agent.status === 'done'    ? meta.color :
    agent.status === 'error'   ? 'text-neon-pink' :
    'text-steel-600';

  const statusDot =
    agent.status === 'running' ? 'bg-neon-cyan animate-pulse' :
    agent.status === 'done'    ? 'bg-neon-green' :
    agent.status === 'error'   ? 'bg-neon-pink' :
    'bg-steel-700';

  return (
    <div className={`rounded-xl border overflow-hidden transition-all duration-300 ${
      isActive ? `${meta.border} ${meta.bg}` :
      agent.status === 'done' ? 'border-white/[0.08]' :
      'border-white/[0.04]'
    }`}>
      {/* Lane header */}
      <button
        onClick={() => agent.steps.length > 0 && setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
          isActive ? meta.bg + ' border ' + meta.border : 'bg-white/[0.03] border border-white/[0.06]'
        }`}>
          <Icon size={14} className={isActive ? meta.color : 'text-steel-500'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-medium ${isActive ? meta.color : 'text-steel-300'}`}>
              {meta.label}
            </span>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
          </div>
          <p className="text-[9px] text-steel-600 font-mono">{meta.desc}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {agent.status === 'running' && <Loader2 size={12} className="text-neon-cyan animate-spin" />}
          {agent.status === 'done' && <span className="text-[9px] font-mono text-neon-green">{agent.steps.length} steps</span>}
          {agent.steps.length > 0 && (
            expanded
              ? <ChevronDown size={11} className="text-steel-600" />
              : <ChevronRight size={11} className="text-steel-600" />
          )}
        </div>
      </button>

      {/* Steps */}
      {expanded && agent.steps.length > 0 && (
        <div className="border-t border-white/[0.04] px-3 py-2 space-y-1.5">
          {agent.steps.map((step, i) => {
            const StepIcon = STEP_ICONS[step.type] || Bot;
            const [stepExpanded, setStepExpanded] = useState(false);
            return (
              <div key={step.id}>
                <button
                  onClick={() => step.detail && setStepExpanded(!stepExpanded)}
                  className="w-full flex items-center gap-2 py-1 text-left hover:bg-white/[0.02] rounded px-1"
                >
                  <span className="text-[9px] font-mono text-steel-700 w-3">{i+1}</span>
                  <StepIcon size={11} className={meta.color + '/70'} />
                  <span className="flex-1 text-[11px] font-mono text-steel-300 truncate">{step.label}</span>
                  {STATUS_ICONS[step.status]}
                </button>
                {stepExpanded && step.detail && (
                  <pre className="text-[10px] font-mono text-steel-500 whitespace-pre-wrap pl-6 pb-1 max-h-32 overflow-y-auto leading-relaxed">
                    {step.detail}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const EXAMPLE_TASKS = [
  'Build a full Kanban board with drag & drop',
  'Create a markdown editor with live preview',
  'Build a budget tracker with charts',
  'Make a multiplayer tic-tac-toe game',
];

export default function MultiAgentPanel({
  isOpen, onClose,
  isRunning, agents, files, activeAgent,
  onRun, onStop, onClear,
  apiKey, onPreviewFile,
}) {
  const [task, setTask] = useState('');
  const fileList = Object.keys(files);
  const allDone = agents.planner.status === 'done' &&
                  agents.coder.status === 'done' &&
                  agents.reviewer.status === 'done';
  const hasStarted = Object.values(agents).some(a => a.status !== 'idle');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void-950 safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 glass-panel shrink-0">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-neon-purple/80" />
          <h2 className="font-display text-sm font-semibold tracking-wider text-steel-100">Multi-Agent</h2>
          {isRunning && (
            <span className="text-[9px] font-mono text-neon-cyan bg-neon-cyan/10 px-1.5 py-0.5 rounded-full animate-pulse">
              {activeAgent ? activeAgent.toUpperCase() : 'RUNNING'}
            </span>
          )}
          {allDone && (
            <span className="text-[9px] font-mono text-neon-green bg-neon-green/10 px-1.5 py-0.5 rounded-full">
              COMPLETE
            </span>
          )}
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
        {/* Task input — show when idle */}
        {!hasStarted && (
          <div className="px-4 py-4 space-y-4">
            {/* How it works */}
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(AGENT_META).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <div key={key} className={`rounded-xl border ${meta.border} ${meta.bg} p-2.5 text-center`}>
                    <Icon size={16} className={`${meta.color} mx-auto mb-1`} />
                    <p className={`text-[10px] font-mono font-medium ${meta.color}`}>{meta.label}</p>
                    <p className="text-[9px] text-steel-600 mt-0.5 leading-tight">{meta.desc}</p>
                  </div>
                );
              })}
            </div>

            {!apiKey && (
              <div className="px-3 py-2 rounded-lg bg-neon-amber/5 border border-neon-amber/15">
                <p className="text-[10px] text-neon-amber/80 font-mono">Gemini API key required — set in Settings.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-steel-500 uppercase tracking-wider">Task for the team</label>
              <textarea
                value={task}
                onChange={e => setTask(e.target.value)}
                placeholder="Describe what you want built — be as detailed as you like..."
                rows={4}
                className="w-full input-stealth text-sm py-2.5 resize-none rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {EXAMPLE_TASKS.map(t => (
                <button key={t} onClick={() => setTask(t)}
                  className="text-[10px] font-mono text-steel-500 bg-white/[0.02] border border-white/[0.05] rounded-lg px-2.5 py-2 hover:border-neon-green/20 hover:text-steel-300 transition-all text-left leading-tight active:scale-95">
                  {t}
                </button>
              ))}
            </div>

            <button
              onClick={() => { if (task.trim() && apiKey) { onRun(task.trim()); setTask(''); } }}
              disabled={!task.trim() || !apiKey}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-30 bg-neon-green/10 border border-neon-green/25 text-neon-green hover:bg-neon-green/15"
            >
              <Users size={14} />
              Deploy Team
            </button>
          </div>
        )}

        {/* Agent lanes */}
        {hasStarted && (
          <div className="px-4 py-3 space-y-3">
            {/* Overall progress */}
            <div className="flex items-center gap-3 px-1">
              {Object.entries(AGENT_META).map(([key, meta], i) => (
                <React.Fragment key={key}>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-mono font-bold
                      ${agents[key].status === 'done' ? 'bg-neon-green/20 text-neon-green border border-neon-green/30' :
                        agents[key].status === 'running' ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 animate-pulse' :
                        'bg-white/[0.04] text-steel-600 border border-white/[0.06]'}`}>
                      {i+1}
                    </div>
                    <span className={`text-[10px] font-mono ${
                      agents[key].status === 'done' ? 'text-neon-green' :
                      agents[key].status === 'running' ? meta.color : 'text-steel-600'
                    }`}>{meta.label}</span>
                  </div>
                  {i < 2 && <div className={`flex-1 h-px ${agents[key].status === 'done' ? 'bg-neon-green/30' : 'bg-white/[0.06]'}`} />}
                </React.Fragment>
              ))}
            </div>

            {Object.entries(AGENT_META).map(([key]) => (
              <AgentLane
                key={key}
                name={key}
                agent={agents[key]}
                isActive={activeAgent === key}
              />
            ))}
          </div>
        )}

        {/* Files */}
        {fileList.length > 0 && (
          <div className="px-4 pb-3 space-y-2">
            <span className="text-[10px] font-mono text-steel-500 uppercase tracking-wider">
              Output Files ({fileList.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {fileList.map(path => (
                <button key={path}
                  onClick={() => path.endsWith('.html') && onPreviewFile?.(files[path], path)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-mono bg-white/[0.03] border border-white/[0.06] text-steel-300 hover:border-neon-green/20 transition-all active:scale-95"
                >
                  <FileText size={10} />
                  {path.split('/').pop()}
                  {path.endsWith('.html') && <Eye size={9} className="text-neon-green/60" />}
                </button>
              ))}
            </div>
            <button
              onClick={() => downloadFilesAsZip(files)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-mono border border-neon-cyan/20 text-neon-cyan/80 bg-neon-cyan/5 hover:bg-neon-cyan/10 active:scale-[0.98] transition-all"
            >
              <Archive size={12} />
              Download all as .zip
            </button>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 border-t border-white/5 px-4 py-3 flex gap-2">
        {isRunning ? (
          <button onClick={onStop}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-sm border border-neon-pink/25 text-neon-pink bg-neon-pink/5 hover:bg-neon-pink/10 active:scale-[0.98] transition-all">
            <Square size={13} />
            Stop Team
          </button>
        ) : hasStarted ? (
          <button onClick={onClear}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-sm border border-white/[0.06] text-steel-400 bg-white/[0.02] hover:bg-white/[0.04] active:scale-[0.98] transition-all">
            <Trash2 size={13} />
            New Task
          </button>
        ) : null}
      </div>
    </div>
  );
}
