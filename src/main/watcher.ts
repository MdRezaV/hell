import { type FSWatcher, watch, type WatchOptions } from 'chokidar'
import type { Stats } from 'fs'
import { log } from './logger'
import { type IgnoreRule, isEntryIgnored, loadIgnoreRules, mergeIgnoreRules } from './fsUtils'

const DEBOUNCE_MS = 200
const WRITE_STABILITY_MS = 200
const WRITE_POLL_MS = 100

/**
 * Watches one workspace directory at a time and debounces filesystem events
 * into a single `onChange` callback. State lives on the instance (not module
 * globals) so a restart can't race a stale debounce timer from the previous
 * watcher into firing after the new one has already taken over.
 */
class WorkspaceWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private closed = false

  async stop(): Promise<void> {
    this.closed = true
    this.clearDebounce()
    if (this.watcher) {
      log.debug('Stopping file watcher')
      const watcher = this.watcher
      this.watcher = null
      await watcher.close().catch((e) => {
        log.warn('Error closing watcher', e)
      })
    }
  }

  async start(workspacePath: string, onChange: () => void): Promise<void> {
    await this.stop()
    this.closed = false
    log.info('Starting file watcher for', workspacePath)

    let rules: IgnoreRule[] = []
    try {
      rules = await loadIgnoreRules(workspacePath, [], true)
    } catch (e) {
      log.warn('Failed to load ignore rules for watcher', e)
    }
    const mergedIg = mergeIgnoreRules(rules)

    const opts: WatchOptions = {
      ignored: ((path: string, stats?: Stats) => {
        if (!stats) return false
        return isEntryIgnored(path, stats.isDirectory(), mergedIg, workspacePath)
      }) as WatchOptions['ignored'],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: WRITE_STABILITY_MS,
        pollInterval: WRITE_POLL_MS
      }
    }

    this.watcher = watch(workspacePath, opts)

    const trigger = (): void => {
      if (this.closed) return
      this.clearDebounce()
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null
        if (this.closed) return
        onChange()
      }, DEBOUNCE_MS)
    }

    this.watcher
      .on('add', trigger)
      .on('change', trigger)
      .on('unlink', trigger)
      .on('addDir', trigger)
      .on('unlinkDir', trigger)
      .on('error', (e) => {
        log.warn('Watcher error', e)
      })
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }
}

// The app watches a single workspace at a time (see `workspace:watch` in ipc.ts),
// so one shared instance matches actual usage rather than letting callers pass
// around a watcher they'd have to thread through IPC handlers.
const activeWorkspaceWatcher = new WorkspaceWatcher()

export function startWatching(workspacePath: string, onChange: () => void): Promise<void> {
  return activeWorkspaceWatcher.start(workspacePath, onChange)
}

export function stopWatching(): Promise<void> {
  return activeWorkspaceWatcher.stop()
}
