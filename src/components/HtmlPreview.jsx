import React, { useEffect, useRef } from 'react';
import { X, RefreshCw, ExternalLink, Maximize2 } from 'lucide-react';

export default function HtmlPreview({ html, title, onClose }) {
  const iframeRef = useRef(null);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;

    if (iframeRef.current) {
      iframeRef.current.src = url;
    }

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, [html]);

  const handleRefresh = () => {
    if (iframeRef.current && blobUrlRef.current) {
      iframeRef.current.src = blobUrlRef.current;
    };
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

      {/* Full Screen Preview */}
      <div className="flex-1 relative bg-[#0a0a0f]">
        <iframe
          ref={iframeRef}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads"
          title="HTML Preview"
        />
      </div>
    </div>
  );
}
