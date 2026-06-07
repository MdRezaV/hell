import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles, Loader2 } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

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

function MessageBubble({ message }: { message: ChatMessage }): React.JSX.Element {
  const isUser = message.role === 'user'

  return (
    <div className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-ai'}`}>
      <div className={`chat-avatar ${isUser ? 'chat-avatar-user' : 'chat-avatar-ai'}`}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
        <div className="chat-bubble-content">
          {message.content.split('\n').map((line, i) => (
            <span key={i}>
              {line.split(/(\*\*[^*]+\*\*)/).map((segment, j) => {
                if (segment.startsWith('**') && segment.endsWith('**')) {
                  return <strong key={j}>{segment.slice(2, -2)}</strong>
                }
                return segment
              })}
              {i < message.content.split('\n').length - 1 && <br />}
            </span>
          ))}
        </div>
        <div className="chat-timestamp">{formatTime(message.timestamp)}</div>
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
      <div className="chat-bubble chat-bubble-ai">
        <div className="chat-typing">
          <span className="chat-typing-dot" />
          <span className="chat-typing-dot" />
          <span className="chat-typing-dot" />
        </div>
      </div>
    </div>
  )
}

function AIChat(): React.JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = async (): Promise<void> => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200))

    const aiMessage: ChatMessage = {
      role: 'assistant',
      content: getAIResponse(trimmed),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, aiMessage])
    setIsLoading(false)
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
          <div className="ai-chat-hint">
            Press <span className="kbd">Enter</span> to send, <span className="kbd">Shift</span>+<span className="kbd">Enter</span> for new line
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-chat">
      <div className="ai-chat-header">
        <div className="ai-chat-header-left">
          <Bot size={16} />
          <span>AI Assistant</span>
        </div>
        <div className="ai-chat-header-status">
          {isLoading ? (
            <>
              <Loader2 size={12} className="spin" />
              <span>Thinking...</span>
            </>
          ) : (
            <>
              <span className="ai-chat-status-dot" />
              <span>Ready</span>
            </>
          )}
        </div>
      </div>
      <div className="ai-chat-messages">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isLoading && <TypingIndicator />}
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