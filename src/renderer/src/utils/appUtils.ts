import { type ChatMessage } from '../components/AIChat'

export const MIN_LEFT_WIDTH = 160
export const MAX_LEFT_WIDTH = 520
export const DEFAULT_LEFT_WIDTH = 280

export function joinWithWorkspace(workspace: string, relPath: string): string {
  const sep = workspace.includes('\\') ? '\\' : '/'
  return workspace + sep + relPath
}

export function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return 'New Chat'
  const content = firstUser.variants[firstUser.activeVariant]?.content ?? ''
  const trimmed = content.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= 40) return trimmed
  return trimmed.slice(0, 40) + '...'
}
