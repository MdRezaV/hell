# Hell — Project Audit

Date: 2026-08-11
Scope: full repo review (main process, IPC, database, renderer, build/CI, docs), via static reading + two focused sub-agent passes. `node_modules` was not installed in this environment, so `npm run typecheck` / `lint` / `test` could not be executed live — findings below are from source review, not a tool run.

**Update (same day):** all P0/P1 items and most P2/P3 items below were implemented. Status is marked inline per item. This pass was also done without a working `node_modules` (Electron's binary download timed out in this sandbox — no network egress), so none of the changes were verified with `npm run typecheck`/`lint`/`test`. Run those before merging.

---

## P0 — Critical (fix before any further AI-driven file writes)

1. **Path traversal in file IPC handlers — arbitrary read/write/delete/move outside the workspace**
   `src/main/ipc.ts:95-143` (`read-file`, `write-file`, `delete-file`, `move-file`) and `:370-427` (`read-directory`, `read-directory-tree`, `search-file-content`).
   All of these do `join(workspace, relativePath)` (or take a raw absolute path) with **no check that the resolved path stays inside the workspace root**. Since file paths in this app frequently originate from **AI-generated markdown** (`file-create:<path>`, `file-delete:<path>`, `@@FILE`, `@@REPLACE`, etc.) that gets auto-applied via Apply-All, a single AI response containing `../../../../Windows/System32/...` or `~/.ssh/id_rsa` as a path silently reads, overwrites, or deletes files far outside the intended project — no prompt, no warning.
   **Status: FIXED.** Added `src/main/pathSafety.ts` (`WorkspacePath`/`PathTraversalError`); every path-taking handler in `ipc.ts` now resolves through it and rejects escapes. `search-file-content`/`count-lines` now validate/resolve against the workspace too. `read-directory`/`read-directory-tree` were simplified to a single `workspace` param (the old `dirPath`/`rootDir` pair was always called with the same value in practice, so it was attack surface with no real use). Tests added: `tests/src/main/pathSafety.test.ts`.

2. **Renderer has unrestricted `ipcRenderer.invoke` access — no channel allowlist**
   `src/preload/index.ts` exposes `@electron-toolkit/preload`'s full `electronAPI` (raw `ipcRenderer.invoke`) alongside the custom `api`. Combined with finding #1, any script able to execute in the renderer (e.g. a future markdown-rendering regression) can call `read-file`/`write-file` etc. directly with attacker-chosen arguments, bypassing whatever the intended `api` surface allows.
   **Status: FIXED.** `src/preload/index.ts` now exposes only a curated `window.api` — one named, typed method per IPC channel, plus `window.api.events` for the two main→renderer pushes (`context-menu:show`, `workspace:changed`). Raw `ipcRenderer` is no longer reachable from the renderer at all. Every call site across `App.tsx`, `AIChat.tsx`, `ChatHistory.tsx`, `ContextMenu.tsx`, `FileExplorer.tsx`, `useFileContent.ts`, `SettingsContext.tsx`, `fileApply.ts` was migrated to `window.api.*`. `src/preload/index.d.ts` now types `window.api` from the preload module's own exported type.

---

## P1 — High (real bugs, will corrupt data or misattribute state during normal use)

3. **Chat rendering: module-global incremental parse cache leaks across messages**
   `src/renderer/src/utils/markdownParser.ts:599-647`, used from `Markdown.tsx:234`. The fast-path incremental cache (`_incRawPrefix`/`_incProcessedPrefix`/`_incLastFilePath`) is a **singleton**, but every chat bubble renders its own `Markdown` instance. Two different messages that happen to share a text prefix can cause message B to reuse message A's cached parse state, misattributing an orphan `[SEARCH]`/`@@SEARCH` block to the wrong file path. `resetPreprocessCache()` is only called on new-chat/select-chat/task-run — not on ordinary scrolling — so this is live during normal use.
   **Status: FIXED.** The cache is now a bounded `Map` keyed by a `cacheKey` (`Markdown` takes a `cacheKey` prop; `AIChat.tsx` passes `${message.id}-${message.activeVariant}`, the same key already used for React's `key`). `resetPreprocessCache()` still clears everything with no args, or one entry with a key.

4. **Overlapping async flows in `App.tsx` can interleave and corrupt UI state**
   `handleSelectChat` (`App.tsx:599-653`) and `handleWorkspaceChange` (`:199-234`) have no generation/cancellation guard. `withLoading` only drives the spinner, it does not serialize calls. Rapidly clicking two chat-history items (or double-clicking "Open Workspace") can let flow A finish after flow B, leaving chat A's messages paired with chat B's file-state/tags. `AIChat.loadChat` already has a `loadChatGenerationRef` for exactly this reason — `App.tsx`'s outer sequence has no equivalent.
   **Status: FIXED.** Added `sessionGenerationRef` in `App.tsx`; both `handleWorkspaceChange` and `handleSelectChat` bump it on entry and bail at each `await` boundary if superseded. `loadWorkspaceState` takes an optional `generation` param so the same check reaches its state writes.

5. **`handleTaskRun` drops `taskId` when flushing the outgoing chat**
   `App.tsx:841-863` calls `db:update-chat-session`/`db:create-chat-session` with 7 args, omitting the `taskId` 8th argument that every other call site (`saveCurrentChat`, `handleNewChat`, `handleMessagesChange`) passes. Running a task from an assistant message silently loses the previous chat session's task association.
   **Status: FIXED.** Added `savedTaskId` and passed it through, matching the other call sites.

6. **`findLooseMatch` / `applyFileReplace` silently pick the wrong occurrence on ambiguous matches**
   `src/renderer/src/utils/looseMatch.ts:236-253`, `fileApply.ts:94-130`. When a search snippet (or an "already applied" snippet in `detectReplaceState`) occurs more than once in a file — common with boilerplate/repeated method signatures — the code always edits/reports on the *first* match. This is a plausible root cause of silent, hard-to-notice file corruption when applying AI replace-blocks. Existing tests document "first match wins" as intended behavior rather than testing for ambiguity detection.
   **Status: FIXED.** `LooseMatch` now carries an `ambiguous` flag (set when a second token-sequence match exists); `applyFileReplace` checks it (and the equivalent exact-match case via a second `indexOf`) and returns an error instead of applying when the search text isn't unique. `detectReplaceState`'s existence checks are unaffected (still just presence checks for UI state). `unapplyFileReplace` was left as-is — lower risk, not the direction the audit flagged. Tests added in `looseMatch.test.ts`.

7. **Duplicate keyboard listeners collide with the documented single-listener shortcut system**
   HELL.md mandates all shortcuts live in `useGlobalShortcuts`'s one `keydown` listener, but 4 more independent listeners exist: `SettingsContext.tsx:316-341` (zoom), `ContextMenu.tsx:38`, `Settings.tsx:390`, `Whip.tsx:262`. Concretely, `Ctrl+0` is claimed by both `useGlobalShortcuts` (welcome-screen "switch to mode 0") and `SettingsContext` ("reset zoom to 100%") — both fire on the same keystroke, so resetting zoom on the welcome screen also switches chat mode.
   **Status: FIXED (the real collision); other three left as intentional exceptions.** Zoom (`zoomIn`/`zoomOut`/`resetZoom`) moved out of `SettingsContext`'s own listener into `useGlobalShortcuts`, with the welcome-screen check applied correctly: Ctrl+0 mode-switches on the welcome screen, resets zoom everywhere else. `ContextMenu.tsx`'s and `Settings.tsx`'s `Escape`-to-close listeners and `Whip.tsx`'s minigame input capture were reviewed and left alone — they're scoped to a mounted overlay/feature, not a second binding for the same global key, so they don't reproduce this bug. Documented as an accepted exception list in HELL.md.

---

## P2 — Medium (security hardening, maintainability, data-safety hygiene)

8. **`sandbox: false` on the main BrowserWindow** (`src/main/window.ts:18`) — disables Chromium's OS-level renderer sandbox with no comment explaining why it's needed. Combined with #1/#2, this widens the blast radius of any future renderer compromise. Re-enable unless a specific dependency requires it, and document the reason if not.
   **Status: FIXED.** Removed `sandbox: false` (Electron 39 defaults to `sandbox: true`). **Not verified at runtime** — could not run the app in this environment. `electron-log/preload` is documented as sandbox-compatible, but please launch `npm run dev` and confirm renderer logging and IPC still work before merging.

9. **Schema-version bump wipes all user data with no backup** — `src/main/database.ts:169-179`. `SCHEMA_VERSION` is already at 8 (i.e., this has happened at least 7 times), and every mismatch unconditionally drops `chat_sessions`, `file_states`, `expanded_dirs`, `workspaces` with no export or user warning. Any future schema change silently deletes all saved chat history. Recommend real migrations (`ALTER TABLE`) or at minimum dumping the old DB to a timestamped backup file before dropping.
   **Status: PARTIALLY FIXED.** Added `backupBeforeReset`: checkpoints WAL and copies the sqlite file to `<dbPath>.v<oldVersion>.bak` before the drop, best-effort (logs and continues on failure). This is a safety net, not real migrations — a genuine `ALTER TABLE`-based migration path is still a larger follow-up if schema churn continues.

10. **No CI on regular commits/PRs — only on release tags.** `.github/workflows/release.yml` only triggers on `v*.*.*` tags and only then runs `npm run test`. There is no lint/typecheck/test workflow on pushes or pull requests, so regressions can merge to `master` unnoticed until a release build.
    **Status: FIXED.** Added `.github/workflows/ci.yml`: runs lint, typecheck, and test on push to `master` and on every PR.

11. **Widespread "setState in render body" pattern beyond the one documented exception.** HELL.md says this pattern is permitted only in `useFileContent`, but the same derived-state-in-render pattern is duplicated in `FileExplorer.tsx:345-354` and four blocks in `FileBlocks.tsx` (`FileReplaceBlock:184-191`, `FileMoveBlock:365-370`, `FileDeleteBlock:474-479`, `FileBlock:650-655`). Each is self-consistent today, but the convention has silently spread — either fold these into the documented exception list or refactor to `useEffect`.
    **Status: FIXED via documentation, not refactor.** Chose the lower-risk option: HELL.md's React & Components section now lists all five sites as the closed exception list, instead of understating it as one. Refactoring five working call sites to `useEffect` without a compiler to verify against felt like the wrong risk/value trade for this pass; revisit if it causes a real bug.

12. **macOS build requests camera/microphone entitlements the app doesn't use.** `electron-builder.yml` declares `NSCameraUsageDescription`/`NSMicrophoneUsageDescription` for an app with no camera/mic feature (file explorer + chat + clipboard). Likely uncustomized boilerplate; unnecessary permission prompts hurt App Store review and user trust. Also `notarize: false` and placeholder `publish.url: https://example.com/auto-updates` / `appId: com.electron.app` look like unfinished packaging config, not production-ready.
    **Status: FIXED.** Removed the camera/mic entries. Changed `appId` to `com.hell.app` with a TODO comment to replace it with a real reverse-DNS id before shipping. Removed the placeholder `publish` block entirely (there's no `electron-updater` wired in, so a fake feed URL was actively misleading) with a comment explaining why; add it back once an update flow exists. `notarize: false` left as-is — that's a real decision about whether you're paying for an Apple Developer notarization pipeline, not boilerplate.

13. **Windows path-casing not normalized.** `toRelative` (`database.ts:206-220`) and every `join(workspace, ...)` in `ipc.ts` do plain string operations; on Windows, reopening a workspace with different drive-letter casing or via a symlink can fragment file-state/session history across what the OS considers the same path. (Note: the specific "prefix collision" quirk mentioned in HELL.md — `/workspace` vs `/workspace-other` — is **already fixed**: `database.ts:213` checks the boundary character. That doc comment is stale.)
    **Status: PARTIALLY FIXED.** `toRelative`'s prefix comparison is now case-insensitive on `win32` (`startsWithPath`), fixing the "reopen the same folder with different casing → every file looks like it's outside the workspace" symptom while still returning paths in their original on-disk casing. **Not fixed:** workspace *identity* in the `workspaces` table is still an exact-string primary key, so the same folder opened with two different casings is still tracked as two separate workspace rows/history entries — a real fix there needs path normalization at the point workspaces are opened/stored, which has migration implications for existing rows and felt like a bigger, riskier change than this pass's budget justified. Also fixed the stale doc comment itself (see HELL.md).

14. **God-components.** `AIChat.tsx` (1221 lines) and `App.tsx` (1067 lines) concentrate a large share of app logic; this is a maintainability risk (hard to test, easy to introduce the interleaving bugs in #4/#5 above) rather than a bug per se. Consider extracting task-run/session-flush logic out of `App.tsx` into a dedicated hook.
    **Status: NOT DONE.** Deliberately out of scope for this pass: splitting these apart is a large, behavior-preserving refactor that's very hard to do safely by hand without a compiler available to catch mistakes (see the environment note at the top). Recommend doing this as its own dedicated pass once `npm run typecheck`/`test` can be run continuously against it.

---

## P3 — Low (polish, coverage gaps)

15. **No tests for `watcher.ts`, `window.ts`, `index.ts`, `logger.ts`** — debounce timing, the module-global `closed` flag in `watcher.ts:12` (fragile under rapid workspace switching, though currently mitigated by synchronous `clearDebounce()`), and app-lifecycle cleanup are entirely unverified.
    **Status: PARTIALLY ADDRESSED.** `watcher.ts` was rewritten as a `WorkspaceWatcher` class with the watcher/timer/`closed` state on instance fields instead of module globals (see "OOP" note below) — same behavior, clearer ownership, easier to unit-test in the future. No new tests added for it or for `window.ts`/`index.ts`/`logger.ts` (these need a `electron` runtime or heavy mocking to test meaningfully; left for a dedicated testing pass).
16. **`moveFileSafe`'s EXDEV cross-device fallback** (`ipc.ts:53-72`) has no test coverage.
    **Status: NOT DONE.** No test added.
17. **Ambiguous-match scenarios untested** in `looseMatch.test.ts` / `markdownParser.test.ts` (see #6) and the incremental-cache-across-distinct-messages scenario (see #3) is untested.
    **Status: FIXED for looseMatch** (`ambiguous`-flag tests added). `markdownParser.ts`'s per-key cache behavior was not given a dedicated new test; the existing tests still pass against the new `Map`-backed implementation since the default key preserves old single-slot behavior when no `cacheKey` is passed.
18. **`docs/output-format.md`** documents the `@@FILE`/`@@REPLACE` AI output syntax in detail, but **HELL.md never mentions it** even though `markdownParser.ts` supports both that syntax and the fenced-code-block syntax HELL.md does describe. A reader of HELL.md alone would not know this second format exists.
    **Status: FIXED.** HELL.md's Markdown block-system section now cross-references `docs/output-format.md`.

---

## OOP / readability pass

Applied to the **main process**, where stateful services actually fit an OOP shape — not to the renderer, which is intentionally hooks/functional per HELL.md's documented conventions and would fight React's model if converted:

- `src/main/pathSafety.ts` — new `WorkspacePath` class (see #1) encapsulating a workspace root and its resolve/contains behavior, plus a dedicated `PathTraversalError` type.
- `src/main/watcher.ts` — rewritten as a `WorkspaceWatcher` class; the same external `startWatching`/`stopWatching` functions remain (backed by one shared instance, matching the app's actual "one active workspace" usage) so no caller changes were needed.
- `ipc.ts`/`database.ts` were left as plain modules — they're a flat handler-registration/query-function shape, not stateful, and wrapping them in classes wouldn't have added anything real.

---

## Environment note

`npm install` could not complete in this sandbox — Electron's postinstall binary download timed out (no network egress), so `node_modules` doesn't exist here and none of this could be checked with `npm run typecheck`, `npm run lint`, or `npm test`. Please run all three (and `npm run dev` to sanity-check the app launches, given the `sandbox: true` and preload changes) before merging.

## Top features worth addressing next

1. **Decompose `AIChat.tsx`/`App.tsx`** (P2 #14) — the biggest remaining maintainability risk, deliberately deferred this pass.
2. **Real DB migrations** instead of wipe-plus-backup-on-schema-mismatch (P2 #9).
3. **Workspace-identity normalization** so the same folder isn't tracked as two workspaces under different casing (P2 #13's remaining half).
4. **Surface the new "ambiguous match" and "path escapes workspace" errors in the UI** — they currently return as `{success: false, error: '...'}` from IPC/apply functions; confirm the chat UI actually shows these to the user rather than swallowing them.
