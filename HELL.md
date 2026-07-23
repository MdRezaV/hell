# HELL.md

## Project Overview & Tech Stack

**Hell** is a desktop AI-assisted coding agent. It provides a workspace file explorer, a chat interface for composing
prompts, clipboard-based integration with external LLMs, and automated parsing of AI responses to apply file changes
(create, replace, delete, move) directly to the workspace.

**Core stack:**

- Electron 39 (main + preload + renderer), electron-vite 5 / Vite 7
- React 19 + TypeScript 5.9
- Tailwind CSS 3 (Catppuccin theme via CSS variables) + per-component CSS in `styles/`
- better-sqlite3 (synchronous, main process)
- chokidar (file watching), electron-log (main + renderer)
- react-markdown + remark-gfm + remark-breaks (chat markdown)
- react-syntax-highlighter + highlight.js (deferred code highlighting)
- @tanstack/react-virtual (virtualized file tree and lists)
- js-tiktoken (cl100k_base token counting, main process only)
- lucide-react (icons), p-limit, ignore
- vitest 4 for tests

**Key capabilities:**

- Workspace folder selection, file tree with checkboxes, file tagging (PND/INQ/ADD)
- Multi-turn chat with message variants, edit, re-roll; per-session mode and task association
- Prompt construction from selected files, directory tree, and `HELL.md`
- Markdown rendering with custom blocks: file-create, file-replace, file-delete, file-move, task, command, commit
- Apply-all / unapply-all across file blocks in a message
- Loose token-based search for fuzzy code replacements
- Chat session persistence (with `mode` + `task_id`), workspace state restore, session search
- Global keyboard shortcuts, global loading indicator, debounced line/token counts for the current selection

---

## Architecture & Directory Structure

Electron 3-process architecture: strictly separated main, preload bridge, renderer.

```
src/
  main/          # Node.js main process
    index.ts     # App lifecycle, init database, create window, register IPC
    ipc.ts       # All IPC handlers (safeHandle wrapper)
    database.ts  # better-sqlite3 schema (SCHEMA_VERSION 6), queries, transactions
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
      main.tsx               # React entry point, font loading
      App.tsx                # Root: workspace state, tag lifecycle, copy/paste orchestration
      WorkspaceContext.tsx   # React context for workspace path
      LoadingContext.tsx     # Global loading counter (beginTask/endTask/withLoading)
      components/
        AIChat.tsx           # Chat UI, message list, input, mode selector
        FileExplorer.tsx     # Virtualized file tree with search
        ChatHistory.tsx      # Chat session list, grouped by time, keyboard navigation
        Markdown.tsx         # Markdown renderer with custom components
        ProgressBar.tsx      # Global loading bar (reads LoadingContext)
        StatusBar.tsx        # Line/token counts, Copy/Paste buttons
        markdown/
          ApplyAll.tsx       # Apply-all / unapply-all bar for file blocks
          CodeBlocks.tsx     # Command, Commit, GenericCode blocks
          FileBlocks.tsx     # File, FileReplace, FileDelete, FileMove, Task blocks
          DeferredHighlighting.tsx # Double-rAF deferred syntax highlighting
          StreamingContext.tsx     # Flags the actively-streaming segment
      hooks/
        useApplyAll.ts       # ApplyAllContext + useApplyRegistration (per-block apply registry)
        useAutoResizeTextarea.ts
        useClickOutside.ts
        useCopyToClipboard.ts
        useFileContent.ts    # Cached file reads + invalidation events
        useGlobalShortcuts.ts# ALL keyboard shortcuts (single keydown listener)
        useLazyMount.ts
        useResizableLayout.ts# Left/right panel resize
        useScrollSync.ts
      styles/                # Per-component CSS (Tailwind @apply + theme tokens)
      utils/
        PromptEngine.ts      # Prompt assembly per chat mode (CHAT_MODES)
        appUtils.ts          # Path join, title derivation
        fileApply.ts         # File read/write/replace/delete IPC wrappers + caching + ipcThrottle
        looseMatch.ts        # Token-based fuzzy search for code replacements
        markdownParser.ts    # Markdown preprocessor, segmenter, replace-block parser
        markdownLanguages.ts # Language detection for code blocks
```

**Key architectural patterns:**

- **All I/O stays in main process.** Renderer communicates via `window.electron.ipcRenderer.invoke`.
- **Database is synchronous (better-sqlite3).** WAL mode + `foreign_keys = ON`; bulk writes in transactions.
- **IPC handlers use `safeHandle`** (try/catch + `log.error`, rethrow).
- **File changes from the AI are applied through the main process** and invalidate renderer caches via window
  CustomEvents.
