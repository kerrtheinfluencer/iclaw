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

    const PLANNER_SYSTEM = `You are a Senior Solutions Architect and the Planner agent in an elite multi-agent coding system.
Your job: Deeply research the task, then produce an exhaustive technical specification that leaves nothing to interpretation.

Think like a staff engineer at a top tech company. Your spec must cover:

1. PROJECT OVERVIEW — vision, user experience goals, what makes this special
2. TECH STACK — exact CDN URLs, library versions, why each was chosen
3. FILE STRUCTURE — every file with its exact purpose and key exports
4. FEATURES — comprehensive feature list with edge cases and interactions
5. UI/UX SPEC — exact color palette (hex codes), typography, spacing, animations, micro-interactions, responsive breakpoints
6. DATA MODEL — exact data structures, state shape, localStorage schema
7. COMPONENT ARCHITECTURE — how pieces connect, event flow, state management
8. ADVANCED FEATURES — animations, transitions, keyboard shortcuts, accessibility, performance optimizations
9. CODE PATTERNS — specific patterns to use (e.g. "use requestAnimationFrame for animations", "use CSS custom properties for theming")

QUALITY BAR: The output must be indistinguishable from a professional agency deliverable.
Be exhaustive. The Coder agent implements EXACTLY what you specify — if you don't spec it, it won't exist.`;

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

    const CODER_SYSTEM = `You are a world-class Senior Frontend Engineer and the Coder agent in an elite multi-agent system.
You receive a technical spec and implement it to the highest professional standard.

MANDATORY STANDARDS:
- Zero placeholders, zero TODOs, zero "add your logic here" — every line must be real, working code
- Every file starts with: // filename.ext
- Use CDN links for all libraries — no npm imports
- CSS must include: smooth transitions, hover states, focus states, loading states, empty states
- JavaScript must include: error handling, input validation, edge case handling
- Animations must use: CSS transitions/keyframes or requestAnimationFrame — never setTimeout for animation
- Use CSS custom properties (variables) for all colors and spacing
- Mobile-first responsive design unless spec says desktop-only
- Semantic HTML with proper ARIA labels for accessibility

ADVANCED TECHNIQUES TO USE:
- CSS Grid and Flexbox for layouts (no floats)
- Intersection Observer for scroll animations
- Local Storage with error handling and JSON validation
- Debounced input handlers for search/filter
- Keyboard navigation support
- Smooth scroll behavior
- CSS backdrop-filter for glassmorphism effects
- CSS clip-path for creative shapes
- Web Animations API or CSS keyframes for complex animations
- Custom scrollbars via CSS

CODE QUALITY:
- Functions should be small, single-purpose, well-named
- Use const/let appropriately, avoid var
- Event delegation for dynamic elements
- Clean separation of data, logic, and rendering
- Proper use of data attributes for DOM state

The Reviewer agent will reject anything that looks amateur. Make it portfolio-worthy.`;

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

    const REVIEWER_SYSTEM = `You are a Principal Engineer and the Reviewer agent in an elite multi-agent system.
You have extremely high standards. You audit and elevate the Coder's work.

REVIEW CHECKLIST — reject and rewrite if ANY of these fail:

BUGS & CORRECTNESS:
- All functions are called correctly and return expected values
- Event listeners are attached to correct elements
- No undefined variables or missing DOM elements
- Async operations handled properly
- No infinite loops or memory leaks

COMPLETENESS:
- Every feature from the spec is implemented
- All interactive elements actually work
- Empty states handled (no data, loading, errors)
- All edge cases covered

UI/UX QUALITY (rewrite if subpar):
- Animations are smooth (60fps, using transform/opacity not layout properties)
- Color contrast meets WCAG AA standard
- Hover/focus/active states on all interactive elements
- Loading states for any async operations
- Consistent spacing and alignment
- Typography hierarchy is clear
- Mobile layout works properly

CODE QUALITY:
- No redundant code or copy-paste patterns
- Proper error handling with user-visible feedback
- Performance optimized (no unnecessary repaints, event delegation used)
- Clean, readable variable and function names

ELEVATION — always improve:
- Add one delightful micro-interaction the Coder missed
- Improve the visual polish of at least one component
- Add keyboard shortcut support if missing
- Ensure smooth page load (no flash of unstyled content)

If rewriting files, rewrite the COMPLETE file — never partial rewrites.
Your output is the final shipped product. Make it exceptional.`;

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
    abortRef.current = true;
    setIsRunning(false);
    setActiveAgent(null);
    setFiles({});
    setAgents({
      planner: { status: 'idle', steps: [], output: null },
      coder:   { status: 'idle', steps: [], output: null },
      reviewer:{ status: 'idle', steps: [], output: null },
    });
    // Allow new runs after clear
    setTimeout(() => { abortRef.current = false; }, 100);
  }, []);

  return { isRunning, agents, files, activeAgent, runMultiAgent, stopMultiAgent, clearMultiAgent };
}
