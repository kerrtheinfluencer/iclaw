# iclaw — Intelligent Code Logic & Autonomous Workspace

Mobile-first, offline-capable AI coding environment. Runs a local LLM via WebAssembly or connects to cloud APIs for AI-powered "Vibe Coding" on your phone.

## Features

- **Hybrid AI Engine** — WASM (llama.cpp, works on iOS today), WebGPU (future), or Cloud API (Claude/OpenAI)
- **Mobile Code Editor** — Full editor with line numbers, undo/redo, search, word wrap, font sizing
- **Local RAG** — Orama indexes your project files for context-aware coding
- **One-Tap Inject** — Save AI-generated code directly to project files
- **File System Access** — Open local project folders (when browser supports it)
- **Git Integration** — Stage, commit, view history via isomorphic-git
- **Full PWA** — Install to home screen, works offline
- **Cyber-Stealth UI** — Neon-on-black theme, iPhone safe areas, swipe gestures

## Setup from Phone (GitHub Web UI)

### Step 1: Create the repo
1. Go to github.com → **New Repository**
2. Name it `iclaw`, check "Add a README", click **Create**
3. Delete the auto-generated README (you'll replace it)

### Step 2: Upload files
Upload files in this order using **Add file → Upload files** on GitHub:

**Root files (upload first):**
- `package.json`
- `vite.config.js`
- `tailwind.config.js`
- `postcss.config.js`
- `index.html`
- `.gitignore`
- `README.md`

**Then create folders and upload contents:**

Use **Add file → Create new file** and type the path to create folders:
- Type `src/main.jsx` → paste content → commit
- Type `src/App.jsx` → paste content → commit
- Type `src/styles/globals.css` → paste → commit
- Type `src/workers/llm.worker.js` → paste → commit
- Type `src/utils/fileHandler.js` → paste → commit
- Type `src/utils/db.js` → paste → commit
- Type `src/utils/rag.js` → paste → commit
- Type `src/utils/git.js` → paste → commit
- Type `src/utils/codeParser.js` → paste → commit
- Type `src/hooks/useLLM.js` → paste → commit
- Type `src/hooks/useWorkspace.js` → paste → commit
- Type `src/components/Header.jsx` → paste → commit
- Type `src/components/Sidebar.jsx` → paste → commit
- Type `src/components/ChatView.jsx` → paste → commit
- Type `src/components/ChatMessage.jsx` → paste → commit
- Type `src/components/CodeBlock.jsx` → paste → commit
- Type `src/components/CodeEditor.jsx` → paste → commit
- Type `src/components/FileViewer.jsx` → paste → commit
- Type `src/components/ModelLoader.jsx` → paste → commit
- Type `src/components/SettingsPanel.jsx` → paste → commit
- Type `.github/workflows/deploy.yml` → paste → commit

### Step 3: Enable GitHub Pages
1. Go to repo **Settings → Pages**
2. Under Source, select **GitHub Actions**
3. The deploy workflow runs automatically on each push
4. Your site will be at `https://YOUR_USERNAME.github.io/iclaw/`

### Step 4: Fix base path
If deploying to `github.io/iclaw/`, add this line to `vite.config.js`:
```js
base: '/iclaw/',
```

## Architecture

```
src/
├── App.jsx                  # Main orchestrator
├── main.jsx                 # Entry point
├── components/
│   ├── Header.jsx           # Status bar + engine indicator
│   ├── Sidebar.jsx          # Project tree, chat, git
│   ├── ChatView.jsx         # Chat UI with engine selector
│   ├── ChatMessage.jsx      # Message renderer
│   ├── CodeBlock.jsx        # Syntax highlight + One-Tap Inject
│   ├── CodeEditor.jsx       # Mobile code editor
│   ├── FileViewer.jsx       # Read-only file viewer
│   ├── ModelLoader.jsx      # Model download UI
│   └── SettingsPanel.jsx    # Engine + API configuration
├── hooks/
│   ├── useLLM.js            # Hybrid worker communication
│   └── useWorkspace.js      # File system + RAG
├── utils/
│   ├── fileHandler.js       # File System Access API
│   ├── db.js                # IndexedDB persistence
│   ├── rag.js               # Orama search engine
│   ├── git.js               # isomorphic-git
│   └── codeParser.js        # Code block extraction
├── workers/
│   └── llm.worker.js        # WASM + WebGPU + API inference
└── styles/
    └── globals.css           # Tailwind + theme
```

## AI Engines

| Engine | Model | Size | Works on iOS | Speed |
|--------|-------|------|-------------|-------|
| WASM | Qwen2.5-Coder 1.5B Q4 | ~900MB | Yes (today) | ~5-10 tok/s |
| WebGPU | Qwen2.5-Coder 3B Q4 | ~1.8GB | Future | ~20-40 tok/s |
| Cloud API | Claude Sonnet / GPT-4o | 0 | Yes | ~50-80 tok/s |

## Mobile Gestures

- **Swipe right from edge** → Open sidebar
- **Swipe left** → Close sidebar
- **Tap code block save icon** → One-Tap Inject to project

## License

MIT
