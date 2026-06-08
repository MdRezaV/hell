import { useCallback } from 'react'

export function useAutoResizeTextarea(): (el: HTMLTextAreaElement) => void {
  return useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])
}
