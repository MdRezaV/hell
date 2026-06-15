import type { ReactNode } from 'react'

export function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node || typeof node !== 'object') return ''

  const stack: ReactNode[] = [node]
  const parts: string[] = []

  while (stack.length > 0) {
    const current = stack.pop()
    if (current == null) continue
    if (typeof current === 'string') {
      parts.push(current)
    } else if (typeof current === 'number') {
      parts.push(String(current))
    } else if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i--) {
        stack.push(current[i])
      }
    } else if (typeof current === 'object' && 'props' in current) {
      const props = (current as { props?: { children?: ReactNode } }).props
      if (props?.children != null) {
        stack.push(props.children)
      }
    }
  }

  return parts.join('')
}
