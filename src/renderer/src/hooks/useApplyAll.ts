import { createContext, useContext, useEffect, useRef } from 'react'

export type ApplyBlockStatus = 'idle' | 'applied' | 'error' | 'notFound'

export interface ApplyBlockInfo {
  apply: () => Promise<void>
  unapply?: () => Promise<void>
  status: ApplyBlockStatus
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
  unapplyFn?: () => Promise<void>
): void {
  const ctx = useApplyAllContext()
  const idRef = useRef(`apply-${++applyIdCounter}`)
  const applyRef = useRef(applyFn)
  const unapplyRef = useRef(unapplyFn)

  useEffect(() => {
    applyRef.current = applyFn
  }, [applyFn])

  useEffect(() => {
    unapplyRef.current = unapplyFn
  }, [unapplyFn])

  useEffect(() => {
    if (!ctx) return
    const id = idRef.current
    ctx.register(
      id,
      () => applyRef.current(),
      unapplyRef.current ? () => unapplyRef.current!() : undefined
    )
    return () => ctx.unregister(id)
  }, [ctx])

  useEffect(() => {
    if (!ctx) return
    ctx.setStatus(idRef.current, status)
  }, [ctx, status])
}
