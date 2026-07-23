import { type FSWatcher, watch, type WatchOptions } from 'chokidar'
import type { Stats } from 'fs'
import { log } from './logger'
import { type IgnoreRule, isEntryIgnored, loadIgnoreRules, mergeIgnoreRules } from './fsUtils'

const DEBOUNCE_MS = 200
const WRITE_STABILITY_MS = 200
const WRITE_POLL_MS = 100

let currentWatcher: FSWatcher | null = null
let debounceTimer: NodeJS.Timeout | null = null
let closed = false

function clearDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

export async function stopWatching(): Promise<void> {
  closed = true
  clearDebounce()
  if (currentWatcher) {
    log.debug('Stopping file watcher')
    const watcher = currentWatcher
    currentWatcher = null
    await watcher.close().catch((e) => {
      log.warn('Error closing watcher', e)
    })
  }
}

export async function startWatching(workspacePath: string, onChange: () => void): Promise<void> {
  await stopWatching()
  closed = false
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

  currentWatcher = watch(workspacePath, opts)

  const trigger = (): void => {
    if (closed) return
    clearDebounce()
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (closed) return
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
