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

// CDN map for bare imports
const CDN_MAP = {
  'three':        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'gsap':         'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js',
  'anime':        'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js',
  'p5':           'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js',
  'chart.js':     'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'd3':           'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
  'tone':         'https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js',
  'lodash':       'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js',
  'matter-js':    'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js',
  'pixi.js':      'https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.2/pixi.min.js',
  'fabric':       'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js',
  'marked':       'https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js',
  'confetti':     'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js',
  'socket.io':    'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.2/socket.io.min.js',
  'rxjs':         'https://cdnjs.cloudflare.com/ajax/libs/rxjs/7.8.1/rxjs.umd.min.js',
  'mathjs':       'https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.0/math.min.js',
  'tensorflow':   'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.15.0/dist/tf.min.js',
  'ml5':          'https://unpkg.com/ml5@latest/dist/ml5.min.js',
};

// Detect if JS code uses a known 3D/canvas/animation library
function detectLibraries(code) {
  const detected = [];
  const checks = {
    'THREE':     'three',
    'GSAP':      'gsap',
    'gsap':      'gsap',
    'anime(':    'anime',
    'p5(':       'p5',
    'Chart(':    'chart.js',
    'd3.':       'd3',
    'Tone.':     'tone',
    'Matter.':   'matter-js',
    'PIXI.':     'pixi.js',
    'fabric.':   'fabric',
    'marked(':   'marked',
    'confetti(': 'confetti',
    'math.':     'mathjs',
    'tf.':       'tensorflow',
    'ml5.':      'ml5',
  };
  for (const [token, lib] of Object.entries(checks)) {
    if (code.includes(token)) detected.push(lib);
  }
  return [...new Set(detected)];
}

