import log from 'electron-log/main'
import { readdir, stat, unlink } from 'fs/promises'
import { join, dirname } from 'path'

const RETENTION_MS = 24 * 60 * 60 * 1000
const MAX_LOG_SIZE = 5 * 1024 * 1024
const ACTIVE_LOG_FILES = new Set(['main.log', 'renderer.log'])

async function cleanOldLogs(): Promise<void> {
  try {
    const logFile = log.transports.file.getFile()
    const logDir = dirname(logFile.path)
    const entries = await readdir(logDir)
    const now = Date.now()
    for (const entry of entries) {
      if (ACTIVE_LOG_FILES.has(entry)) continue
      const fullPath = join(logDir, entry)
      try {
        const s = await stat(fullPath)
        if (s.isFile() && now - s.mtimeMs > RETENTION_MS) {
          await unlink(fullPath)
        }
      } catch {
        // skip files that can't be stat'd or deleted
      }
    }
  } catch (e) {
    log.warn('Failed to clean old logs:', e)
  }
}

export function initializeLogging(): void {
  log.initialize()
  log.transports.file.maxSize = MAX_LOG_SIZE
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
  log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}'
  log.errorHandler.startCatching({ showDialog: false })
  log.info('Logging initialized')
  cleanOldLogs()
}

export { log }
