import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'

const MAX_WORKSPACES = 5

let db: Database.Database | null = null

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'hell.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      path TEXT PRIMARY KEY,
      last_opened INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS file_states (
      workspace_path TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (workspace_path, relative_path),
      FOREIGN KEY (workspace_path) REFERENCES workspaces(path) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS expanded_dirs (
      workspace_path TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      PRIMARY KEY (workspace_path, relative_path),
      FOREIGN KEY (workspace_path) REFERENCES workspaces(path) ON DELETE CASCADE
    );
  `)
}

export function closeDatabase(): void {
  if (db) {
    try {
      db.close()
    } catch {
      /* ignore */
    }
    db = null
  }
}

function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

function toRelative(workspacePath: string, absolutePath: string): string {
  if (absolutePath.startsWith(workspacePath)) {
    let rel = absolutePath.substring(workspacePath.length)
    if (rel.startsWith('/') || rel.startsWith('\\')) rel = rel.substring(1)
    return rel
  }
  return absolutePath
}

export function touchWorkspace(workspacePath: string): void {
  const d = getDb()
  d.prepare(
    `INSERT INTO workspaces (path, last_opened) VALUES (?, ?)
     ON CONFLICT(path) DO UPDATE SET last_opened = excluded.last_opened`
  ).run(workspacePath, Date.now())

  const row = d.prepare('SELECT COUNT(*) AS c FROM workspaces').get() as { c: number }
  if (row.c > MAX_WORKSPACES) {
    const excess = row.c - MAX_WORKSPACES
    const oldest = d
      .prepare('SELECT path FROM workspaces ORDER BY last_opened ASC LIMIT ?')
      .all(excess) as Array<{ path: string }>
    const del = d.prepare('DELETE FROM workspaces WHERE path = ?')
    const tx = d.transaction(() => {
      for (const r of oldest) del.run(r.path)
    })
    tx()
  }
}

export interface WorkspaceState {
  fileStates: Array<[string, string]>
  expandedDirs: string[]
}

export function getWorkspaceState(workspacePath: string): WorkspaceState {
  const d = getDb()
  const files = d
    .prepare('SELECT relative_path, tag FROM file_states WHERE workspace_path = ?')
    .all(workspacePath) as Array<{ relative_path: string; tag: string }>
  const dirs = d
    .prepare('SELECT relative_path FROM expanded_dirs WHERE workspace_path = ?')
    .all(workspacePath) as Array<{ relative_path: string }>

  return {
    fileStates: files.map((f) => [f.relative_path, f.tag]),
    expandedDirs: dirs.map((r) => r.relative_path)
  }
}

export function getLastWorkspace(): string | null {
  const d = getDb()
  const row = d
    .prepare('SELECT path FROM workspaces ORDER BY last_opened DESC LIMIT 1')
    .get() as { path: string } | undefined
  return row?.path ?? null
}

export function setFileState(workspacePath: string, absolutePath: string, tag: string): void {
  const d = getDb()
  const rel = toRelative(workspacePath, absolutePath)
  d.prepare(
    `INSERT INTO file_states (workspace_path, relative_path, tag) VALUES (?, ?, ?)
     ON CONFLICT(workspace_path, relative_path) DO UPDATE SET tag = excluded.tag`
  ).run(workspacePath, rel, tag)
}

export function removeFileState(workspacePath: string, absolutePath: string): void {
  const d = getDb()
  const rel = toRelative(workspacePath, absolutePath)
  d.prepare('DELETE FROM file_states WHERE workspace_path = ? AND relative_path = ?').run(
    workspacePath,
    rel
  )
}

export function clearFileStates(workspacePath: string): void {
  const d = getDb()
  d.prepare('DELETE FROM file_states WHERE workspace_path = ?').run(workspacePath)
}

export function setDirExpanded(workspacePath: string, absolutePath: string, expanded: boolean): void {
  const d = getDb()
  const rel = toRelative(workspacePath, absolutePath)
  if (expanded) {
    d.prepare(
      `INSERT OR IGNORE INTO expanded_dirs (workspace_path, relative_path) VALUES (?, ?)`
    ).run(workspacePath, rel)
  } else {
    d.prepare('DELETE FROM expanded_dirs WHERE workspace_path = ? AND relative_path = ?').run(
      workspacePath,
      rel
    )
  }
}