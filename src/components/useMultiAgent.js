/**
 * iclaw Multi-Agent System
 * Three specialized agents working in sequence:
 * 1. Planner — researches, breaks task into spec
 * 2. Coder   — implements spec file by file
 * 3. Reviewer — audits code, fixes bugs, improves quality
 */
import { useState, useRef, useCallback } from 'react';
import { uid } from '../utils/codeParser.js';

const CORS_PROXY = 'https://corsproxy.io/?url=';
const SEARXNG_INSTANCES = ['https://search.sapti.me', 'https://searx.be', 'https://paulgo.io'];

async function browserSearch(query) {
  for (const instance of SEARXNG_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&format=json&categories=general&language=en`;
      const res = await fetch(CORS_PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.results?.length > 0) {
        return data.results.slice(0, 4).map((r, i) =>
          `[${i+1}] ${r.title}\n${r.content || ''}`
        ).join('\n\n');
      }
    } catch { continue; }
  }
  return null;
}

async function callProvider(apiKey, engine, model, systemPrompt, messages, temperature = 0.3) {
  if (engine === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...messages.map(({role,content})=>({role,content}))],
        temperature, max_tokens: 8192,
      }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0,200)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
  if (engine === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'X-Title': 'iclaw' },
      body: JSON.stringify({
        model: model || 'mistralai/mistral-7b-instruct:free',
        messages: [{ role: 'system', content: systemPrompt }, ...messages.map(({role,content})=>({role,content}))],
        temperature, max_tokens: 8192,
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0,200)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
  // Gemini default
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`;
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood.' }] },
    ...messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
  ];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { temperature, maxOutputTokens: 8192 } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0,200)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
}

