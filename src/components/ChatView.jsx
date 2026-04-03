import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Loader2, Sparkles, FolderOpen,
  RotateCcw, Cpu, Settings, Paperclip, X, FileText, Globe, Search, Zap, Mic, MicOff,
} from 'lucide-react';
import ChatMessage from './ChatMessage.jsx';

// Wrap JS for inline preview — uses JSON.stringify to avoid ALL quote conflicts
function wrapJsPreview(code) {
  const libs = [];
  if (code.includes('THREE')) libs.push('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
  if (code.includes('Chart')) libs.push('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js');
  if (code.includes('PIXI')) libs.push('https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.2/pixi.min.js');
  if (code.includes('d3.')) libs.push('https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js');
  if (code.includes('anime')) libs.push('https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js');
  const needsCanvas = code.includes('THREE') || code.includes('PIXI') || code.includes('canvas');
  const cleaned = code.replace(/^import\s+.*$/gm, '').replace(/^export\s+/gm, '');
  // Serialize all dynamic values — zero raw quotes in this source file
  const libsJson = JSON.stringify(libs);
  const codeJson = JSON.stringify(cleaned);
  const bodyTag = needsCanvas ? 'canvas' : 'div';
  const bodyId = needsCanvas ? 'c' : 'app';
  const html = [
    '<!DOCTYPE html><html>',
    '<head><meta charset="UTF-8">',
    '<style>*{margin:0}body{background:#0a0a0f;color:#e8e8e8;font-family:sans-serif}canvas{display:block}</style>',
    '</head>',
    '<body>',
    '<' + bodyTag + ' id="' + bodyId + '"></' + bodyTag + '>',
    '<script>',
    '(function(){',
    'var L=' + libsJson + ',C=' + codeJson + ';',
    'function run(){',
    'var c=document.getElementById("c");',
    'if(c){c.width=innerWidth;c.height=innerHeight;}',
    'try{new Function(C)();}',
    'catch(e){document.body.textContent="Error: "+e.message;}',
    '}',
    'function load(i){if(i>=L.length){run();return;}',
    'var s=document.createElement("script");',
    's.src=L[i];s.onload=function(){load(i+1);};s.onerror=load.bind(null,i+1);',
    'document.head.appendChild(s);}',
    'load(0);',
    '})();',
    '<\/script>',
    '</body></html>',
  ].join('');
  return html;
}

export default function ChatView({
  messages, onSend, llmStatus, loadProgress, loadText,
  onInitModel, onResetChat, onInject, onPreview,
  projectOpen, projectName, onOpenProject, fsSupported,
  statusMessage, activeEngine, onOpenSettings,
  webSearchOn, isSearching, onToggleSearch, onOpenAgent,
}) {
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [autoPreviewHtml, setAutoPreviewHtml] = useState(null);
  const [showAutoPreview, setShowAutoPreview] = useState(false);
  const [attachments, setAttachments] = useState([]); // { name, mimeType, base64, size }
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const setStreamRef = useRef(setStreamingText);
  setStreamRef.current = setStreamingText;

  useEffect(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => { scrollRef.current.scrollTop = scrollRef.current.scrollHeight; });
    }
  }, [messages, streamingText]);

  // Auto canvas preview — detect HTML/JS in last assistant message
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;
    const content = lastMsg.content || '';
    // Look for full HTML doc or substantial JS with canvas/3D
    const htmlMatch = content.match(/```html\n([\s\S]{200,}?)```/);
    const jsMatch = content.match(/```(?:javascript|js)\n([\s\S]{200,}?)```/);
    if (htmlMatch) {
      setAutoPreviewHtml(htmlMatch[1]);
      setShowAutoPreview(true);
    } else if (jsMatch && (jsMatch[1].includes('THREE') || jsMatch[1].includes('canvas') || jsMatch[1].includes('PIXI') || jsMatch[1].includes('Chart') || jsMatch[1].includes('animate'))) {
      setAutoPreviewHtml('__JS__' + jsMatch[1]);
      setShowAutoPreview(true);
    }
  }, [messages]);

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, []);

  const toggleVoice = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input not supported on this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      setInput(transcript);
      resizeTextarea();
    };
    rec.onend = () => {
      setIsListening(false);
      // Auto-send if we got a result
      setTimeout(() => {
        if (textareaRef.current?.value?.trim()) handleSend();
      }, 300);
    };
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
  }, [isListening, resizeTextarea]);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    const newAttachments = [];

    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        alert(`${file.name} is too large (max 20MB)`);
        continue;
      }
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });
      newAttachments.push({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64,
        size: file.size,
      });
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = ''; // Reset input
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (llmStatus === 'generating') return;

    const prefix = attachments.length > 0
      ? `[Attached: ${attachments.map((a) => a.name).join(', ')}]\n\n`
      : '';

    onSend(prefix + (text || 'Please analyze the attached document(s).'), setStreamRef, attachments);
    setInput('');
    setAttachments([]);
    setStreamingText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const isGenerating = llmStatus === 'generating';
  const isReady = llmStatus === 'ready';
  const isLoading = llmStatus === 'loading';
  const isIdle = llmStatus === 'idle' || llmStatus === 'needsKey';
  const isError = llmStatus === 'error';

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  };

  const previewContent = autoPreviewHtml?.startsWith('__JS__')
    ? wrapJsPreview(autoPreviewHtml.replace('__JS__', ''))
    : autoPreviewHtml;

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4 scroll-smooth">
        {messages.length === 0 && !streamingText && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-neon-green/10 to-neon-cyan/10 border border-neon-green/20 flex items-center justify-center animate-glow-breathe">
                <Sparkles size={32} className="text-neon-green/70" />
              </div>
            </div>
            <div className="space-y-1.5">
              <h2 className="font-display text-xl font-bold tracking-wider text-steel-100">iclaw</h2>
              <p className="text-xs text-steel-400 max-w-[260px] leading-relaxed">
                100% free AI coding workspace. Pick a provider below.
              </p>
            </div>

            {(isIdle || isError) && (
              <div className="w-full max-w-[300px] space-y-2">
                {[
                  { id: 'gemini',      icon: '✦',  name: 'Google Gemini', desc: 'Free · 1M context · Web search', color: 'border-blue-400/20' },
                  { id: 'groq',        icon: '⚡',  name: 'Groq',          desc: 'Free · Fastest · GPT-OSS 120B', color: 'border-orange-400/20' },
                  { id: 'cerebras',    icon: '🧠',  name: 'Cerebras',      desc: 'Free · 2000 tok/s · Llama 70B', color: 'border-cyan-400/20' },
                  { id: 'sambanova',   icon: '⚙',   name: 'SambaNova',     desc: 'Free · Llama 4 · 10M context',  color: 'border-emerald-400/20' },
                  { id: 'huggingface', icon: '🤗',  name: 'Hugging Face',  desc: 'Free token · Qwen Coder 32B',   color: 'border-yellow-400/20' },
                  { id: 'openrouter',  icon: '◈',   name: 'OpenRouter',    desc: 'Free models · DeepSeek, Qwen',  color: 'border-purple-400/20' },
                ].map((p) => (
                  <button key={p.id} onClick={onOpenSettings}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border ${p.color} bg-white/[0.01] hover:bg-white/[0.03] transition-all active:scale-[0.98]`}>
                    <span className="text-xl">{p.icon}</span>
                    <div className="text-left">
                      <span className="text-sm font-medium text-steel-200">{p.name}</span>
                      <p className="text-[10px] text-steel-500">{p.desc}</p>
                    </div>
                  </button>
                ))}
                <button onClick={onOpenAgent}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-neon-amber/20 bg-white/[0.01] hover:bg-white/[0.03] transition-all active:scale-[0.98]">
                  <Zap size={20} className="text-neon-amber" />
                  <div className="text-left">
                    <span className="text-sm font-medium text-steel-200">Agent Mode</span>
                    <p className="text-[10px] text-steel-500">Auto-build apps step by step</p>
                  </div>
                </button>
                <button onClick={() => onInitModel('wasm')}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-neon-green/20 bg-white/[0.01] hover:bg-white/[0.03] transition-all active:scale-[0.98]">
                  <Cpu size={20} className="text-neon-green" />
                  <div className="text-left">
                    <span className="text-sm font-medium text-steel-200">Local WASM (Offline)</span>
                    <p className="text-[10px] text-steel-500">No key · Qwen2.5-Coder 3B · ~1.9GB</p>
                  </div>
                </button>
                {isError && <div className="mt-2 px-3 py-2 rounded-lg bg-neon-pink/5 border border-neon-pink/15"><p className="text-[10px] font-mono text-neon-pink/80">{statusMessage}</p></div>}
                {llmStatus === 'needsKey' && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-neon-amber/5 border border-neon-amber/15">
                    <p className="text-[10px] font-mono text-neon-amber/80">{statusMessage}</p>
                    <button onClick={onOpenSettings} className="mt-1.5 text-[10px] font-mono text-neon-amber flex items-center gap-1"><Settings size={10} /> Open Settings</button>
                  </div>
                )}
              </div>
            )}

            {isLoading && (
              <div className="w-full max-w-[240px] space-y-3">
                <div className="flex items-center justify-center gap-2 text-neon-amber text-xs font-mono"><Loader2 size={14} className="animate-spin" />{(loadProgress * 100).toFixed(0)}%</div>
                <div className="w-full h-1.5 bg-void-300 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-neon-green to-neon-cyan rounded-full transition-all duration-300" style={{ width: `${loadProgress * 100}%` }} /></div>
                <p className="text-[10px] text-steel-500 font-mono text-center truncate">{loadText}</p>
              </div>
            )}

            {isReady && (
              <div className="w-full max-w-[280px] space-y-3">
                {fsSupported && !projectOpen && (
                  <button onClick={onOpenProject} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono bg-white/[0.03] border border-white/[0.08] text-steel-300 hover:border-neon-amber/30 transition-all active:scale-[0.97]">
                    <FolderOpen size={14} /> Open Project Folder
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {['Build a landing page', 'Fix a bug in my code', 'Write a REST API', 'Analyze a document'].map((prompt) => (
                    <button key={prompt} onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                      className="text-[10px] font-mono text-steel-500 bg-white/[0.02] border border-white/[0.05] rounded-lg px-2.5 py-2 hover:border-neon-green/20 hover:text-steel-300 transition-all active:scale-[0.97] text-left leading-tight">{prompt}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4 pt-4">
          {messages.map((msg, i) => (
            <ChatMessage key={msg.id || i} message={msg} onInject={onInject} onPreview={onPreview} projectOpen={projectOpen} />
          ))}
          {streamingText && <ChatMessage message={{ role: 'assistant', content: streamingText, isStreaming: true }} onInject={onInject} onPreview={onPreview} projectOpen={projectOpen} />}
          {isGenerating && !streamingText && (
            <div className="flex items-center gap-2 px-1 py-2">
              <div className="flex gap-1">{[0, 150, 300].map((d) => <div key={d} className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div>
              <span className="text-[10px] font-mono text-steel-500">Generating...</span>
            </div>
          )}
        </div>
      </div>

      {/* Auto Canvas Preview */}
      {showAutoPreview && previewContent && (
        <div className="shrink-0 border-t border-neon-green/20 bg-[#0a0a12]" style={{height: '45vh'}}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
            <span className="text-[10px] font-mono text-neon-green/70 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
              Live Preview
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => onPreview?.(previewContent, 'preview')}
                className="text-[9px] font-mono text-steel-500 hover:text-steel-300 px-2 py-0.5 rounded border border-white/[0.06] hover:border-white/20 transition-all">
                Fullscreen
              </button>
              <button onClick={() => setShowAutoPreview(false)}
                className="text-[9px] font-mono text-steel-600 hover:text-neon-pink px-2 py-0.5 rounded border border-white/[0.06] transition-all">
                ✕
              </button>
            </div>
          </div>
          <iframe
            key={previewContent.slice(0, 50)}
            srcDoc={previewContent}
            sandbox="allow-scripts allow-same-origin allow-modals allow-pointer-lock"
            className="w-full border-0 bg-white"
            style={{height: 'calc(100% - 32px)'}}
            title="Auto Preview"
          />
        </div>
      )}

      {/* Input area */}
      <div className="safe-bottom border-t border-white/5 bg-void-950/90 backdrop-blur-xl px-3 pt-2 pb-2">
        {/* Attachment preview */}
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-neon-cyan/5 border border-neon-cyan/15 shrink-0">
                <FileText size={12} className="text-neon-cyan" />
                <span className="text-[10px] font-mono text-steel-300 max-w-[100px] truncate">{att.name}</span>
                <span className="text-[9px] text-steel-600">{formatSize(att.size)}</span>
                <button onClick={() => removeAttachment(i)} className="p-0.5 hover:bg-white/5 rounded"><X size={10} className="text-steel-500" /></button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {messages.length > 0 && (
            <button onClick={onResetChat} className="shrink-0 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-neon-pink/20 transition-all active:scale-90">
              <RotateCcw size={16} className="text-steel-400" />
            </button>
          )}

          {/* Upload button */}
          <button onClick={() => fileInputRef.current?.click()}
            disabled={!isReady && !isGenerating}
            className="shrink-0 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-neon-cyan/20 transition-all active:scale-90 disabled:opacity-30">
            <Paperclip size={16} className={attachments.length > 0 ? 'text-neon-cyan' : 'text-steel-400'} />
          </button>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.json,.html,.css,.js,.py,.ts,.jsx,.tsx,.xml,.svg" onChange={handleFileSelect} className="hidden" />

          {/* Web search toggle */}
          <button onClick={() => onToggleSearch?.(!webSearchOn)}
            disabled={!isReady && !isGenerating}
            className={`shrink-0 p-2.5 rounded-xl border transition-all active:scale-90 disabled:opacity-30 ${
              webSearchOn
                ? 'bg-neon-green/10 border-neon-green/25'
                : 'bg-white/[0.03] border-white/[0.06]'
            }`}
            title={webSearchOn ? 'Web search ON' : 'Web search OFF'}>
            <Globe size={16} className={webSearchOn ? 'text-neon-green' : 'text-steel-500'} />
          </button>

          {/* Voice input */}
          <button onClick={toggleVoice}
            disabled={!isReady && !isGenerating}
            className={`shrink-0 p-2.5 rounded-xl border transition-all active:scale-90 disabled:opacity-30 ${
              isListening
                ? 'bg-neon-pink/15 border-neon-pink/30 animate-pulse'
                : 'bg-white/[0.03] border-white/[0.06]'
            }`}
            title={isListening ? 'Listening... tap to stop' : 'Voice input'}>
            {isListening
              ? <MicOff size={16} className="text-neon-pink" />
              : <Mic size={16} className="text-steel-500" />}
          </button>

          <textarea ref={textareaRef} value={input}
            onChange={(e) => { setInput(e.target.value); resizeTextarea(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={isReady ? (attachments.length > 0 ? 'Describe what to do with the file...' : projectOpen ? `Ask about ${projectName}...` : 'Ask iclaw anything...') : 'Select an engine to start...'}
            disabled={!isReady && !isGenerating} rows={1}
            className="flex-1 input-stealth pr-10 py-3 text-[14px] resize-none rounded-xl disabled:opacity-40 disabled:cursor-not-allowed" />

          <button onClick={handleSend}
            disabled={(!input.trim() && attachments.length === 0) || (!isReady && !isGenerating)}
            className={`shrink-0 p-2.5 rounded-xl transition-all active:scale-90 ${
              (input.trim() || attachments.length > 0) && isReady ? 'bg-neon-green/15 border border-neon-green/30 shadow-neon-green' : 'bg-white/[0.03] border border-white/[0.06]'
            } disabled:opacity-30 disabled:cursor-not-allowed`}>
            {isGenerating ? <Loader2 size={18} className="text-neon-cyan animate-spin" /> : <Send size={18} className={(input.trim() || attachments.length > 0) && isReady ? 'text-neon-green' : 'text-steel-500'} />}
          </button>
        </div>

        {isReady && (
          <div className="flex items-center gap-3 mt-1.5 px-1">
            {webSearchOn && (
              <span className="text-[9px] font-mono text-steel-600 flex items-center gap-1">
                <Globe size={8} className={isSearching ? 'text-neon-cyan animate-pulse' : 'text-neon-green/50'} />
                {isSearching ? 'Searching web...' : 'Web search on'}
              </span>
            )}
            {projectOpen && (
              <span className="text-[9px] font-mono text-steel-600 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-neon-green/50" />
                RAG · {projectName}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
