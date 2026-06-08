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
    CREATE TABLE IF NOT EXISTS workspaces
    (
      path
      TEXT
      PRIMARY
      KEY,
      last_opened
      INTEGER
      NOT
      NULL
    );
    CREATE TABLE IF NOT EXISTS file_states
    (
      workspace_path
      TEXT
      NOT
      NULL,
      relative_path
      TEXT
      NOT
      NULL,
      tag
      TEXT
      NOT
      NULL,
      PRIMARY
      KEY
    (
      workspace_path,
      relative_path
    ),
      FOREIGN KEY
    (
      workspace_path
    ) REFERENCES workspaces
    (
      path
    ) ON DELETE CASCADE
      );
    CREATE TABLE IF NOT EXISTS expanded_dirs
    (
      workspace_path
      TEXT
      NOT
      NULL,
      relative_path
      TEXT
      NOT
      NULL,
      PRIMARY
      KEY
    (
      workspace_path,
      relative_path
    ),
      FOREIGN KEY
    (
      workspace_path
    ) REFERENCES workspaces
    (
      path
    ) ON DELETE CASCADE
      );
    CREATE TABLE IF NOT EXISTS workspace_settings
    (
      workspace_path
      TEXT
      PRIMARY
      KEY,
      include_dir_structure
      INTEGER
      NOT
      NULL
      DEFAULT
      1,
      FOREIGN KEY
    (
      workspace_path
    ) REFERENCES workspaces
    (
      path
    ) ON DELETE CASCADE
      );
    CREATE TABLE IF NOT EXISTS chat_sessions
    (
      id
      TEXT
      PRIMARY
      KEY,
      workspace_path
      TEXT,
      title
      TEXT
      NOT
      NULL,
      messages
      TEXT
      NOT
      NULL,
      created_at
      INTEGER
      NOT
      NULL,
      updated_at
      INTEGER
      NOT
      NULL
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
  const row = d.prepare('SELECT path FROM workspaces ORDER BY last_opened DESC LIMIT 1').get() as
    | { path: string }
    | undefined
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

export function batchSetFileStates(
  workspacePath: string,
  states: Array<{ absolutePath: string; tag: string }>
): void {
  const d = getDb()
  const stmt = d.prepare(
    `INSERT INTO file_states (workspace_path, relative_path, tag) VALUES (?, ?, ?)
     ON CONFLICT(workspace_path, relative_path) DO UPDATE SET tag = excluded.tag`
  )
  const tx = d.transaction(() => {
    for (const { absolutePath, tag } of states) {
      const rel = toRelative(workspacePath, absolutePath)
      stmt.run(workspacePath, rel, tag)
    }
  })
  tx()
}

export function batchRemoveFileStates(workspacePath: string, absolutePaths: string[]): void {
  const d = getDb()
  const stmt = d.prepare('DELETE FROM file_states WHERE workspace_path = ? AND relative_path = ?')
  const tx = d.transaction(() => {
    for (const absolutePath of absolutePaths) {
      const rel = toRelative(workspacePath, absolutePath)
      stmt.run(workspacePath, rel)
    }
  })
  tx()
}

export function clearFileStates(workspacePath: string): void {
  const d = getDb()
  d.prepare('DELETE FROM file_states WHERE workspace_path = ?').run(workspacePath)
}

export function setDirExpanded(
  workspacePath: string,
  absolutePath: string,
  expanded: boolean
): void {
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

export function getIncludeDirStructure(workspacePath: string): boolean {
  const d = getDb()
  const row = d
    .prepare('SELECT include_dir_structure FROM workspace_settings WHERE workspace_path = ?')
    .get(workspacePath) as { include_dir_structure: number } | undefined
  return row ? row.include_dir_structure === 1 : true
}

export function setIncludeDirStructure(workspacePath: string, value: boolean): void {
  const d = getDb()
  d.prepare(
    `INSERT INTO workspace_settings (workspace_path, include_dir_structure) VALUES (?, ?)
     ON CONFLICT(workspace_path) DO UPDATE SET include_dir_structure = excluded.include_dir_structure`
  ).run(workspacePath, value ? 1 : 0)
}

export interface ChatSession {
  id: string
  workspace_path: string | null
  title: string
  messages: string
  created_at: number
  updated_at: number
}

export function createChatSession(
  workspacePath: string | null,
  title: string,
  messages: string
): string {
  const d = getDb()
  const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  d.prepare(
    `INSERT INTO chat_sessions (id, workspace_path, title, messages, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, workspacePath ?? null, title, messages, Date.now(), Date.now())
  return id
}

export function updateChatSession(id: string, title: string, messages: string): void {
  const d = getDb()
  d.prepare(`UPDATE chat_sessions SET title = ?, messages = ?, updated_at = ? WHERE id = ?`).run(
    title,
    messages,
    Date.now(),
    id
  )
}

export function getChatSessions(workspacePath: string | null): ChatSession[] {
  const d = getDb()
  if (workspacePath) {
    return d
      .prepare(`SELECT * FROM chat_sessions WHERE workspace_path = ? ORDER BY updated_at DESC`)
      .all(workspacePath) as ChatSession[]
  }
  return d.prepare(`SELECT * FROM chat_sessions ORDER BY updated_at DESC`).all() as ChatSession[]
}

export function getChatSession(id: string): ChatSession | null {
  const d = getDb()
  const row = d.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as
    | ChatSession
    | undefined
  return row ?? null
}

export function deleteChatSession(id: string): void {
  const d = getDb()
  d.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id)
}

export function pruneWorkspaceState(
  workspacePath: string,
  validFilePaths: string[],
  validDirPaths: string[]
): void {
  const d = getDb()
  const validRelFiles = new Set(validFilePaths.map((p) => toRelative(workspacePath, p)))
  const validRelDirs = new Set(validDirPaths.map((p) => toRelative(workspacePath, p)))

  const fileStates = d
    .prepare('SELECT relative_path FROM file_states WHERE workspace_path = ?')
    .all(workspacePath) as Array<{ relative_path: string }>
  const expandedDirs = d
    .prepare('SELECT relative_path FROM expanded_dirs WHERE workspace_path = ?')
    .all(workspacePath) as Array<{ relative_path: string }>

  const tx = d.transaction(() => {
    const delFile = d.prepare(
      'DELETE FROM file_states WHERE workspace_path = ? AND relative_path = ?'
    )
    const delDir = d.prepare(
      'DELETE FROM expanded_dirs WHERE workspace_path = ? AND relative_path = ?'
    )

    for (const row of fileStates) {
      if (!validRelFiles.has(row.relative_path)) {
        delFile.run(workspacePath, row.relative_path)
      }
    }

    for (const row of expandedDirs) {
      if (!validRelDirs.has(row.relative_path)) {
        delDir.run(workspacePath, row.relative_path)
      }
    }
  })
  tx()
}
