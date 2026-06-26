import { useCallback, useRef } from 'react'

export function useScrollSync(): {
  leftRef: React.RefObject<HTMLDivElement | null>
  rightRef: React.RefObject<HTMLDivElement | null>
  handleLeftScroll: () => void
  handleRightScroll: () => void
} {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const isSyncing = useRef(false)

  const sync = useCallback((source: 'left' | 'right') => {
    if (isSyncing.current) return
    const from = source === 'left' ? leftRef.current : rightRef.current
    const to = source === 'left' ? rightRef.current : leftRef.current
    if (!from || !to) return

    let didSync = false

    if (to.scrollTop !== from.scrollTop) {
      isSyncing.current = true
      to.scrollTop = from.scrollTop
      didSync = true
    }

    const fromH = from.querySelector('.md-file-code-scroll')
    const toH = to.querySelector('.md-file-code-scroll')
    if (fromH && toH && toH.scrollLeft !== fromH.scrollLeft) {
      isSyncing.current = true
      toH.scrollLeft = fromH.scrollLeft
      didSync = true
    }

    if (didSync) {
      setTimeout(() => {
        isSyncing.current = false
      }, 50)
    }
  }, [])

  const handleLeftScroll = useCallback(() => sync('left'), [sync])
  const handleRightScroll = useCallback(() => sync('right'), [sync])

  return { leftRef, rightRef, handleLeftScroll, handleRightScroll }
}
