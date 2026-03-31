import React, { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, Search, Mic, FolderOpen, Play } from 'lucide-react';

export default function ChatView({ 
  messages, 
  onSend, 
  onPreview,
  llmStatus,
  statusMessage,
  loadProgress,
  loadText,
  onSettingsOpen,
  onOpenAgent,
  webSearchOn,
  isSearching,
  onToggleSearch,
  projectOpen
}) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const isReady = llmStatus === 'ready' || llmStatus === 'idle';
  const isError = llmStatus === 'error';

  // Extract HTML from message content
  const extractHtmlFromMessage = (content) => {
    const htmlMatch = content.match(/```html\n([\s\S]*?)```/);
    if (htmlMatch) {
      return htmlMatch[1].trim();
    }
    // Also match if it starts with <!DOCTYPE or <html
    if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
      const match = content.match(/(<!DOCTYPE html>[\s\S]*?<\/html>)/);
      if (match) return match[1].trim();
    }
    return null;
  };

  const handleSend = useCallback(() => {
    if (!input.trim() || !isReady) return;
    onSend(input, streamRef, attachments);
    setInput('');
    setAttachments([]);
  }, [input, attachments, isReady, onSend]);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachments(prev => [...prev, {
          name: file.name,
          size: file.size,
          mimeType: file.type,
          base64: event.target.result.split(',')[1]
        }]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const providers = [
    { id: 'gemini', icon: '✦', name: 'Google Gemini', desc: 'Free · Supports doc uploads', color: 'border-blue-400/20' },
    { id: 'groq', icon: '⚡', name: 'Groq', desc: 'Free · Fastest inference', color: 'border-orange-400/20' },
    { id: 'openrouter', icon: '◈', name: 'OpenRouter', desc: 'Free models · DeepSeek, Qwen', color: 'border-purple-400/20' },
  ];

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-2xl font-bold text-[#00ff88] mb-2">iclaw</h2>
            <p className="text-[#888] mb-8">100% free AI coding workspace. Pick a provider below.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSettingsOpen()}
                  className={`p-4 rounded-xl border ${p.color} bg-[#0f0f16] hover:bg-[#1a1a24] transition-all text-left group`}
                >
                  <div className="text-2xl mb-2">{p.icon}</div>
                  <div className="font-semibold text-[#e0e0e0] group-hover:text-[#00ff88]">{p.name}</div>
                  <div className="text-xs text-[#666] mt-1">{p.desc}</div>
                </button>
              ))}
            </div>

            {!projectOpen && (
              <button 
                onClick={() => document.querySelector('[data-sidebar-toggle]')?.click()}
                className="mt-8 flex items-center gap-2 px-4 py-2 bg-[#00ff88]/10 text-[#00ff88] rounded-lg hover:bg-[#00ff88]/20"
              >
                <FolderOpen className="w-4 h-4" />
                Open Project Folder
              </button>
            )}
          </div>
        ) : (
          messages.map((msg, i) => {
            const htmlContent = msg.role === 'assistant' ? extractHtmlFromMessage(msg.content) : null;
            
            return (
              <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user' 
                    ? 'bg-[#00ff88] text-[#0a0a0f]' 
                    : 'bg-[#1a1a24] text-[#e0e0e0] border border-[#333]'
                }`}>
                  <div className="whitespace-pre-wrap text-sm font-mono">{msg.content}</div>
                  
                  {/* HTML Preview Button */}
                  {htmlContent && (
                    <div className="mt-3 pt-3 border-t border-[#333]">
                      <button
                        onClick={() => onPreview(htmlContent, 'preview.html')}
                        className="flex items-center gap-2 px-3 py-2 bg-[#00ff88] text-[#0a0a0f] rounded-lg text-sm font-medium hover:bg-[#00ff88]/90 transition-colors"
                      >
                        <Play className="w-4 h-4" />
                        Run Preview
                      </button>
                    </div>
                  )}
                  
                  {msg.stats && (
                    <div className="text-xs mt-2 opacity-60">
                      {msg.stats.tokens} tokens · {msg.stats.elapsed}s · {msg.stats.tokPerSec} tok/s
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        
        {isSearching && (
          <div className="flex items-center gap-2 text-[#00ff88] text-sm animate-pulse">
            <Search className="w-4 h-4" />
            Searching web...
          </div>
        )}
      </div>

      <div className="border-t border-[#333] p-4 bg-[#0f0f16]">
        {isError && (
          <div className="mb-2 text-red-400 text-sm flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full" />
            {statusMessage}
          </div>
        )}
        
        {llmStatus === 'needsKey' && (
          <div className="mb-2 text-yellow-400 text-sm">
            API key required. Click settings to configure.
          </div>
        )}

        {llmStatus === 'loading' && (
          <div className="mb-2 text-[#00ff88] text-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-32 h-2 bg-[#1a1a24] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#00ff88] transition-all duration-300"
                  style={{ width: `${(loadProgress * 100).toFixed(0)}%` }}
                />
              </div>
              <span>{(loadProgress * 100).toFixed(0)}%</span>
            </div>
            <div className="text-xs text-[#666]">{loadText}</div>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1 px-2 py-1 bg-[#1a1a24] rounded text-xs text-[#888]">
                <span className="truncate max-w-[100px]">{att.name}</span>
                <span className="text-[#666]">({formatSize(att.size)})</span>
                <button 
                  onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                  className="ml-1 text-red-400 hover:text-red-300"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
          />
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-[#666] hover:text-[#00ff88] transition-colors"
            title="Attach files"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          <button 
            onClick={() => onToggleSearch(!webSearchOn)}
            className={`p-2 transition-colors ${webSearchOn ? 'text-[#00ff88]' : 'text-[#666] hover:text-[#00ff88]'}`}
            title="Toggle web search"
          >
            <Search className="w-5 h-5" />
          </button>

          <button 
            className="p-2 text-[#666] hover:text-[#00ff88] transition-colors"
            title="Voice input"
          >
            <Mic className="w-5 h-5" />
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isReady ? "Type a message..." : "Waiting for engine..."}
            disabled={!isReady}
            className="flex-1 bg-[#1a1a24] border border-[#333] rounded-lg px-3 py-2 text-sm text-[#e0e0e0] placeholder-[#666] focus:outline-none focus:border-[#00ff88] resize-none min-h-[40px] max-h-[120px]"
            rows={1}
          />

          <button 
            onClick={handleSend}
            disabled={!input.trim() || !isReady}
            className="p-2 bg-[#00ff88] text-[#0a0a0f] rounded-lg hover:bg-[#00ff88]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
