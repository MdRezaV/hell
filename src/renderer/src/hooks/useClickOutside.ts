import { useEffect, useRef } from 'react'

export function useClickOutside<T extends HTMLElement>(
  callback: () => void,
  enabled: boolean
): React.RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!enabled) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callback()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [enabled, callback])

  return ref
}
