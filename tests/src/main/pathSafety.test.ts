import { describe, expect, it } from 'vitest'
import { sep } from 'path'
import { PathTraversalError, WorkspacePath } from '../../../src/main/pathSafety'

describe('WorkspacePath', () => {
  it('resolves a plain relative path inside the workspace', () => {
    const ws = WorkspacePath.for('/workspace')
    expect(ws.resolve('src/index.ts')).toBe(`${ws.workspaceRoot}${sep}src${sep}index.ts`)
  })

  it('resolves the workspace root itself', () => {
    const ws = WorkspacePath.for('/workspace')
    expect(ws.resolve('.')).toBe(ws.workspaceRoot)
  })

  it('throws PathTraversalError for a path escaping the workspace via ..', () => {
    const ws = WorkspacePath.for('/workspace')
    expect(() => ws.resolve('../../etc/passwd')).toThrow(PathTraversalError)
  })

  it('throws for an absolute path outside the workspace', () => {
    const ws = WorkspacePath.for('/workspace')
    expect(() => ws.resolve('/etc/passwd')).toThrow(PathTraversalError)
  })

  it('does not treat a sibling directory with a shared prefix as contained', () => {
    // Regression guard for the classic "/workspace" vs "/workspace-other" bug.
    const ws = WorkspacePath.for('/workspace')
    expect(ws.contains('/workspace-other/secret.txt')).toBe(false)
  })

  it('contains() accepts nested paths and rejects paths outside the root', () => {
    const ws = WorkspacePath.for('/workspace')
    expect(ws.contains('/workspace/src/index.ts')).toBe(true)
    expect(ws.contains('/elsewhere/index.ts')).toBe(false)
  })
})
