import React, { useState, useRef, useEffect } from 'react';
import {
  X, Maximize2, Minimize2, RotateCcw, ExternalLink,
  Smartphone, Monitor, Code2, Eye,
} from 'lucide-react';

export default function HtmlPreview({ html, title, onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState('preview');
  const [deviceFrame, setDeviceFrame] = useState('mobile');
  const [error, setError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!html) return;

    // Clean up previous blob
    if (blobUrl) URL.revokeObjectURL(blobUrl);

    let processedHtml = html;

    // Inject viewport if missing
    if (!processedHtml.includes('name="viewport"')) {
      if (processedHtml.includes('<head>')) {
        processedHtml = processedHtml.replace(
          '<head>',
          '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        );
      }
    }

    // Inject error catcher
    const errorScript = `<script>
window.onerror = function(msg, url, line) {
  parent.postMessage({ type: 'previewError', message: msg, line: line }, '*');
  return false;
};
window.addEventListener('unhandledrejection', function(e) {
  parent.postMessage({ type: 'previewError', message: e.reason?.message || String(e.reason), line: 0 }, '*');
});
</script>`;

    if (processedHtml.includes('</body>')) {
      processedHtml = processedHtml.replace('</body>', errorScript + '</body>');
    } else {
      processedHtml += errorScript;
    }

    const blob = new Blob([processedHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    setError(null);

    return () => URL.revokeObjectURL(url);
  }, [html, refreshKey]);

  // Listen for iframe errors
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'previewError') {
        setError(`JS Error${e.data.line ? ` (line ${e.data.line})` : ''}: ${e.data.message}`);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const openExternal = () => {
    if (blobUrl) window.open(blobUrl, '_blank');
  };

  if (!html) return null;

  return (
    <div className={`fixed inset-0 z-[60] flex flex-col bg-void-950 safe-top safe-bottom`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 glass-panel shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            <X size={16} className="text-steel-400" />
          </button>
          <span className="text-xs font-mono text-steel-200 truncate max-w-[150px]">
            {title || 'Preview'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Preview / Code toggle */}
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

          <button onClick={() => setRefreshKey(k => k + 1)} className="p-1.5 rounded hover:bg-white/5 active:scale-90" title="Refresh">
            <RotateCcw size={13} className="text-steel-400" />
          </button>
          <button onClick={openExternal} className="p-1.5 rounded hover:bg-white/5 active:scale-90" title="Open in new tab">
            <ExternalLink size={13} className="text-steel-400" />
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            {isFullscreen ? <Minimize2 size={13} className="text-steel-400" /> : <Maximize2 size={13} className="text-steel-400" />}
          </button>
        </div>
      </div>

      {/* Error bar */}
      {error && (
        <div className="px-3 py-1.5 bg-neon-pink/5 border-b border-neon-pink/15 shrink-0">
          <p className="text-[10px] font-mono text-neon-pink/80 truncate">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 flex items-stretch justify-center bg-[#111118] overflow-hidden">
        {viewMode === 'preview' ? (
          <div className={`flex-1 transition-all duration-300 ${
            deviceFrame === 'mobile' ? 'max-w-[430px] border-x border-white/5' : 'w-full'
          }`}>
            {blobUrl ? (
              <iframe
                key={`${refreshKey}-${blobUrl}`}
                src={blobUrl}
                sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin"
                className="w-full h-full bg-white border-0"
                title="HTML Preview"
                allow="accelerometer; camera; encrypted-media; geolocation; gyroscope"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-steel-500 text-xs font-mono">Loading preview...</p>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full overflow-auto p-4">
            <pre className="text-[12px] font-mono text-steel-200 leading-[1.65] whitespace-pre-wrap break-words">
              {html}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
