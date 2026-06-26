import log from 'electron-log/renderer'
import { normalizeLineEndings } from './markdownParser'
import { findLooseMatch } from './looseMatch'

export interface ApplyResult {
  success: boolean
  error?: string
}

export interface FileState {
  exists: boolean
  content: string | null
}

export const FILE_CACHE_MAX = 256
const IPC_CONCURRENCY_LIMIT = 4

export const fileContentCache = new Map<string, Promise<FileState>>()

let ipcInFlight = 0
const ipcQueue: Array<() => void> = []

function processIpcQueue(): void {
  while (ipcQueue.length > 0 && ipcInFlight < IPC_CONCURRENCY_LIMIT) {
    ipcQueue.shift()!()
  }
}

export function ipcThrottle<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = (): void => {
      ipcInFlight++
      fn().then(
        (result) => {
          ipcInFlight--
          resolve(result)
          processIpcQueue()
        },
        (err) => {
          ipcInFlight--
          reject(err)
          processIpcQueue()
        }
      )
    }
    if (ipcInFlight < IPC_CONCURRENCY_LIMIT) {
      run()
    } else {
      ipcQueue.push(run)
    }
  })
}

export function invalidateFileContentCache(workspace: string, path: string): void {
  fileContentCache.delete(`${workspace}::${path}`)
  window.dispatchEvent(new CustomEvent('file-content-invalidated', { detail: { workspace, path } }))
}

export function invalidateWorkspaceFileCache(workspace: string): void {
  for (const key of fileContentCache.keys()) {
    if (key.startsWith(`${workspace}::`)) {
      fileContentCache.delete(key)
    }
  }
  window.dispatchEvent(new CustomEvent('workspace-files-invalidated', { detail: { workspace } }))
}

export async function readFile(workspace: string, path: string): Promise<FileState> {
  return (await window.electron.ipcRenderer.invoke(
    'read-file',
    workspace,
    path
  )) as Promise<FileState>
}

export async function applyFileWrite(
  workspace: string,
  path: string,
  content: string
): Promise<ApplyResult> {
  try {
    return await ((await window.electron.ipcRenderer.invoke(
      'write-file',
      workspace,
      path,
      content
    )) as Promise<ApplyResult>)
  } catch (e) {
    log.error('Failed to write file:', e)
    return { success: false, error: String(e) }
  }
}

export async function applyFileReplace(
  workspace: string,
  path: string,
  oldCode: string,
  newCode: string
): Promise<ApplyResult> {
  try {
    const fileResult = await readFile(workspace, path)
    if (!fileResult.exists || fileResult.content === null) {
      return { success: false, error: 'File not found' }
    }
    const content = normalizeLineEndings(fileResult.content)
    const normalizedOldCode = normalizeLineEndings(oldCode)
    const normalizedNewCode = normalizeLineEndings(newCode)

    const exactIdx = content.indexOf(normalizedOldCode)
    if (exactIdx !== -1) {
      const newContent =
        content.slice(0, exactIdx) +
        normalizedNewCode +
        content.slice(exactIdx + normalizedOldCode.length)
      return applyFileWrite(workspace, path, newContent)
    }

    const loose = findLooseMatch(content, normalizedOldCode)
    if (loose) {
      const newContent =
        content.slice(0, loose.start) + normalizedNewCode + content.slice(loose.end)
      return applyFileWrite(workspace, path, newContent)
    }

    return { success: false, error: 'Search text not found in file' }
  } catch (e) {
    log.error('Failed to apply replace:', e)
    return { success: false, error: String(e) }
  }
}

export async function unapplyFileReplace(
  workspace: string,
  path: string,
  oldCode: string,
  newCode: string
): Promise<ApplyResult> {
  try {
    const fileResult = await readFile(workspace, path)
    if (!fileResult.exists || fileResult.content === null) {
      return { success: false, error: 'File not found' }
    }
    const content = normalizeLineEndings(fileResult.content)
    const normalizedOldCode = normalizeLineEndings(oldCode)
    const normalizedNewCode = normalizeLineEndings(newCode)

    const exactIdx = content.lastIndexOf(normalizedNewCode)
    if (exactIdx !== -1) {
      const newContent =
        content.slice(0, exactIdx) +
        normalizedOldCode +
        content.slice(exactIdx + normalizedNewCode.length)
      return applyFileWrite(workspace, path, newContent)
    }

    return { success: false, error: 'Applied text not found in file' }
  } catch (e) {
    log.error('Failed to unapply replace:', e)
    return { success: false, error: String(e) }
  }
}

export type ReplaceState = 'idle' | 'applied' | 'notFound'

export function detectReplaceState(
  content: string | null,
  exists: boolean,
  oldCode: string,
  newCode: string
): ReplaceState {
  if (!exists || content === null) return 'notFound'

  const normalizedContent = normalizeLineEndings(content)
  const normalizedOldCode = normalizeLineEndings(oldCode)
  const normalizedNewCode = normalizeLineEndings(newCode)

  if (normalizedContent.indexOf(normalizedOldCode) !== -1) return 'idle'
  if (findLooseMatch(normalizedContent, normalizedOldCode)) return 'idle'

  if (normalizedContent.includes(normalizedNewCode)) return 'applied'
  if (findLooseMatch(normalizedContent, normalizedNewCode)) return 'applied'

  return 'notFound'
}

export async function applyFileMove(
  workspace: string,
  oldPath: string,
  newPath: string
): Promise<ApplyResult> {
  try {
    const readResult = await readFile(workspace, oldPath)
    if (!readResult.exists || readResult.content === null) {
      return { success: false, error: 'Source file not found' }
    }
    const writeResult = await applyFileWrite(workspace, newPath, readResult.content)
    if (!writeResult.success) return writeResult
    return await (window.electron.ipcRenderer.invoke(
      'delete-file',
      workspace,
      oldPath
    ) as Promise<ApplyResult>)
  } catch (e) {
    log.error('Failed to apply move:', e)
    return { success: false, error: String(e) }
  }
}

export async function applyFileDelete(workspace: string, path: string): Promise<ApplyResult> {
  try {
    return await (window.electron.ipcRenderer.invoke(
      'delete-file',
      workspace,
      path
    ) as Promise<ApplyResult>)
  } catch (e) {
    log.error('Failed to delete file:', e)
    return { success: false, error: String(e) }
  }
}
