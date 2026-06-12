import { type FSWatcher, watch, type WatchOptions } from 'chokidar'
import type { Stats } from 'fs'
import { log } from './logger'
import { loadIgnoreRules, isEntryIgnored, type IgnoreRule } from './fsUtils'

const DEBOUNCE_MS = 200
const WRITE_STABILITY_MS = 200
const WRITE_POLL_MS = 100

let currentWatcher: FSWatcher | null = null
let debounceTimer: NodeJS.Timeout | null = null

function clearDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

export function stopWatching(): void {
  clearDebounce()
  if (currentWatcher) {
    log.debug('Stopping file watcher')
    currentWatcher.close().catch((e) => {
      log.warn('Error closing watcher', e)
    })
    currentWatcher = null
  }
}

export async function startWatching(workspacePath: string, onChange: () => void): Promise<void> {
  stopWatching()
  log.info('Starting file watcher for', workspacePath)

  let rules: IgnoreRule[] = []
  try {
    rules = await loadIgnoreRules(workspacePath, [], true)
  } catch (e) {
    log.warn('Failed to load ignore rules for watcher', e)
  }

  const opts: WatchOptions = {
    ignored: ((path: string, stats?: Stats) => {
      if (!stats) return false
      return isEntryIgnored(path, stats.isDirectory(), rules)
    }) as WatchOptions['ignored'],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: WRITE_STABILITY_MS,
      pollInterval: WRITE_POLL_MS
    }
  }

  currentWatcher = watch(workspacePath, opts)

  const trigger = (): void => {
    clearDebounce()
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      onChange()
    }, DEBOUNCE_MS)
  }

  currentWatcher
    .on('add', trigger)
    .on('change', trigger)
    .on('unlink', trigger)
    .on('addDir', trigger)
    .on('unlinkDir', trigger)
    .on('error', (e) => {
      log.warn('Watcher error', e)
    })
}
