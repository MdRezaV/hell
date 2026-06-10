import React, { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_LEFT_WIDTH, MAX_LEFT_WIDTH, MIN_LEFT_WIDTH } from '../utils/appUtils'

interface ResizableLayoutResult {
  leftWidth: number
  rightWidth: number
  layoutRef: React.RefObject<HTMLDivElement | null>
  startResizeLeft: (e: React.MouseEvent) => void
  startResizeRight: (e: React.MouseEvent) => void
}

export function useResizableLayout(): ResizableLayoutResult {
  const [leftWidth, setLeftWidth] = useState<number>(DEFAULT_LEFT_WIDTH)
  const [rightWidth, setRightWidth] = useState<number>(DEFAULT_LEFT_WIDTH)
  const isResizing = useRef(false)
  const resizeTarget = useRef<'left' | 'right' | null>(null)
  const layoutRef = useRef<HTMLDivElement>(null)

  const startResizeLeft = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    resizeTarget.current = 'left'
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const startResizeRight = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    resizeTarget.current = 'right'
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!isResizing.current || !layoutRef.current) return
      const rect = layoutRef.current.getBoundingClientRect()
      if (resizeTarget.current === 'left') {
        const newWidth = e.clientX - rect.left
        setLeftWidth(Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, newWidth)))
      } else if (resizeTarget.current === 'right') {
        const newWidth = rect.right - e.clientX
        setRightWidth(Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, newWidth)))
      }
    }

    const handleMouseUp = (): void => {
      if (!isResizing.current) return
      isResizing.current = false
      resizeTarget.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return {
    leftWidth,
    rightWidth,
    layoutRef,
    startResizeLeft,
    startResizeRight
  }
}
