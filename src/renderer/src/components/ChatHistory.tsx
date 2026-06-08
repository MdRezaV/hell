import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Plus, Trash2, Clock } from 'lucide-react'

export interface ChatSession {
  id: string
  workspace_path: string | null
  title: string
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

function formatDate(ts: number): string {
  const d = new Date(ts)
  return (
    d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  )
}

export default function ChatHistory({
  workspace,
  activeChatId,
  onSelectChat,
  onNewChat,
  refreshKey
}: ChatHistoryProps): React.JSX.Element {
  const [sessions, setSessions] = useState<ChatSession[]>([])

  const loadSessions = useCallback(async () => {
    const result: ChatSession[] = await window.electron.ipcRenderer.invoke(
      'db:get-chat-sessions',
      workspace
    )
    setSessions(result || [])
  }, [workspace])

  useEffect(() => {
    loadSessions()
  }, [loadSessions, refreshKey])

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      await window.electron.ipcRenderer.invoke('db:delete-chat-session', id)
      loadSessions()
      if (activeChatId === id) {
        onNewChat()
      }
    },
    [activeChatId, onNewChat, loadSessions]
  )

  return (
    <div className="chat-history">
      <div className="chat-history-header">
        <span className="chat-history-title">History</span>
        <button onClick={onNewChat} title="New Chat">
          <Plus size={14} />
        </button>
      </div>
      <div className="chat-history-list">
        {sessions.length === 0 && (
          <div className="chat-history-empty">
            <Clock size={24} strokeWidth={1.5} className="opacity-50" />
            <p>No chat history</p>
          </div>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`chat-history-item ${activeChatId === session.id ? 'active' : ''}`}
            onClick={() => onSelectChat(session.id)}
          >
            <MessageSquare size={14} className="chat-history-icon" />
            <div className="chat-history-item-content">
              <span className="chat-history-item-title">{session.title || 'New Chat'}</span>
              <span className="chat-history-item-date">{formatDate(session.updated_at)}</span>
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
    </div>
  )
}
