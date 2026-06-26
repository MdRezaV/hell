import { createContext, useContext, useEffect, useState } from 'react'

export const DeferredHighlightingContext = createContext(false)

export function useDeferHeavyRendering(): boolean {
  return useContext(DeferredHighlightingContext)
}

function scheduleWhenIdle(callback: () => void): void {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number }
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(callback)
  } else {
    setTimeout(callback, 0)
  }
}

export function useDeferredHighlighting(
  defer: boolean,
  observeRef: { current: HTMLElement | null }
): boolean {
  const [observedReady, setObservedReady] = useState(false)

  const ready = !defer || observedReady

  useEffect(() => {
    if (!defer || observedReady) return
    const el = observeRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            scheduleWhenIdle(() => setObservedReady(true))
            observer.disconnect()
            break
          }
        }
      },
      { rootMargin: '300px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [defer, observedReady, observeRef])

  return ready
}
