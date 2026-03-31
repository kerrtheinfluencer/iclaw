import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Save, Search, ChevronLeft, ChevronRight } from 'lucide-react';

export default function CodeEditor({ filePath, content, onClose, onSave }) {
  const [code, setCode] = useState(content);
  const [saved, setSaved] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const textareaRef = useRef(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  const lines = code.split('\n');
  const lineCount = lines.length;
  const ext = filePath.split('.').pop() || '';

  useEffect(() => {
    setCode(content);
    setSaved(true);
  }, [content, filePath]);

  const handleChange = (e) => {
    setCode(e.target.value);
    setSaved(e.target.value === content);
  };

  const handleSave = async () => {
    const ok = await onSave(filePath, code);
    if (ok) setSaved(true);
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      setShowSearch(true);
    }
  };

  const updateCursorPos = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const textBefore = code.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = textBefore.split('\n').pop().length + 1;
    setCursorLine(line);
    setCursorCol(col);
  };

  const performSearch = useCallback(() => {
    if (!searchTerm) {
      setSearchResults([]);
      return;
    }
    const results = [];
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let match;
    while ((match = regex.exec(code)) !== null) {
      results.push(match.index);
    }
    setSearchResults(results);
    setCurrentMatch(results.length > 0 ? 0 : -1);
  }, [searchTerm, code]);

  useEffect(() => {
    performSearch();
  }, [performSearch]);

  const goToMatch = (direction) => {
    if (searchResults.length === 0) return;
    let next = currentMatch + direction;
    if (next < 0) next = searchResults.length - 1;
    if (next >= searchResults.length) next = 0;
    setCurrentMatch(next);
    
    const pos = searchResults[next];
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.setSelectionRange(pos, pos + searchTerm.length);
      textarea.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0f] flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0f0f16] border-b border-[#333]">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-[#333] rounded-lg">
            <X className="w-5 h-5 text-[#666]" />
          </button>
          <span className="text-[#e0e0e0] font-mono text-sm">{filePath}</span>
          {!saved && <span className="text-[#00ff88] text-xs">● Modified</span>}
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#666] font-mono">
            {lineCount}L · {ext.toUpperCase()} · L{cursorLine}:C{cursorCol}
          </span>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2 rounded-lg ${showSearch ? 'bg-[#00ff88]/20 text-[#00ff88]' : 'hover:bg-[#333] text-[#666]'}`}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saved}
            className="flex items-center gap-2 px-3 py-2 bg-[#00ff88] text-[#0a0a0f] rounded-lg text-sm font-medium hover:bg-[#00ff88]/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#1a1a24] border-b border-[#333]">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-sm text-[#e0e0e0] placeholder-[#666] focus:outline-none"
            autoFocus
          />
          {searchResults.length > 0 && (
            <span className="text-xs text-[#666]">
              {currentMatch + 1} / {searchResults.length}
            </span>
          )}
          <button onClick={() => goToMatch(-1)} className="p-1 hover:bg-[#333] rounded">
            <ChevronLeft className="w-4 h-4 text-[#666]" />
          </button>
          <button onClick={() => goToMatch(1)} className="p-1 hover:bg-[#333] rounded">
            <ChevronRight className="w-4 h-4 text-[#666]" />
          </button>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line numbers */}
        <div className="w-16 py-4 bg-[#0f0f16] border-r border-[#333] text-right pr-4 select-none overflow-hidden">
          {lines.map((_, i) => (
            <div key={i} className="text-xs text-[#666] font-mono leading-6">
              {i + 1}
            </div>
          ))}
        </div>
        
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={updateCursorPos}
          onKeyUp={updateCursorPos}
          className="flex-1 bg-transparent text-[#e0e0e0] font-mono text-sm p-4 resize-none focus:outline-none leading-6"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
