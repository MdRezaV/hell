import { resolve, sep } from 'path'

/**
 * Thrown when a caller-supplied path would resolve outside its workspace root.
 * IPC handlers must catch this distinctly from filesystem errors (e.g. ENOENT)
 * so traversal attempts are logged and rejected rather than silently followed.
 */
export class PathTraversalError extends Error {
  constructor(
    readonly attemptedPath: string,
    readonly workspaceRoot: string
  ) {
    super(`Path "${attemptedPath}" escapes workspace root "${workspaceRoot}"`)
    this.name = 'PathTraversalError'
  }
}

/**
 * Confines path resolution to a single workspace root. Every file IPC handler
 * that accepts a renderer-supplied relative path must resolve it through here
 * instead of a bare `path.join`, which happily follows `..` outside the root.
 */
export class WorkspacePath {
  private readonly root: string

  private constructor(root: string) {
    this.root = root
  }

  static for(workspace: string): WorkspacePath {
    return new WorkspacePath(resolve(workspace))
  }

  get workspaceRoot(): string {
    return this.root
  }

  /** Resolves `relativePath` against the workspace root, throwing if it escapes. */
  resolve(relativePath: string): string {
    const full = resolve(this.root, relativePath)
    if (!this.containsResolved(full)) {
      throw new PathTraversalError(relativePath, this.root)
    }
    return full
  }

  /** True if the given absolute (or relative-to-cwd) path resolves inside this workspace. */
  contains(candidatePath: string): boolean {
    return this.containsResolved(resolve(candidatePath))
  }

  private containsResolved(full: string): boolean {
    return full === this.root || full.startsWith(this.root + sep)
  }
}
