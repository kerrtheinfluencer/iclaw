import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Maximize2, Minimize2, RotateCcw, ExternalLink,
  Smartphone, Monitor, Code2, Eye,
} from 'lucide-react';

/**
 * Sandboxed HTML preview component.
 * Renders HTML/CSS/JS in a secure iframe with device frame options.
 */
export default function HtmlPreview({ html, title, onClose }) {
  const iframeRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'code'
  const [deviceFrame, setDeviceFrame] = useState('mobile'); // 'mobile' | 'desktop'
  const [error, setError] = useState(null);
  const [key, setKey] = useState(0); // For forcing iframe refresh

  // Create blob URL for the HTML
  const blobUrl = useRef(null);

  useEffect(() => {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);

    // Wrap HTML to catch errors and inject viewport meta if missing
    let processedHtml = html;

    if (!processedHtml.includes('<meta name="viewport"')) {
      processedHtml = processedHtml.replace(
        '<head>',
        '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">'
      );
    }

    // Add error catching script
    const errorScript = `
<script>
  window.onerror = function(msg, url, line) {
    parent.postMessage({ type: 'previewError', message: msg, line: line }, '*');
  };
</script>`;

    if (processedHtml.includes('</body>')) {
      processedHtml = processedHtml.replace('</body>', errorScript + '</body>');
    } else {
      processedHtml += errorScript;
    }

    const blob = new Blob([processedHtml], { type: 'text/html' });
    blobUrl.current = URL.createObjectURL(blob);
    setError(null);

    return () => {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, [html, key]);

  // Listen for errors from iframe
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'previewError') {
        setError(`Line ${e.data.line}: ${e.data.message}`);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const refresh = () => setKey((k) => k + 1);

  const openExternal = () => {
    if (blobUrl.current) window.open(blobUrl.current, '_blank');
  };

  if (!html) return null;

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-[60] bg-void-950'
    : 'fixed inset-0 z-[60] bg-void-950 safe-top safe-bottom';

  return (
    <div className={containerClass}>
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 glass-panel">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            <X size={16} className="text-steel-400" />
          </button>
          <span className="text-xs font-mono text-steel-200 truncate">
            {title || 'Preview'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* View toggle: preview / code */}
          <div className="flex bg-white/[0.03] rounded-lg border border-white/[0.06] p-0.5">
            <button
              onClick={() => setViewMode('preview')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'preview' ? 'bg-neon-green/10 text-neon-green' : 'text-steel-500'
              }`}
            >
              <Eye size={13} />
            </button>
            <button
              onClick={() => setViewMode('code')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'code' ? 'bg-neon-cyan/10 text-neon-cyan' : 'text-steel-500'
              }`}
            >
              <Code2 size={13} />
            </button>
          </div>

          {/* Device frame toggle */}
          {viewMode === 'preview' && (
            <div className="flex bg-white/[0.03] rounded-lg border border-white/[0.06] p-0.5">
              <button
                onClick={() => setDeviceFrame('mobile')}
                className={`p-1.5 rounded-md transition-colors ${
                  deviceFrame === 'mobile' ? 'bg-neon-amber/10 text-neon-amber' : 'text-steel-500'
                }`}
              >
                <Smartphone size={13} />
              </button>
              <button
                onClick={() => setDeviceFrame('desktop')}
                className={`p-1.5 rounded-md transition-colors ${
                  deviceFrame === 'desktop' ? 'bg-neon-amber/10 text-neon-amber' : 'text-steel-500'
                }`}
              >
                <Monitor size={13} />
              </button>
            </div>
          )}

          <button onClick={refresh} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            <RotateCcw size={13} className="text-steel-400" />
          </button>
          <button onClick={openExternal} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            <ExternalLink size={13} className="text-steel-400" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded hover:bg-white/5 active:scale-90"
          >
            {isFullscreen ? (
              <Minimize2 size={13} className="text-steel-400" />
            ) : (
              <Maximize2 size={13} className="text-steel-400" />
            )}
          </button>
        </div>
      </div>

      {/* ── Error bar ── */}
      {error && (
        <div className="px-3 py-1.5 bg-neon-pink/5 border-b border-neon-pink/15">
          <p className="text-[10px] font-mono text-neon-pink/80 truncate">{error}</p>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 h-[calc(100%-44px)] overflow-hidden flex items-center justify-center bg-[#111118]">
        {viewMode === 'preview' ? (
          <div
            className={`h-full transition-all duration-300 ${
              deviceFrame === 'mobile'
                ? 'w-[390px] max-w-full border-x border-white/5'
                : 'w-full'
            }`}
          >
            <iframe
              ref={iframeRef}
              key={key}
              src={blobUrl.current}
              sandbox="allow-scripts allow-modals allow-forms allow-popups"
              className="w-full h-full bg-white border-0"
              title="HTML Preview"
            />
          </div>
        ) : (
          <div className="w-full h-full overflow-auto p-4">
            <pre className="text-[12px] font-mono text-steel-200 leading-[1.65] whitespace-pre-wrap">
              {html}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
