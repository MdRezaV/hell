import { type FSWatcher, watch } from 'chokidar'

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
    currentWatcher.close().catch(() => {
      /* ignore close errors */
    })
    currentWatcher = null
  }
}

export function startWatching(workspacePath: string, onChange: () => void): void {
  stopWatching()

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
    .on('error', () => {
      /* swallow watcher errors (e.g. permission issues on subdirs) */
    })
}
