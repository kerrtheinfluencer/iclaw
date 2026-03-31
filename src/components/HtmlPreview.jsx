import React, { useState, useEffect } from 'react';
import {
  X, Maximize2, Minimize2, RotateCcw, ExternalLink,
  Smartphone, Monitor, Code2, Eye,
} from 'lucide-react';

const CDN_MAP = {
  'three':        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'gsap':         'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js',
  'anime':        'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js',
  'p5':           'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js',
  'chart.js':     'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'd3':           'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
  'tone':         'https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js',
  'matter-js':    'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js',
  'pixi.js':      'https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.2/pixi.min.js',
  'confetti':     'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js',
  'marked':       'https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js',
};

const GLOBAL_TO_CDN = {
  'THREE':   'three',
  'gsap':    'gsap',
  'anime':   'anime',
  'Chart':   'chart.js',
  'Matter':  'matter-js',
  'PIXI':    'pixi.js',
  'BABYLON': 'babylon',
  'p5':      'p5',
};

// NEW: Inject CSS and JS from files object into HTML
function injectFilesIntoHtml(html, files) {
  if (!files || Object.keys(files).length === 0) return html;
  
  let processed = html;
  
  // Inject styles.css if present
  if (files['styles.css']) {
    const styleBlock = `<style>\n/* Injected from styles.css */\n${files['styles.css']}\n</style>`;
    if (processed.includes('</head>')) {
      processed = processed.replace('</head>', `${styleBlock}\n</head>`);
    } else if (processed.includes('<head>')) {
      processed = processed.replace('<head>', `<head>\n${styleBlock}`);
    } else if (processed.includes('<html')) {
      processed = processed.replace('<html', `<head>${styleBlock}</head><html`);
    } else {
      processed = styleBlock + processed;
    }
  }
  
  // Inject script.js if present
  if (files['script.js']) {
    const scriptBlock = `<script>\n// Injected from script.js\n${files['script.js']}\n</script>`;
    if (processed.includes('</body>')) {
      processed = processed.replace('</body>', `${scriptBlock}\n</body>`);
    } else if (processed.includes('<body>')) {
      processed = processed.replace('<body>', `<body>\n${scriptBlock}`);
    } else if (processed.includes('</html>')) {
      processed = processed.replace('</html>', `${scriptBlock}\n</html>`);
    } else {
      processed = processed + scriptBlock;
    }
  }
  
  // Handle other CSS files (e.g., app.css, main.css)
  Object.entries(files).forEach(([filename, content]) => {
    if (filename.endsWith('.css') && filename !== 'styles.css') {
      const styleBlock = `<style data-file="${filename}">\n/* Injected from ${filename} */\n${content}\n</style>`;
      if (processed.includes('</head>')) {
        processed = processed.replace('</head>', `${styleBlock}\n</head>`);
      }
    }
    if (filename.endsWith('.js') && filename !== 'script.js') {
      const scriptBlock = `<script data-file="${filename}">\n// Injected from ${filename}\n${content}\n</script>`;
      if (processed.includes('</body>')) {
        processed = processed.replace('</body>', `${scriptBlock}\n</body>`);
      } else if (processed.includes('</html>')) {
        processed = processed.replace('</html>', `${scriptBlock}\n</html>`);
      }
    }
  });
  
  return processed;
}

