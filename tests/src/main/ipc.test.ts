import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { registerIpcHandlers } from '../../../src/main/ipc'
import * as fsPromises from 'fs/promises'
import * as fs from 'fs'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const listeners = new Map<string, ((...args: unknown[]) => void)[]>()

interface ReadFileResult {
  exists: boolean
  error: boolean
  content: string | null
}

interface WriteFileResult {
  success: boolean
  error?: string
}

interface DeleteFileResult {
  success: boolean
  error?: string
}

interface CountLinesResult {
  lines: number
  tokens: number
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      if (!listeners.has(channel)) listeners.set(channel, [])
      listeners.get(channel)!.push(listener)
    }
  },
  dialog: {
    showOpenDialog: vi.fn()
  },
  BrowserWindow: {
    fromWebContents: vi.fn()
  }
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn()
}))

vi.mock('fs', () => ({
  createReadStream: vi.fn()
}))

vi.mock('js-tiktoken', () => ({
  getEncoding: vi.fn(() => ({
    encode: vi.fn((text: string) => text.split(' '))
  }))
}))

vi.mock('../../../src/main/database', () => ({
  getLastWorkspace: vi.fn(),
  touchWorkspace: vi.fn(),
  getWorkspaceState: vi.fn(),
  setFileState: vi.fn(),
  removeFileState: vi.fn(),
  batchSetFileStates: vi.fn(),
  batchRemoveFileStates: vi.fn(),
  clearFileStates: vi.fn(),
  clearAllData: vi.fn(),
  setDirExpanded: vi.fn(),
  pruneWorkspaceState: vi.fn(),
  createChatSession: vi.fn(),
  updateChatSession: vi.fn(),
  getChatSessions: vi.fn(),
  getChatSession: vi.fn(),
  deleteChatSession: vi.fn(),
  snapshotWorkspaceStateToSession: vi.fn(() => ({ fileStates: '[]', expandedDirs: '[]' }))
}))

vi.mock('../../../src/main/fsUtils', () => ({
  readDirTree: vi.fn(),
  formatTreeText: vi.fn()
}))

vi.mock('../../../src/main/watcher', () => ({
  startWatching: vi.fn(),
  stopWatching: vi.fn()
}))

