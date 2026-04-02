import React, { useState } from 'react';
import { Bot, User, Zap, Cpu, Cloud, Brain, ChevronDown, ChevronRight } from 'lucide-react';
import CodeBlock from './CodeBlock.jsx';
import { parseResponse } from '../utils/codeParser.js';

const engineIcons = {
  gemini: Cloud,
  groq: Zap,
  openrouter: Cloud,
  wasm: Cpu,
};

function ThinkingBlock({ content, isStreaming }) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split('\n');
  const preview = lines.slice(0, 2).join('\n');
  const hasMore = lines.length > 2;

  return (
    <div className={`my-2 rounded-lg border overflow-hidden transition-colors ${
      isStreaming
        ? 'border-neon-purple/40 bg-neon-purple/[0.05] animate-pulse-slow'
        : 'border-neon-purple/20 bg-neon-purple/[0.03]'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-neon-purple/[0.04] transition-colors active:scale-[0.99]"
      >
        <Brain size={13} className={`shrink-0 ${isStreaming ? 'text-neon-purple animate-pulse' : 'text-neon-purple/70'}`} />
        <span className="text-[10px] font-mono text-neon-purple/70 uppercase tracking-wider">
          {isStreaming ? 'Thinking…' : 'Thought process'}
        </span>
        <span className="text-[9px] font-mono text-steel-600 ml-auto">
          {lines.length} lines
        </span>
        {!isStreaming && (
          expanded
            ? <ChevronDown size={12} className="text-neon-purple/40 shrink-0" />
            : <ChevronRight size={12} className="text-neon-purple/40 shrink-0" />
        )}
      </button>

      {/* Always show preview while streaming */}
      {(isStreaming || !expanded) && (
        <div className="px-3 pb-2">
          <p className="text-[11px] text-steel-500 leading-relaxed whitespace-pre-wrap line-clamp-3 italic">
            {preview}{hasMore ? '…' : ''}
          </p>
        </div>
      )}

      {/* Full content when expanded (not streaming) */}
      {!isStreaming && expanded && (
        <div className="px-3 pb-3 border-t border-neon-purple/10">
          <p className="text-[11px] text-steel-400 leading-relaxed whitespace-pre-wrap pt-2 font-mono">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}

// Parse content that may be mid-stream (partial <think> blocks)
function parseWithStreaming(content) {
  const segments = [];
  let remaining = content;

  while (remaining.length > 0) {
    const thinkStart = remaining.indexOf('<think>');
    if (thinkStart === -1) {
      // No more think blocks
      if (remaining.trim()) segments.push({ type: 'text', content: remaining });
      break;
    }

    // Text before <think>
    if (thinkStart > 0) {
      const before = remaining.slice(0, thinkStart);
      if (before.trim()) segments.push({ type: 'text', content: before });
    }

    const thinkEnd = remaining.indexOf('</think>', thinkStart);
    if (thinkEnd === -1) {
      // Unclosed <think> — still streaming
      const thinkContent = remaining.slice(thinkStart + 7);
      segments.push({ type: 'thinking', content: thinkContent, isStreaming: true });
      break;
    }

    // Closed <think>
    const thinkContent = remaining.slice(thinkStart + 7, thinkEnd);
    segments.push({ type: 'thinking', content: thinkContent, isStreaming: false });
    remaining = remaining.slice(thinkEnd + 8);
  }

  return segments;
}

export default function ChatMessage({ message, onInject, onPreview, projectOpen }) {
  const isUser = message.role === 'user';
  const isStreaming = message.isStreaming === true;

  // Use streaming-aware parser for assistant messages
  const segments = isUser ? null : (
    isStreaming ? parseWithStreaming(message.content) : parseResponse(message.content)
  );

  const EngineIcon = message.stats?.engine ? engineIcons[message.stats.engine] : null;

  return (
    <div className={`animate-slide-up ${isUser ? 'flex justify-end' : ''}`}>
      <div className={`max-w-[92%] ${
        isUser
          ? 'bg-neon-green/[0.07] border border-neon-green/15 rounded-2xl rounded-br-md px-4 py-3'
          : 'py-3'
      }`}>
        {/* Role indicator */}
        <div className="flex items-center gap-2 mb-2">
          {isUser ? (
            <>
              <div className="w-5 h-5 rounded-full bg-neon-green/15 flex items-center justify-center">
                <User size={11} className="text-neon-green" />
              </div>
              <span className="text-[10px] font-mono text-neon-green/60 uppercase tracking-wider">You</span>
            </>
          ) : (
            <>
              <div className="w-5 h-5 rounded-full bg-neon-cyan/15 flex items-center justify-center">
                <Bot size={11} className="text-neon-cyan" />
              </div>
              <span className="text-[10px] font-mono text-neon-cyan/60 uppercase tracking-wider">iclaw</span>
              {message.stats && (
                <span className="text-[9px] font-mono text-steel-600 flex items-center gap-1">
                  {EngineIcon && <EngineIcon size={8} />}
                  {message.stats.model && (
                    <span className="text-steel-700">{message.stats.model.split('/').pop().replace(':free','')}</span>
                  )}
                  <Zap size={8} />
                  {message.stats.tokPerSec} tok/s · {message.stats.elapsed}s
                </span>
              )}
            </>
          )}
        </div>

        {/* Content */}
        {isUser ? (
          <p className="text-sm text-steel-100 leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          <div className="space-y-1">
            {segments?.map((seg, i) => {
              if (seg.type === 'thinking') {
                return <ThinkingBlock key={i} content={seg.content} isStreaming={seg.isStreaming ?? false} />;
              }
              if (seg.type === 'code') {
                return (
                  <CodeBlock
                    key={i}
                    code={seg.content}
                    language={seg.language}
                    filename={seg.filename}
                    onInject={onInject}
                    onPreview={onPreview}
                    projectOpen={projectOpen}
                  />
                );
              }
              return (
                <p key={i} className="text-sm text-steel-200 leading-relaxed whitespace-pre-wrap px-1">
                  {seg.content}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