function processHtml(html, files) {
  // NEW: First inject CSS/JS from files
  let out = files ? injectFilesIntoHtml(html, files) : html;

  // Add viewport if missing
  if (!out.includes('name="viewport"') && out.includes('<head>')) {
    out = out.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  }

  // Collect needed CDN URLs
  const cdnUrls = [];
  const seen = new Set();
  function addCdn(key) {
    const url = CDN_MAP[key];
    if (url && !seen.has(url)) { seen.add(url); cdnUrls.push(url); }
  }

  // Rewrite bare ES imports to comments + collect CDN
  out = out.replace(/import\s+(?:[\w*{}\s,]+\s+from\s+)?['"]([^./][^'"]*)['"]/g, (match, pkg) => {
    addCdn(pkg.split('/')[0]);
    addCdn(pkg);
    return '/* CDN loaded: ' + pkg + ' */';
  });

  // require()
  out = out.replace(/(?:const|let|var)\s+\w+\s*=\s*require\(['"]([^'"]+)['"]\)/g, (match, pkg) => {
    addCdn(pkg.split('/')[0]);
    addCdn(pkg);
    return '/* CDN loaded: ' + pkg + ' */';
  });

  // Auto-detect globals
  Object.entries(GLOBAL_TO_CDN).forEach(function(entry) {
    var globalName = entry[0], cdnKey = entry[1];
    if (out.indexOf(globalName + '.') !== -1 || out.indexOf(globalName + '(') !== -1) {
      addCdn(cdnKey);
    }
  });

  // Error catcher — always inject
  var errorScript = '<script>\n' +
    'window.onerror = function(m,u,l) { parent.postMessage({type:"previewError",message:m,line:l},"*"); return false; };\n' +
    'window.addEventListener("unhandledrejection", function(e) { parent.postMessage({type:"previewError",message:e.reason&&e.reason.message||String(e.reason),line:0},"*"); });\n' +
    '</script>';

  if (cdnUrls.length === 0) {
    // No CDN needed — just inject error catcher and return as-is
    if (out.includes('</head>')) {
      out = out.replace('</head>', errorScript + '\n</head>');
    } else {
      out = errorScript + '\n' + out;
    }
    return out;
  }

  // Has CDN deps — inject a loader script that:
  // 1. Loads CDN scripts sequentially
  // 2. Then re-runs all inline scripts that were collected
  // Strategy: collect inline script contents, remove them, load CDNs, then eval inline scripts
  var inlineScripts = [];
  out = out.replace(/<script(?![^>]*src=)([^>]*)>([\s\S]*?)<\/script>/gi, function(match, attrs, content) {
    if (content.trim()) {
      inlineScripts.push(content);
      return '<!-- inline script deferred -->';
    }
    return match;
  });

  var escapedScripts = JSON.stringify(inlineScripts);
  var urlsJson = JSON.stringify(cdnUrls);

  var loaderScript = '<script>\n' +
    '(function() {\n' +
    '  var cdnUrls = ' + urlsJson + ';\n' +
    '  var inlineScripts = ' + escapedScripts + ';\n' +
    '  function runInline() {\n' +
    '    inlineScripts.forEach(function(code) {\n' +
    '      try {\n' +
    '        var s = document.createElement("script");\n' +
    '        s.textContent = code;\n' +
    '        document.head.appendChild(s);\n' +
    '      } catch(e) {\n' +
    '        parent.postMessage({type:"previewError",message:e.message,line:0},"*");\n' +
    '      }\n' +
    '    });\n' +
    '  }\n' +
    '  function loadNext(i) {\n' +
    '    if (i >= cdnUrls.length) { runInline(); return; }\n' +
    '    var s = document.createElement("script");\n' +
    '    s.src = cdnUrls[i];\n' +
    '    s.onload = function() { loadNext(i + 1); };\n' +
    '    s.onerror = function() { console.warn("CDN failed:", cdnUrls[i]); loadNext(i + 1); };\n' +
    '    document.head.appendChild(s);\n' +
    '  }\n' +
    '  if (document.readyState === "loading") {\n' +
    '    document.addEventListener("DOMContentLoaded", function() { loadNext(0); });\n' +
    '  } else {\n' +
    '    loadNext(0);\n' +
    '  }\n' +
    '})();\n' +
    '</script>';

  var injectBlock = errorScript + '\n' + loaderScript;

  if (out.includes('</head>')) {
    out = out.replace('</head>', injectBlock + '\n</head>');
  } else if (out.match(/<body[^>]*>/)) {
    out = out.replace(/<body[^>]*>/, function(m) { return m + '\n' + injectBlock; });
  } else {
    out = injectBlock + '\n' + out;
  }

  return out;
}