// Wrap JS/CSS in a runnable HTML doc
function wrapForPreview(code, language, filename) {
  const lang = (language || '').toLowerCase();

  // Already HTML
  if (['html', 'xml'].includes(lang)) {
    if (code.includes('<html') || code.includes('<!DOCTYPE') || code.includes('<!doctype')) return code;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${filename || 'Preview'}</title>
</head>
<body style="margin:0;background:#000;">
${code}
</body>
</html>`;
  }

  // SVG
  if (lang === 'svg' || code.trim().startsWith('<svg')) {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#111;}</style>
</head><body>${code}</body></html>`;
  }

  // CSS — show a demo page
  if (['css', 'scss'].includes(lang)) {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body { margin: 0; background: #0a0a0f; color: #e0e0e0; font-family: sans-serif; padding: 20px; }
h1,h2,h3,p,button,a,.box,.card,.btn { display: inline-block; margin: 8px; }
</style>
<style>${code}</style>
</head><body>
<h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3>
<p>A paragraph of text with <a href="#">a link</a>.</p>
<button class="btn">Button</button>
<button class="btn btn-primary">Primary</button>
<div class="box card" style="padding:16px">A card / box element</div>
<div class="container" style="max-width:600px;margin:20px auto">
  <div class="row"><div class="col">Column 1</div><div class="col">Column 2</div></div>
</div>
</body></html>`;
  }

  // JavaScript / TypeScript — detect libraries and wrap
  if (['javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx'].includes(lang)) {
    const libs = detectLibraries(code);
    const cdnScripts = libs
      .map(lib => CDN_MAP[lib])
      .filter(Boolean)
      .map(url => `<script src="${url}"></script>`)
      .join('\n');

    // Detect if it needs a canvas
    const needsCanvas = code.includes('canvas') || code.includes('Canvas') ||
                        code.includes('THREE') || code.includes('WebGL') ||
                        code.includes('getContext') || code.includes('PIXI');

    const needsFullscreen = code.includes('THREE') || code.includes('PIXI') ||
                             code.includes('fullscreen') || code.includes('renderer');

    const bodyStyle = needsFullscreen
      ? 'margin:0;overflow:hidden;background:#000;width:100vw;height:100vh;'
      : 'margin:0;background:#0a0a0f;color:#e8e8e8;font-family:monospace;padding:16px;';

    const canvasHtml = needsCanvas
      ? `<canvas id="canvas" style="display:block;width:100%;height:100vh;"></canvas>`
      : `<div id="app" style="padding:16px;"></div>`;

    // Strip ES module syntax that breaks inline scripts
    let processedCode = code
      .replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '// (import removed — using CDN)')
      .replace(/^export\s+default\s+/gm, 'const __default__ = ')
      .replace(/^export\s+/gm, '');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${filename || 'Preview'}</title>
<style>body { ${bodyStyle} } canvas { display: block; }</style>
${cdnScripts}
</head>
<body>
${canvasHtml}
<script>
// Auto-resize canvas helper
const canvas = document.getElementById('canvas');
if (canvas) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}
try {
${processedCode}
} catch(e) {
  document.body.innerHTML = '<div style="color:#ff6b6b;padding:20px;font-family:monospace;background:#1a0a0a;height:100vh;box-sizing:border-box"><h3>Runtime Error</h3><pre>' + e.message + '</pre></div>';
}
<\/script>
</body>
</html>`;
  }

  // Fallback — show as text
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{margin:0;background:#0a0a0f;color:#ccc;font-family:monospace;padding:20px;}</style>
</head><body><pre>${code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`;
}

// Determine if a code block is previewable
function isPreviewable(language, code) {
  const lang = (language || '').toLowerCase();
  if (['html', 'xml', 'svg', 'css', 'scss'].includes(lang)) return true;
  if (['javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx'].includes(lang)) return true;
  if (lang === 'plaintext' && (code.includes('<html') || code.includes('<!DOCTYPE'))) return true;
  return false;
}

function getPreviewLabel(language) {
  const lang = (language || '').toLowerCase();
  if (['javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx'].includes(lang)) return 'Run';
  if (['css', 'scss'].includes(lang)) return 'Demo';
  return 'Preview';
}

export default function CodeBlock({ code, language = 'plaintext', filename, onInject, onPreview, projectOpen }) {
  const codeRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [showInjectMenu, setShowInjectMenu] = useState(false);
  const [injectPath, setInjectPath] = useState(filename || '');
  const [injected, setInjected] = useState(false);

  const canPreview = isPreviewable(language, code);

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
    try { await navigator.clipboard.writeText(code); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = code; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePreview = () => {
    const html = wrapForPreview(code, language, filename);
    onPreview?.(html, filename || `preview.${language || 'html'}`);
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
  const previewLabel = getPreviewLabel(language);
  const libs = ['javascript','js','jsx','ts','tsx'].includes((language||'').toLowerCase())
    ? detectLibraries(code) : [];

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-white/[0.06] bg-[#06060e]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] border-b border-white/[0.04]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono text-neon-cyan/70 uppercase tracking-wider shrink-0">
            {language}
          </span>
          {filename && (
            <span className="text-[10px] font-mono text-steel-500 truncate">→ {filename}</span>
          )}
          <span className="text-[10px] font-mono text-steel-600 shrink-0">{lineCount}L</span>
          {/* Library badges */}
          {libs.slice(0, 2).map(lib => (
            <span key={lib} className="text-[9px] font-mono text-neon-purple/70 bg-neon-purple/10 px-1 py-0.5 rounded shrink-0">
              {lib}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Preview/Run button */}
          {canPreview && (
            <button
              onClick={handlePreview}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-neon-green/10 active:scale-90 transition-all"
              title={`${previewLabel} code`}
            >
              <Eye size={12} className="text-neon-green" />
              <span className="text-[9px] font-mono text-neon-green">{previewLabel}</span>
            </button>
          )}

          {/* Copy */}
          <button onClick={handleCopy}
            className="p-1.5 rounded hover:bg-white/5 active:scale-90 transition-all" title="Copy">
            {copied ? <Check size={13} className="text-neon-green" /> : <Copy size={13} className="text-steel-400" />}
          </button>

          {/* Inject */}
          {projectOpen && (
            <button
              onClick={() => { if (filename && !showInjectMenu) handleInject(); else setShowInjectMenu(!showInjectMenu); }}
              className={`p-1.5 rounded transition-all active:scale-90 ${injected ? 'bg-neon-green/10' : 'hover:bg-white/5'}`}
              title="Save to project"
            >
              {injected ? <Check size={13} className="text-neon-green" /> : <FileDown size={13} className="text-neon-amber/70" />}
            </button>
          )}
        </div>
      </div>

      {/* Inject input */}
      {showInjectMenu && (
        <div className="flex items-center gap-2 px-3 py-2 bg-neon-green/[0.03] border-b border-neon-green/10">
          <span className="text-[10px] text-steel-400 shrink-0">Path:</span>
          <input type="text" value={injectPath} onChange={e => setInjectPath(e.target.value)}
            placeholder="src/component.jsx"
            className="flex-1 bg-transparent border-b border-white/10 text-xs font-mono text-steel-200 py-1 px-1 focus:outline-none focus:border-neon-green/40 placeholder:text-steel-600 caret-neon-green"
            autoFocus onKeyDown={e => e.key === 'Enter' && handleInject()} />
          <button onClick={handleInject} className="text-[10px] font-mono text-neon-green bg-neon-green/10 px-2 py-1 rounded active:scale-95">
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
