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
  return await window.api.readFile(workspace, path)
}

export async function applyFileWrite(
  workspace: string,
  path: string,
  content: string
): Promise<ApplyResult> {
  try {
    return await window.api.writeFile(workspace, path, content)
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
      if (content.indexOf(normalizedOldCode, exactIdx + 1) !== -1) {
        return {
          success: false,
          error: 'Search text matches multiple locations in file; add more context to disambiguate'
        }
      }
      const newContent =
        content.slice(0, exactIdx) +
        normalizedNewCode +
        content.slice(exactIdx + normalizedOldCode.length)
      return applyFileWrite(workspace, path, newContent)
    }

    const loose = findLooseMatch(content, normalizedOldCode)
    if (loose) {
      if (loose.ambiguous) {
        return {
          success: false,
          error: 'Search text matches multiple locations in file; add more context to disambiguate'
        }
      }
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

let cachedLooseMatchContent: string | null = null
const cachedLooseMatchResults = new Map<string, boolean>()

function cachedFindLooseMatch(content: string, search: string): boolean {
  if (search.length > content.length) return false

  if (content !== cachedLooseMatchContent) {
    cachedLooseMatchContent = content
    cachedLooseMatchResults.clear()
  }

  const cached = cachedLooseMatchResults.get(search)
  if (cached !== undefined) return cached

  const result = Boolean(findLooseMatch(content, search))
  cachedLooseMatchResults.set(search, result)
  return result
}

/**
 * All string inputs must already be normalized via `normalizeLineEndings`.
 * Returns early on the first exact or loose match, skipping the expensive
 * `findLooseMatch` call when `indexOf` succeeds. Loose-match results are
 * memoized per content reference with a length-based fast-path rejection
 * to avoid redundant tokenization across re-renders.
 */
export function detectReplaceState(
  normalizedContent: string | null,
  exists: boolean,
  normalizedOldCode: string,
  normalizedNewCode: string
): ReplaceState {
  if (!exists || normalizedContent === null) return 'notFound'

  if (normalizedContent.indexOf(normalizedOldCode) !== -1) return 'idle'
  if (cachedFindLooseMatch(normalizedContent, normalizedOldCode)) return 'idle'

  if (normalizedContent.indexOf(normalizedNewCode) !== -1) return 'applied'
  if (cachedFindLooseMatch(normalizedContent, normalizedNewCode)) return 'applied'

  return 'notFound'
}

export async function applyFileMove(
  workspace: string,
  oldPath: string,
  newPath: string
): Promise<ApplyResult> {
  try {
    return await window.api.moveFile(workspace, oldPath, newPath)
  } catch (e) {
    log.error('Failed to apply move:', e)
    return { success: false, error: String(e) }
  }
}

export async function applyFileDelete(workspace: string, path: string): Promise<ApplyResult> {
  try {
    return await window.api.deleteFile(workspace, path)
  } catch (e) {
    log.error('Failed to delete file:', e)
    return { success: false, error: String(e) }
  }
}
