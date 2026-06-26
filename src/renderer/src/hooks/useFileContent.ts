import { useEffect, useState } from 'react'
import log from 'electron-log/renderer'
import { useWorkspace } from '../WorkspaceContext'
import { FILE_CACHE_MAX, fileContentCache, type FileState, ipcThrottle } from '../utils/fileApply'

interface FileStateCache {
  data: FileState
  path: string
  workspace: string
}

const NO_WORKSPACE_STATE: FileState = { exists: false, content: null }

function normalizeContent(content: string | null): string | null {
  if (content === null) return null
  return content.replace(/\r\n/g, '\n')
}

export function useFileContent(path: string): FileState | null {
  const { workspace } = useWorkspace()
  const [cache, setCache] = useState<FileStateCache | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [stableState, setStableState] = useState<FileState | null>(null)
  const [prevPath, setPrevPath] = useState(path)
  const [prevWorkspace, setPrevWorkspace] = useState(workspace)
  const [prevCache, setPrevCache] = useState<FileStateCache | null>(null)

  useEffect(() => {
    if (!workspace) return
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { workspace: string; path: string }
      if (detail.workspace === workspace && detail.path === path) {
        setRefreshKey((k) => k + 1)
      }
    }
    const wsHandler = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { workspace: string }
      if (detail.workspace === workspace) {
        setRefreshKey((k) => k + 1)
      }
    }
    window.addEventListener('file-content-invalidated', handler)
    window.addEventListener('workspace-files-invalidated', wsHandler)
    return () => {
      window.removeEventListener('file-content-invalidated', handler)
      window.removeEventListener('workspace-files-invalidated', wsHandler)
    }
  }, [workspace, path])

  useEffect(() => {
    if (!workspace) return
    const cacheKey = `${workspace}::${path}`
    let cancelled = false

    const existingPromise = fileContentCache.get(cacheKey)
    if (existingPromise) {
      existingPromise.then((result) => {
        if (!cancelled) setCache({ data: result, path, workspace })
      })
    } else {
      const promise = ipcThrottle(
        () => window.electron.ipcRenderer.invoke('read-file', workspace, path) as Promise<FileState>
      ).catch((e) => {
        log.error(`Failed to read file ${path}:`, e)
        return { exists: false, content: null }
      })
      if (fileContentCache.size >= FILE_CACHE_MAX) {
        const firstKey = fileContentCache.keys().next().value
        if (firstKey !== undefined) fileContentCache.delete(firstKey)
      }
      fileContentCache.set(cacheKey, promise)
      promise.then((result) => {
        if (!cancelled) setCache({ data: result, path, workspace })
      })
    }

    return () => {
      cancelled = true
    }
  }, [workspace, path, refreshKey])

  if (path !== prevPath || workspace !== prevWorkspace) {
    setPrevPath(path)
    setPrevWorkspace(workspace)
    setStableState(null)
    setPrevCache(null)
  } else if (cache !== prevCache) {
    setPrevCache(cache)
    if (!cache || cache.path !== path || cache.workspace !== workspace) {
      setStableState(null)
    } else {
      const next = cache.data
      setStableState((prev) => {
        const isSame =
          prev === next ||
          (prev !== null &&
            prev.exists === next.exists &&
            (prev.content === next.content ||
              normalizeContent(prev.content) === normalizeContent(next.content)))
        return isSame ? prev : next
      })
    }
  }

  if (!workspace) {
    return NO_WORKSPACE_STATE
  }

  if (!cache || cache.path !== path || cache.workspace !== workspace) {
    return null
  }

  return stableState
}
