import { useState, useCallback } from 'react';
import {
  openProjectDirectory,
  indexProjectFiles,
  getDirectoryTree,
  readFile,
  writeFile,
  isFileSystemSupported,
  getDirectoryHandle,
} from '../utils/fileHandler.js';
import { indexFiles, queryRAG, getRAGStats } from '../utils/rag.js';
import { initGit, isGitRepo } from '../utils/git.js';

/**
 * Hook for managing the local project workspace.
 */
export function useWorkspace() {
  const [isOpen, setIsOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [tree, setTree] = useState([]);
  const [indexStats, setIndexStats] = useState(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [hasGit, setHasGit] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');

  const fsSupported = isFileSystemSupported();

  const openProject = useCallback(async () => {
    const handle = await openProjectDirectory();
    if (!handle) return false;

    setProjectName(handle.name);
    setIsOpen(true);

    // Build tree
    const dirTree = await getDirectoryTree(handle);
    setTree(dirTree);

    // Init git
    initGit(handle);
    const gitStatus = await isGitRepo();
    setHasGit(gitStatus);

    // Index files for RAG
    setIsIndexing(true);
    try {
      const files = await indexProjectFiles(handle);
      const stats = await indexFiles(files);
      setIndexStats(stats);
    } catch (err) {
      console.warn('Indexing error:', err);
    } finally {
      setIsIndexing(false);
    }

    return true;
  }, []);

  const refreshTree = useCallback(async () => {
    const handle = getDirectoryHandle();
    if (!handle) return;
    const dirTree = await getDirectoryTree(handle);
    setTree(dirTree);
  }, []);

  const openFile = useCallback(async (path) => {
    try {
      const content = await readFile(path);
      setSelectedFile(path);
      setFileContent(content);
      return content;
    } catch (err) {
      console.error('Failed to read file:', err);
      return null;
    }
  }, []);

  const saveFile = useCallback(async (path, content) => {
    try {
      await writeFile(path, content);
      await refreshTree();
      return true;
    } catch (err) {
      console.error('Failed to write file:', err);
      return false;
    }
  }, [refreshTree]);

  const searchContext = useCallback(async (query) => {
    return await queryRAG(query);
  }, []);

  const reindex = useCallback(async () => {
    const handle = getDirectoryHandle();
    if (!handle) return;

    setIsIndexing(true);
    try {
      const files = await indexProjectFiles(handle);
      const stats = await indexFiles(files);
      setIndexStats(stats);
    } finally {
      setIsIndexing(false);
    }
  }, []);

  return {
    isOpen,
    projectName,
    tree,
    indexStats,
    isIndexing,
    hasGit,
    selectedFile,
    fileContent,
    fsSupported,
    openProject,
    refreshTree,
    openFile,
    saveFile,
    searchContext,
    reindex,
  };
}
