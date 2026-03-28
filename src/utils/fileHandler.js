/**
 * iclaw — File Handler
 * Manages the File System Access API for local project directory access
 * and OPFS for high-speed model weight caching.
 */

// ─── File System Access API (Project Workspace) ─────────────────────

let directoryHandle = null;

/**
 * Check if File System Access API is available.
 */
export function isFileSystemSupported() {
  return 'showDirectoryPicker' in window;
}

/**
 * Prompt user to select a project directory.
 * Returns the directory handle or null.
 */
export async function openProjectDirectory() {
  if (!isFileSystemSupported()) {
    throw new Error('File System Access API not supported. Requires Safari 26+ or Chrome.');
  }

  try {
    directoryHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });
    return directoryHandle;
  } catch (err) {
    if (err.name === 'AbortError') return null; // User cancelled
    throw err;
  }
}

/**
 * Get the current directory handle.
 */
export function getDirectoryHandle() {
  return directoryHandle;
}

/**
 * Set directory handle (e.g., from IndexedDB restoration).
 */
export function setDirectoryHandle(handle) {
  directoryHandle = handle;
}

/**
 * Recursively read all files in the project directory.
 * Returns an array of { path, name, content, size, lastModified }.
 * Skips binary files, node_modules, .git, and large files.
 */
export async function indexProjectFiles(handle = directoryHandle, basePath = '') {
  if (!handle) throw new Error('No directory selected.');

  const files = [];
  const skipDirs = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.cache',
    '__pycache__', '.vscode', '.idea', 'vendor', 'coverage',
  ]);
  const textExtensions = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.html', '.json',
    '.md', '.txt', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp',
    '.h', '.hpp', '.sh', '.yaml', '.yml', '.toml', '.env', '.gitignore',
    '.svelte', '.vue', '.php', '.swift', '.kt', '.sql', '.graphql',
    '.prisma', '.dockerfile', '.xml', '.svg', '.ini', '.cfg',
  ]);
  const MAX_FILE_SIZE = 100 * 1024; // 100KB per file max

  async function walk(dirHandle, currentPath) {
    for await (const [name, entry] of dirHandle) {
      const fullPath = currentPath ? `${currentPath}/${name}` : name;

      if (entry.kind === 'directory') {
        if (!skipDirs.has(name) && !name.startsWith('.')) {
          await walk(entry, fullPath);
        }
      } else if (entry.kind === 'file') {
        const ext = '.' + name.split('.').pop().toLowerCase();
        if (!textExtensions.has(ext) && name !== 'Makefile' && name !== 'Dockerfile') continue;

        try {
          const file = await entry.getFile();
          if (file.size > MAX_FILE_SIZE) continue;

          const content = await file.text();
          files.push({
            path: fullPath,
            name,
            content,
            size: file.size,
            lastModified: file.lastModified,
            handle: entry,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  await walk(handle, basePath);
  return files;
}

/**
 * Read a single file by path from the project directory.
 */
export async function readFile(filePath) {
  if (!directoryHandle) throw new Error('No directory selected.');

  const parts = filePath.split('/').filter(Boolean);
  let current = directoryHandle;

  // Navigate to the parent directory
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }

  const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
  const file = await fileHandle.getFile();
  return await file.text();
}

/**
 * Write content to a file in the project directory.
 * Creates the file if it doesn't exist.
 */
export async function writeFile(filePath, content) {
  if (!directoryHandle) throw new Error('No directory selected.');

  const parts = filePath.split('/').filter(Boolean);
  let current = directoryHandle;

  // Create/navigate directories
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i], { create: true });
  }

  const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();

  return true;
}

/**
 * Get the directory tree structure (for sidebar display).
 */
export async function getDirectoryTree(handle = directoryHandle, depth = 0, maxDepth = 4) {
  if (!handle || depth > maxDepth) return [];

  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache']);
  const tree = [];

  for await (const [name, entry] of handle) {
    if (name.startsWith('.') && depth === 0 && name !== '.env') continue;

    const node = {
      name,
      kind: entry.kind,
      children: [],
    };

    if (entry.kind === 'directory' && !skipDirs.has(name)) {
      node.children = await getDirectoryTree(entry, depth + 1, maxDepth);
    }

    tree.push(node);
  }

  // Sort: directories first, then alphabetical
  return tree.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}


// ─── OPFS (Model Weight Storage) ────────────────────────────────────

/**
 * Check if OPFS is available.
 */
export function isOPFSSupported() {
  return 'storage' in navigator && 'getDirectory' in navigator.storage;
}

/**
 * Get storage usage estimate.
 */
export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const est = await navigator.storage.estimate();
  return {
    used: est.usage,
    quota: est.quota,
    usedMB: (est.usage / (1024 * 1024)).toFixed(1),
    quotaMB: (est.quota / (1024 * 1024)).toFixed(0),
    percentUsed: ((est.usage / est.quota) * 100).toFixed(1),
  };
}

/**
 * Request persistent storage (important for model weights).
 */
export async function requestPersistentStorage() {
  if (navigator.storage?.persist) {
    return await navigator.storage.persist();
  }
  return false;
}
