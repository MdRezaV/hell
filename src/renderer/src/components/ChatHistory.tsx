import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { ChevronDown, Clock, Plus, Search, Trash2, X } from 'lucide-react'
import log from 'electron-log/renderer'
import '../styles/ChatHistory.css'

export interface ChatSession {
  id: string
  workspace_path: string | null
  title: string
  created_at: number
  updated_at: number
  mode?: string
  task_id?: string
}

interface ChatHistoryProps {
  workspace: string | null
  activeChatId: string | null
  onSelectChat: (id: string) => void
  onNewChat: () => void
  refreshKey: number
}

const GROUP_ORDER = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older']

function startOfDay(year: number, month: number, date: number): Date {
  return new Date(year, month, date)
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

function formatItemTime(ts: number, todayStart: number, yesterdayStart: number): string {
  if (ts >= todayStart) {
    const offset = ts - todayStart
    const h = Math.floor(offset / 3600000)
    const m = Math.floor((offset % 3600000) / 60000)
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`
  }
  if (ts >= yesterdayStart) {
    return 'Yesterday'
  }
  const d = new Date(ts)
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`
}

function groupByTime(sessions: ChatSession[]): Map<string, ChatSession[]> {
  const now = new Date()
  const todayStart = startOfDay(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = startOfDay(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const weekAgo = startOfDay(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  const monthAgo = startOfDay(now.getFullYear(), now.getMonth(), now.getDate() - 29)

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

  for (const [, items] of groups) {
    items.sort((a, b) => b.created_at - a.created_at)
  }

  return groups
}

interface ChatHistoryItemProps {
  session: ChatSession
  isActive: boolean
  formattedTime: string
  onSelect: (id: string) => void
  onDelete: (e: React.MouseEvent, id: string) => void
}

const ChatHistoryItem = memo(function ChatHistoryItem({
  session,
  isActive,
  formattedTime,
  onSelect,
  onDelete
}: ChatHistoryItemProps): React.JSX.Element {
  const handleClick = useCallback(() => onSelect(session.id), [onSelect, session.id])
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => onDelete(e, session.id),
    [onDelete, session.id]
  )
  return (
    <div className={`chat-history-item ${isActive ? 'active' : ''}`} onClick={handleClick}>
      <div className="chat-history-item-content">
        <span className="chat-history-item-title">{session.title || 'New Chat'}</span>
        <span className="chat-history-item-meta">
          {session.mode && (
            <span
              className={`chat-history-item-mode chat-history-item-mode--${session.mode.toLowerCase()}`}
            >
              {session.mode}
            </span>
          )}
          {session.task_id && (
            <span className="chat-history-item-mode chat-history-item-mode--task">
              TASK {session.task_id}
            </span>
          )}
          <span className="chat-history-item-date">{formattedTime}</span>
        </span>
      </div>
      <button className="chat-history-delete" onClick={handleDeleteClick} title="Delete">
        <Trash2 size={12} />
      </button>
    </div>
  )
})

export interface ChatHistoryHandle {
  navigateUp: () => void
  navigateDown: () => void
}

const ChatHistory = forwardRef<ChatHistoryHandle, ChatHistoryProps>(function ChatHistory(
  { workspace, activeChatId, onSelectChat, onNewChat, refreshKey },
  ref
): React.JSX.Element {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [search, setSearch] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!workspace) {
      setSessions([])
      setLoading(false)
      return
    }
    let ignore = false
    setLoading(true)
    window.api
      .getChatSessions(workspace)
      .then((result: ChatSession[]) => {
        if (!ignore) {
          setSessions(result || [])
          setLoading(false)
        }
      })
      .catch((e) => {
        log.error('Failed to get chat sessions:', e)
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [workspace, refreshKey])

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      try {
        await window.api.deleteChatSession(id)
        const result: ChatSession[] = await window.api.getChatSessions(workspace)
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

  const [searchResults, setSearchResults] = useState<ChatSession[] | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!search.trim() || !workspace) {
      setSearchResults(null)
      clearTimeout(searchDebounceRef.current)
      return
    }
    const q = search.trim()
    clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results: ChatSession[] = await window.api.searchChatSessions(workspace, q)
        setSearchResults(results || [])
      } catch (e) {
        log.error('Failed to search chat sessions:', e)
        setSearchResults([])
      }
    }, 200)
    return () => {
      clearTimeout(searchDebounceRef.current)
    }
  }, [search, workspace])

  const filtered = searchResults ?? sessions

  const grouped = useMemo(() => groupByTime(filtered), [filtered])

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const formattedTimes = useMemo(() => {
    const now = new Date()
    const todayStart = startOfDay(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const yesterdayStart = startOfDay(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1
    ).getTime()
    const map = new Map<string, string>()
    for (const s of filtered) {
      map.set(s.id, formatItemTime(s.created_at, todayStart, yesterdayStart))
    }
    return map
  }, [filtered])

  const visibleIds = useMemo(() => {
    const ids: string[] = []
    for (const groupKey of GROUP_ORDER) {
      if (collapsedGroups.has(groupKey)) continue
      const items = grouped.get(groupKey)
      if (!items) continue
      for (const s of items) ids.push(s.id)
    }
    return ids
  }, [grouped, collapsedGroups])

  const navigate = useCallback(
    (direction: 'up' | 'down') => {
      if (visibleIds.length === 0) return
      const currentIdx = activeChatId ? visibleIds.indexOf(activeChatId) : -1
      let nextIdx: number
      if (currentIdx === -1) {
        nextIdx = direction === 'up' ? visibleIds.length - 1 : 0
      } else {
        nextIdx =
          direction === 'up'
            ? Math.max(0, currentIdx - 1)
            : Math.min(visibleIds.length - 1, currentIdx + 1)
      }
      const nextId = visibleIds[nextIdx]
      if (nextId && nextId !== activeChatId) {
        onSelectChat(nextId)
      }
    },
    [visibleIds, activeChatId, onSelectChat]
  )

  useImperativeHandle(
    ref,
    () => ({
      navigateUp: () => navigate('up'),
      navigateDown: () => navigate('down')
    }),
    [navigate]
  )

  return (
    <div className="chat-history">
      <div className="chat-history-header">
        <div className="chat-history-header-left">
          <span className="chat-history-title">History</span>
          <span className="chat-history-count">
            {search ? `${filtered.length}/${sessions.length}` : sessions.length}
          </span>
        </div>
        <button className="chat-history-header-btn" onClick={onNewChat} title="New Chat">
          <Plus size={14} className="chat-history-header-btn-icon" />
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
        {loading ? (
          <div className="chat-history-skeleton">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="chat-history-skeleton-item">
                <div className="chat-history-skeleton-icon" />
                <div className="chat-history-skeleton-content">
                  <div
                    className="chat-history-skeleton-bar"
                    style={{ width: `${45 + ((i * 17) % 45)}%` }}
                  />
                  <div
                    className="chat-history-skeleton-bar chat-history-skeleton-bar--sm"
                    style={{ width: `${25 + ((i * 11) % 30)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="chat-history-empty">
            {search ? (
              <Search size={24} strokeWidth={1.5} className="chat-history-empty-icon" />
            ) : (
              <Clock size={24} strokeWidth={1.5} className="chat-history-empty-icon" />
            )}
            <p className="chat-history-empty-text">
              {search ? 'No matching chats' : 'No chat history'}
            </p>
          </div>
        ) : (
          GROUP_ORDER.map((groupKey) => {
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
                      <ChatHistoryItem
                        key={session.id}
                        session={session}
                        isActive={activeChatId === session.id}
                        formattedTime={formattedTimes.get(session.id) ?? ''}
                        onSelect={onSelectChat}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
})

export default memo(ChatHistory)