- **No global state library.** State lives in `App.tsx`, mirrored into refs (`workspaceRef`, `fileStatesRef`,
  `expandedDirsRef`, `dirStructureTagRef`, `activeChatIdRef`) via `useEffect` so callbacks stay stable.
- **Stable entry points for evolving logic:** `handleCopy`/`handlePaste` delegate to `latestCopyFnRef`/
  `latestPasteFnRef`, reassigned in `useEffect` each render.
- **Global loading:** long flows (workspace change, chat select) are wrapped in `withLoading` from `LoadingContext`;
  `ProgressBar` renders the state.
- **Message variants:** each chat message has `variants[]` + `activeVariant` index.
- **Cross-component signaling via window CustomEvents:** `task-run`, `file-content-invalidated`,
  `workspace-files-invalidated` (renderer-side); `workspace:changed` (main → renderer via `webContents.send`).
- `AIChat` exposes an imperative handle: `loadChat`, `getMessages`, `getMode`/`setMode`, `getTaskId`, `copyByIndex`,
  `pasteAsAssistant`, `runTask`, `getResolvedUserIndex`.

---

## Coding Conventions & Style

### TypeScript

- `tsconfig.node.json` for main + preload; `tsconfig.web.json` for renderer. `npm run typecheck` runs both.
- `@renderer/*` alias maps to `src/renderer/src/*` (tsconfig + vite).
- Avoid `any`; the only sanctioned suppression is the `safeHandle` signature in `ipc.ts`.

### Formatting (Prettier)

- `singleQuote: true`, `semi: false`, `printWidth: 100`, `trailingComma: 'none'`

### Linting

- ESLint flat config: `@electron-toolkit/eslint-config-ts` + react + react-hooks + react-refresh + prettier.
- **React hooks rules are enforced.** No conditional hooks or hooks in callbacks.
- Files exporting both a component and hooks (context files) need
  `// eslint-disable-next-line react-refresh/only-export-components` (see `LoadingContext.tsx`).
- Render-phase state adjustment (setState during render for prev-prop comparison) is used deliberately in
  `useFileContent`; everywhere else, side effects belong in `useEffect`.

### Naming

- **Components:** PascalCase (`FileExplorer`, `ChatHistory`)
- **Files:** PascalCase for components/contexts, camelCase for utilities and hooks (`useFileContent.ts`, `fileApply.ts`)
- **Functions/variables:** camelCase; **types/interfaces:** PascalCase (`FileTag`, `ChatMessage`, `ApplyBlockStatus`)

### Imports

- External libraries first, then internal modules.
- `@renderer/` for renderer-internal imports; `electron-log/renderer` (default import `log`) for renderer logging.

### Component Patterns

- `forwardRef` + `useImperativeHandle` when exposing methods (`AIChat`, `FileExplorer`, `ChatHistory`).
- `memo` for expensive components (`Markdown`, `FileExplorer`, `StatusBar`).
- Context for cross-cutting UI state: `WorkspaceContext`, `LoadingContext`, `ApplyAllContext`, `StreamingContext`,
  `DeferredHighlightingContext`.

### Styling

- Tailwind utilities in JSX for layout; component-specific styles in `src/renderer/src/styles/<Component>.css` via
  `@apply` with theme tokens (CSS variables from `tailwind.config.js`).
- Heavy markdown blocks use `content-visibility: auto` + `contain-intrinsic-size` + `contain` for render skipping.
- Inline styles only for dynamic dimensions (panel widths, virtualizer offsets).

### Error Handling

- Main: `try/catch` + `log.error()` inside IPC handlers (via `safeHandle`).
- Renderer: `try/catch` around awaited IPC; fire-and-forget IPC ends in `.catch((e) => log.error(...))`.

### State Management

- File selection: `Map<string, FileTag>`, `FileTag = 'PND' | 'INQ' | 'ADD'`.
- **Tag lifecycle:** `PND` → `INQ` on copy (context sent) → `ADD` on paste (response received). New chat converts `INQ`/
  `ADD` back to `PND`. Unchecking a file never removes `ADD`-tagged entries.
- `dirStructureTag` follows the same lifecycle, tracked separately (`null` when no workspace).
- Expanded dirs live in a `Set<string>` mirrored to the `expanded_dirs` table.

### Database

- `SCHEMA_VERSION` (currently 6): mismatch wipes and recreates all tables. Increment on any incompatible change.
- `chat_sessions` stores `messages`, `file_states`, `expanded_dirs` as JSON strings plus `dir_structure_tag`, `mode`,
  `task_id`. Session snapshots serialize **absolute** paths; workspace tables store **relative** paths via `toRelative`.
