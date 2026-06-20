# HELL.md

## Project Overview & Tech Stack

**Hell** is a desktop AI-assisted coding agent. It provides a workspace file explorer, a chat interface for composing prompts, clipboard-based integration with external LLMs, and automated parsing of AI responses to apply file changes (create, replace, delete, move) directly to the workspace.

**Core stack:**
- Electron (main + renderer)
- React 19 + TypeScript
- Vite (via electron-vite)
- Tailwind CSS (Catppuccin theme via CSS variables)
- better-sqlite3 (synchronous, main process)
- chokidar (file watching)
- electron-log (structured logging)
- vitest for tests

**Key capabilities:**
- Workspace folder selection, file tree with checkboxes, file tagging (PND/INQ/ADD)
- Multi-turn chat with message variants, edit, and re-roll
- Prompt construction from selected files, directory tree, and `HELL.md`
- Markdown rendering with custom blocks: file-create, file-replace, file-delete, file-move, task, command, commit
- Loose token-based search for fuzzy code replacements
- Chat session persistence, workspace state restore

---

## Architecture & Directory Structure

The app follows the **Electron 3-process architecture** with a strictly separated main process, preload bridge, and renderer.

```
src/
  main/          # Node.js main process
    index.ts     # App lifecycle, init database, create window, register IPC
    ipc.ts       # All IPC handlers (safeHandle wrapper)
    database.ts  # better-sqlite3 schema, queries, transactions
    watcher.ts   # chokidar file watcher with debounce
    fsUtils.ts   # Directory tree reading, ignore rules, binary detection
    window.ts    # BrowserWindow creation
    logger.ts    # electron-log initialization, log rotation
  preload/
    index.ts     # contextBridge exposure (electron, api)
    index.d.ts   # Type declarations for exposed globals
  renderer/
    index.html
    src/
      main.tsx              # React entry point, font loading
      App.tsx               # Root component, workspace state, orchestration
      WorkspaceContext.tsx   # Simple React context for workspace path
      components/
        AIChat.tsx          # Chat UI, message list, input, mode selector
        FileExplorer.tsx    # Virtualized file tree with search
        ChatHistory.tsx     # Chat session list, grouped by time
        Markdown.tsx        # Markdown renderer with custom components
        StatusBar.tsx       # Line/token counts, Copy/Paste buttons
        markdown/
          ApplyAll.tsx      # Apply-all bar for file blocks
          CodeBlocks.tsx    # Command, Commit, GenericCode blocks
          FileBlocks.tsx    # File, FileReplace, FileDelete, FileMove, Task blocks
      hooks/                # Custom hooks (resize, clipboard, etc.)
      utils/
        PromptEngine.ts     # Prompt assembly per chat mode
        appUtils.ts         # Path join, title derivation
        fileApply.ts        # File read/write/replace/delete IPC wrappers + caching
        looseMatch.ts       # Token-based fuzzy search for code replacements
        markdownParser.ts   # Markdown preprocessor, segmenter, replace-block parser
        markdownLanguages.ts# Language detection for code blocks
```

**Key architectural patterns:**
- **All I/O stays in main process.** Renderer communicates exclusively via `window.electron.ipcRenderer.invoke`.
- **Database is synchronous (better-sqlite3).** All DB writes are wrapped in transactions where bulk operations are needed.
- **IPC handlers use `safeHandle`** (wraps in try/catch with logging).
- **File changes from the AI are applied through the main process** (read/write/delete) and invalidate caches.
- **No global state library.** State lives in `App.tsx` with refs for stable callbacks. `WorkspaceContext` is minimal.
- **Message variants:** Each chat message can have multiple `variants` (edit history for user, multiple AI responses) with `activeVariant` index.

---

## Coding Conventions & Style

### TypeScript
- `tsconfig.node.json` for main + preload; `tsconfig.web.json` for renderer.
- `@renderer/*` alias maps to `src/renderer/src/*` (configured in both tsconfig and vite).
- Avoid `any`; eslint recommended config is active.

### Formatting (Prettier)
- `singleQuote: true`
- `semi: false`
- `printWidth: 100`
- `trailingComma: 'none'`

### Linting
- ESLint with `@electron-toolkit/eslint-config-ts` + React plugin + hooks plugin + prettier.
- **React hooks rules are enforced.** Do not call hooks conditionally or inside callbacks.

### Naming
- **Components:** PascalCase (`FileExplorer`, `ChatHistory`, `StatusBar`)
- **Files:** PascalCase for components, camelCase for utilities (`fileApply.ts`, `looseMatch.ts`)
- **Functions/variables:** camelCase
- **Types/interfaces:** PascalCase (`FileTag`, `ChatMessage`, `FlatNode`)

