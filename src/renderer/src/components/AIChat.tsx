import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
  forwardRef,
  useImperativeHandle
} from 'react'
import {
  Copy,
  Bot,
  Sparkles,
  Loader2,
  MessageSquarePlus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  RefreshCw,
  Check,
  X
} from 'lucide-react'
import Markdown from './Markdown'
import { useClickOutside } from '../hooks/useClickOutside'
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea'
import { buildPrompt } from '../utils/PromptEngine'

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

function ModeSelector({
  mode,
  onChange
}: {
  mode: ChatMode
  onChange: (mode: ChatMode) => void
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setIsOpen(false), isOpen)

  return (
    <div className={`ai-chat-input-mode ${isOpen ? 'open' : ''}`} ref={ref}>
      <span className="ai-chat-input-mode-label">Mode</span>
      <button
        type="button"
        className="ai-chat-input-mode-trigger"
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{mode}</span>
        <ChevronDown size={13} className="chevron" />
      </button>
      {isOpen && (
        <div className="ai-chat-mode-menu" role="listbox">
          {CHAT_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`ai-chat-mode-option ${m === mode ? 'active' : ''}`}
              role="option"
              aria-selected={m === mode}
              onClick={() => {
                onChange(m)
                setIsOpen(false)
              }}
            >
              <span>{m}</span>
              <Check size={13} className="mode-check" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function getAIResponse(userMessage: string): string {
  return userMessage
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface EditMessageProps {
  initialContent: string
  messageId: string
  onEdit: (id: string, content: string) => void
  onCancelEdit: () => void
}

function EditMessage({
  initialContent,
  messageId,
  onEdit,
  onCancelEdit
}: EditMessageProps): React.JSX.Element {
  const [editContent, setEditContent] = useState(initialContent)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const resizeTextarea = useAutoResizeTextarea()

  useEffect(() => {
    if (editRef.current) {
      editRef.current.focus()
      resizeTextarea(editRef.current)
    }
  }, [resizeTextarea])

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onEdit(messageId, editContent)
    } else if (e.key === 'Escape') {
      onCancelEdit()
    }
  }

  const handleEditInput = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setEditContent(e.target.value)
    resizeTextarea(e.target)
  }

  return (
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
        <button className="btn-primary" onClick={() => onEdit(messageId, editContent)}>
          <Check size={12} /> Save
        </button>
      </div>
    </>
  )
}

const MessageBubble = memo(function MessageBubble({
  message,
  isLastAssistant,
  isLoading,
  isEditing,
  isCopied,
  onVariantChange,
  onEdit,
  onRegenerate,
  onStartEdit,
  onCancelEdit,
  onCopy
}: {
  message: ChatMessage
  isLastAssistant: boolean
  isLoading: boolean
  isEditing: boolean
  isCopied: boolean
  onVariantChange: (id: string, dir: 'prev' | 'next') => void
  onEdit: (id: string, content: string) => void
  onRegenerate: (id: string) => void
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onCopy: (id: string, content: string) => void
}): React.JSX.Element {
  const isUser = message.role === 'user'
  const variant = message.variants[message.activeVariant]
  const hasVariants = message.variants.length > 1
  const isActiveEmpty = variant.content === '' && isLoading

  return (
    <div className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-ai'}`}>
      <div className="chat-message-body">
        {isEditing ? (
          <EditMessage
            key={message.id + '-' + message.activeVariant}
            initialContent={variant.content}
            messageId={message.id}
            onEdit={onEdit}
            onCancelEdit={onCancelEdit}
          />
        ) : (
          <>
            <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
              {isActiveEmpty ? (
                <div className="chat-typing">
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </div>
              ) : isUser ? (
                <div className="chat-bubble-content">
                  {variant.content.split('\n').map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < variant.content.split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="chat-bubble-content">
                  <Markdown content={variant.content} />
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
              {!isActiveEmpty && (
                <button
                  className="chat-action-btn"
                  onClick={() => onCopy(message.id, variant.content)}
                  title={isCopied ? 'Copied' : 'Copy'}
                >
                  {isCopied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
})

function TypingIndicator(): React.JSX.Element {
  return (
    <div className="chat-message chat-message-ai">
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

export interface AIChatHandle {
  copyByIndex(index?: number): Promise<boolean>
  pasteAsAssistant(): Promise<boolean>
}

const AIChat = forwardRef<AIChatHandle, object>(function AIChat(_, ref): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [mode, setMode] = useState<ChatMode>(CHAT_MODES[0])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const copyTimeoutRef = useRef<number | null>(null)
  const messagesRef = useRef(messages)
  const isLoadingRef = useRef(isLoading)
  const resizeTextarea = useAutoResizeTextarea()

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])

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

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      async copyByIndex(index?: number): Promise<boolean> {
        const userMessages = messages.filter((m) => m.role === 'user')
        if (userMessages.length === 0) return false
        const resolvedIndex =
          index === undefined || index < 0 || index >= userMessages.length
            ? userMessages.length - 1
            : index
        const userMsg = userMessages[resolvedIndex]
        const userContent = userMsg.variants[userMsg.activeVariant].content
        const promptText = buildPrompt(userContent, resolvedIndex)
        try {
          await navigator.clipboard.writeText(promptText)
          return true
        } catch {
          return false
        }
      },
      async pasteAsAssistant(): Promise<boolean> {
        try {
          const text = await navigator.clipboard.readText()
          if (!text) return false
          const aiMessage: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            variants: [{ content: text, timestamp: new Date() }],
            activeVariant: 0
          }
          setMessages((prev) => [...prev, aiMessage])
          return true
        } catch {
          return false
        }
      }
    }),
    [messages]
  )

  const handleSend = async (): Promise<void> => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      variants: [{ content: trimmed, timestamp: new Date() }],
      activeVariant: 0
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
    setIsLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200))

    const aiMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      variants: [{ content: getAIResponse(trimmed), timestamp: new Date() }],
      activeVariant: 0
    }

    setMessages((prev) => [...prev, aiMessage])
    setIsLoading(false)
  }

  const handleRegenerate = useCallback(async (messageId: string): Promise<void> => {
    if (isLoadingRef.current) return

    const currentMessages = messagesRef.current
    const msgIndex = currentMessages.findIndex((m) => m.id === messageId)
    if (msgIndex === -1) return

    const userMsg = currentMessages
      .slice(0, msgIndex)
      .reverse()
      .find((m) => m.role === 'user')
    if (!userMsg) return

    const userContent = userMsg.variants[userMsg.activeVariant].content

    setMessages((prev) => {
      const updated = [...prev]
      const idx = updated.findIndex((m) => m.id === messageId)
      if (idx === -1) return prev
      const msg = { ...updated[idx] }
      msg.variants = [...msg.variants, { content: '', timestamp: new Date() }]
      msg.activeVariant = msg.variants.length - 1
      updated[idx] = msg
      return updated
    })

    setIsLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200))

    const newContent = getAIResponse(userContent)

    setMessages((prev) => {
      const updated = [...prev]
      const idx = updated.findIndex((m) => m.id === messageId)
      if (idx === -1) return prev
      const msg = { ...updated[idx] }
      msg.variants = [...msg.variants]
      msg.variants[msg.activeVariant] = { content: newContent, timestamp: new Date() }
      updated[idx] = msg
      return updated
    })

    setIsLoading(false)
  }, [])

  const handleEditSave = useCallback(
    async (messageId: string, newContent: string): Promise<void> => {
      const trimmed = newContent.trim()
      if (!trimmed || isLoadingRef.current) return

      const currentMessages = messagesRef.current
      const msgIndex = currentMessages.findIndex((m) => m.id === messageId)
      if (msgIndex === -1) return

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId)
        if (idx === -1) return prev
        const updated = prev.slice(0, idx + 1)
        const msg = { ...updated[idx] }
        msg.variants = [...msg.variants, { content: trimmed, timestamp: new Date() }]
        msg.activeVariant = msg.variants.length - 1
        updated[idx] = msg
        return updated
      })

      setEditingId(null)
      setIsLoading(true)

      await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200))

      const aiMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        variants: [{ content: getAIResponse(trimmed), timestamp: new Date() }],
        activeVariant: 0
      }

      setMessages((prev) => [...prev, aiMessage])
      setIsLoading(false)
    },
    []
  )

  const handleVariantChange = useCallback((messageId: string, direction: 'prev' | 'next'): void => {
    setMessages((prev) => {
      const updated = [...prev]
      const idx = updated.findIndex((m) => m.id === messageId)
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
  }, [])

  const handleNewChat = useCallback((): void => {
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = null
    }
    setMessages([])
    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
    setIsLoading(false)
    setEditingId(null)
    setCopiedId(null)
  }, [])

  const handleCopy = useCallback(async (messageId: string, content: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(messageId)
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedId((prev) => (prev === messageId ? null : prev))
      }, 1500)
    } catch {
      /* ignore clipboard errors */
    }
  }, [])

  const handleCancelEdit = useCallback(() => setEditingId(null), [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInput(e.target.value)
    resizeTextarea(e.target)
  }

  const isChatMode = messages.length > 0
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i
    }
    return -1
  }, [messages])

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
            <div className="ai-chat-input-footer">
              <ModeSelector mode={mode} onChange={setMode} />
            </div>
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
            isCopied={copiedId === msg.id}
            onVariantChange={handleVariantChange}
            onEdit={handleEditSave}
            onRegenerate={handleRegenerate}
            onStartEdit={setEditingId}
            onCancelEdit={handleCancelEdit}
            onCopy={handleCopy}
          />
        ))}
        {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <TypingIndicator />
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="ai-chat-input-bar ai-chat-input-bar-floating">
        <div className="ai-chat-input-wrapper ai-chat-input-floating">
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
        </div>
      </div>
    </div>
  )
})

export default AIChat