// NEW: Accept files prop
export default function HtmlPreview({ html, title, files, onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState('preview');
  const [deviceFrame, setDeviceFrame] = useState('mobile');
  const [error, setError] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!html) return;
    setBlobUrl(function(prev) { if (prev) URL.revokeObjectURL(prev); return null; });
    // NEW: Pass files to processHtml
    var processed = processHtml(html, files);
    var blob = new Blob([processed], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    setBlobUrl(url);
    setError(null);
    return function() { URL.revokeObjectURL(url); };
  }, [html, files, refreshKey]); // NEW: Added files to dependency array

  useEffect(() => {
    var handler = function(e) {
      if (e.data && e.data.type === 'previewError') {
        setError('JS Error' + (e.data.line ? ' (line ' + e.data.line + ')' : '') + ': ' + e.data.message);
      }
    };
    window.addEventListener('message', handler);
    return function() { window.removeEventListener('message', handler); };
  }, []);

  if (!html) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-void-950 safe-top safe-bottom">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 glass-panel shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            <X size={16} className="text-steel-400" />
          </button>
          <span className="text-xs font-mono text-steel-200 truncate max-w-[150px]">{title || 'Preview'}</span>
          {/* NEW: Show file count indicator */}
          {files && Object.keys(files).length > 0 && (
            <span className="text-[10px] bg-neon-green/10 text-neon-green px-1.5 py-0.5 rounded">
              {Object.keys(files).length} files
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="flex bg-white/[0.03] rounded-lg border border-white/[0.06] p-0.5">
            <button onClick={() => setViewMode('preview')}
              className={'p-1.5 rounded-md transition-colors ' + (viewMode === 'preview' ? 'bg-neon-green/10 text-neon-green' : 'text-steel-500')}>
              <Eye size={13} />
            </button>
            <button onClick={() => setViewMode('code')}
              className={'p-1.5 rounded-md transition-colors ' + (viewMode === 'code' ? 'bg-neon-cyan/10 text-neon-cyan' : 'text-steel-500')}>
              <Code2 size={13} />
            </button>
          </div>
          {viewMode === 'preview' && (
            <div className="flex bg-white/[0.03] rounded-lg border border-white/[0.06] p-0.5">
              <button onClick={() => setDeviceFrame('mobile')}
                className={'p-1.5 rounded-md transition-colors ' + (deviceFrame === 'mobile' ? 'bg-neon-amber/10 text-neon-amber' : 'text-steel-500')}>
                <Smartphone size={13} />
              </button>
              <button onClick={() => setDeviceFrame('desktop')}
                className={'p-1.5 rounded-md transition-colors ' + (deviceFrame === 'desktop' ? 'bg-neon-amber/10 text-neon-amber' : 'text-steel-500')}>
                <Monitor size={13} />
              </button>
            </div>
          )}
          <button onClick={() => { setRefreshKey(function(k) { return k + 1; }); setError(null); }}
            className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            <RotateCcw size={13} className="text-steel-400" />
          </button>
          <button onClick={() => { if (blobUrl) window.open(blobUrl, '_blank'); }}
            className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            <ExternalLink size={13} className="text-steel-400" />
          </button>
          <button onClick={() => setIsFullscreen(function(v) { return !v; })}
            className="p-1.5 rounded hover:bg-white/5 active:scale-90">
            {isFullscreen ? <Minimize2 size={13} className="text-steel-400" /> : <Maximize2 size={13} className="text-steel-400" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-1.5 bg-neon-pink/5 border-b border-neon-pink/15 shrink-0 flex items-center justify-between">
          <p className="text-[10px] font-mono text-neon-pink/80 truncate">{error}</p>
          <button onClick={() => setError(null)} className="ml-2 text-neon-pink/50 shrink-0 p-0.5">
            <X size={10} />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex items-stretch justify-center bg-[#111118] overflow-hidden">
        {viewMode === 'preview' ? (
          <div className={'flex-1 transition-all duration-300 ' + (deviceFrame === 'mobile' ? 'max-w-[430px] border-x border-white/5' : 'w-full')}>
            {blobUrl ? (
              <iframe
                key={String(refreshKey) + blobUrl}
                src={blobUrl}
                sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin allow-pointer-lock"
                className="w-full h-full bg-white border-0"
                title="Preview"
                allow="accelerometer; camera; microphone; gyroscope"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-steel-500 text-xs font-mono">Loading...</p>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full overflow-auto p-4">
            <pre className="text-[12px] font-mono text-steel-200 leading-[1.65] whitespace-pre-wrap break-words">{html}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
