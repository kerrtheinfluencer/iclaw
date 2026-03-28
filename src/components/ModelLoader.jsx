import React from 'react';
import { Cpu, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function ModelLoader({ status, progress, text, message, onInit }) {
  if (status === 'ready') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void-950/95 backdrop-blur-md safe-top safe-bottom">
      <div className="w-[300px] space-y-6 text-center px-4">
        {/* Animated CPU icon */}
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-neon-green/10 to-neon-cyan/5 border border-neon-green/20 animate-glow-breathe" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Cpu size={36} className={`text-neon-green/70 ${status === 'loading' ? 'animate-pulse' : ''}`} />
          </div>
        </div>

        {status === 'idle' && (
          <>
            <div className="space-y-2">
              <h3 className="font-display text-lg font-bold text-steel-100 tracking-wider">
                Load AI Model
              </h3>
              <p className="text-xs text-steel-400 leading-relaxed">
                Download and cache Qwen2.5-Coder 3B locally. ~1.8GB, stored in your browser for offline use.
              </p>
            </div>
            <button onClick={onInit} className="btn-neon w-full py-3 text-sm font-semibold">
              Initialize WebGPU Engine
            </button>
            <p className="text-[10px] text-steel-600">
              Requires WebGPU support (Safari 26+, Chrome 113+)
            </p>
          </>
        )}

        {status === 'loading' && (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-display font-bold text-neon-green">
                  {(progress * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-void-300 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-neon-green via-neon-cyan to-neon-green rounded-full transition-all duration-500"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-steel-500 font-mono truncate px-2">
                {text}
              </p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="space-y-2">
              <AlertTriangle size={24} className="text-neon-pink mx-auto" />
              <h3 className="font-display text-sm font-bold text-neon-pink">
                Initialization Failed
              </h3>
              <p className="text-xs text-steel-400 leading-relaxed">
                {message}
              </p>
            </div>
            <button onClick={onInit} className="btn-neon w-full py-2.5">
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
