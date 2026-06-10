import { type FSWatcher, watch } from 'chokidar'
import { log } from './logger'

const DEBOUNCE_MS = 200
const WRITE_STABILITY_MS = 200
const WRITE_POLL_MS = 50

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

export function startWatching(workspacePath: string, onChange: () => void): void {
  stopWatching()
  log.info('Starting file watcher for', workspacePath)

  currentWatcher = watch(workspacePath, {
    ignored: [/(^|[/\\])\.git([/\\]|$)/],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: WRITE_STABILITY_MS,
      pollInterval: WRITE_POLL_MS
    }
  })

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
