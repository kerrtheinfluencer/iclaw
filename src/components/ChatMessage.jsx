import React from 'react';
import { Bot, User, Zap, Cpu, Cloud } from 'lucide-react';
import CodeBlock from './CodeBlock.jsx';
import { parseResponse } from '../utils/codeParser.js';

const engineIcons = {
  puter: Cloud,
  wasm: Cpu,
  api: Cloud,
  webgpu: Zap,
};

export default function ChatMessage({ message, onInject, onPreview, projectOpen }) {
  const isUser = message.role === 'user';
  const segments = isUser ? null : parseResponse(message.content);

  const EngineIcon = message.stats?.engine ? engineIcons[message.stats.engine] : null;

  return (
    <div className={`animate-slide-up ${isUser ? 'flex justify-end' : ''}`}>
      <div
        className={`max-w-[92%] ${
          isUser
            ? 'bg-neon-green/[0.07] border border-neon-green/15 rounded-2xl rounded-br-md px-4 py-3'
            : 'py-3'
        }`}
      >
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
                    <span className="text-steel-700">{message.stats.model.split('/').pop()}</span>
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
            {segments?.map((seg, i) =>
              seg.type === 'code' ? (
                <CodeBlock
                  key={i}
                  code={seg.content}
                  language={seg.language}
                  filename={seg.filename}
                  onInject={onInject}
                  onPreview={onPreview}
                  projectOpen={projectOpen}
                />
              ) : (
                <p key={i} className="text-sm text-steel-200 leading-relaxed whitespace-pre-wrap px-1">
                  {seg.content}
                </p>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
