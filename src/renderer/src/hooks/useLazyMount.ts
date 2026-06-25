import { useCallback, useEffect, useState } from 'react'

export interface UseLazyMountResult {
  containerRef: (el: HTMLDivElement | null) => void
  shouldMount: boolean
  placeholderHeight: number | null
}

const ROOT_MARGIN = '200px 0px'

/**
 * Defers mounting of heavy content until the observed container is near the
 * viewport, and unmounts it once it scrolls far outside. While unmounted, a
 * placeholder with the last-measured height preserves layout so scrollbars
 * and scroll position do not collapse.
 */
export function useLazyMount(): UseLazyMountResult {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  // Start mounted so the first render can be measured.
  const [isNearViewport, setIsNearViewport] = useState(true)
  const [height, setHeight] = useState<number | null>(null)

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    setContainerEl(el)
  }, [])

  useEffect(() => {
    if (!containerEl) return

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsNearViewport(entry.isIntersecting)
        }
      },
      { rootMargin: ROOT_MARGIN }
    )
    io.observe(containerEl)

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height
        if (h > 0) {
          setHeight(h)
        }
      }
    })
    ro.observe(containerEl)

    return () => {
      io.disconnect()
      ro.disconnect()
    }
  }, [containerEl])

  // Keep content mounted until we have a measured height, otherwise the
  // placeholder would render with 0 height and never recover.
  const shouldMount = isNearViewport || height === null

  return { containerRef, shouldMount, placeholderHeight: height }
}