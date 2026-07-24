import { join } from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { log } from './logger'

const MAX_WORKSPACES = 40
const MAX_SESSIONS_PER_WORKSPACE = 100

// Increment this whenever the database schema changes in a
// backwards-incompatible way. On startup, if the stored
// `PRAGMA user_version` does not match, the database is wiped
// and recreated from scratch.
const SCHEMA_VERSION = 8

let db: Database.Database | null = null

function createTables(d: Database.Database): void {
  d.exec(`
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
      NULL,
      file_states
      TEXT
      NOT
      NULL
      DEFAULT
      '[]',
      expanded_dirs
      TEXT
      NOT
      NULL
      DEFAULT
      '[]',
      dir_structure_tag
      TEXT
      NOT
      NULL
      DEFAULT
      '',
      mode
      TEXT
      NOT
      NULL
      DEFAULT
      '',
      task_id
      TEXT
      NOT
      NULL
      DEFAULT
      '',
      messages_preview
      TEXT
      NOT
      NULL
      DEFAULT
      ''
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_ws_updated
      ON chat_sessions(workspace_path, updated_at);

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated
      ON chat_sessions(updated_at);
  `)
}

function dropAllTables(d: Database.Database): void {
  d.exec(`
    DROP TABLE IF EXISTS chat_sessions;
    DROP TABLE IF EXISTS expanded_dirs;
    DROP TABLE IF EXISTS file_states;
    DROP TABLE IF EXISTS workspaces;
  `)
}

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'hell.db')
  log.info('Opening database at', dbPath)
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  const storedVersion = (db.pragma('user_version', { simple: true }) as number) ?? 0

  if (storedVersion !== SCHEMA_VERSION) {
    log.info(
      `Schema version mismatch (stored=${storedVersion}, current=${SCHEMA_VERSION}). Resetting database.`
    )
    dropAllTables(db)
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
  }

  createTables(db)
}

export function closeDatabase(): void {
  if (db) {
    try {
      db.close()
      log.info('Database closed')
    } catch (e) {
      log.error('Error closing database', e)
    }
    db = null
  }
}

function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

function normalizeWorkspacePath(p: string): string {
  if (p.length > 1 && (p.endsWith('/') || p.endsWith('\\'))) {
    return p.slice(0, -1)
  }
  return p
}

export function toRelative(workspacePath: string, absolutePath: string): string {
  workspacePath = normalizeWorkspacePath(workspacePath)
  if (!absolutePath.startsWith(workspacePath)) {
    return absolutePath
  }
  if (absolutePath.length !== workspacePath.length) {
    const nextChar = absolutePath[workspacePath.length]
    if (nextChar !== '/' && nextChar !== '\\') {
      return absolutePath
    }
  }
  let rel = absolutePath.substring(workspacePath.length)
  if (rel.startsWith('/') || rel.startsWith('\\')) rel = rel.substring(1)
  return rel
}

export function touchWorkspace(workspacePath: string): void {
  workspacePath = normalizeWorkspacePath(workspacePath)
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
    const delSessions = d.prepare('DELETE FROM chat_sessions WHERE workspace_path = ?')
    const tx = d.transaction(() => {
      for (const r of oldest) {
        delSessions.run(r.path)
        del.run(r.path)
      }
    })
    tx()
  }
}

export interface WorkspaceState {
  fileStates: Array<[string, string]>
  expandedDirs: string[]
}

