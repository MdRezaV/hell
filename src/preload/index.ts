import { contextBridge, ipcRenderer } from 'electron'
import 'electron-log/preload'

// Defaults to `any`, matching Electron's own `ipcRenderer.invoke` typing, so callers that don't
// need a specific shape (or that annotate it themselves at the call site) aren't forced into
// `unknown`. Methods below with an explicit `Promise<...>` return annotation get T inferred
// from that context instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function invoke<T = any>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

export interface ContextMenuShowPayload {
  x: number
  y: number
  misspelledWord: string
  dictionarySuggestions: string[]
}

/**
 * Renderer-facing event bridge. Deliberately exposes only `on`/`removeListener`
 * for main -> renderer pushes, never raw `invoke`/`send` — those go through the
 * named methods on `api` below so every channel the renderer can reach is
 * enumerable and typed, instead of an open door to any IPC handler by name.
 */
const events = {
  onContextMenuShow(listener: (payload: ContextMenuShowPayload) => void): () => void {
    const wrapped = (_event: unknown, payload: ContextMenuShowPayload): void => listener(payload)
    ipcRenderer.on('context-menu:show', wrapped)
    return () => ipcRenderer.removeListener('context-menu:show', wrapped)
  },
  onWorkspaceChanged(listener: () => void): () => void {
    const wrapped = (): void => listener()
    ipcRenderer.on('workspace:changed', wrapped)
    return () => ipcRenderer.removeListener('workspace:changed', wrapped)
  }
}

export interface FileReadResult {
  exists: boolean
  error: boolean
  content: string | null
}

export interface FileOpResult {
  success: boolean
  error?: string
}

const api = {
  events,

  openWorkspace: (): Promise<string | null> => invoke('open-workspace'),

  clipboardWriteText: (text: string): Promise<void> => invoke('clipboard:write-text', text),
  clipboardReadText: (): Promise<string> => invoke('clipboard:read-text'),

  readFile: (workspace: string, relativePath: string): Promise<FileReadResult> =>
    invoke('read-file', workspace, relativePath),
  writeFile: (workspace: string, relativePath: string, content: string): Promise<FileOpResult> =>
    invoke('write-file', workspace, relativePath, content),
  deleteFile: (workspace: string, relativePath: string): Promise<FileOpResult> =>
    invoke('delete-file', workspace, relativePath),
  moveFile: (workspace: string, oldPath: string, newPath: string): Promise<FileOpResult> =>
    invoke('move-file', workspace, oldPath, newPath),
  readDirectory: (workspace: string) => invoke('read-directory', workspace),
  readDirectoryTree: (workspace: string): Promise<string> =>
    invoke('read-directory-tree', workspace),
  searchFileContent: (workspace: string, filePaths: string[], query: string): Promise<string[]> =>
    invoke('search-file-content', workspace, filePaths, query),
  countLines: (
    workspace: string,
    relativePaths: string[]
  ): Promise<{ lines: number; tokens: number }> => invoke('count-lines', workspace, relativePaths),

  watchWorkspace: (workspacePath: string | null): Promise<void> =>
    invoke('workspace:watch', workspacePath),

  getLastWorkspace: (): Promise<string | null> => invoke('db:get-last-workspace'),
  getWorkspaces: () => invoke('db:get-workspaces'),
  touchWorkspace: (workspacePath: string): Promise<void> =>
    invoke('db:touch-workspace', workspacePath),
  getWorkspaceState: (workspacePath: string) => invoke('db:get-workspace-state', workspacePath),
  setFileState: (workspacePath: string, absolutePath: string, tag: string): Promise<void> =>
    invoke('db:set-file-state', workspacePath, absolutePath, tag),
  removeFileState: (workspacePath: string, absolutePath: string): Promise<void> =>
    invoke('db:remove-file-state', workspacePath, absolutePath),
  batchSetFileStates: (
    workspacePath: string,
    states: Array<{ absolutePath: string; tag: string }>
  ): Promise<void> => invoke('db:batch-set-file-states', workspacePath, states),
  batchRemoveFileStates: (workspacePath: string, absolutePaths: string[]): Promise<void> =>
    invoke('db:batch-remove-file-states', workspacePath, absolutePaths),
  clearFileStates: (workspacePath: string): Promise<void> =>
    invoke('db:clear-file-states', workspacePath),
  clearAllData: (): Promise<void> => invoke('db:clear-all'),
  setDirExpanded: (
    workspacePath: string,
    absolutePath: string,
    expanded: boolean
  ): Promise<void> => invoke('db:set-dir-expanded', workspacePath, absolutePath, expanded),
  batchSetDirExpanded: (
    workspacePath: string,
    entries: Array<{ absolutePath: string; expanded: boolean }>
  ): Promise<void> => invoke('db:batch-set-dir-expanded', workspacePath, entries),
  pruneWorkspaceState: (
    workspacePath: string,
    validFilePaths: string[],
    validDirPaths: string[]
  ): Promise<void> => invoke('db:prune-workspace-state', workspacePath, validFilePaths, validDirPaths),

  createChatSession: (
    workspacePath: string | null,
    title: string,
    messages: string,
    fileStates?: string,
    expandedDirs?: string,
    dirStructureTag?: string,
    mode?: string,
    taskId?: string
  ): Promise<string> =>
    invoke(
      'db:create-chat-session',
      workspacePath,
      title,
      messages,
      fileStates,
      expandedDirs,
      dirStructureTag,
      mode,
      taskId
    ),
  updateChatSession: (
    id: string,
    title: string,
    messages: string,
    fileStates?: string,
    expandedDirs?: string,
    dirStructureTag?: string,
    mode?: string,
    taskId?: string
  ): Promise<void> =>
    invoke(
      'db:update-chat-session',
      id,
      title,
      messages,
      fileStates,
      expandedDirs,
      dirStructureTag,
      mode,
      taskId
    ),
  getChatSessions: (workspacePath: string | null) => invoke('db:get-chat-sessions', workspacePath),
  searchChatSessions: (workspacePath: string | null, query: string) =>
    invoke('db:search-chat-sessions', workspacePath, query),
  getChatSession: (id: string) => invoke('db:get-chat-session', id),
  deleteChatSession: (id: string): Promise<void> => invoke('db:delete-chat-session', id),

  spellcheckReplace: (word: string): Promise<void> => invoke('spellcheck:replace', word),
  spellcheckAddToDictionary: (word: string): Promise<void> =>
    invoke('spellcheck:add-to-dictionary', word),

  loadSettings: () => invoke('settings:load'),
  saveSettings: (json: string): Promise<void> => invoke('settings:save', json)
}

export type HellApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
