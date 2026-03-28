import React, { useRef, useEffect } from 'react';
import { X, FileText, Save } from 'lucide-react';
import hljs from 'highlight.js/lib/core';

export default function FileViewer({ path, content, onClose, onSave }) {
  const codeRef = useRef(null);
  const ext = path?.split('.').pop() || '';

  useEffect(() => {
    if (codeRef.current && content) {
      try {
        const lang = hljs.getLanguage(ext) ? ext : 'plaintext';
        const result = hljs.highlight(content, { language: lang, ignoreIllegals: true });
        codeRef.current.innerHTML = result.value;
      } catch {
        codeRef.current.textContent = content;
      }
    }
  }, [content, ext]);

  if (!path) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void-950 safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 glass-panel">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-neon-cyan shrink-0" />
          <span className="text-xs font-mono text-steel-200 truncate">{path}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/5 active:scale-90 transition-all"
        >
          <X size={18} className="text-steel-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-[12px] leading-[1.7] font-mono">
          <code ref={codeRef} className="text-steel-200" />
        </pre>
      </div>

      {/* Line count */}
      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] font-mono text-steel-600">
          {content?.split('\n').length || 0} lines · {ext.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
