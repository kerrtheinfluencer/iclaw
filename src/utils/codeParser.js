/**
 * iclaw — Code Parser
 * Extracts code blocks from markdown-style AI responses
 * and provides syntax highlighting helpers.
 */

/**
 * Parse AI response into segments of text, code blocks, and thinking blocks.
 */
export function parseResponse(text) {
  const segments = [];

  // First, extract <think> blocks and replace with placeholders
  let processed = text;
  const thinkBlocks = [];
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let thinkMatch;

  while ((thinkMatch = thinkRegex.exec(text)) !== null) {
    const placeholder = `__THINK_${thinkBlocks.length}__`;
    thinkBlocks.push(thinkMatch[1].trim());
    processed = processed.replace(thinkMatch[0], placeholder);
  }

  // Now parse code blocks from the processed text
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      const textContent = processed.slice(lastIndex, match.index).trim();
      if (textContent) {
        pushTextOrThink(segments, textContent, thinkBlocks);
      }
    }

    const language = match[1] || 'plaintext';
    const code = match[2].trim();
    const filename = extractFilename(code, language);

    segments.push({ type: 'code', language, content: code, filename });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < processed.length) {
    const remaining = processed.slice(lastIndex).trim();
    if (remaining) {
      pushTextOrThink(segments, remaining, thinkBlocks);
    }
  }

  return segments;
}

/**
 * Push text segments, replacing think placeholders with thinking blocks.
 */
function pushTextOrThink(segments, text, thinkBlocks) {
  const thinkPlaceholderRegex = /__THINK_(\d+)__/g;

  if (!thinkPlaceholderRegex.test(text)) {
    segments.push({ type: 'text', content: text });
    return;
  }

  // Reset regex
  thinkPlaceholderRegex.lastIndex = 0;
  let lastIdx = 0;
  let m;

  while ((m = thinkPlaceholderRegex.exec(text)) !== null) {
    // Text before placeholder
    if (m.index > lastIdx) {
      const before = text.slice(lastIdx, m.index).trim();
      if (before) segments.push({ type: 'text', content: before });
    }

    // Thinking block
    const blockIndex = parseInt(m[1], 10);
    if (thinkBlocks[blockIndex]) {
      segments.push({ type: 'thinking', content: thinkBlocks[blockIndex] });
    }

    lastIdx = m.index + m[0].length;
  }

  // Text after last placeholder
  if (lastIdx < text.length) {
    const after = text.slice(lastIdx).trim();
    if (after) segments.push({ type: 'text', content: after });
  }
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