export function getWorkspaceState(workspacePath: string): WorkspaceState {
  workspacePath = normalizeWorkspacePath(workspacePath)
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

export function getWorkspaces(): Array<{ path: string; last_opened: number }> {
  const d = getDb()
  const rows = d
    .prepare('SELECT path, last_opened FROM workspaces ORDER BY last_opened DESC')
    .all() as Array<{ path: string; last_opened: number }>
  const seen = new Set<string>()
  const result: Array<{ path: string; last_opened: number }> = []
  for (const row of rows) {
    const norm = normalizeWorkspacePath(row.path)
    if (!seen.has(norm)) {
      seen.add(norm)
      result.push({ path: norm, last_opened: row.last_opened })
    }
  }
  return result
}

export function getLastWorkspace(): string | null {
  const d = getDb()
  const row = d.prepare('SELECT path FROM workspaces ORDER BY last_opened DESC LIMIT 1').get() as
    { path: string } | undefined
  return row?.path ?? null
}

export function setFileState(workspacePath: string, absolutePath: string, tag: string): void {
  workspacePath = normalizeWorkspacePath(workspacePath)
  const d = getDb()
  const rel = toRelative(workspacePath, absolutePath)
  d.prepare(
    `INSERT INTO file_states (workspace_path, relative_path, tag) VALUES (?, ?, ?)
     ON CONFLICT(workspace_path, relative_path) DO UPDATE SET tag = excluded.tag`
  ).run(workspacePath, rel, tag)
}

export function removeFileState(workspacePath: string, absolutePath: string): void {
  workspacePath = normalizeWorkspacePath(workspacePath)
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
  workspacePath = normalizeWorkspacePath(workspacePath)
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
  workspacePath = normalizeWorkspacePath(workspacePath)
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
  workspacePath = normalizeWorkspacePath(workspacePath)
  const d = getDb()
  d.prepare('DELETE FROM file_states WHERE workspace_path = ?').run(workspacePath)
}

export function setDirExpanded(
  workspacePath: string,
  absolutePath: string,
  expanded: boolean
): void {
  workspacePath = normalizeWorkspacePath(workspacePath)
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

export function batchSetDirExpanded(
  workspacePath: string,
  entries: Array<{ absolutePath: string; expanded: boolean }>
): void {
  workspacePath = normalizeWorkspacePath(workspacePath)
  const d = getDb()
  const insertStmt = d.prepare(
    `INSERT OR IGNORE INTO expanded_dirs (workspace_path, relative_path) VALUES (?, ?)`
  )
  const deleteStmt = d.prepare(
    'DELETE FROM expanded_dirs WHERE workspace_path = ? AND relative_path = ?'
  )
  const tx = d.transaction(() => {
    for (const { absolutePath, expanded } of entries) {
      const rel = toRelative(workspacePath, absolutePath)
      if (expanded) {
        insertStmt.run(workspacePath, rel)
      } else {
        deleteStmt.run(workspacePath, rel)
      }
    }
  })
  tx()
}

export interface ChatSession {
  id: string
  workspace_path: string | null
  title: string
  messages: string
  created_at: number
  updated_at: number
  file_states: string
  expanded_dirs: string
  dir_structure_tag: string
  mode: string
  task_id: string
  messages_preview: string
}

export function extractPreview(messagesJson: string): string {
  try {
    const messages = JSON.parse(messagesJson) as Array<{
      role: string
      variants: Array<{ content: string }>
    }>
    const parts: string[] = []
    for (const msg of messages) {
      if (msg.role === 'user' && msg.variants && msg.variants.length > 0) {
        parts.push(msg.variants[0].content)
      }
    }
    const joined = parts.join('\n')
    return joined.length > 500 ? joined.slice(0, 500) : joined
  } catch {
    return ''
  }
}

export function createChatSession(
  workspacePath: string | null,
  title: string,
  messages: string,
  fileStates: string = '[]',
  expandedDirs: string = '[]',
  dirStructureTag: string = '',
  mode: string = '',
  taskId: string = '',
  messagesPreview: string = ''
): string {
  const d = getDb()
  const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  d.prepare(
    `INSERT INTO chat_sessions (id, workspace_path, title, messages, created_at, updated_at, file_states, expanded_dirs, dir_structure_tag, mode, task_id, messages_preview)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    workspacePath ?? null,
    title,
    messages,
    Date.now(),
    Date.now(),
    fileStates,
    expandedDirs,
    dirStructureTag,
    mode,
    taskId,
    messagesPreview
  )

  if (workspacePath) {
    const count = d
      .prepare('SELECT COUNT(*) AS c FROM chat_sessions WHERE workspace_path = ?')
      .get(workspacePath) as { c: number }
    if (count.c > MAX_SESSIONS_PER_WORKSPACE) {
      const excess = count.c - MAX_SESSIONS_PER_WORKSPACE
      d.prepare(
        `DELETE FROM chat_sessions WHERE id IN (
          SELECT id FROM chat_sessions WHERE workspace_path = ? ORDER BY updated_at ASC LIMIT ?
        )`
      ).run(workspacePath, excess)
    }
  }

  return id
}

export function updateChatSession(
  id: string,
  title: string,
  messages: string,
  fileStates: string = '[]',
  expandedDirs: string = '[]',
  dirStructureTag: string = '',
  mode: string = '',
  taskId: string = '',
  messagesPreview: string = ''
): void {
  const d = getDb()
  d.prepare(
    `UPDATE chat_sessions SET title = ?, messages = ?, updated_at = ?, file_states = ?, expanded_dirs = ?, dir_structure_tag = ?, mode = ?, task_id = ?, messages_preview = ? WHERE id = ?`
  ).run(
    title,
    messages,
    Date.now(),
    fileStates,
    expandedDirs,
    dirStructureTag,
    mode,
    taskId,
    messagesPreview,
    id
  )
}

export function snapshotWorkspaceStateToSession(workspacePath: string): {
  fileStates: string
  expandedDirs: string
} {
  workspacePath = normalizeWorkspacePath(workspacePath)
  const d = getDb()
  const files = d
    .prepare('SELECT relative_path, tag FROM file_states WHERE workspace_path = ?')
    .all(workspacePath) as Array<{ relative_path: string; tag: string }>
  const dirs = d
    .prepare('SELECT relative_path FROM expanded_dirs WHERE workspace_path = ?')
    .all(workspacePath) as Array<{ relative_path: string }>

  const fileStates = files.map((f) => ({
    absolutePath: join(workspacePath, f.relative_path),
    tag: f.tag
  }))
  const expandedDirs = dirs.map((r) => join(workspacePath, r.relative_path))

  return {
    fileStates: JSON.stringify(fileStates),
    expandedDirs: JSON.stringify(expandedDirs)
  }
}

export function getChatSessions(workspacePath: string | null): ChatSession[] {
  const d = getDb()
  if (workspacePath) {
    return d
      .prepare(
        `SELECT id, workspace_path, title, created_at, updated_at, mode, task_id FROM chat_sessions WHERE workspace_path = ? ORDER BY updated_at DESC`
      )
      .all(workspacePath) as ChatSession[]
  }
  return d
    .prepare(
      `SELECT id, workspace_path, title, created_at, updated_at, mode, task_id FROM chat_sessions ORDER BY updated_at DESC`
    )
    .all() as ChatSession[]
}

export function searchChatSessions(workspacePath: string | null, query: string): ChatSession[] {
  const d = getDb()
  const q = `%${query}%`
  if (workspacePath) {
    return d
      .prepare(
        `SELECT id, workspace_path, title, created_at, updated_at, mode, task_id FROM chat_sessions WHERE workspace_path = ? AND (title LIKE ? OR messages_preview LIKE ?) ORDER BY updated_at DESC`
      )
      .all(workspacePath, q, q) as ChatSession[]
  }
  return d
    .prepare(
      `SELECT id, workspace_path, title, created_at, updated_at, mode, task_id FROM chat_sessions WHERE title LIKE ? OR messages_preview LIKE ? ORDER BY updated_at DESC`
    )
    .all(q, q) as ChatSession[]
}

export function getChatSession(id: string): ChatSession | null {
  const d = getDb()
  const row = d.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as
    ChatSession | undefined
  return row ?? null
}

export function deleteChatSession(id: string): void {
  const d = getDb()
  d.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id)
}

export function clearAllData(): void {
  const d = getDb()
  const tx = d.transaction(() => {
    d.prepare('DELETE FROM chat_sessions').run()
    d.prepare('DELETE FROM file_states').run()
    d.prepare('DELETE FROM expanded_dirs').run()
    d.prepare('DELETE FROM workspaces').run()
  })
  tx()
}

export function pruneWorkspaceState(
  workspacePath: string,
  validFilePaths: string[],
  validDirPaths: string[]
): void {
  workspacePath = normalizeWorkspacePath(workspacePath)
  const d = getDb()
  const validRelFiles = validFilePaths.map((p) => toRelative(workspacePath, p))
  const validRelDirs = validDirPaths.map((p) => toRelative(workspacePath, p))

  const tx = d.transaction(() => {
    d.exec(`DROP TABLE IF EXISTS temp_valid_files`)
    d.exec(`DROP TABLE IF EXISTS temp_valid_dirs`)
    d.exec(`CREATE TEMP TABLE temp_valid_files (relative_path TEXT PRIMARY KEY)`)
    d.exec(`CREATE TEMP TABLE temp_valid_dirs (relative_path TEXT PRIMARY KEY)`)

    const insertFile = d.prepare('INSERT INTO temp_valid_files (relative_path) VALUES (?)')
    for (const rel of validRelFiles) {
      insertFile.run(rel)
    }

    const insertDir = d.prepare('INSERT INTO temp_valid_dirs (relative_path) VALUES (?)')
    for (const rel of validRelDirs) {
      insertDir.run(rel)
    }

    d.prepare(
      `DELETE FROM file_states
       WHERE workspace_path = ?
       AND relative_path NOT IN (SELECT relative_path FROM temp_valid_files)`
    ).run(workspacePath)

    d.prepare(
      `DELETE FROM expanded_dirs
       WHERE workspace_path = ?
       AND relative_path NOT IN (SELECT relative_path FROM temp_valid_dirs)`
    ).run(workspacePath)

    d.exec(`DROP TABLE temp_valid_files`)
    d.exec(`DROP TABLE temp_valid_dirs`)
  })

  tx()
}
