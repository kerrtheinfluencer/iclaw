import React, { useState, useRef, useEffect } from 'react';
import {
  X, Maximize2, Minimize2, RotateCcw, ExternalLink,
  Smartphone, Monitor, Code2, Eye,
} from 'lucide-react';

// Map bare module specifiers to CDN URLs
const CDN_MAP = {
  'three':        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'gsap':         'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js',
  'anime':        'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js',
  'p5':           'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js',
  'chart.js':     'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'd3':           'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
  'tone':         'https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js',
  'lodash':       'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js',
  'axios':        'https://cdnjs.cloudflare.com/ajax/libs/axios/1.6.2/axios.min.js',
  'dayjs':        'https://cdnjs.cloudflare.com/ajax/libs/dayjs/1.11.10/dayjs.min.js',
  'confetti':     'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js',
  'matter-js':    'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js',
  'pixi.js':      'https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.2/pixi.min.js',
  'fabric':       'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js',
  'socket.io':    'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.2/socket.io.min.js',
  'marked':       'https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js',
  'highlight.js': 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  'rxjs':         'https://cdnjs.cloudflare.com/ajax/libs/rxjs/7.8.1/rxjs.umd.min.js',
  'mathjs':       'https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.0/math.min.js',
  'tensorflow':   'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.15.0/dist/tf.min.js',
  'ml5':          'https://unpkg.com/ml5@latest/dist/ml5.min.js',
  'babylon':      'https://cdn.babylonjs.com/babylon.js',
  'aframe':       'https://aframe.io/releases/1.4.0/aframe.min.js',
  'tweakpane':    'https://cdn.jsdelivr.net/npm/tweakpane@4.0.3/dist/tweakpane.min.js',
};

