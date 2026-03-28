/**
 * iclaw — Git Handler
 * Local git operations via isomorphic-git.
 * Note: Full git support requires a CORS proxy for remote operations.
 * Local staging and committing work through the File System Access API.
 */

import git from 'isomorphic-git';

// In-memory filesystem adapter for isomorphic-git
// This bridges the File System Access API handles to isomorphic-git's fs interface
class FSAccessAdapter {
  constructor(dirHandle) {
    this.root = dirHandle;
    this._cache = new Map();
  }

  async _resolve(filepath) {
    const parts = filepath.split('/').filter(Boolean);
    let current = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      try {
        current = await current.getDirectoryHandle(parts[i]);
      } catch {
        return null;
      }
    }
    return { dir: current, name: parts[parts.length - 1] || '' };
  }

  async readFile(filepath, opts = {}) {
    const resolved = await this._resolve(filepath);
    if (!resolved) throw new Error(`ENOENT: ${filepath}`);
    const handle = await resolved.dir.getFileHandle(resolved.name);
    const file = await handle.getFile();
    if (opts.encoding === 'utf8') return await file.text();
    return new Uint8Array(await file.arrayBuffer());
  }

  async writeFile(filepath, data) {
    const parts = filepath.split('/').filter(Boolean);
    let current = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i], { create: true });
    }
    const handle = await current.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async unlink(filepath) {
    const resolved = await this._resolve(filepath);
    if (resolved) {
      await resolved.dir.removeEntry(resolved.name);
    }
  }

  async readdir(filepath) {
    const parts = filepath.split('/').filter(Boolean);
    let current = this.root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part);
    }
    const entries = [];
    for await (const [name] of current) {
      entries.push(name);
    }
    return entries;
  }

  async mkdir(filepath) {
    const parts = filepath.split('/').filter(Boolean);
    let current = this.root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }
  }

  async rmdir(filepath) {
    const resolved = await this._resolve(filepath);
    if (resolved) {
      await resolved.dir.removeEntry(resolved.name, { recursive: true });
    }
  }

  async stat(filepath) {
    const resolved = await this._resolve(filepath);
    if (!resolved) throw new Error(`ENOENT: ${filepath}`);

    try {
      const handle = await resolved.dir.getFileHandle(resolved.name);
      const file = await handle.getFile();
      return { type: 'file', size: file.size, mode: 0o100644, isFile: () => true, isDirectory: () => false };
    } catch {
      try {
        await resolved.dir.getDirectoryHandle(resolved.name);
        return { type: 'dir', mode: 0o040000, isFile: () => false, isDirectory: () => true };
      } catch {
        throw new Error(`ENOENT: ${filepath}`);
      }
    }
  }

  async lstat(filepath) {
    return this.stat(filepath);
  }
}

let fs = null;
let dir = '/';

/**
 * Initialize git with a File System Access directory handle.
 */
export function initGit(dirHandle) {
  fs = new FSAccessAdapter(dirHandle);
  dir = '/';
}

/**
 * Get git status of all files.
 */
export async function getStatus() {
  if (!fs) throw new Error('Git not initialized.');

  try {
    const matrix = await git.statusMatrix({ fs, dir });
    return matrix.map(([filepath, head, workdir, stage]) => ({
      filepath,
      status: statusText(head, workdir, stage),
      head,
      workdir,
      stage,
    }));
  } catch (err) {
    console.warn('Git status error:', err);
    return [];
  }
}

function statusText(head, workdir, stage) {
  if (head === 0 && workdir === 2 && stage === 0) return 'new';
  if (head === 1 && workdir === 2 && stage === 1) return 'modified';
  if (head === 1 && workdir === 0 && stage === 0) return 'deleted';
  if (head === 1 && workdir === 2 && stage === 2) return 'staged-modified';
  if (head === 0 && workdir === 2 && stage === 2) return 'staged-new';
  if (head === 1 && workdir === 1 && stage === 1) return 'unmodified';
  return 'unknown';
}

/**
 * Stage a file.
 */
export async function stageFile(filepath) {
  if (!fs) throw new Error('Git not initialized.');
  await git.add({ fs, dir, filepath });
}

/**
 * Stage all changed files.
 */
export async function stageAll() {
  const statuses = await getStatus();
  for (const file of statuses) {
    if (file.status !== 'unmodified') {
      if (file.status === 'deleted') {
        await git.remove({ fs, dir, filepath: file.filepath });
      } else {
        await git.add({ fs, dir, filepath: file.filepath });
      }
    }
  }
}

/**
 * Create a commit.
 */
export async function commit(message, author = { name: 'iclaw', email: 'iclaw@local' }) {
  if (!fs) throw new Error('Git not initialized.');
  return await git.commit({ fs, dir, message, author });
}

/**
 * Get commit log.
 */
export async function getLog(depth = 20) {
  if (!fs) throw new Error('Git not initialized.');
  try {
    return await git.log({ fs, dir, depth });
  } catch {
    return [];
  }
}

/**
 * Check if directory is a git repo.
 */
export async function isGitRepo() {
  if (!fs) return false;
  try {
    await fs.stat('.git');
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize a new git repo.
 */
export async function initRepo() {
  if (!fs) throw new Error('Git not initialized.');
  await git.init({ fs, dir });
}