- List/search queries return metadata columns only (no `messages`); full rows via `getChatSession`.
- Bulk writes go through batch functions (transactions); `pruneWorkspaceState` uses temp tables.
- Workspaces capped at `MAX_WORKSPACES` (5); oldest evicted inside `touchWorkspace`.

---

## AI-Specific Directives

### IPC & Process Boundaries

- **Never** use synchronous `fs` in main. Use `fs/promises`; `createReadStream` is acceptable for streaming (see
  `search-file-content`).
- **Always** register handlers via `safeHandle` in `src/main/ipc.ts`. Never bare `ipcMain.handle`.
- `read-file` resolves `{ exists, error, content }` — check `exists`, then `error`; `write-file`/`delete-file` resolve
  `{ success, error? }`. Handle these shapes; do not expect exceptions.
- New `ipcRenderer.on` listeners in the renderer require cleanup in the `useEffect` return.
- Preload exposes only `window.electron` and `window.api`; update `src/preload/index.d.ts` when adding exposure.
- Main → renderer pushes use `webContents.send`; guard with `win && !win.isDestroyed()`.
- Token counting stays in main (`count-lines`); the tiktoken encoder is a lazy singleton (`getTiktokenEncoder`).

### React & Components

- **Do not** call state setters in the render body (sole exception: the prev-prop pattern in `useFileContent`).
- **Do not** use array indices as keys for reorderable items; use stable unique IDs.
- **All keyboard shortcuts live in `useGlobalShortcuts`** (one window `keydown` listener). Extend its handler map
  instead of adding per-component listeners. Shortcuts are suppressed in INPUT/TEXTAREA/contentEditable, except
  Ctrl/Cmd+digit mode switching on the welcome screen.
- Wrap async multi-step flows in `withLoading` so `ProgressBar` reflects them.
- Apply/unapply blocks register via `useApplyRegistration` with a `stableKey`. Registrations intentionally persist after
  unmount so `ApplyAllBar` tracks off-screen blocks — **never** add unregister-on-unmount.
- Expensive markdown rendering must respect `useIsStreaming()` / `useDeferredHighlighting()`: skip highlighting on the
  streaming segment, defer the rest past a double rAF.
- Read workspace file content in components only through `useFileContent` (caches by `${workspace}::${path}`, evicts
  oldest at `FILE_CACHE_MAX`, refreshes on invalidation events). After any write/delete, invalidate via
  `invalidateFileContentCache` / `invalidateWorkspaceFileCache` — they dispatch the required events.
- The `Markdown` custom block system uses fenced language prefixes:
  - `language-file:<path>` — Create/overwrite file
  - `language-file-replace:<path>` — Replace block (`<<<ORIGINAL` / `<<<REPLACEMENT` delimiters)
  - `language-file-delete:<path>` — Delete file
  - `language-file-move:<oldPath> -> <newPath>` — Move/rename file
  - `language-task:<id>` — Task block (Files: / Description: metadata); running one dispatches the `task-run` window
    event handled in `App.tsx`
  - `language-command` — Shell command
  - `language-commit` — Commit message
  - All other `language-*` — Generic code block; untagged blocks auto-detect language
- Inline code `file-include:<path>` triggers file inclusion in the FileExplorer.

### File Operations

- Normalize separators with `.replace(/\\/g, '/')` when comparing paths (renderer paths may use either).
- Replace flow in `fileApply.ts`: exact string match first, then `findLooseMatch` token-based fallback. Never bypass
  this chain.
- Maintain the `leafPaths` invariant on file-tree nodes when manipulating selection.
- Task-file matching uses longest suffix match against known workspace paths (see the `task-run` handler).

### Prompt Construction

- Use `buildPrompt` from `PromptEngine.ts`. Do not construct prompts manually. Modes come from `CHAT_MODES`;
  Ctrl/Cmd+1..9 maps by array index.
- `HELL.md` is auto-injected into prompts when a workspace is open. Keep it concise and strictly factual.

### Database

- Do not modify `SCHEMA_VERSION` without understanding the wipe-on-mismatch logic in `initDatabase`; test schema changes
  with a fresh database.
- `toRelative` uses `startsWith` without path boundary checks — `/workspace` and `/workspace-other` may collide.
- When `fileStates`/`expandedDirs` are not passed explicitly, chat-session create/update falls back to
  `snapshotWorkspaceStateToSession`; preserve this behavior.

### Testing

- Tests live in `tests/src/` mirroring the source structure (main: database, fsUtils, ipc; renderer: looseMatch,
  markdownParser).
- Run `npm test`, never bare `vitest`: `pretest` rebuilds better-sqlite3 for Node and `posttest` rebuilds it for
  Electron — skipping either breaks tests or the app.
- Main process tests mock IPC and database.
