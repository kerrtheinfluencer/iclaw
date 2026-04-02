import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Maximize2, Minimize2, RotateCcw, ExternalLink,
  Smartphone, Monitor, Code2, Eye, Play, Pause,
  ChevronLeft, ChevronRight, Layers,
} from 'lucide-react';

/**
 * LiveCanvas — Gemini Canvas-style live preview panel.
 * Sits beside the chat, updates in real-time as the AI streams code.
 * Supports HTML/CSS/JS with hot-reload, device frames, and history.
 */
export default function LiveCanvas({ html, title, isStreaming, onClose }) {
  const iframeRef = useRef(null);
  const [deviceFrame, setDeviceFrame] = useState('mobile');
  const [viewMode, setViewMode] = useState('preview');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState(null);
  const [key, setKey] = useState(0);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isLive, setIsLive] = useState(true);
  const blobUrl = useRef(null);
  const lastHtmlRef = useRef('');

  // Build blob URL from HTML
  const buildUrl = useCallback((rawHtml) => {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);

    let processed = rawHtml;

    // Inject viewport meta if missing
    if (!processed.includes('<meta name="viewport"')) {
      processed = processed.includes('<head>')
        ? processed.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">')
        : `<head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>${processed}`;
    }

    // Inject error reporter
    const errorScript = `<script>
window.onerror = function(msg, src, line) {
  parent.postMessage({ type: 'canvasError', message: msg, line: line }, '*');
  return true;
};
window.addEventListener('unhandledrejection', function(e) {
  parent.postMessage({ type: 'canvasError', message: e.reason?.message || String(e.reason), line: 0 }, '*');
});
</script>`;

    processed = processed.includes('</body>')
      ? processed.replace('</body>', errorScript + '</body>')
      : processed + errorScript;

    const blob = new Blob([processed], { type: 'text/html' });
    blobUrl.current = URL.createObjectURL(blob);
    return blobUrl.current;
  }, []);

  // Listen for iframe errors
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'canvasError') {
        setError(`Line ${e.data.line}: ${e.data.message}`);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Update preview when html changes (live streaming mode)
  useEffect(() => {
    if (!html || !isLive) return;
    // Only update when we have a complete-ish HTML document or streaming ends
    const isComplete = html.includes('</html>') || html.includes('</body>') || !isStreaming;
    if (!isComplete && isStreaming) return;
    if (html === lastHtmlRef.current) return;

    lastHtmlRef.current = html;
    setError(null);
    buildUrl(html);
    setKey(k => k + 1);
  }, [html, isStreaming, isLive, buildUrl]);

  // Save to history when streaming ends
  useEffect(() => {
    if (!isStreaming && html && html !== history[historyIndex]?.html) {
      const entry = { html, title: title || `Preview ${Date.now()}`, ts: Date.now() };
      setHistory(prev => {
        const trimmed = prev.slice(0, historyIndex + 1);
        const next = [...trimmed, entry];
        setHistoryIndex(next.length - 1);
        return next;
      });
    }
  }, [isStreaming]);

  const loadHistoryEntry = (idx) => {
    if (!history[idx]) return;
    setHistoryIndex(idx);
    lastHtmlRef.current = history[idx].html;
    buildUrl(history[idx].html);
    setKey(k => k + 1);
    setError(null);
  };

  const refresh = () => { setError(null); setKey(k => k + 1); };

  const openExternal = () => {
    if (blobUrl.current) window.open(blobUrl.current, '_blank');
  };

  if (!html) return null;

  const currentUrl = blobUrl.current;

  return (
    <div className={`flex flex-col bg-[#0d0d14] border-l border-white/[0.06] transition-all duration-300 ${
      isFullscreen ? 'fixed inset-0 z-[70]' : 'h-full'
    }`}>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-white/[0.06] bg-void-950/80 backdrop-blur shrink-0">

        {/* Title + live badge */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 active:scale-90 shrink-0">
            <X size={14} className="text-steel-400" />
          </button>
          <Layers size={13} className="text-neon-green/60 shrink-0" />
          <span className="text-[11px] font-mono text-steel-300 truncate">
            {title || 'Canvas'}
          </span>
          {isStreaming && isLive && (
            <span className="flex items-center gap-1 text-[9px] font-mono text-neon-cyan bg-neon-cyan/10 px-1.5 py-0.5 rounded-full shrink-0 animate-pulse">
              <span className="w-1 h-1 rounded-full bg-neon-cyan" />
              LIVE
            </span>
          )}
          {!isStreaming && html && (
            <span className="text-[9px] font-mono text-neon-green/60 shrink-0">READY</span>
          )}
        </div>

        {/* History nav */}
        {history.length > 1 && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => loadHistoryEntry(historyIndex - 1)}
              disabled={historyIndex <= 0}
              className="p-1 rounded hover:bg-white/5 disabled:opacity-20"
            >
              <ChevronLeft size={13} className="text-steel-500" />
            </button>
            <span className="text-[9px] font-mono text-steel-600 px-1">
              {historyIndex + 1}/{history.length}
            </span>
            <button
              onClick={() => loadHistoryEntry(historyIndex + 1)}
              disabled={historyIndex >= history.length - 1}
              className="p-1 rounded hover:bg-white/5 disabled:opacity-20"
            >
              <ChevronRight size={13} className="text-steel-500" />
            </button>
          </div>
        )}

        {/* View toggle */}
        <div className="flex bg-white/[0.03] rounded-lg border border-white/[0.05] p-0.5">
          <button
            onClick={() => setViewMode('preview')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'preview' ? 'bg-neon-green/10 text-neon-green' : 'text-steel-500 hover:text-steel-300'}`}
            title="Preview"
          >
            <Eye size={12} />
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'code' ? 'bg-neon-cyan/10 text-neon-cyan' : 'text-steel-500 hover:text-steel-300'}`}
            title="Source"
          >
            <Code2 size={12} />
          </button>
        </div>

        {/* Device toggle (preview only) */}
        {viewMode === 'preview' && (
          <div className="flex bg-white/[0.03] rounded-lg border border-white/[0.05] p-0.5">
            <button
              onClick={() => setDeviceFrame('mobile')}
              className={`p-1.5 rounded-md transition-colors ${deviceFrame === 'mobile' ? 'bg-neon-amber/10 text-neon-amber' : 'text-steel-500 hover:text-steel-300'}`}
              title="Mobile"
            >
              <Smartphone size={12} />
            </button>
            <button
              onClick={() => setDeviceFrame('desktop')}
              className={`p-1.5 rounded-md transition-colors ${deviceFrame === 'desktop' ? 'bg-neon-amber/10 text-neon-amber' : 'text-steel-500 hover:text-steel-300'}`}
              title="Desktop"
            >
              <Monitor size={12} />
            </button>
          </div>
        )}

        {/* Live toggle */}
        <button
          onClick={() => setIsLive(v => !v)}
          className={`p-1.5 rounded-md transition-colors ${isLive ? 'text-neon-green' : 'text-steel-600'}`}
          title={isLive ? 'Live update ON' : 'Live update OFF'}
        >
          {isLive ? <Play size={12} /> : <Pause size={12} />}
        </button>

        <button onClick={refresh} className="p-1.5 rounded hover:bg-white/5 active:scale-90" title="Refresh">
          <RotateCcw size={12} className="text-steel-500" />
        </button>
        <button onClick={openExternal} className="p-1.5 rounded hover:bg-white/5 active:scale-90" title="Open in new tab">
          <ExternalLink size={12} className="text-steel-500" />
        </button>
        <button
          onClick={() => setIsFullscreen(v => !v)}
          className="p-1.5 rounded hover:bg-white/5 active:scale-90"
          title="Fullscreen"
        >
          {isFullscreen ? <Minimize2 size={12} className="text-steel-500" /> : <Maximize2 size={12} className="text-steel-500" />}
        </button>
      </div>

      {/* ── Error bar ── */}
      {error && (
        <div className="px-3 py-1.5 bg-neon-pink/5 border-b border-neon-pink/15 shrink-0 flex items-center justify-between">
          <p className="text-[10px] font-mono text-neon-pink/80 truncate flex-1">{error}</p>
          <button onClick={() => setError(null)} className="ml-2 shrink-0">
            <X size={10} className="text-neon-pink/60" />
          </button>
        </div>
      )}

      {/* ── Streaming skeleton ── */}
      {isStreaming && !currentUrl && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#0d0d14]">
          <div className="flex gap-1.5">
            {[0, 150, 300].map(d => (
              <div
                key={d}
                className="w-2 h-2 rounded-full bg-neon-green/40 animate-bounce"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </div>
          <p className="text-[10px] font-mono text-steel-600">Building preview...</p>
        </div>
      )}

      {/* ── Content ── */}
      {currentUrl && (
        <div className="flex-1 overflow-hidden flex items-start justify-center bg-[#111118]">
          {viewMode === 'preview' ? (
            <div className={`h-full transition-all duration-300 ${
              deviceFrame === 'mobile' ? 'w-[390px] max-w-full border-x border-white/[0.06] shadow-2xl' : 'w-full'
            }`}>
              {/* Device chrome for mobile */}
              {deviceFrame === 'mobile' && (
                <div className="h-6 bg-void-900 border-b border-white/[0.05] flex items-center justify-center gap-1 shrink-0">
                  <div className="w-12 h-1 rounded-full bg-white/10" />
                </div>
              )}
              <iframe
                ref={iframeRef}
                key={key}
                src={currentUrl}
                sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
                className={`w-full bg-white border-0 ${
                  deviceFrame === 'mobile' ? 'h-[calc(100%-24px)]' : 'h-full'
                }`}
                title="Live Canvas"
              />
            </div>
          ) : (
            <div className="w-full h-full overflow-auto p-4">
              <pre className="text-[11px] font-mono text-steel-300 leading-[1.7] whitespace-pre-wrap">
                {html}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
