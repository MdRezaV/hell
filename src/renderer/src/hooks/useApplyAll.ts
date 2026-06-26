import { createContext, useContext, useEffect, useRef } from 'react'

export type ApplyBlockStatus = 'idle' | 'applied' | 'error' | 'notFound'

export interface ApplyBlockInfo {
  apply: () => Promise<void>
  unapply?: () => Promise<void>
  status: ApplyBlockStatus
}

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export interface ApplyAllContextValue {
  register: (id: string, apply: () => Promise<void>, unapply?: () => Promise<void>) => void
  unregister: (id: string) => void
  setStatus: (id: string, status: ApplyBlockStatus) => void
  blocks: Map<string, ApplyBlockInfo>
}

export const ApplyAllContext = createContext<ApplyAllContextValue | null>(null)

export function useApplyAllContext(): ApplyAllContextValue | null {
  return useContext(ApplyAllContext)
}

let applyIdCounter = 0

export function useApplyRegistration(
  applyFn: () => Promise<void>,
  status: ApplyBlockStatus,
  unapplyFn?: () => Promise<void>,
  stableKey?: string
): ApplyBlockStatus {
  const ctx = useApplyAllContext()
  const idRef = useRef(stableKey ? `stable-${hashString(stableKey)}` : `apply-${++applyIdCounter}`)
  const applyRef = useRef(applyFn)
  const unapplyRef = useRef(unapplyFn)
  const initialSyncRef = useRef(true)

  useEffect(() => {
    applyRef.current = applyFn
  }, [applyFn])

  useEffect(() => {
    unapplyRef.current = unapplyFn
  }, [unapplyFn])

  useEffect(() => {
    if (!ctx) return
    const id = idRef.current
    const wrappedApply = async (): Promise<void> => {
      try {
        await applyRef.current()
        ctx.setStatus(id, 'applied')
      } catch {
        ctx.setStatus(id, 'error')
      }
    }
    const wrappedUnapply = unapplyRef.current
      ? async (): Promise<void> => {
          try {
            await unapplyRef.current!()
            ctx.setStatus(id, 'idle')
          } catch {
            ctx.setStatus(id, 'error')
          }
        }
      : undefined
    ctx.register(id, wrappedApply, wrappedUnapply)
    // Don't unregister on unmount — registrations persist so ApplyAllBar
    // can track off-screen blocks. Remounting with the same stableKey
    // updates the functions without creating duplicates.
  }, [ctx])

  useEffect(() => {
    if (!ctx) return
    const id = idRef.current
    if (initialSyncRef.current) {
      initialSyncRef.current = false
      const existing = ctx.blocks.get(id)?.status
      if (existing) return
    }
    ctx.setStatus(id, status)
  }, [ctx, status])

  return ctx?.blocks.get(idRef.current)?.status ?? status
}
