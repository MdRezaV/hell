import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdirSync, rmSync } from 'fs'
import { app } from 'electron'
import {
  batchSetFileStates,
  clearFileStates,
  closeDatabase,
  createChatSession,
  deleteChatSession,
  getChatSession,
  getChatSessions,
  getWorkspaceState,
  initDatabase,
  removeFileState,
  setDirExpanded,
  setFileState,
  touchWorkspace,
  updateChatSession
} from '../src/main/database'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn()
  }
}))

vi.mock('../src/main/logger', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

describe('database', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `hell-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    vi.mocked(app.getPath).mockReturnValue(testDir)
    initDatabase()
  })

  afterEach(() => {
    closeDatabase()
    rmSync(testDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('should initialize database without errors', () => {
    expect(true).toBe(true)
  })

  it('should manage workspaces and empty state', () => {
    const ws = '/workspace'
    touchWorkspace(ws)

    const state = getWorkspaceState(ws)
    expect(state.fileStates).toEqual([])
    expect(state.expandedDirs).toEqual([])
  })

  it('should manage file states', () => {
    const ws = '/workspace'
    touchWorkspace(ws)

    setFileState(ws, '/workspace/src/index.ts', 'modified')
    let state = getWorkspaceState(ws)
    expect(state.fileStates).toEqual([['src/index.ts', 'modified']])

    batchSetFileStates(ws, [
      { absolutePath: '/workspace/src/app.ts', tag: 'new' },
      { absolutePath: '/workspace/src/index.ts', tag: 'saved' }
    ])
    state = getWorkspaceState(ws)
    expect(state.fileStates).toHaveLength(2)
    expect(state.fileStates).toContainEqual(['src/app.ts', 'new'])
    expect(state.fileStates).toContainEqual(['src/index.ts', 'saved'])

    removeFileState(ws, '/workspace/src/app.ts')
    state = getWorkspaceState(ws)
    expect(state.fileStates).toHaveLength(1)

    clearFileStates(ws)
    state = getWorkspaceState(ws)
    expect(state.fileStates).toHaveLength(0)
  })

  it('should manage expanded directories', () => {
    const ws = '/workspace'
    touchWorkspace(ws)

    setDirExpanded(ws, '/workspace/src', true)
    let state = getWorkspaceState(ws)
    expect(state.expandedDirs).toEqual(['src'])

    setDirExpanded(ws, '/workspace/src/components', true)
    state = getWorkspaceState(ws)
    expect(state.expandedDirs).toHaveLength(2)

    setDirExpanded(ws, '/workspace/src', false)
    state = getWorkspaceState(ws)
    expect(state.expandedDirs).toEqual(['src/components'])
  })

  it('should manage chat sessions', () => {
    const ws = '/workspace'
    touchWorkspace(ws)

    const id = createChatSession(ws, 'Test Chat', '[]')
    expect(id).toBeDefined()

    const sessions = getChatSessions(ws)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].title).toBe('Test Chat')

    const session = getChatSession(id)
    expect(session).not.toBeNull()
    expect(session?.messages).toBe('[]')

    updateChatSession(id, 'Updated Chat', '[{"role":"user","content":"hi"}]')
    const updated = getChatSession(id)
    expect(updated?.title).toBe('Updated Chat')
    expect(updated?.messages).toBe('[{"role":"user","content":"hi"}]')

    deleteChatSession(id)
    const deleted = getChatSession(id)
    expect(deleted).toBeNull()
  })
})
