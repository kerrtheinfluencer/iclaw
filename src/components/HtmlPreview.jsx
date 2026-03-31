import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, AlertCircle } from 'lucide-react';

export default function HtmlPreview({ html, title, onClose }) {
  const iframeRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (!html || typeof html !== 'string') {
      setError('No HTML content provided');
      setLoading(false);
      return;
    }

    // Ensure we have complete HTML document
    let fullHtml = html;
    
    // If it's not a complete document, wrap it
    if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
      fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Preview'}</title>
  <style>
    body { 
      margin: 0; 
      padding: 20px; 
      font-family: system-ui, -apple-system, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
    }
    canvas { display: block; margin: 0 auto; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
    }

    try {
      // Create blob and URL
      const blob = new Blob([fullHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      // Set iframe src
      if (iframeRef.current) {
        iframeRef.current.src = url;
        
        // Cleanup previous URL after a delay
        setTimeout(() => {
          if (url) URL.revokeObjectURL(url);
        }, 1000);
      }

      setLoading(false);
    } catch (err) {
      setError('Failed to create preview: ' + err.message);
      setLoading(false);
    }

    // Cleanup
    return () => {
      setLoading(false);
    };
  }, [html, title]);

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0f0f16] border-b border-[#333]">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-[#333] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#666]" />
          </button>
          <div>
            <h3 className="text-[#e0e0e0] font-medium">{title || 'Preview'}</h3>
            <p className="text-xs text-[#666]">HTML Canvas Mode</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 bg-[#1a1a24] text-[#e0e0e0] rounded-lg hover:bg-[#222] text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-[#00ff88] text-[#0a0a0f] rounded-lg font-medium hover:bg-[#00ff88]/90"
          >
            Close Preview
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative bg-[#0a0a0f]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-[#00ff88] animate-pulse">Loading preview...</div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400">
            <AlertCircle className="w-12 h-12 mb-4" />
            <p>{error}</p>
            <p className="text-sm text-[#666] mt-2">Check console for details</p>
          </div>
        )}

        <iframe
          ref={iframeRef}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
          title="HTML Preview"
          style={{ background: 'white' }}
        />
      </div>
    </div>
  );
}