// Extract code blocks from a response
function extractFiles(response) {
  const files = {};
  const regex = /```[\w]*\n(?:\/\/\s*|#\s*|<!--\s*)?([^\s]+\.\w+)[^\n]*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    const path = match[1].replace(/-->.*/, '').trim();
    const content = match[2].trim();
    if (path && content) files[path] = content;
  }
  // Fallback: any fenced block with a filename comment
  if (Object.keys(files).length === 0) {
    const fallback = /```(\w+)\n([\s\S]*?)```/g;
    let i = 0;
    while ((match = fallback.exec(response)) !== null) {
      const lang = match[1];
      const content = match[2].trim();
      const extMap = { html: 'index.html', css: 'styles.css', javascript: 'script.js', js: 'script.js', python: 'main.py' };
      const filename = extMap[lang] || `file${i}.${lang}`;
      files[filename] = content;
      i++;
    }
  }
  return files;
}

export function useMultiAgent() {
  const [isRunning, setIsRunning] = useState(false);
  const [agents, setAgents] = useState({
    planner: { status: 'idle', steps: [], output: null },
    coder:   { status: 'idle', steps: [], output: null },
    reviewer:{ status: 'idle', steps: [], output: null },
  });
  const [files, setFiles] = useState({});
  const [activeAgent, setActiveAgent] = useState(null);
  const abortRef = useRef(false);

  const updateAgent = (name, update) => {
    setAgents(prev => ({
      ...prev,
      [name]: { ...prev[name], ...update },
    }));
  };

  const addAgentStep = (agentName, step) => {
    setAgents(prev => ({
      ...prev,
      [agentName]: {
        ...prev[agentName],
        steps: [...prev[agentName].steps, { id: uid(), ...step }],
      },
    }));
  };

  const updateLastAgentStep = (agentName, update) => {
    setAgents(prev => {
      const agent = prev[agentName];
      const steps = [...agent.steps];
      if (steps.length > 0) steps[steps.length - 1] = { ...steps[steps.length - 1], ...update };
      return { ...prev, [agentName]: { ...agent, steps } };
    });
  };

  // ── AGENT 1: PLANNER ─────────────────────────────────────────────
  const runPlanner = async (task, apiKey, engine, model) => {
    setActiveAgent('planner');
    updateAgent('planner', { status: 'running', steps: [], output: null });

    const PLANNER_SYSTEM = `You are the Planner agent in a multi-agent coding system.
Your job: Research the task, then produce a detailed technical specification.

Output a structured spec with:
1. PROJECT OVERVIEW — what we're building and why
2. TECH STACK — exact technologies, libraries, CDN links needed
3. FILE STRUCTURE — list every file to create with its purpose
4. FEATURES — detailed list of all features to implement
5. UI/UX NOTES — design decisions, color scheme, layout
6. IMPLEMENTATION NOTES — key technical decisions, patterns to use

Be specific and thorough. The Coder agent will implement exactly what you specify.`;

    addAgentStep('planner', { type: 'think', status: 'running', label: 'Analyzing task...' });

    // Search for relevant info
    addAgentStep('planner', { type: 'search', status: 'running', label: `Researching: ${task.slice(0, 50)}...` });
    const searchResults = await browserSearch(task);
    updateLastAgentStep('planner', { status: 'done', detail: searchResults ? 'Found relevant context' : 'No search results' });

    addAgentStep('planner', { type: 'think', status: 'running', label: 'Writing technical spec...' });

    const messages = [{
      role: 'user',
      content: `Task: ${task}${searchResults ? `\n\nResearch context:\n${searchResults}` : ''}\n\nWrite a complete technical specification.`,
    }];

    const spec = await callProvider(apiKey, engine, model, PLANNER_SYSTEM, messages, 0.4);
    updateLastAgentStep('planner', { status: 'done', detail: spec.slice(0, 200) + '...' });
    updateAgent('planner', { status: 'done', output: spec });
    return spec;
  };

  // ── AGENT 2: CODER ───────────────────────────────────────────────
  const runCoder = async (task, spec, apiKey, engine, model) => {
    setActiveAgent('coder');
    updateAgent('coder', { status: 'running', steps: [], output: null });

    const CODER_SYSTEM = `You are the Coder agent in a multi-agent coding system.
You receive a technical spec and implement it completely.

RULES:
- Write complete, production-ready code — no placeholders or TODOs
- Every file must start with a comment showing the filename: // filename.ext
- Use modern best practices and the exact tech stack from the spec
- For HTML apps: write one complete self-contained index.html unless spec says otherwise
- Include all CSS inline or in separate files as spec requires
- Make it actually work — test-quality code
- Use CDN links for any libraries (no npm imports in browser code)`;

    addAgentStep('coder', { type: 'plan', status: 'running', label: 'Reading spec...' });
    await new Promise(r => setTimeout(r, 500)); // brief pause for UX
    updateLastAgentStep('coder', { status: 'done', detail: 'Spec parsed' });

    // Determine files to write from spec
    addAgentStep('coder', { type: 'write_file', status: 'running', label: 'Implementing all files...' });

    const messages = [{
      role: 'user',
      content: `Original task: ${task}\n\nTechnical Specification:\n${spec}\n\nImplement the complete project. Write ALL files with full code. Start each file with a comment showing its filename.`,
    }];

    const implementation = await callProvider(apiKey, engine, model, CODER_SYSTEM, messages, 0.2);

    // Extract files from response
    const extractedFiles = extractFiles(implementation);
    const fileCount = Object.keys(extractedFiles).length;

    updateLastAgentStep('coder', {
      status: fileCount > 0 ? 'done' : 'warn',
      detail: fileCount > 0
        ? `Written: ${Object.keys(extractedFiles).join(', ')}`
        : 'No structured files found — storing as index.html',
    });

    // If no files extracted, store whole response as index.html
    if (fileCount === 0) {
      const htmlMatch = implementation.match(/```html\n([\s\S]*?)```/);
      if (htmlMatch) extractedFiles['index.html'] = htmlMatch[1].trim();
      else extractedFiles['index.html'] = implementation;
    }

    setFiles(extractedFiles);
    updateAgent('coder', { status: 'done', output: implementation });
    return { implementation, files: extractedFiles };
  };

  // ── AGENT 3: REVIEWER ────────────────────────────────────────────
  const runReviewer = async (task, spec, files, apiKey, engine, model) => {
    setActiveAgent('reviewer');
    updateAgent('reviewer', { status: 'running', steps: [], output: null });

    const REVIEWER_SYSTEM = `You are the Reviewer agent in a multi-agent coding system.
You audit code written by the Coder agent and improve it.

Your review must cover:
1. BUG CHECK — identify any bugs, errors, or broken logic
2. COMPLETENESS — does it match the spec? Missing features?
3. CODE QUALITY — best practices, efficiency, readability
4. UX QUALITY — does the UI look good and work well?
5. FIXES — rewrite any files that have issues (full file rewrites only)

If files need fixing, rewrite them completely with // filename.ext at the top.
If everything looks good, say so and provide a final summary.`;

    addAgentStep('reviewer', { type: 'think', status: 'running', label: 'Auditing code...' });

    const fileContents = Object.entries(files)
      .map(([path, content]) => `\`\`\`\n// ${path}\n${content}\n\`\`\``)
      .join('\n\n');

    const messages = [{
      role: 'user',
      content: `Original task: ${task}\n\nSpec:\n${spec.slice(0, 1000)}...\n\nCode to review:\n${fileContents}\n\nReview this code thoroughly and fix any issues.`,
    }];

    const review = await callProvider(apiKey, engine, model, REVIEWER_SYSTEM, messages, 0.3);
    updateLastAgentStep('reviewer', { status: 'done', detail: 'Review complete' });

    // Extract any fixed files
    const fixedFiles = extractFiles(review);
    if (Object.keys(fixedFiles).length > 0) {
      addAgentStep('reviewer', {
        type: 'write_file', status: 'done',
        label: `Fixed ${Object.keys(fixedFiles).length} file(s)`,
        detail: Object.keys(fixedFiles).join(', '),
      });
      // Merge fixes into files
      setFiles(prev => ({ ...prev, ...fixedFiles }));
    } else {
      addAgentStep('reviewer', { type: 'check', status: 'done', label: 'Code passed review — no fixes needed' });
    }

    // Extract summary
    const summaryMatch = review.match(/(?:summary|conclusion|result)[:\s]*([\s\S]{50,300})/i);
    const summary = summaryMatch?.[1]?.trim() || review.slice(0, 300);

    addAgentStep('reviewer', { type: 'finish', status: 'done', label: 'Review complete', detail: summary });
    updateAgent('reviewer', { status: 'done', output: review });
    return { review, fixedFiles };
  };

  // ── MAIN ORCHESTRATOR ────────────────────────────────────────────
  const runMultiAgent = useCallback(async (task, apiKey, engine = 'gemini', model = 'gemini-2.5-flash', onFileWrite, onPreview) => {
    if (!apiKey) return;
    setIsRunning(true);
    setFiles({});
    abortRef.current = false;

    // Reset all agents
    setAgents({
      planner: { status: 'idle', steps: [], output: null },
      coder:   { status: 'idle', steps: [], output: null },
      reviewer:{ status: 'idle', steps: [], output: null },
    });

    try {
      // Phase 1: Plan
      if (abortRef.current) return;
      const spec = await runPlanner(task, apiKey, engine, model);

      // Phase 2: Code
      if (abortRef.current) return;
      const { files: writtenFiles } = await runCoder(task, spec, apiKey, engine, model);

      // Notify parent of written files
      for (const [path, content] of Object.entries(writtenFiles)) {
        if (onFileWrite) await onFileWrite(path, content);
        if (path.endsWith('.html') && onPreview) onPreview(content, path);
      }

      // Phase 3: Review
      if (abortRef.current) return;
      const { fixedFiles } = await runReviewer(task, spec, writtenFiles, apiKey, engine, model);

      // Notify parent of any fixes
      for (const [path, content] of Object.entries(fixedFiles)) {
        if (onFileWrite) await onFileWrite(path, content);
        if (path.endsWith('.html') && onPreview) onPreview(content, path);
      }

    } catch (err) {
      const current = activeAgent || 'planner';
      addAgentStep(current, { type: 'error', status: 'error', label: 'Error', detail: err.message });
      updateAgent(current, { status: 'error' });
    }

    setActiveAgent(null);
    setIsRunning(false);
  }, []);

  const stopMultiAgent = useCallback(() => {
    abortRef.current = true;
    setIsRunning(false);
    setActiveAgent(null);
  }, []);

  const clearMultiAgent = useCallback(() => {
    setAgents({
      planner: { status: 'idle', steps: [], output: null },
      coder:   { status: 'idle', steps: [], output: null },
      reviewer:{ status: 'idle', steps: [], output: null },
    });
    setFiles({});
    setActiveAgent(null);
  }, []);

  return { isRunning, agents, files, activeAgent, runMultiAgent, stopMultiAgent, clearMultiAgent };
}