function processHtml(html) {
  let out = html;

  // 1. Add viewport if missing
  if (!out.includes('name="viewport"')) {
    out = out.includes('<head>')
      ? out.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">')
      : out;
  }

  // 2. Find all CDN scripts needed (from bare imports OR detected globals)
  const injectedCdns = new Set();
  const cdnScripts = [];

  const addCdn = (pkg) => {
    const basePkg = pkg.split('/')[0];
    const cdnUrl = CDN_MAP[basePkg] || CDN_MAP[pkg];
    if (cdnUrl && !injectedCdns.has(cdnUrl)) {
      injectedCdns.add(cdnUrl);
      cdnScripts.push(cdnUrl);
    }
  };

  // Detect bare imports
  out = out.replace(
    /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^./][^'"]*)['"]/g,
    (match, pkg) => { addCdn(pkg); return \`/* CDN: \${pkg} */\`; }
  );
  out = out.replace(
    /(?:const|let|var)\s+\w+\s*=\s*require\(['"]([^'"]+)['"]\)/g,
    (match, pkg) => { addCdn(pkg); return \`/* CDN: \${pkg} */\`; }
  );

  // Auto-detect globals used in code
  Object.entries(CDN_MAP).forEach(([pkg, url]) => {
    const globalName = pkg === 'three' ? 'THREE' :
                       pkg === 'chart.js' ? 'Chart' :
                       pkg === 'matter-js' ? 'Matter' :
                       pkg === 'pixi.js' ? 'PIXI' :
                       pkg.charAt(0).toUpperCase() + pkg.slice(1);
    if (out.includes(globalName + '.') && !injectedCdns.has(url)) {
      injectedCdns.add(url);
      cdnScripts.push(url);
    }
  });

  // 3. Error catcher
  const errorScript = \`<script>
window.onerror = function(msg, url, line, col, err) {
  parent.postMessage({ type: 'previewError', message: msg, line: line }, '*');
  return false;
};
window.addEventListener('unhandledrejection', function(e) {
  parent.postMessage({ type: 'previewError', message: e.reason?.message || String(e.reason), line: 0 }, '*');
});
<\/script>\`;

  // 4. Build script loader that waits for ALL CDN scripts before running inline code
  // This is the key fix — scripts load sequentially, then deferred inline scripts run
  let injectBlock;
  if (cdnScripts.length > 0) {
    const scriptUrls = JSON.stringify(cdnScripts);
    injectBlock = \`\${errorScript}
<script>
(function() {
  var urls = \${scriptUrls};
  var loaded = 0;
  function loadNext(i) {
    if (i >= urls.length) {
      // All CDN scripts loaded — now run deferred inline scripts
      document.querySelectorAll('script[data-defer]').forEach(function(s) {
        var fn = new Function(s.textContent);
        try { fn(); } catch(e) { 
          parent.postMessage({ type: 'previewError', message: e.message, line: 0 }, '*');
        }
      });
      return;
    }
    var s = document.createElement('script');
    s.src = urls[i];
    s.onload = function() { loadNext(i + 1); };
    s.onerror = function() { 
      console.warn('CDN load failed:', urls[i]); 
      loadNext(i + 1); 
    };
    document.head.appendChild(s);
  }
  loadNext(0);
})();
<\/script>\`;

    // Mark all inline scripts as deferred so they run after CDN loads
    out = out.replace(/<script(?![^>]*src=)(?![^>]*data-defer)([^>]*)>/g, '<script data-defer$1>');
  } else {
    injectBlock = errorScript;
  }

  if (out.includes('</head>')) {
    out = out.replace('</head>', injectBlock + '\n</head>');
  } else if (out.includes('<body')) {
    out = out.replace(/<body[^>]*>/, (m) => m + '\n' + injectBlock);
  } else {
    out = injectBlock + '\n' + out;
  }

  return out;
}

export default function HtmlPreview({ html, title, onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState('preview');
  const [deviceFrame, setDeviceFrame] = useState('mobile');
  const [error, setError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!html) return;
    // Revoke old blob
    setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });

    const processed = processHtml(html);
    const blob = new Blob([processed], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    setError(null);

    return () => URL.revokeObjectURL(url);
  }, [html, refreshKey]);

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'previewError') {
        setError(`JS Error${e.data.line ? ` (line ${e.data.line})` : ''}: ${e.data.message}`);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const openExternal = () => { if (blobUrl) window.open(blobUrl, '_blank'); };

  if (!html) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-void-950 safe-top safe-bottom">
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
            <button onClick={() => setViewMode('preview')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'preview' ? 'bg-neon-green/10 text-neon-green' : 'text-steel-500'}`}>
              <Eye size={13} />
            </button>
            <button onClick={() => setViewMode('code')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'code' ? 'bg-neon-cyan/10 text-neon-cyan' : 'text-steel-500'}`}>
              <Code2 size={13} />
            </button>
          </div>

          {/* Device frame */}
          {viewMode === 'preview' && (
            <div className="flex bg-white/[0.03] rounded-lg border border-white/[0.06] p-0.5">
              <button onClick={() => setDeviceFrame('mobile')}
                className={`p-1.5 rounded-md transition-colors ${deviceFrame === 'mobile' ? 'bg-neon-amber/10 text-neon-amber' : 'text-steel-500'}`}>
                <Smartphone size={13} />
              </button>
              <button onClick={() => setDeviceFrame('desktop')}
                className={`p-1.5 rounded-md transition-colors ${deviceFrame === 'desktop' ? 'bg-neon-amber/10 text-neon-amber' : 'text-steel-500'}`}>
                <Monitor size={13} />
              </button>
            </div>
          )}

          <button onClick={() => { setRefreshKey(k => k + 1); setError(null); }}
            className="p-1.5 rounded hover:bg-white/5 active:scale-90" title="Refresh">
            <RotateCcw size={13} className="text-steel-400" />
          </button>
          <button onClick={openExternal}
            className="p-1.5 rounded hover:bg-white/5 active:scale-90" title="Open in new tab">
            <ExternalLink size={13} className="text-steel-400" />
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            {isFullscreen ? <Minimize2 size={13} className="text-steel-400" /> : <Maximize2 size={13} className="text-steel-400" />}
          </button>
        </div>
      </div>

      {/* Error bar */}
      {error && (
        <div className="px-3 py-1.5 bg-neon-pink/5 border-b border-neon-pink/15 shrink-0 flex items-center justify-between">
          <p className="text-[10px] font-mono text-neon-pink/80 truncate">{error}</p>
          <button onClick={() => setError(null)} className="ml-2 text-neon-pink/50 hover:text-neon-pink shrink-0">
            <X size={10} />
          </button>
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
                sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin allow-pointer-lock"
                className="w-full h-full bg-white border-0"
                title="HTML Preview"
                allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone"
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
