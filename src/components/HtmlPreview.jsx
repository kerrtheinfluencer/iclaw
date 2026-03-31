import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, FileCode, Monitor, Code } from 'lucide-react';

export default function HtmlPreview({ files, onClose }) {
  const iframeRef = useRef(null);
  const [activeTab, setActiveTab] = useState('preview');
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!files || !Array.isArray(files) || files.length === 0) {
      setError('No files to preview');
      return;
    }

    setError(null);
    
    // Find HTML file
    const htmlFile = files.find(f => f.type === 'html' || f.name.endsWith('.html'));
    if (!htmlFile) {
      setError('No HTML file found');
      return;
    }

    // Build virtual file system
    const fileMap = {};
    files.forEach(file => {
      const blob = new Blob([file.content], { 
        type: file.type === 'css' ? 'text/css' : 
              file.type === 'javascript' ? 'application/javascript' : 
              'text/html' 
      });
      fileMap[file.name] = URL.createObjectURL(blob);
    });

    // Process HTML to replace references
    let processedHtml = htmlFile.content;
    
    // Replace CSS links
    files.filter(f => f.type === 'css').forEach(cssFile => {
      const regex = new RegExp(`href=["']${cssFile.name}["']`, 'g');
      processedHtml = processedHtml.replace(regex, `href="${fileMap[cssFile.name]}"`);
    });
    
    // Replace JS scripts
    files.filter(f => f.type === 'javascript').forEach(jsFile => {
      const regex = new RegExp(`src=["']${jsFile.name}["']`, 'g');
      processedHtml = processedHtml.replace(regex, `src="${fileMap[jsFile.name]}"`);
    });

    // Ensure proper HTML structure
    if (!processedHtml.includes('<!DOCTYPE')) {
      processedHtml = `<!DOCTYPE html>\n${processedHtml}`;
    }

    // Create final blob
    const finalBlob = new Blob([processedHtml], { type: 'text/html' });
    const finalUrl = URL.createObjectURL(finalBlob);

    if (iframeRef.current) {
      iframeRef.current.src = finalUrl;
    }

    // Cleanup function
    return () => {
      Object.values(fileMap).forEach(url => URL.revokeObjectURL(url));
      URL.revokeObjectURL(finalUrl);
    };
  }, [files]);

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#0a0a0f] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 bg-[#0f0f16] border-b border-[#333]">
          <h3 className="text-[#e0e0e0] font-medium">Preview Error</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#333] rounded">
            <X className="w-5 h-5 text-[#666]" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-red-400">
          <div className="text-center">
            <p>{error}</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 bg-[#333] rounded text-[#e0e0e0]">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const htmlFile = files?.find(f => f.type === 'html' || f.name.endsWith('.html'));
  const otherFiles = files?.filter(f => f !== htmlFile) || [];

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
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-[#00ff88]" />
            <h3 className="text-[#e0e0e0] font-medium">Canvas Preview</h3>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-2 rounded-lg text-sm ${activeTab === 'preview' ? 'bg-[#00ff88] text-[#0a0a0f]' : 'text-[#666] hover:bg-[#333]'}`}
          >
            Preview
          </button>
          <button 
            onClick={() => setActiveTab('code')}
            className={`px-3 py-2 rounded-lg text-sm ${activeTab === 'code' ? 'bg-[#00ff88] text-[#0a0a0f]' : 'text-[#666] hover:bg-[#333]'}`}
          >
            Code
          </button>
          <div className="w-px h-6 bg-[#333] mx-2" />
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
            Close
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'preview' ? (
        <div className="flex-1 relative bg-[#0a0a0f]">
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
            style={{ background: '#ffffff' }}
            title="Canvas Preview"
          />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* File List */}
          <div className="w-48 bg-[#0f0f16] border-r border-[#333] overflow-y-auto">
            <div className="p-3 text-xs text-[#666] uppercase font-semibold">Files</div>
            {files?.map((file, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-4 py-3 text-sm hover:bg-[#1a1a24] border-b border-[#333] ${selectedFile === file ? 'bg-[#1a1a24] text-[#00ff88]' : 'text-[#e0e0e0]'}`}
              >
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4" />
                  <span className="truncate">{file.name}</span>
                </div>
              </button>
            ))}
          </div>
          
          {/* Code View */}
          <div className="flex-1 bg-[#0a0a0f] overflow-auto">
            {selectedFile ? (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[#e0e0e0] font-medium">{selectedFile.name}</h4>
                  <span className="text-xs text-[#666]">{selectedFile.content.length} chars</span>
                </div>
                <pre className="text-sm font-mono text-[#00ff88] whitespace-pre-wrap">
                  {selectedFile.content}
                </pre>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-[#666]">
                <div className="text-center">
                  <Code className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Select a file to view code</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
