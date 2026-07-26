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
import {
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  X
} from 'lucide-react'
import fireAnimation from '../assets/img/fire-animation.gif'
import { useVirtualizer } from '@tanstack/react-virtual'
import Markdown from './Markdown'
import ContextMenu from './ContextMenu'
import '../styles/AIChat.css'
import { useClickOutside } from '../hooks/useClickOutside'
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea'
import {
  buildPrompt,
  CHAT_MODES,
  type FileContext,
  getModeByLabel,
  type McpToolInfo
} from '../utils/PromptEngine'
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

const HAS_INCLUDE_RE = /\[INCLUDE\s+[^\]]+]/

type ChatMode = string

const WELCOME_LINES = [
  'what the HELL is going on?',
  'what the HELL is coding on?',
  'coding feels like HELL',
  'what the HELL?',
  'another day living in HELL',
  'go to HELL (and write some code)',
  'welcome to HELL — commits are forever',
  'HELL freezes over... eventually, when the tests pass',
  'HELL is where the bugs are',
  'merge conflict? straight to HELL',
  'it works on my machine — said no one in HELL',
  'HELL is a warm, cozy IDE',
  'in HELL, all errors are unhandled',
  'in HELL, the AI does the coding and you do the debugging',
  'HELL yeah!',
  'straight outta HELL',
  'HELL is open for business',
  'welcome to the inferno',
  'HELL hath no fury like a failing CI',
  'abandon hope, ye who enter HELL',
  'no rest for the wicked (or the devs in HELL)',
  'the 9th circle of HELL is legacy code',
  'in HELL, the linter watches you sleep',
  'HELL is just production with more honesty',
  'welcome to HELL — git push --force',
  'in HELL, PRs go to rot',
  'in HELL, git blame tells no lies',
  'in HELL, merge conflicts are a lifestyle',
  'welcome to HELL — the sprint never ends',
  'HELL is the only place where NaN === NaN is still false',
  'in HELL, the compiler is always right',
  'in HELL, semicolons go missing',
  'in HELL, TODO comments live forever',
  'every npm install in HELL is a fresh torment',
  'in HELL, indentation wars are eternal',
  'in HELL, stack traces go to die',
  'welcome to HELL — pair program with the devil',
  'HELL has 9 circles of debugging',
  'welcome to HELL — the coffee is stale and so are the deps',
  'welcome to HELL — the build is always red',
  'in HELL, every bug is a feature request',
  'in HELL, your backlog has a backlog',
  "in HELL, `console.log('here')` is a debugging strategy",
  'HELL is the only place where `git push --force` feels like therapy',
  'in HELL, every // TODO becomes a // NEVER',
  'in HELL, your tests pass locally but fail in CI — forever',
  'in HELL, `undefined is not a function` is the official greeting',
  'in HELL, all your dependencies are 3 major versions behind',
  'in HELL, `npm audit fix` just adds more vulnerabilities',
  'in HELL, the stack trace goes so deep it wraps around',
  "in HELL, `null` and `undefined` are not equal — they're roommates",
  'in HELL, `git blame` always points at you',
  'HELL has standups that never sit down',
  'in HELL, every sprint retro is a roast session',
  'in HELL, the PM adds scope during the deploy',
  'in HELL, your PR has been open since the last ice age',
  "in HELL, 'it's just a quick fix' is the most dangerous phrase",
  'in HELL, code review is a blood sport',
  'in HELL, the linter has more authority than the tech lead',
  'in HELL, the AI writes the code and you write the excuses',
  'in HELL, even the AI asks for more context',
  "in HELL, copilot is the pilot and you're the passenger",
  'in HELL, the AI generates code faster than you can reject it',
  'in HELL, hallucinations are a workplace hazard',
  'in HELL, production is just staging with more anxiety',
  'in HELL, every deploy is a leap of faith',
  "in HELL, dark mode isn't a theme — it's a warning",
  'in HELL, rebasing is a circle of its own',
  'in HELL, your .env file is publicly committed and everyone knows',
  'in HELL, the coffee is decaf and the wifi is throttled',
  'in HELL, the only constant is technical debt',
  'welcome to HELL — where the debugger fears to tread',
  'HELL runs on caffeine and bad decisions',
  'one does not simply exit HELL',
  'HELL now comes with 100% more edge cases',
  'your code has been sentenced to HELL',
  'welcome to HELL — please ignore the screaming compiler',
  "HELL exists because production wasn't painful enough",
  'git commit first, panic later',
  'in HELL, undefined behavior is a feature',
  'welcome to HELL — enjoy your infinite loading spinner',
  'in HELL, every fix creates two new bugs',
  'abandon stack overflow, all ye who enter here',
  'HELL is now compiling... eventually',
  'there is no escape from HELL, only hot reload',
  'in HELL, stack traces are bedtime stories',
  'welcome to HELL — hope you like merge conflicts',
  'the bugs were already here when we arrived',
  'in HELL, rubber ducks cry',
  'your technical debt has accrued interest',
  'in HELL, every branch is a feature branch',
  'welcome to HELL — the CI is judging you',
  "there's a special place in HELL for force pushes",
  'in HELL, hope returns a 404',
  'segmentation fault (of the soul)',
  'in HELL, "it works locally" isn\'t enough',
  'welcome to HELL — please sacrifice another dependency',
  'in HELL, npm installs measure geological time',
  'loading HELL... this may take forever',
  'in HELL, the garbage collector missed this one',
  'warning: entering HELL may cause spontaneous refactoring',
  'HELLo world',
  'HELL now features premium existential errors',
  'sudo enter HELL',
  'the only way out is through the debugger',
  'welcome to HELL — your PR has 173 comments',
  'HELL is home to the recursive bug report',
  'your semicolon has been found guilty',
  'in HELL, exceptions are the rule',
  'welcome to HELL — AI writes code, humans explain it',
  "CTRL+Z doesn't work here",
  'every path leads to HELL',
  'in HELL, TODO means "not today"',
  'you have reached the final boss: legacy code',
  'in HELL, there are 99 little bugs in the code',
  'the compiler hungers',
  'welcome to HELL — please resolve the conflicts within yourself',
  'commit messages are forever, shame is eternal',
  'in HELL, undefined is defined by vibes',
  'error 666: developer not found',
  'here we code again',
  'HELL-o there',
  'HELLvetica is the only font here',
  'what the shell? welcome to HELL',
  "HELL yeah, let's ship bugs",
  'go to HELL, but bring unit tests',
  'HELLo from the other IDE',
  'HELL hath no fury like a missing semicolon',
  "HELL is other people's code",
  'HELLo darkness, my old compiler',
  'HELL now comes with extra 🔥... figuratively',
  'the 10th circle of HELL is CSS',
  'HELL is where the Khamenei are',
  'Codex? Claude? No thanks, Im living in HELL',
  'Fuckoff, I haven’t been coding for years',
  'Another day to fuck Qwen',
  'Lets fuck Qwen tonight'
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

type TypingState = 'typing' | 'pausing' | 'glitching' | 'waiting' | 'deleting' | 'idle'

interface TypingResult {
  text: string
  glitch: string | null
  state: TypingState
}

const GLITCH_CHARS = '!@#$%^&*<>{}[]|/\\~`0123456789'

function useTypingAnimation(lines: string[], active: boolean): TypingResult {
  const [displayText, setDisplayText] = useState('')
  const [lineIndex, setLineIndex] = useState(() => Math.floor(Math.random() * lines.length))
  const [charIndex, setCharIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [state, setState] = useState<TypingState>('idle')
  const [glitch, setGlitch] = useState<string | null>(null)
  const [prevActive, setPrevActive] = useState(active)

  // Reset state during rendering when active changes
  if (active !== prevActive) {
    setPrevActive(active)
    if (!active) {
      setState('idle')
      setGlitch(null)
    }
  }

  let derivedState: TypingState = state
  if (!active) {
    derivedState = 'idle'
  } else if (isDeleting) {
    derivedState = 'deleting'
  } else if (charIndex >= (lines[lineIndex]?.length ?? 0)) {
    derivedState = 'waiting'
  } else if (glitch !== null) {
    derivedState = 'glitching'
  }

  useEffect(() => {
    if (!active) {
      return
    }

    const currentLine = lines[lineIndex]
    let timeout: number
    let glitchTimeout: number | undefined

    if (!isDeleting) {
      if (charIndex >= currentLine.length) {
        const pauseDuration = 1400 + Math.random() * 1600
        timeout = window.setTimeout(() => {
          setIsDeleting(true)
        }, pauseDuration)
      } else {
        const roll = Math.random()
        const nextChar = currentLine[charIndex]

        if (roll < 0.035) {
          const wrongChar = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
          Promise.resolve().then(() => setGlitch(wrongChar))
          const glitchDuration = 80 + Math.random() * 80
          glitchTimeout = window.setTimeout(() => {
            setGlitch(null)
            setDisplayText(currentLine.slice(0, charIndex + 1))
            setCharIndex(charIndex + 1)
          }, glitchDuration)
        } else if (roll < 0.09) {
          Promise.resolve().then(() => setState('pausing'))
          timeout = window.setTimeout(
            () => {
              setDisplayText(currentLine.slice(0, charIndex + 1))
              setCharIndex(charIndex + 1)
            },
            180 + Math.random() * 520
          )
        } else {
          Promise.resolve().then(() => setState('typing'))
          let delay = 35 + Math.random() * 55
          if (nextChar === ' ') {
            delay *= 0.5
          } else if ('.,!?;:'.includes(nextChar)) {
            delay += 100 + Math.random() * 150
          } else if ('—-'.includes(nextChar)) {
            delay += 50 + Math.random() * 80
          }
          timeout = window.setTimeout(() => {
            setDisplayText(currentLine.slice(0, charIndex + 1))
            setCharIndex(charIndex + 1)
          }, delay)
        }
      }
    } else {
      if (charIndex > 0) {
        const roll = Math.random()
        let delay = 16 + Math.random() * 22
        if (roll < 0.2) delay *= 0.35
        timeout = window.setTimeout(() => {
          setDisplayText(currentLine.slice(0, charIndex - 1))
          setCharIndex(charIndex - 1)
        }, delay)
      } else {
        timeout = window.setTimeout(
          () => {
            let nextIndex = Math.floor(Math.random() * lines.length)
            if (lines.length > 1 && nextIndex === lineIndex) {
              nextIndex = (nextIndex + 1) % lines.length
            }
            setLineIndex(nextIndex)
            setIsDeleting(false)
          },
          250 + Math.random() * 350
        )
      }
    }

    return () => {
      clearTimeout(timeout)
      if (glitchTimeout !== undefined) clearTimeout(glitchTimeout)
    }
  }, [active, charIndex, isDeleting, lineIndex, lines])

  return { text: displayText, glitch, state: derivedState }
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
  getTaskId(): string
  setMode(mode: string): void
  loadChat(messages: ChatMessage[], mode?: string, chatId?: string, taskId?: string): void
  runTask(
    description: string,
    files: FileContext[],
    dirStructure?: string,
    taskId?: string
  ): Promise<boolean>
}

interface AIChatProps {
  onNewChat?: () => void
  onMessagesChange?: (messages: ChatMessage[], mode: string, taskId: string) => void
  onUserSend?: () => void
}

const AIChat = forwardRef<AIChatHandle, AIChatProps>(function AIChat(
  { onNewChat, onMessagesChange, onUserSend },
  ref
): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [mode, setMode] = useState<ChatMode>(CHAT_MODES[0].label)
  const [taskId, setTaskId] = useState('')
  const [isAwaitingResponse, setIsAwaitingResponse] = useState(false)
  const [chatId, setChatId] = useState<string | undefined>(undefined)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const copyTimeoutRef = useRef<number | null>(null)
  const isLoadingRef = useRef(false)
  const messagesRef = useRef<ChatMessage[]>([])
  const inputValueRef = useRef('')
  const onMessagesChangeRef = useRef(onMessagesChange)
  const onUserSendRef = useRef(onUserSend)
  const modeRef = useRef(mode)
  const taskIdRef = useRef('')
  const pendingSaveRef = useRef<{ messages: ChatMessage[]; mode: string; taskId: string } | null>(
    null
  )
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
    onUserSendRef.current = onUserSend
  }, [onUserSend])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    taskIdRef.current = taskId
  }, [taskId])

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
    const pending = { messages, mode: modeRef.current, taskId: taskIdRef.current }
    pendingSaveRef.current = pending
    const timeout = setTimeout(() => {
      pendingSaveRef.current = null
      onMessagesChangeRef.current?.(pending.messages, pending.mode, pending.taskId)
    }, 300)
    return () => {
      clearTimeout(timeout)
      if (pendingSaveRef.current) {
        const toFlush = pendingSaveRef.current
        pendingSaveRef.current = null
        onMessagesChangeRef.current?.(toFlush.messages, toFlush.mode, toFlush.taskId)
      }
    }
  }, [messages, taskId])

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
        let count = userMessages.length
        if (inputValueRef.current.trim()) {
          count++
        }
        if (count === 0) return 0
        return count - 1
      },
      getMessages(): ChatMessage[] {
        return messagesRef.current
      },
      getMode(): string {
        return modeRef.current
      },
      getTaskId(): string {
        return taskIdRef.current
      },
      setMode(newMode: string): void {
        setMode(newMode)
      },
      loadChat(
        newMessages: ChatMessage[],
        newMode?: string,
        newChatId?: string,
        newTaskId?: string
      ): void {
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
        setTaskId(newTaskId || '')
        taskIdRef.current = newTaskId || ''
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
        let mcpTools: McpToolInfo[] = []
        try {
          mcpTools = (await window.electron.ipcRenderer.invoke(
            'mcp:get-tools',
            workspace
          )) as McpToolInfo[]
        } catch {
          /* MCP not available — continue without tools */
        }
        const promptText = buildPrompt(
          userContent,
          resolvedIndex,
          modeConfig,
          files,
          dirStructure,
          hellMdContent,
          mcpTools
        )
        try {
          await window.electron.ipcRenderer.invoke('clipboard:write-text', promptText)
          return true
        } catch {
          return false
        }
      },
      async runTask(
        description: string,
        files: FileContext[],
        dirStructure?: string,
        newTaskId?: string
      ): Promise<boolean> {
        setMode('Coding')
        modeRef.current = 'Coding'
        setTaskId(newTaskId || '')
        taskIdRef.current = newTaskId || ''
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
        let mcpTools: McpToolInfo[] = []
        try {
          mcpTools = (await window.electron.ipcRenderer.invoke(
            'mcp:get-tools',
            workspace
          )) as McpToolInfo[]
        } catch {
          /* MCP not available — continue without tools */
        }
        const promptText = buildPrompt(
          description,
          userCount - 1,
          modeConfig,
          files,
          dirStructure,
          hellMdContent,
          mcpTools
        )
        try {
          await window.electron.ipcRenderer.invoke('clipboard:write-text', promptText)
          return true
        } catch {
          return false
        }
      },
      async pasteAsAssistant(): Promise<boolean> {
        try {
          const text = await window.electron.ipcRenderer.invoke('clipboard:read-text')
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
  }, [mode, readHellMd, workspace])

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
    const newMessages = [...messagesRef.current, userMessage]
    messagesRef.current = newMessages
    setMessages(newMessages)
    setTimeout(() => onUserSendRef.current?.(), 0)
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
      messagesRef.current = updated
      return updated
    })
    setTimeout(() => onUserSendRef.current?.(), 0)
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
      await window.electron.ipcRenderer.invoke('clipboard:write-text', content)
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

  const showContinue = useMemo(() => {
    if (input.trim()) return false
    if (messages.length === 0) return false
    const last = messages[messages.length - 1]
    if (last.role !== 'assistant') return false
    const content = last.variants[last.activeVariant]?.content ?? ''
    return HAS_INCLUDE_RE.test(content)
  }, [messages, input])

  const handleContinue = useCallback((): void => {
    const last = messagesRef.current[messagesRef.current.length - 1]
    if (!last || last.role !== 'assistant') return

    window.dispatchEvent(new CustomEvent('trigger-include-add-all'))

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      variants: [{ content: 'Continue', timestamp: new Date() }],
      activeVariant: 0
    }
    setIsAwaitingResponse(true)
    const newMessages = [...messagesRef.current, userMessage]
    messagesRef.current = newMessages
    setMessages(newMessages)
    setTimeout(() => onUserSendRef.current?.(), 0)
  }, [])

  const isChatMode = messages.length > 0
  const typedWelcome = useTypingAnimation(WELCOME_LINES, !isChatMode)

  if (!isChatMode) {
    return (
      <div className="ai-chat ai-chat-welcome">
        <ContextMenu />
        <div className="ai-chat-welcome-content">
          <div className="ai-chat-welcome-icon">
            <img src={fireAnimation} alt="" width={64} height={64} />
          </div>
          <p className="ai-chat-welcome-tagline">
            {typedWelcome.text}
            {typedWelcome.glitch && (
              <span className="typing-glitch" aria-hidden="true">
                {typedWelcome.glitch}
              </span>
            )}
            <span
              className={`typing-cursor typing-cursor--${typedWelcome.state}`}
              aria-hidden="true"
            />
          </p>
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
      <ContextMenu />
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
          {showContinue && (
            <div className="ai-chat-input-footer">
              <button type="button" className="ai-chat-continue-btn" onClick={handleContinue}>
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default AIChat
