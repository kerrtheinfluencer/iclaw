import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Save, Undo2, Redo2, Search, Copy, Check,
  ChevronLeft, Type, WrapText, Hash,
} from 'lucide-react';
import hljs from 'highlight.js/lib/core';

export default function CodeEditor({ path, initialContent, onSave, onClose }) {
  const [content, setContent] = useState(initialContent || '');
  const [saved, setSaved] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [wordWrap, setWordWrap] = useState(true);
  const [fontSize, setFontSize] = useState(13);
  const [copied, setCopied] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const scrollRef = useRef(null);
  const lastSaveRef = useRef(initialContent || '');

  const ext = path?.split('.').pop() || '';
  const lines = content.split('\n');
  const lineCount = lines.length;

  // Detect if file is modified
  useEffect(() => {
    setSaved(content === lastSaveRef.current);
  }, [content]);

  // Track cursor position
  const updateCursor = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = content.substring(0, pos);
    const line = (before.match(/\n/g) || []).length + 1;
    const col = pos - before.lastIndexOf('\n');
    setCursorLine(line);
    setCursorCol(col);
  }, [content]);

  // Handle tab key
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      pushUndo();
      setContent(newContent);
      // Restore cursor
      requestAnimationFrame(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      });
    }
  };

  const pushUndo = () => {
    setUndoStack((prev) => [...prev.slice(-50), content]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, content]);
    setUndoStack((u) => u.slice(0, -1));
    setContent(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, content]);
    setRedoStack((r) => r.slice(0, -1));
    setContent(next);
  };

  const handleSave = async () => {
    const success = await onSave?.(path, content);
    if (success) {
      setSaved(true);
      lastSaveRef.current = content;
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback if needed */ }
  };

  // Sync scroll between textarea and line numbers
  const handleScroll = () => {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Search highlighting
  const matchCount = searchTerm
    ? (content.match(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
    : 0;

  if (!path) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void-950 safe-top safe-bottom">
      {/* ── Top Toolbar ── */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-white/5 glass-panel gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 active:scale-90 transition-all shrink-0"
          >
            <ChevronLeft size={18} className="text-steel-300" />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-mono text-steel-200 truncate">{path}</p>
            <p className="text-[9px] font-mono text-steel-600">
              {lineCount}L · {ext.toUpperCase()} · L{cursorLine}:C{cursorCol}
              {!saved && <span className="text-neon-amber ml-1">● Modified</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-2 rounded hover:bg-white/5 active:scale-90 disabled:opacity-20"
          >
            <Undo2 size={15} className="text-steel-400" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-2 rounded hover:bg-white/5 active:scale-90 disabled:opacity-20"
          >
            <Redo2 size={15} className="text-steel-400" />
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2 rounded hover:bg-white/5 active:scale-90 ${showSearch ? 'bg-white/5' : ''}`}
          >
            <Search size={15} className="text-steel-400" />
          </button>
          <button
            onClick={handleCopy}
            className="p-2 rounded hover:bg-white/5 active:scale-90"
          >
            {copied ? <Check size={15} className="text-neon-green" /> : <Copy size={15} className="text-steel-400" />}
          </button>
          <button
            onClick={handleSave}
            className={`p-2 rounded active:scale-90 transition-all ${
              saved
                ? 'opacity-30'
                : 'bg-neon-green/10 hover:bg-neon-green/15'
            }`}
            disabled={saved}
          >
            <Save size={15} className={saved ? 'text-steel-500' : 'text-neon-green'} />
          </button>
        </div>
      </div>

      {/* ── Search Bar ── */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-void-800/50">
          <Search size={13} className="text-steel-500 shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-xs font-mono text-steel-200 py-1
              focus:outline-none placeholder:text-steel-600 caret-neon-green"
            autoFocus
          />
          {searchTerm && (
            <span className="text-[10px] font-mono text-steel-500 shrink-0">
              {matchCount} match{matchCount !== 1 ? 'es' : ''}
            </span>
          )}
          <button onClick={() => { setShowSearch(false); setSearchTerm(''); }}
            className="p-1 rounded hover:bg-white/5">
            <X size={13} className="text-steel-500" />
          </button>
        </div>
      )}

      {/* ── Editor Area ── */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 flex">
          {/* Line numbers */}
          <div
            ref={highlightRef}
            className="w-10 shrink-0 overflow-hidden bg-void-900/50 border-r border-white/[0.04] select-none"
          >
            <div className="py-3 px-1">
              {lines.map((_, i) => (
                <div
                  key={i}
                  className={`text-right pr-2 leading-[1.65] text-[${fontSize - 1}px] font-mono ${
                    cursorLine === i + 1 ? 'text-neon-green/60' : 'text-steel-700'
                  }`}
                  style={{ fontSize: `${fontSize - 1}px`, lineHeight: '1.65' }}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              pushUndo();
              setContent(e.target.value);
            }}
            onScroll={handleScroll}
            onClick={updateCursor}
            onKeyUp={updateCursor}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            className="flex-1 bg-transparent text-steel-200 p-3 resize-none
              focus:outline-none caret-neon-green selection:bg-neon-green/15"
            style={{
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: `${fontSize}px`,
              lineHeight: '1.65',
              tabSize: 2,
              whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
              overflowWrap: wordWrap ? 'break-word' : 'normal',
            }}
          />
        </div>
      </div>

      {/* ── Bottom Toolbar ── */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-white/5 glass-panel">
        <div className="flex items-center gap-2">
          {/* Font size controls */}
          <button
            onClick={() => setFontSize((s) => Math.max(10, s - 1))}
            className="p-1.5 rounded hover:bg-white/5 active:scale-90"
          >
            <Type size={12} className="text-steel-500" />
          </button>
          <span className="text-[10px] font-mono text-steel-500 w-6 text-center">{fontSize}</span>
          <button
            onClick={() => setFontSize((s) => Math.min(20, s + 1))}
            className="p-1.5 rounded hover:bg-white/5 active:scale-90"
          >
            <Type size={15} className="text-steel-400" />
          </button>

          <div className="w-px h-4 bg-white/5" />

          {/* Word wrap toggle */}
          <button
            onClick={() => setWordWrap(!wordWrap)}
            className={`p-1.5 rounded hover:bg-white/5 active:scale-90 ${wordWrap ? 'bg-white/5' : ''}`}
            title="Toggle word wrap"
          >
            <WrapText size={14} className={wordWrap ? 'text-neon-green/70' : 'text-steel-500'} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-steel-600">
            {content.length.toLocaleString()} chars
          </span>
          {!saved && (
            <button
              onClick={handleSave}
              className="text-[10px] font-mono text-void-950 bg-neon-green px-3 py-1 rounded-md
                active:scale-95 transition-transform font-semibold"
            >
              SAVE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
