import React, { useRef, useEffect, useState } from 'react';
import { Copy, Check, FileDown, Eye } from 'lucide-react';
import hljs from 'highlight.js/lib/core';

import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import swift from 'highlight.js/lib/languages/swift';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('markdown', markdown);

export default function CodeBlock({
  code,
  language = 'plaintext',
  filename,
  onInject,
  onPreview,
  projectOpen,
}) {
  const codeRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [showInjectMenu, setShowInjectMenu] = useState(false);
  const [injectPath, setInjectPath] = useState(filename || '');
  const [injected, setInjected] = useState(false);

  const isPreviewable = ['html', 'xml', 'svg'].includes(language) &&
    (code.includes('<html') || code.includes('<!DOCTYPE') || code.includes('<body') || code.includes('<svg'));

  useEffect(() => {
    if (codeRef.current) {
      try {
        const result = hljs.highlight(code, {
          language: hljs.getLanguage(language) ? language : 'plaintext',
          ignoreIllegals: true,
        });
        codeRef.current.innerHTML = result.value;
      } catch {
        codeRef.current.textContent = code;
      }
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInject = async () => {
    if (!injectPath.trim()) return;
    const success = await onInject?.(injectPath.trim(), code);
    if (success) {
      setInjected(true);
      setShowInjectMenu(false);
      setTimeout(() => setInjected(false), 3000);
    }
  };

  const lineCount = code.split('\n').length;

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-white/[0.06] bg-[#06060e]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-neon-cyan/70 uppercase tracking-wider">
            {language}
          </span>
          {filename && (
            <span className="text-[10px] font-mono text-steel-500">→ {filename}</span>
          )}
          <span className="text-[10px] font-mono text-steel-600">{lineCount}L</span>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Preview button (HTML only) */}
          {isPreviewable && (
            <button
              onClick={() => onPreview?.(code, filename || 'preview.html')}
              className="p-1.5 rounded hover:bg-neon-green/10 active:scale-90 transition-all"
              title="Preview HTML"
            >
              <Eye size={13} className="text-neon-green" />
            </button>
          )}

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-white/5 active:scale-90 transition-all"
            title="Copy code"
          >
            {copied ? <Check size={13} className="text-neon-green" /> : <Copy size={13} className="text-steel-400" />}
          </button>

          {/* One-Tap Inject */}
          {projectOpen && (
            <button
              onClick={() => {
                if (filename && !showInjectMenu) handleInject();
                else setShowInjectMenu(!showInjectMenu);
              }}
              className={`p-1.5 rounded transition-all active:scale-90 ${
                injected ? 'bg-neon-green/10' : 'hover:bg-white/5'
              }`}
              title="Save to project"
            >
              {injected ? (
                <Check size={13} className="text-neon-green" />
              ) : (
                <FileDown size={13} className="text-neon-amber/70" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Inject path input */}
      {showInjectMenu && (
        <div className="flex items-center gap-2 px-3 py-2 bg-neon-green/[0.03] border-b border-neon-green/10">
          <span className="text-[10px] text-steel-400 shrink-0">Path:</span>
          <input
            type="text"
            value={injectPath}
            onChange={(e) => setInjectPath(e.target.value)}
            placeholder="src/component.jsx"
            className="flex-1 bg-transparent border-b border-white/10 text-xs font-mono
              text-steel-200 py-1 px-1 focus:outline-none focus:border-neon-green/40
              placeholder:text-steel-600 caret-neon-green"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleInject()}
          />
          <button
            onClick={handleInject}
            className="text-[10px] font-mono text-neon-green bg-neon-green/10
              px-2 py-1 rounded active:scale-95"
          >
            Save
          </button>
        </div>
      )}

      {/* Code */}
      <div className="overflow-x-auto p-3">
        <pre className="text-[12.5px] leading-[1.65] font-mono">
          <code ref={codeRef} className="text-steel-200" />
        </pre>
      </div>
    </div>
  );
}
