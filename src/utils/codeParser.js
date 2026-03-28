/**
 * iclaw — Code Parser
 * Extracts code blocks from markdown-style AI responses
 * and provides syntax highlighting helpers.
 */

/**
 * Parse AI response into segments of text and code blocks.
 */
export function parseResponse(text) {
  const segments = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index).trim();
      if (textContent) {
        segments.push({ type: 'text', content: textContent });
      }
    }

    // Code block
    const language = match[1] || 'plaintext';
    const code = match[2].trim();

    // Try to detect target filename from first comment line
    const filename = extractFilename(code, language);

    segments.push({
      type: 'code',
      language,
      content: code,
      filename,
    });

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) {
      segments.push({ type: 'text', content: remaining });
    }
  }

  return segments;
}

/**
 * Extract a target filename from the first line comment in code.
 */
function extractFilename(code, language) {
  const firstLine = code.split('\n')[0];

  // Match common comment patterns: // filename.ext, # filename.ext, /* filename.ext */
  const patterns = [
    /^\/\/\s*(.+\.\w+)/,
    /^#\s*(.+\.\w+)/,
    /^\/\*\s*(.+\.\w+)\s*\*\//,
    /^<!--\s*(.+\.\w+)\s*-->/,
    /^--\s*(.+\.\w+)/,
  ];

  for (const pattern of patterns) {
    const m = firstLine.match(pattern);
    if (m) return m[1].trim();
  }

  // Suggest filename from language
  const defaultExt = {
    javascript: 'script.js',
    jsx: 'component.jsx',
    typescript: 'script.ts',
    tsx: 'component.tsx',
    python: 'script.py',
    html: 'index.html',
    css: 'styles.css',
    json: 'data.json',
    shell: 'script.sh',
    bash: 'script.sh',
    rust: 'main.rs',
    go: 'main.go',
    swift: 'main.swift',
  };

  return defaultExt[language] || null;
}

/**
 * Get language-specific file extension.
 */
export function langToExt(language) {
  const map = {
    javascript: '.js', jsx: '.jsx', typescript: '.ts', tsx: '.tsx',
    python: '.py', ruby: '.rb', go: '.go', rust: '.rs',
    java: '.java', c: '.c', cpp: '.cpp', swift: '.swift',
    kotlin: '.kt', php: '.php', css: '.css', scss: '.scss',
    html: '.html', json: '.json', yaml: '.yml', toml: '.toml',
    sql: '.sql', shell: '.sh', bash: '.sh', markdown: '.md',
  };
  return map[language] || '.txt';
}

/**
 * Generate a unique ID.
 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
