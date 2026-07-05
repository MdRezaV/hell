import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import {
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Flame,
  Pencil,
  Plus,
  X
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import Markdown from './Markdown'
import '../styles/AIChat.css'
import { useClickOutside } from '../hooks/useClickOutside'
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea'
import { buildPrompt, CHAT_MODES, type FileContext, getModeByLabel } from '../utils/PromptEngine'
import { useWorkspace } from '../WorkspaceContext'

export interface MessageVariant {
  content: string
  timestamp: Date
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  variants: MessageVariant[]
  activeVariant: number
}

let nextId = 0
function generateId(): string {
  return `msg-${Date.now()}-${nextId++}`
}

const NEAR_BOTTOM_THRESHOLD = 100

type ChatMode = string

const WELCOME_LINES = [
  'what the HELL is going on?',
  'what the HELL is coding on?',
  'coding feels like HELL',
  'what the HELL?',
  'another day living in HELL'
]

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
          {CHAT_MODES.map((m) => {
            const label = m.label
            return (
              <button
                key={label}
                type="button"
                className={`ai-chat-mode-option ${label === mode ? 'active' : ''}`}
                role="option"
                aria-selected={label === mode}
                onClick={() => {
                  onChange(label)
                  setIsOpen(false)
                }}
              >
                <span>{label}</span>
                <Check size={13} className="mode-check" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

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

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
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
  isEditing,
  isCopied,
  onVariantChange,
  onEdit,
  onStartEdit,
  onCancelEdit,
  onCopy
}: {
  message: ChatMessage
  isEditing: boolean
  isCopied: boolean
  onVariantChange: (id: string, dir: 'prev' | 'next') => void
  onEdit: (id: string, content: string) => void
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onCopy: (id: string, content: string) => void
}): React.JSX.Element {
  const isUser = message.role === 'user'
  const variant = message.variants[message.activeVariant]
  const hasVariants = message.variants.length > 1

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
              {isUser ? (
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
                  <Markdown
                    key={`${message.id}-${message.activeVariant}`}
                    content={variant.content}
                    deferHeavyRendering={true}
                  />
                </div>
              )}
            </div>
            <div className="chat-message-actions">
              <span className="chat-timestamp">{formatTime(variant.timestamp)}</span>
              {hasVariants && (
                <div className="chat-variant-nav">
                  <button
                    onClick={() => onVariantChange(message.id, 'prev')}
                    disabled={message.activeVariant === 0}
                    title="Previous"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <span>
                    {message.activeVariant + 1}/{message.variants.length}
                  </span>
                  <button
                    onClick={() => onVariantChange(message.id, 'next')}
                    disabled={message.activeVariant === message.variants.length - 1}
                    title="Next"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
              {isUser && (
                <button
                  className="chat-action-btn"
                  onClick={() => onStartEdit(message.id)}
                  title="Edit"
                >
                  <Pencil size={12} />
                </button>
              )}
              {
                <button
                  className="chat-action-btn"
                  onClick={() => onCopy(message.id, variant.content)}
                  title={isCopied ? 'Copied' : 'Copy'}
                >
                  {isCopied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              }
            </div>
          </>
        )}
      </div>
    </div>
  )
})

export interface AIChatHandle {
  copyByIndex(
    index?: number,
    files?: FileContext[],
    dirStructure?: string,
    modeLabel?: string
  ): Promise<boolean>
  pasteAsAssistant(): Promise<boolean>
  getResolvedUserIndex(): number
  getMessages(): ChatMessage[]
  getMode(): string
  setMode(mode: string): void
  loadChat(messages: ChatMessage[], mode?: string, chatId?: string): void
  runTask(description: string, files: FileContext[], dirStructure?: string): Promise<boolean>
}

interface AIChatProps {
  onNewChat?: () => void
  onMessagesChange?: (messages: ChatMessage[], mode: string) => void
}

const AIChat = forwardRef<AIChatHandle, AIChatProps>(function AIChat(
  { onNewChat, onMessagesChange },
  ref
): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [mode, setMode] = useState<ChatMode>(CHAT_MODES[0].label)
  const [isAwaitingResponse, setIsAwaitingResponse] = useState(false)
  const [chatId, setChatId] = useState<string | undefined>(undefined)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const copyTimeoutRef = useRef<number | null>(null)
  const isLoadingRef = useRef(false)
  const messagesRef = useRef<ChatMessage[]>([])
  const inputValueRef = useRef('')
  const onMessagesChangeRef = useRef(onMessagesChange)
  const modeRef = useRef(mode)
  const pendingSaveRef = useRef<{ messages: ChatMessage[]; mode: string } | null>(null)
  const isNearBottomRef = useRef(true)
  const loadChatGenerationRef = useRef(0)
  const resizeTextarea = useAutoResizeTextarea()
  const { workspace } = useWorkspace()

  const virtualItemCount = messages.length + (isAwaitingResponse ? 1 : 0)

  const estimateSize = useCallback(
    (index: number): number => {
      if (index >= messages.length) {
        return 60
      }
      const message = messages[index]
      if (!message) return 80

      const variant = message.variants[message.activeVariant]
      const content = variant?.content ?? ''

      const newlineCount = (content.match(/\n/g) || []).length
      const estimatedLinesFromLength = Math.ceil(content.length / 45)
      const totalLines = Math.max(newlineCount + 1, estimatedLinesFromLength)

      let height = 56 + totalLines * 22

      if (message.variants.length > 1) {
        height += 24
      }

      if (message.role === 'assistant') {
        height += 16
      }

      return Math.max(60, Math.min(height, 1200))
    },
    [messages]
  )

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualItemCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize,
    overscan: 5
  })
  const virtualizerRef = useRef(virtualizer)
  virtualizerRef.current = virtualizer

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD
  }, [])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    inputValueRef.current = input
  }, [input])

  useEffect(() => {
    onMessagesChangeRef.current = onMessagesChange
  }, [onMessagesChange])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const readHellMd = useCallback(async (): Promise<string | null> => {
    if (!workspace) return null
    try {
      const result = (await window.electron.ipcRenderer.invoke(
        'read-file',
        workspace,
        'HELL.md'
      )) as { exists: boolean; error: boolean; content: string | null }
      if (result && !result.error && result.exists) {
        return result.content
      }
      return null
    } catch {
      return null
    }
  }, [workspace])

  useEffect(() => {
    if (isLoadingRef.current) return
    if (messages.length === 0) return
    const pending = { messages, mode: modeRef.current }
    pendingSaveRef.current = pending
    const timeout = setTimeout(() => {
      pendingSaveRef.current = null
      onMessagesChangeRef.current?.(pending.messages, pending.mode)
    }, 300)
    return () => {
      clearTimeout(timeout)
      if (pendingSaveRef.current) {
        const toFlush = pendingSaveRef.current
        pendingSaveRef.current = null
        onMessagesChangeRef.current?.(toFlush.messages, toFlush.mode)
      }
    }
  }, [messages])

  useEffect(() => {
    if (!isNearBottomRef.current) return
    if (virtualItemCount > 0) {
      virtualizerRef.current.scrollToIndex(virtualItemCount - 1, { align: 'end' })
    }
  }, [virtualItemCount])

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

  useImperativeHandle(ref, () => {
    return {
      getResolvedUserIndex(): number {
        const userMessages = messagesRef.current.filter((m) => m.role === 'user')
        if (userMessages.length === 0) return 0
        return userMessages.length - 1
      },
      getMessages(): ChatMessage[] {
        return messagesRef.current
      },
      getMode(): string {
        return modeRef.current
      },
      setMode(newMode: string): void {
        setMode(newMode)
      },
      loadChat(newMessages: ChatMessage[], newMode?: string, newChatId?: string): void {
        const generation = ++loadChatGenerationRef.current
        isLoadingRef.current = true
        setInput('')
        if (inputRef.current) {
          inputRef.current.style.height = 'auto'
        }
        setEditingId(null)
        setCopiedId(null)
        setIsAwaitingResponse(false)
        if (newMode !== undefined) {
          setMode(newMode)
        }
        if (newChatId !== undefined) {
          setChatId(newChatId)
        }
        setMessages(newMessages)
        isNearBottomRef.current = true

        if (newMessages.length === 0) {
          setTimeout(() => {
            if (loadChatGenerationRef.current === generation) {
              isLoadingRef.current = false
            }
          }, 0)
          return
        }

        requestAnimationFrame(() => {
          let attempts = 0
          const maxAttempts = 40
          let lastTotalSize = 0
          let stableFrames = 0

          const checkAndScroll = (): void => {
            if (loadChatGenerationRef.current !== generation) return
            attempts++
            const currentCount = virtualizerRef.current.options.count
            const currentTotalSize = virtualizerRef.current.getTotalSize()

            if (currentCount >= newMessages.length && currentTotalSize > 0) {
              if (currentTotalSize === lastTotalSize) {
                stableFrames++
              } else {
                stableFrames = 0
              }
            }
            lastTotalSize = currentTotalSize

            if (stableFrames >= 2 || attempts >= maxAttempts) {
              isLoadingRef.current = false
              virtualizerRef.current.scrollToIndex(newMessages.length - 1, {
                align: 'end',
                behavior: 'auto'
              })
            } else {
              requestAnimationFrame(checkAndScroll)
            }
          }

          requestAnimationFrame(checkAndScroll)
        })
      },
      async copyByIndex(
        index?: number,
        files: FileContext[] = [],
        dirStructure?: string,
        modeLabel?: string
      ): Promise<boolean> {
        let currentMessages = messagesRef.current
        const trimmedInput = inputValueRef.current.trim()

        if (trimmedInput) {
          const userMessage: ChatMessage = {
            id: generateId(),
            role: 'user',
            variants: [{ content: trimmedInput, timestamp: new Date() }],
            activeVariant: 0
          }
          currentMessages = [...currentMessages, userMessage]
          setMessages(currentMessages)
          setInput('')
          inputValueRef.current = ''
          if (inputRef.current) {
            inputRef.current.style.height = 'auto'
          }
          setIsAwaitingResponse(true)
        }

        const updatedUserMessages = currentMessages.filter((m) => m.role === 'user')
        if (updatedUserMessages.length === 0) return false
        const resolvedIndex =
          index === undefined || index < 0 || index >= updatedUserMessages.length
            ? updatedUserMessages.length - 1
            : index
        const userMsg = updatedUserMessages[resolvedIndex]
        const userContent = userMsg.variants[userMsg.activeVariant].content
        const modeConfig = getModeByLabel(modeLabel || mode)
        const hellMdContent = await readHellMd()
        const promptText = buildPrompt(
          userContent,
          resolvedIndex,
          modeConfig,
          files,
          dirStructure,
          hellMdContent
        )
        try {
          await navigator.clipboard.writeText(promptText)
          return true
        } catch {
          return false
        }
      },
      async runTask(
        description: string,
        files: FileContext[],
        dirStructure?: string
      ): Promise<boolean> {
        setMode('Coding')
        const userMessage: ChatMessage = {
          id: generateId(),
          role: 'user',
          variants: [{ content: description, timestamp: new Date() }],
          activeVariant: 0
        }
        const newMessages = [...messagesRef.current, userMessage]
        setMessages(newMessages)
        messagesRef.current = newMessages
        setIsAwaitingResponse(true)

        const modeConfig = getModeByLabel('Coding')
        const userCount = newMessages.filter((m) => m.role === 'user').length
        const hellMdContent = await readHellMd()
        const promptText = buildPrompt(
          description,
          userCount - 1,
          modeConfig,
          files,
          dirStructure,
          hellMdContent
        )
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
          setIsAwaitingResponse(false)
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant') {
              const updated = [...prev]
              const updatedLast = { ...last }
              updatedLast.variants = [
                ...updatedLast.variants,
                { content: text, timestamp: new Date() }
              ]
              updatedLast.activeVariant = updatedLast.variants.length - 1
              updated[updated.length - 1] = updatedLast
              return updated
            }
            const aiMessage: ChatMessage = {
              id: generateId(),
              role: 'assistant',
              variants: [{ content: text, timestamp: new Date() }],
              activeVariant: 0
            }
            return [...prev, aiMessage]
          })
          setTimeout(() => inputRef.current?.focus(), 0)
          return true
        } catch {
          return false
        }
      }
    }
  }, [mode, readHellMd])

  const handleSend = (): void => {
    const trimmed = input.trim()
    if (!trimmed) return

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      variants: [{ content: trimmed, timestamp: new Date() }],
      activeVariant: 0
    }

    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
    setIsAwaitingResponse(true)
    inputValueRef.current = ''
    setMessages((prev) => [...prev, userMessage])
  }

  const handleEditSave = useCallback((messageId: string, newContent: string): void => {
    const trimmed = newContent.trim()
    if (!trimmed) return

    setEditingId(null)
    setIsAwaitingResponse(true)
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
  }, [])

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
    onNewChat?.()
  }, [onNewChat])

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
  const [welcomeText, setWelcomeText] = useState(
    () => WELCOME_LINES[Math.floor(Math.random() * WELCOME_LINES.length)]
  )

  useEffect(() => {
    if (!isChatMode) {
      setWelcomeText(WELCOME_LINES[Math.floor(Math.random() * WELCOME_LINES.length)])
    }
  }, [isChatMode])

  if (!isChatMode) {
    return (
      <div className="ai-chat ai-chat-welcome">
        <div className="ai-chat-welcome-content">
          <div className="ai-chat-welcome-icon">
            <Flame size={40} strokeWidth={1.25} />
          </div>
          <p className="ai-chat-welcome-tagline">{welcomeText}</p>
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
        </div>
        <div className="ai-chat-header-actions">
          <button onClick={handleNewChat} title="New Chat">
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div ref={scrollContainerRef} className="ai-chat-messages" onScroll={handleScroll}>
        <div
          key={chatId}
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative'
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const isTypingRow = virtualRow.index === messages.length
            const rowKey = isTypingRow ? 'typing' : messages[virtualRow.index].id
            const isUserRow = !isTypingRow && messages[virtualRow.index].role === 'user'
            return (
              <div
                key={rowKey}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={`flex ${isUserRow ? 'justify-end' : 'justify-start'}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: '1rem'
                }}
              >
                {isTypingRow ? (
                  <TypingIndicator />
                ) : (
                  <MessageBubble
                    message={messages[virtualRow.index]}
                    isEditing={editingId === messages[virtualRow.index].id}
                    isCopied={copiedId === messages[virtualRow.index].id}
                    onVariantChange={handleVariantChange}
                    onEdit={handleEditSave}
                    onStartEdit={setEditingId}
                    onCancelEdit={handleCancelEdit}
                    onCopy={handleCopy}
                  />
                )}
              </div>
            )
          })}
        </div>
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
          />
        </div>
      </div>
    </div>
  )
})

export default AIChat
