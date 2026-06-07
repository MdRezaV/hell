import { useState, useRef, useEffect } from 'react'
import {
  Send,
  Bot,
  User,
  Sparkles,
  Loader2,
  MessageSquarePlus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RefreshCw,
  Check,
  X
} from 'lucide-react'

interface MessageVariant {
  content: string
  timestamp: Date
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  variants: MessageVariant[]
  activeVariant: number
}

let nextId = 0
function generateId(): string {
  return `msg-${Date.now()}-${nextId++}`
}

type ChatMode = 'Coding' | 'Write Tests' | 'Search For Bugs'

const CHAT_MODES: ChatMode[] = ['Coding', 'Write Tests', 'Search For Bugs']

const DUMMY_RESPONSES: Record<string, string> = {
  hello:
    "Hello! I'm your AI assistant. I can help you with coding questions, explain concepts, or just have a conversation. What would you like to talk about?",
  hi: "Hi there! How can I help you today? Feel free to ask me anything about programming, design, or any other topic.",
  help: "I can help with:\n\n- **Code explanations** — Ask me about any programming concept\n- **Debugging** — Describe your issue and I'll suggest solutions\n- **Architecture** — Discuss design patterns and best practices\n- **General questions** — Ask me anything!\n\nJust type your question below.",
  react:
    "React is a JavaScript library for building user interfaces. Key concepts include:\n\n- **Components** — Reusable UI building blocks\n- **JSX** — Syntax extension for writing HTML-like code in JavaScript\n- **Hooks** — `useState`, `useEffect`, etc. for managing state and side effects\n- **Virtual DOM** — Efficient rendering through diffing\n\nWould you like me to dive deeper into any of these?",
  typescript:
    "TypeScript adds static typing to JavaScript. Benefits include:\n\n- **Type safety** — Catch errors at compile time\n- **Better IDE support** — Autocomplete, refactoring, navigation\n- **Interfaces & Types** — Define contracts for your data\n- **Generics** — Write reusable, type-safe code\n\nWhat specific TypeScript topic are you interested in?"
}

function getAIResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase().trim()

  for (const [keyword, response] of Object.entries(DUMMY_RESPONSES)) {
    if (lower.includes(keyword)) return response
  }

  const fallbacks = [
    "That's an interesting question! Let me think about this...\n\nBased on my understanding, I'd suggest breaking this down into smaller parts. Could you provide more context about what you're trying to achieve?",
    "Great question! Here are some thoughts:\n\n1. Consider the **architecture** of your solution\n2. Think about **edge cases** and error handling\n3. Keep the code **readable** and maintainable\n\nWould you like me to elaborate on any of these points?",
    "I'd be happy to help with that. Here's my take:\n\nThe key is to approach this systematically. Start with the simplest working version, then iterate and improve. What specific aspect would you like to focus on first?",
    "That's a common challenge! Here are a few approaches:\n\n- **Option A** — Simple and straightforward, good for prototyping\n- **Option B** — More robust, better for production\n- **Option C** — Most flexible, but adds complexity\n\nWhich direction interests you most?"
  ]

  return fallbacks[Math.floor(Math.random() * fallbacks.length)]
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function MessageBubble({
  message,
  isLastAssistant,
  isLoading,
  isEditing,
  onVariantChange,
  onEdit,
  onRegenerate,
  onStartEdit,
  onCancelEdit
}: {
  message: ChatMessage
  isLastAssistant: boolean
  isLoading: boolean
  isEditing: boolean
  onVariantChange: (id: string, dir: 'prev' | 'next') => void
  onEdit: (id: string, content: string) => void
  onRegenerate: (id: string) => void
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
}): React.JSX.Element {
  const isUser = message.role === 'user'
  const variant = message.variants[message.activeVariant]
  const hasVariants = message.variants.length > 1
  const isActiveEmpty = variant.content === '' && isLoading

  const [editContent, setEditContent] = useState(variant.content)
  const editRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus()
      editRef.current.style.height = 'auto'
      editRef.current.style.height = `${editRef.current.scrollHeight}px`
    }
  }, [isEditing])

  useEffect(() => {
    setEditContent(variant.content)
  }, [variant.content])

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onEdit(message.id, editContent)
    } else if (e.key === 'Escape') {
      onCancelEdit()
    }
  }

  const handleEditInput = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setEditContent(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  return (
    <div className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-ai'}`}>
      <div className={`chat-avatar ${isUser ? 'chat-avatar-user' : 'chat-avatar-ai'}`}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className="chat-message-body">
        {isEditing ? (
          <>
            <textarea
              ref={editRef}
              className="chat-edit-area"
              value={editContent}
              onChange={handleEditInput}
              onKeyDown={handleEditKeyDown}
              rows={1}
            />
            <div className="chat-edit-actions">
              <button className="btn-ghost" onClick={onCancelEdit}>
                <X size={12} /> Cancel
              </button>
              <button className="btn-primary" onClick={() => onEdit(message.id, editContent)}>
                <Check size={12} /> Save
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
              {isActiveEmpty ? (
                <div className="chat-typing">
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </div>
              ) : (
                <div className="chat-bubble-content">
                  {variant.content.split('\n').map((line, i) => (
                    <span key={i}>
                      {line.split(/(\*\*[^*]+\*\*)/).map((segment, j) => {
                        if (segment.startsWith('**') && segment.endsWith('**')) {
                          return <strong key={j}>{segment.slice(2, -2)}</strong>
                        }
                        return segment
                      })}
                      {i < variant.content.split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="chat-message-actions">
              <span className="chat-timestamp">{formatTime(variant.timestamp)}</span>
              {hasVariants && (
                <div className="chat-variant-nav">
                  <button
                    onClick={() => onVariantChange(message.id, 'prev')}
                    disabled={message.activeVariant === 0 || isLoading}
                    title="Previous"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <span>
                    {message.activeVariant + 1}/{message.variants.length}
                  </span>
                  <button
                    onClick={() => onVariantChange(message.id, 'next')}
                    disabled={message.activeVariant === message.variants.length - 1 || isLoading}
                    title="Next"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
              {isUser && !isLoading && (
                <button
                  className="chat-action-btn"
                  onClick={() => onStartEdit(message.id)}
                  title="Edit"
                >
                  <Pencil size={12} />
                </button>
              )}
              {!isUser && isLastAssistant && !isLoading && (
                <button
                  className="chat-action-btn"
                  onClick={() => onRegenerate(message.id)}
                  title="Regenerate"
                >
                  <RefreshCw size={12} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TypingIndicator(): React.JSX.Element {
  return (
    <div className="chat-message chat-message-ai">
      <div className="chat-avatar chat-avatar-ai">
        <Bot size={14} />
      </div>
      <div className="chat-message-body">
        <div className="chat-bubble chat-bubble-ai">
          <div className="chat-typing">
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
          </div>
        </div>
      </div>
    </div>
  )
}

function AIChat(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mode, setMode] = useState<ChatMode>(CHAT_MODES[0])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  useEffect(() => {
    if (messages.length === 0) {
      inputRef.current?.focus()
    }
  }, [messages.length])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = async (): Promise<void> => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      variants: [{ content: trimmed, timestamp: new Date() }],
      activeVariant: 0
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200))

    const aiMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      variants: [{ content: getAIResponse(trimmed), timestamp: new Date() }],
      activeVariant: 0
    }

    setMessages(prev => [...prev, aiMessage])
    setIsLoading(false)
  }

  const handleRegenerate = async (messageId: string): Promise<void> => {
    if (isLoading) return

    const msgIndex = messages.findIndex(m => m.id === messageId)
    if (msgIndex === -1) return

    const userMsg = messages
      .slice(0, msgIndex)
      .reverse()
      .find(m => m.role === 'user')
    if (!userMsg) return

    const userContent = userMsg.variants[userMsg.activeVariant].content

    setMessages(prev => {
      const updated = [...prev]
      const msg = { ...updated[msgIndex] }
      msg.variants = [...msg.variants, { content: '', timestamp: new Date() }]
      msg.activeVariant = msg.variants.length - 1
      updated[msgIndex] = msg
      return updated
    })

    setIsLoading(true)

    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200))

    const newContent = getAIResponse(userContent)

    setMessages(prev => {
      const updated = [...prev]
      const idx = updated.findIndex(m => m.id === messageId)
      if (idx === -1) return prev
      const msg = { ...updated[idx] }
      msg.variants = [...msg.variants]
      msg.variants[msg.activeVariant] = { content: newContent, timestamp: new Date() }
      updated[idx] = msg
      return updated
    })

    setIsLoading(false)
  }

  const handleEditSave = async (messageId: string, newContent: string): Promise<void> => {
    const trimmed = newContent.trim()
    if (!trimmed || isLoading) return

    const msgIndex = messages.findIndex(m => m.id === messageId)
    if (msgIndex === -1) return

    setMessages(prev => {
      const updated = prev.slice(0, msgIndex + 1)
      const msg = { ...updated[msgIndex] }
      msg.variants = [...msg.variants, { content: trimmed, timestamp: new Date() }]
      msg.activeVariant = msg.variants.length - 1
      updated[msgIndex] = msg
      return updated
    })

    setEditingId(null)
    setIsLoading(true)

    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200))

    const aiMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      variants: [{ content: getAIResponse(trimmed), timestamp: new Date() }],
      activeVariant: 0
    }

    setMessages(prev => [...prev, aiMessage])
    setIsLoading(false)
  }

  const handleVariantChange = (messageId: string, direction: 'prev' | 'next'): void => {
    setMessages(prev => {
      const updated = [...prev]
      const idx = updated.findIndex(m => m.id === messageId)
      if (idx === -1) return prev
      const msg = { ...updated[idx] }
      if (direction === 'prev' && msg.activeVariant > 0) {
        msg.activeVariant--
      } else if (direction === 'next' && msg.activeVariant < msg.variants.length - 1) {
        msg.activeVariant++
      } else {
        return prev
      }
      updated[idx] = msg
      return updated
    })
  }

  const handleNewChat = (): void => {
    setMessages([])
    setInput('')
    setIsLoading(false)
    setEditingId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const isChatMode = messages.length > 0
  const lastAssistantIndex = messages.map(m => m.role).lastIndexOf('assistant')

  if (!isChatMode) {
    return (
      <div className="ai-chat ai-chat-welcome">
        <div className="ai-chat-welcome-content">
          <div className="ai-chat-welcome-icon">
            <Sparkles size={40} strokeWidth={1.25} />
          </div>
          <h2>AI Assistant</h2>
          <p>Ask me anything about code, architecture, or design.</p>
        </div>
        <div className="ai-chat-input-bar ai-chat-input-bar-centered">
          <div className="ai-chat-input-wrapper">
            <textarea
              ref={inputRef}
              className="ai-chat-input"
              placeholder="Type a message..."
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
            />
            <button
              className="ai-chat-send"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              title="Send message"
            >
              <Send size={16} />
            </button>
          </div>
          <div className="ai-chat-mode-bar">
            <span className="ai-chat-mode-label">Mode</span>
            <select
              className="ai-chat-mode-select"
              value={mode}
              onChange={e => setMode(e.target.value as ChatMode)}
            >
              {CHAT_MODES.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="ai-chat-hint">
            Press <span className="kbd">Enter</span> to send,{' '}
            <span className="kbd">Shift</span>+<span className="kbd">Enter</span> for new line
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-chat">
      <div className="ai-chat-header">
        <div className="ai-chat-header-left">
          <Bot size={14} />
          <span>AI Assistant</span>
          <span className="ai-chat-mode-badge">{mode}</span>
          {isLoading && <Loader2 size={12} className="spin" />}
        </div>
        <div className="ai-chat-header-actions">
          <button onClick={handleNewChat} title="New Chat">
            <MessageSquarePlus size={14} />
          </button>
        </div>
      </div>
      <div className="ai-chat-messages">
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLastAssistant={i === lastAssistantIndex}
            isLoading={isLoading}
            isEditing={editingId === msg.id}
            onVariantChange={handleVariantChange}
            onEdit={handleEditSave}
            onRegenerate={handleRegenerate}
            onStartEdit={setEditingId}
            onCancelEdit={() => setEditingId(null)}
          />
        ))}
        {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <TypingIndicator />
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="ai-chat-input-bar">
        <div className="ai-chat-input-wrapper">
          <textarea
            ref={inputRef}
            className="ai-chat-input"
            placeholder="Type a message..."
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isLoading}
          />
          <button
            className="ai-chat-send"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            title="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default AIChat