### Imports
- External libraries first, then internal modules.
- Use `@renderer/` for renderer-internal imports.
- `electron-log/renderer` for renderer logging.

### Component Patterns
- Use `forwardRef` + `useImperativeHandle` when a component must expose methods (e.g., `AIChat`).
- Use `memo` for expensive components (`Markdown`, `FileExplorer`, `StatusBar`).
- Stable callbacks for child components should use refs to avoid stale closures (e.g., `fileStatesRef`).

### Styling
- Tailwind utility classes for layout and theming.
- All colors reference CSS variables defined in `tailwind.config.js` (Catppuccin palette + semantic tokens).
- Inline styles only for dynamic dimensions (e.g., resize layout widths, virtualizer offsets).

### Error Handling
- Main process: always `try/catch` with `log.error()` inside IPC handlers (handled by `safeHandle`).
- Renderer: `try/catch` around IPC calls; log with `electron-log/renderer`.
- `safeHandle` is the required wrapper for all new `ipcMain.handle` registrations.

### State Management
- File selection state uses a `Map<string, FileTag>` where `FileTag = 'PND' | 'INQ' | 'ADD'`.
- Workspace path is stored in both state and a ref (`workspaceRef`) for use in callbacks without re-triggering effects.
- **Directory structure tag** (`dirStructureTag`) follows the same tag lifecycle, tracked separately.

### Database
- Schema versioned with `SCHEMA_VERSION` constant. Increment it when modifying schema. Existing DB is wiped on mismatch.
- All queries use `better-sqlite3` synchronous API wrapped in transactions for bulk operations.
- Workspaces capped at `MAX_WORKSPACES` (5).

---

## AI-Specific Directives

### IPC & Process Boundaries
- **Never** use `fs` synchronous methods (e.g., `readFileSync`) in the main process. Use `fs/promises` exclusively.
- **Always** register IPC handlers using the `safeHandle` wrapper in `src/main/ipc.ts`. Do not use `ipcMain.handle` directly.
- **Do not** add new `ipcRenderer.on` listeners in the renderer without a corresponding cleanup in the component's `useEffect` return.
- The preload exposes only `window.electron` (from `@electron-toolkit/preload`) and `window.api`. Do not expose additional APIs without updating `src/preload/index.d.ts`.

### React & Components
- **Do not** call state setters directly in the render body. Use `useEffect` for side-effects triggered by prop/state changes.
- **Do not** use array indices as React keys when the array items can be reordered or modified. Use stable unique identifiers.
- **Always** wrap components that receive function props in `memo` if they are expensive to re-render.
- For streaming content, use the `Markdown` component with its built-in segmentation. Do not attempt to re-parse markdown outside of `markdownParser.ts`.
- The `Markdown` component's custom code block system uses fenced code block language prefixes:
  - `language-file:<path>` — Create/overwrite file
  - `language-file-replace:<path>` — Replace block (contains `<<<ORIGINAL` / `<<<REPLACEMENT` delimiters)
  - `language-file-delete:<path>` — Delete file
  - `language-file-move:<oldPath> -> <newPath>` — Move/rename file
  - `language-task:<id>` — Task block (Files: / Description: metadata)
  - `language-command` — Shell command
  - `language-commit` — Commit message
  - All other `language-*` — Generic code block with syntax highlighting
  - Untagged code blocks — Auto-detect language
- Inline code with `file-include:<path>` will trigger file inclusion in the FileExplorer.

### File Operations
- File paths in the renderer may use either `/` or `\`. Always normalize with `.replace(/\\/g, '/')` when comparing.
- File apply logic (`src/renderer/src/utils/fileApply.ts`): use exact string match first, then fall back to `findLooseMatch` for token-based matching. Never bypass this fallback chain.
- Invalidate `fileContentCache` (via `invalidateFileContentCache` or `invalidateWorkspaceFileCache`) after any file write or delete through the main process watcher.
- The file tree uses `leafPaths` arrays on each node for efficient selection/deselection. Maintain this invariant when manipulating tree nodes.

### Prompt Construction
- Use `buildPrompt` from `src/renderer/src/utils/PromptEngine.ts`. Do not construct prompts manually.
- `HELL.md` content is automatically read and injected into prompts when a workspace is open. Keep this file concise and strictly factual.

### Database
- Do not modify `SCHEMA_VERSION` without fully understanding the migration logic in `initDatabase`. Schema changes require incrementing the version and testing with a fresh database.
- All DB writes to `file_states` or `expanded_dirs` must go through the batch functions when processing multiple paths to ensure transactional integrity.
- `toRelative` uses `startsWith` without path boundary checks. Be aware that paths like `/workspace` and `/workspace-other` may collide.

### Testing
- Tests live in `tests/src/` mirroring the source structure.
- Use `vitest`. Run with `npm test`.
- Main process tests should mock IPC and database.
