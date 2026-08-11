import { useEffect, useRef } from 'react'

interface GlobalShortcutHandlers {
  onNewChat: () => void
  onOpenWorkspace: () => void
  onFocusFileSearch: () => void
  onClearSelections: () => void
  onCollapseAll: () => void
  onExpandAll: () => void
  onNavigateHistoryUp: () => void
  onNavigateHistoryDown: () => void
  onCopy: () => void
  onPaste: () => void
  onToggleWhip: () => void
  onModeKey: (digit: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  isWelcomeScreen: () => boolean
}

export function useGlobalShortcuts(handlers: GlobalShortcutHandlers): void {
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key
      const lower = key.toLowerCase()

      const target = e.target as HTMLElement
      const isInput = ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable

      // Ctrl/Cmd + 1..9 — switch chat mode (welcome screen only, works even in input).
      // Ctrl/Cmd+0 is shared with zoom reset: on the welcome screen it switches mode,
      // everywhere else it resets zoom (see the zoom branch below for the other keys).
      if (mod && !e.shiftKey && !e.altKey && /^\d$/.test(key)) {
        if (handlersRef.current.isWelcomeScreen()) {
          e.preventDefault()
          handlersRef.current.onModeKey(parseInt(key, 10))
          return
        }
        if (key === '0' && !isInput) {
          e.preventDefault()
          handlersRef.current.onZoomReset()
        }
        return
      }

      // Ctrl/Cmd +/- — zoom in/out
      if (mod && !e.altKey && !e.shiftKey && (key === '=' || key === '+' || key === '-')) {
        if (isInput) return
        e.preventDefault()
        if (key === '-') {
          handlersRef.current.onZoomOut()
        } else {
          handlersRef.current.onZoomIn()
        }
        return
      }

      // Ctrl/Cmd-only shortcuts
      if (mod && !e.altKey && !e.shiftKey) {
        if (isInput) return
        if (lower === 'n') {
          e.preventDefault()
          handlersRef.current.onNewChat()
        } else if (lower === 'o') {
          e.preventDefault()
          handlersRef.current.onOpenWorkspace()
        } else if (lower === 'k') {
          e.preventDefault()
          handlersRef.current.onClearSelections()
        } else if (lower === 'f') {
          e.preventDefault()
          handlersRef.current.onFocusFileSearch()
        } else if (lower === 'c') {
          const selection = window.getSelection()
          if (!selection || selection.toString().length === 0) {
            e.preventDefault()
            handlersRef.current.onCopy()
          }
        } else if (lower === 'v') {
          e.preventDefault()
          handlersRef.current.onPaste()
        } else if (lower === 'w') {
          e.preventDefault()
          handlersRef.current.onToggleWhip()
        }
        return
      }

      // Alt + Shift + C/E — collapse/expand all directories
      if (e.altKey && e.shiftKey && !mod) {
        if (isInput) return
        if (lower === 'c') {
          e.preventDefault()
          handlersRef.current.onCollapseAll()
        } else if (lower === 'e') {
          e.preventDefault()
          handlersRef.current.onExpandAll()
        }
        return
      }

      // Alt + Arrow — navigate chat history
      if (e.altKey && !e.shiftKey && !mod) {
        if (isInput) return
        if (key === 'ArrowUp') {
          e.preventDefault()
          handlersRef.current.onNavigateHistoryUp()
        } else if (key === 'ArrowDown') {
          e.preventDefault()
          handlersRef.current.onNavigateHistoryDown()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
