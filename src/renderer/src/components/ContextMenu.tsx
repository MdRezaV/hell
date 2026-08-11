import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ContextMenuShowPayload } from '../../../preload/index'
import '../styles/ContextMenu.css'

export default function ContextMenu(): React.JSX.Element | null {
  const [menu, setMenu] = useState<ContextMenuShowPayload | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return window.api.events.onContextMenuShow(setMenu)
  }, [])

  const close = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!menu) return
    const onMouseDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close()
      }
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu, close])

  if (!menu) return null

  const hasSuggestions = menu.dictionarySuggestions.length > 0

  const viewportW = window.innerWidth
  const viewportH = window.innerHeight
  const menuW = 150
  const itemCount = (hasSuggestions ? menu.dictionarySuggestions.length : 1) + 1
  const estimatedH = itemCount * 24 + 12
  const left = menu.x + menuW > viewportW ? viewportW - menuW - 4 : menu.x
  const top = menu.y + estimatedH > viewportH ? viewportH - estimatedH - 4 : menu.y

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {hasSuggestions ? (
        menu.dictionarySuggestions.map((s, i) => (
          <button
            key={s + i}
            className="ctx-menu-item"
            onClick={() => {
              window.api.spellcheckReplace(s)
              close()
            }}
          >
            {s}
          </button>
        ))
      ) : (
        <span className="ctx-menu-empty">No suggestions</span>
      )}
      <div className="ctx-menu-sep" />
      <button
        className="ctx-menu-item ctx-menu-item--muted"
        onClick={() => {
          window.api.spellcheckAddToDictionary(menu.misspelledWord)
          close()
        }}
      >
        Add to dictionary
      </button>
    </div>
  )
}