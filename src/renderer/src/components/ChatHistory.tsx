import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Clock, MessageSquare, Plus, Search, Trash2, X } from 'lucide-react'
import log from 'electron-log/renderer'
import '../styles/ChatHistory.css'

export interface ChatSession {
  id: string
  workspace_path: string | null
  title: string
  messages: string
  created_at: number
  updated_at: number
}

interface ChatHistoryProps {
  workspace: string | null
  activeChatId: string | null
  onSelectChat: (id: string) => void
  onNewChat: () => void
  refreshKey: number
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older']

function formatItemTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)

  if (d >= todayStart) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (d >= yesterdayStart) {
    return 'Yesterday'
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function groupByTime(sessions: ChatSession[]): Map<string, ChatSession[]> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)
  const weekAgo = new Date(todayStart.getTime() - 7 * 86400000)
  const monthAgo = new Date(todayStart.getTime() - 30 * 86400000)

  const groups = new Map<string, ChatSession[]>()

  for (const s of sessions) {
    const d = new Date(s.created_at)
    let key: string
    if (d >= todayStart) key = 'Today'
    else if (d >= yesterdayStart) key = 'Yesterday'
    else if (d >= weekAgo) key = 'Previous 7 Days'
    else if (d >= monthAgo) key = 'Previous 30 Days'
    else key = 'Older'

    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }

  return groups
}

export default memo(function ChatHistory({
  workspace,
  activeChatId,
  onSelectChat,
  onNewChat,
  refreshKey
}: ChatHistoryProps): React.JSX.Element {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [search, setSearch] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    let ignore = false
    window.electron.ipcRenderer
      .invoke('db:get-chat-sessions', workspace)
      .then((result: ChatSession[]) => {
        if (!ignore) {
          setSessions(result || [])
        }
      })
      .catch((e) => log.error('Failed to get chat sessions:', e))
    return () => {
      ignore = true
    }
  }, [workspace, refreshKey])

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      try {
        await window.electron.ipcRenderer.invoke('db:delete-chat-session', id)
        const result: ChatSession[] = await window.electron.ipcRenderer.invoke(
          'db:get-chat-sessions',
          workspace
        )
        setSessions(result || [])
        if (activeChatId === id) {
          onNewChat()
        }
      } catch (err) {
        log.error('Failed to delete chat session:', err)
      }
    },
    [activeChatId, onNewChat, workspace]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions
    const q = search.toLowerCase()
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || s.messages.toLowerCase().includes(q)
    )
  }, [sessions, search])

  const grouped = useMemo(() => groupByTime(filtered), [filtered])

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return (
    <div className="chat-history">
      <div className="chat-history-header">
        <span className="chat-history-title">History</span>
        <button onClick={onNewChat} title="New Chat">
          <Plus size={14} />
        </button>
      </div>
      <div className="chat-history-search">
        <Search size={13} className="chat-history-search-icon" />
        <input
          type="text"
          placeholder="Search chats..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="chat-history-search-input"
        />
        {search && (
          <button className="chat-history-search-clear" onClick={() => setSearch('')} title="Clear">
            <X size={12} />
          </button>
        )}
      </div>
      <div className="chat-history-list">
        {filtered.length === 0 && (
          <div className="chat-history-empty">
            {search ? (
              <Search size={24} strokeWidth={1.5} />
            ) : (
              <Clock size={24} strokeWidth={1.5} />
            )}
            <p>{search ? 'No matching chats' : 'No chat history'}</p>
          </div>
        )}
        {GROUP_ORDER.map((groupKey) => {
          const items = grouped.get(groupKey)
          if (!items || items.length === 0) return null
          const collapsed = collapsedGroups.has(groupKey)
          return (
            <div key={groupKey} className="chat-history-group">
              <div className="chat-history-group-header" onClick={() => toggleGroup(groupKey)}>
                <ChevronDown
                  size={12}
                  className={`chat-history-group-chevron ${collapsed ? 'collapsed' : ''}`}
                />
                <span className="chat-history-group-title">{groupKey}</span>
                <span className="chat-history-group-count">{items.length}</span>
              </div>
              {!collapsed && (
                <div className="chat-history-group-items">
                  {items.map((session) => (
                    <div
                      key={session.id}
                      className={`chat-history-item ${activeChatId === session.id ? 'active' : ''}`}
                      onClick={() => onSelectChat(session.id)}
                    >
                      <MessageSquare size={13} className="chat-history-icon" />
                      <div className="chat-history-item-content">
                        <span className="chat-history-item-title">
                          {session.title || 'New Chat'}
                        </span>
                        <span className="chat-history-item-date">
                          {formatItemTime(session.created_at)}
                        </span>
                      </div>
                      <button
                        className="chat-history-delete"
                        onClick={(e) => handleDelete(e, session.id)}
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})