vi.mock('../../../src/main/logger', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

describe('IPC Handlers', () => {
  beforeEach(() => {
    handlers.clear()
    listeners.clear()
    vi.clearAllMocks()
    registerIpcHandlers()
  })

  it('should register ping listener', () => {
    expect(listeners.has('ping')).toBe(true)
  })

  describe('read-file', () => {
    it('should return file content when successful', async () => {
      const handler = handlers.get('read-file')!
      vi.mocked(fsPromises.readFile).mockResolvedValue('file content')

      const result = (await handler({}, '/workspace', 'test.txt')) as ReadFileResult

      expect(result).toEqual({ exists: true, error: false, content: 'file content' })
      expect(fsPromises.readFile).toHaveBeenCalledWith(join('/workspace', 'test.txt'), 'utf-8')
    })

    it('should return exists: false on ENOENT', async () => {
      const handler = handlers.get('read-file')!
      const err = Object.assign(new Error('Not found'), { code: 'ENOENT' })
      vi.mocked(fsPromises.readFile).mockRejectedValue(err)

      const result = (await handler({}, '/workspace', 'missing.txt')) as ReadFileResult

      expect(result).toEqual({ exists: false, error: false, content: null })
    })

    it('should return error: true on other errors', async () => {
      const handler = handlers.get('read-file')!
      vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('Permission denied'))

      const result = (await handler({}, '/workspace', 'secret.txt')) as ReadFileResult

      expect(result).toEqual({ exists: true, error: true, content: null })
    })
  })

  describe('write-file', () => {
    it('should write file and create directories', async () => {
      const handler = handlers.get('write-file')!
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined)
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined)

      const result = (await handler(
        {},
        '/workspace',
        'dir/test.txt',
        'new content'
      )) as WriteFileResult

      expect(result).toEqual({ success: true })
      expect(fsPromises.mkdir).toHaveBeenCalledWith(join('/workspace', 'dir'), { recursive: true })
      expect(fsPromises.writeFile).toHaveBeenCalledWith(
        join('/workspace', 'dir/test.txt'),
        'new content',
        'utf-8'
      )
    })

    it('should return success: false on error', async () => {
      const handler = handlers.get('write-file')!
      vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined)
      vi.mocked(fsPromises.writeFile).mockRejectedValue(new Error('Disk full'))

      const result = (await handler({}, '/workspace', 'test.txt', 'content')) as WriteFileResult

      expect(result).toEqual({ success: false, error: 'Disk full' })
    })
  })

  describe('delete-file', () => {
    it('should delete file successfully', async () => {
      const handler = handlers.get('delete-file')!
      vi.mocked(fsPromises.unlink).mockResolvedValue(undefined)

      const result = (await handler({}, '/workspace', 'test.txt')) as DeleteFileResult

      expect(result).toEqual({ success: true })
      expect(fsPromises.unlink).toHaveBeenCalledWith(join('/workspace', 'test.txt'))
    })

    it('should return success: false on error', async () => {
      const handler = handlers.get('delete-file')!
      vi.mocked(fsPromises.unlink).mockRejectedValue(new Error('File in use'))

      const result = (await handler({}, '/workspace', 'test.txt')) as DeleteFileResult

      expect(result).toEqual({ success: false, error: 'File in use' })
    })
  })

  describe('search-file-content', () => {
    function createMockStream(chunks: Buffer[]):
      | {
          [Symbol.asyncIterator](): {
            next(): Promise<
              | { done: boolean; value: undefined }
              | { done: boolean; value: Buffer<ArrayBufferLike> }
            >
          }
          destroy(): void
        }
      | {
          next(): Promise<
            { done: boolean; value: undefined } | { done: boolean; value: Buffer<ArrayBufferLike> }
          >
        }
      | {
          done: false
          value: Buffer<ArrayBufferLike>
        }
      | { done: true; value: undefined } {
      let i = 0
      let destroyed = false
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (destroyed || i >= chunks.length) return { done: true, value: undefined }
              return { done: false, value: chunks[i++] }
            }
          }
        },
        destroy() {
          destroyed = true
        }
      }
    }

    it('should find query in file content', async () => {
      const handler = handlers.get('search-file-content')!
      const mockStream = createMockStream([Buffer.from('hello world'), Buffer.from('foo bar')])
      vi.mocked(fs.createReadStream).mockReturnValue(
        mockStream as unknown as ReturnType<typeof fs.createReadStream>
      )

      const result = await handler({}, '/workspace', ['/workspace/test.txt'], 'foo')

      expect(result).toEqual(['/workspace/test.txt'])
    })

    it('should not find query if not present', async () => {
      const handler = handlers.get('search-file-content')!
      const mockStream = createMockStream([Buffer.from('hello world')])
      vi.mocked(fs.createReadStream).mockReturnValue(
        mockStream as unknown as ReturnType<typeof fs.createReadStream>
      )

      const result = await handler({}, '/workspace', ['/workspace/test.txt'], 'missing')

      expect(result).toEqual([])
    })
  })

  describe('count-lines', () => {
    it('should count lines and tokens correctly', async () => {
      const handler = handlers.get('count-lines')!
      vi.mocked(fsPromises.readFile).mockImplementation(async (path) => {
        const pathStr = String(path)
        if (pathStr.endsWith('a.txt')) return Buffer.from('line1\nline2\nline3')
        if (pathStr.endsWith('b.txt')) return Buffer.from('single line')
        if (pathStr.endsWith('empty.txt')) return Buffer.alloc(0)
        throw Object.assign(new Error('Not found'), { code: 'ENOENT' })
      })

      const result = (await handler({}, '/workspace', [
        'a.txt',
        'b.txt',
        'empty.txt',
        'missing.txt'
      ])) as CountLinesResult

      expect(result.lines).toBe(4)
      expect(result.tokens).toBe(3)
    })
  })
})
