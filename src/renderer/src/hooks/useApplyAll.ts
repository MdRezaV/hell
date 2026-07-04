import { createContext, useContext, useEffect, useRef, useState } from 'react'

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
  const [stableId] = useState(() =>
    stableKey ? `stable-${hashString(stableKey)}` : `apply-${++applyIdCounter}`
  )
  const applyRef = useRef(applyFn)
  const unapplyRef = useRef(unapplyFn)
  const ctxRef = useRef(ctx)
  useEffect(() => {
    applyRef.current = applyFn
  }, [applyFn])

  useEffect(() => {
    unapplyRef.current = unapplyFn
  }, [unapplyFn])

  useEffect(() => {
    ctxRef.current = ctx
  }, [ctx])

  useEffect(() => {
    const currentCtx = ctxRef.current
    if (!currentCtx) return
    const id = stableId
    const wrappedApply = async (): Promise<void> => {
      try {
        await applyRef.current()
        ctxRef.current?.setStatus(id, 'applied')
      } catch {
        ctxRef.current?.setStatus(id, 'error')
      }
    }
    const wrappedUnapply = unapplyRef.current
      ? async (): Promise<void> => {
          try {
            await unapplyRef.current!()
            ctxRef.current?.setStatus(id, 'idle')
          } catch {
            ctxRef.current?.setStatus(id, 'error')
          }
        }
      : undefined
    currentCtx.register(id, wrappedApply, wrappedUnapply)
    // Don't unregister on unmount — registrations persist so ApplyAllBar
    // can track off-screen blocks. Remounting with the same stableKey
    // updates the functions without creating duplicates.
    // Intentionally omit `ctx` from deps: ctx identity changes every time
    // the blocks Map updates, which would re-run this effect and call
    // register again, producing an infinite update loop. The wrapped
    // callbacks close over refs, so they always invoke the latest
    // functions without needing to re-register.
  }, [stableId])

  useEffect(() => {
    if (!ctxRef.current) return
    ctxRef.current.setStatus(stableId, status)
  }, [status, stableId])

  return ctx?.blocks.get(stableId)?.status ?? status
}
