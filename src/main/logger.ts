import log from 'electron-log/main'

export function initializeLogging(): void {
  log.initialize()
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
  log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}'
  log.errorHandler.startCatching({ showDialog: false })
  log.info('Logging initialized')
}

export { log }
