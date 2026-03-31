import React, { useEffect, useRef } from 'react';
import { X, RefreshCw, ExternalLink, Code } from 'lucide-react';

export default function HtmlPreview({ html, title, onClose }) {
  const iframeRef = useRef(null);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    // Create blob URL for the HTML content
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;

    // Set iframe src
    if (iframeRef.current) {
      iframeRef.current.src = url;
    }

    // Cleanup
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, [html]);

  const handleRefresh = () => {
    if (iframeRef.current && blobUrlRef.current) {
      iframeRef.current.src = blobUrlRef.current;
    }
  };

  const handleOpenNewTab = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0f0f16] border-b border-[#333]">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-[#333] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#666]" />
          </button>
          <span className="text-[#e0e0e0] font-mono text-sm truncate max-w-[300px]">
            {title || 'Preview'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleRefresh}
            className="p-2 hover:bg-[#333] rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-[#666]" />
          </button>
          <button 
            onClick={handleOpenNewTab}
            className="p-2 hover:bg-[#333] rounded-lg transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4 text-[#666]" />
          </button>
          <button 
            onClick={onClose}
            className="px-3 py-2 bg-[#333] text-[#e0e0e0] rounded-lg text-sm hover:bg-[#444]"
          >
            Close Preview
          </button>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 relative bg-[#0a0a0f]">
        <iframe
          ref={iframeRef}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
          title="HTML Preview"
        />
      </div>

      {/* Info Bar */}
      <div className="px-4 py-2 bg-[#0f0f16] border-t border-[#333] flex items-center justify-between text-xs text-[#666]">
        <div className="flex items-center gap-2">
          <Code className="w-3 h-3" />
          <span>HTML Preview Mode</span>
        </div>
        <span>Auto-refreshes on code update</span>
      </div>
    </div>
  );
}
