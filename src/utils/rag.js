/**
 * iclaw — RAG Engine
 * Local vector search using Orama for context-aware code assistance.
 * Indexes project files and retrieves relevant context for LLM queries.
 */

import { create, insert, search, removeMultiple } from '@orama/orama';

let db = null;
let indexedFiles = new Map(); // path -> { id, lastModified }

/**
 * Initialize the Orama database.
 */
export async function initRAG() {
  db = await create({
    schema: {
      path: 'string',
      filename: 'string',
      content: 'string',
      language: 'string',
      size: 'number',
    },
  });
  return db;
}

/**
 * Detect language from file extension.
 */
function detectLanguage(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', swift: 'swift',
    kt: 'kotlin', php: 'php', css: 'css', scss: 'css',
    html: 'html', json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sql: 'sql', sh: 'shell', toml: 'toml',
    svelte: 'svelte', vue: 'vue', graphql: 'graphql',
  };
  return map[ext] || 'text';
}

/**
 * Index project files into the RAG database.
 * Performs incremental updates based on lastModified.
 */
export async function indexFiles(files) {
  if (!db) await initRAG();

  let added = 0;
  let updated = 0;
  let skipped = 0;

  // Find files to remove (no longer exist)
  const currentPaths = new Set(files.map((f) => f.path));
  const toRemove = [];
  for (const [path, meta] of indexedFiles) {
    if (!currentPaths.has(path)) {
      toRemove.push(meta.id);
      indexedFiles.delete(path);
    }
  }
  if (toRemove.length > 0) {
    await removeMultiple(db, toRemove);
  }

  // Add/update files
  for (const file of files) {
    const existing = indexedFiles.get(file.path);

    if (existing && existing.lastModified === file.lastModified) {
      skipped++;
      continue;
    }

    // Remove old version if updating
    if (existing) {
      await removeMultiple(db, [existing.id]);
      updated++;
    } else {
      added++;
    }

    const id = await insert(db, {
      path: file.path,
      filename: file.name,
      content: file.content,
      language: detectLanguage(file.name),
      size: file.size,
    });

    indexedFiles.set(file.path, { id, lastModified: file.lastModified });
  }

  return { added, updated, skipped, removed: toRemove.length, total: indexedFiles.size };
}

/**
 * Search the RAG index for relevant context.
 * Returns the top-k most relevant file chunks.
 */
export async function queryRAG(query, limit = 5) {
  if (!db) return [];

  const results = await search(db, {
    term: query,
    limit,
    boost: {
      filename: 2.0,
      content: 1.0,
      path: 1.5,
    },
  });

  return results.hits.map((hit) => ({
    path: hit.document.path,
    filename: hit.document.filename,
    content: truncateContent(hit.document.content, 1500),
    language: hit.document.language,
    score: hit.score,
  }));
}

/**
 * Truncate content to a max character count, preserving complete lines.
 */
function truncateContent(content, maxChars) {
  if (content.length <= maxChars) return content;
  const truncated = content.substring(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  return (lastNewline > 0 ? truncated.substring(0, lastNewline) : truncated) + '\n// ... truncated';
}

/**
 * Get indexing stats.
 */
export function getRAGStats() {
  return {
    totalFiles: indexedFiles.size,
    files: Array.from(indexedFiles.keys()),
  };
}

/**
 * Clear the entire index.
 */
export async function clearRAG() {
  indexedFiles.clear();
  db = null;
  await initRAG();
}
