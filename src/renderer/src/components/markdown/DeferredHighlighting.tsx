import { createContext, useContext, useEffect, useState } from 'react'

export const DeferredHighlightingContext = createContext(false)

export function useDeferHeavyRendering(): boolean {
  return useContext(DeferredHighlightingContext)
}

export function useDeferredHighlighting(
  defer: boolean,
  _observeRef?: { current: HTMLElement | null }
): boolean {
  void _observeRef
  const [ready, setReady] = useState(!defer)

  useEffect(() => {
    if (ready) return

    if (!defer) {
      setReady(true)
      return
    }

    // Defer past the next paint using a double rAF. In virtualized lists,
    // items only mount when visible, so intersection observation is
    // unnecessary — we just need a brief, reliable defer to avoid blocking
    // the initial render of many messages at once. requestIdleCallback was
    // avoided because it can be starved indefinitely by heavy render work.
    let cancelled = false
    let raf1 = 0
    let raf2 = 0

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!cancelled) setReady(true)
      })
    })

    return () => {
      cancelled = true
      if (raf1) cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [defer, ready])

  return ready
}
