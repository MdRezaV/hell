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
      const code = e.code

      const target = e.target as HTMLElement
      const isInput = ['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable

      // Ctrl/Cmd + 1..9 — switch chat mode (welcome screen only, works even in input).
      // Ctrl/Cmd+0 is shared with zoom reset: on the welcome screen it switches mode,
      // everywhere else it resets zoom (see the zoom branch below for the other keys).
      if (mod && !e.shiftKey && !e.altKey && /^Digit[1-9]$/.test(code)) {
        if (handlersRef.current.isWelcomeScreen()) {
          e.preventDefault()
          handlersRef.current.onModeKey(parseInt(code.slice(5), 10))
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
        if (code === 'KeyN') {
          e.preventDefault()
          handlersRef.current.onNewChat()
        } else if (code === 'KeyO') {
          e.preventDefault()
          handlersRef.current.onOpenWorkspace()
        } else if (code === 'KeyK') {
          e.preventDefault()
          handlersRef.current.onClearSelections()
        } else if (code === 'KeyF') {
          e.preventDefault()
          handlersRef.current.onFocusFileSearch()
        } else if (code === 'KeyC') {
          const selection = window.getSelection()
          if (!selection || selection.toString().length === 0) {
            e.preventDefault()
            handlersRef.current.onCopy()
          }
        } else if (code === 'KeyV') {
          e.preventDefault()
          handlersRef.current.onPaste()
        } else if (code === 'KeyW') {
          e.preventDefault()
          handlersRef.current.onToggleWhip()
        }
        return
      }

      // Alt + Shift + C/E — collapse/expand all directories
      if (e.altKey && e.shiftKey && !mod) {
        if (isInput) return
        if (code === 'KeyC') {
          e.preventDefault()
          handlersRef.current.onCollapseAll()
        } else if (code === 'KeyE') {
          e.preventDefault()
          handlersRef.current.onExpandAll()
        }
        return
      }

      // Alt + Arrow — navigate chat history
      if (e.altKey && !e.shiftKey && !mod) {
        if (isInput) return
        if (code === 'ArrowUp') {
          e.preventDefault()
          handlersRef.current.onNavigateHistoryUp()
        } else if (code === 'ArrowDown') {
          e.preventDefault()
          handlersRef.current.onNavigateHistoryDown()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
