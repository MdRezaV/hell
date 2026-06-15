import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import {
  ApplyAllContext,
  type ApplyBlockInfo,
  type ApplyBlockStatus,
  useApplyAllContext
} from './applyAll'

export function ApplyAllProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [blocks, setBlocks] = useState<Map<string, ApplyBlockInfo>>(new Map())

  const register = useCallback((id: string, apply: () => Promise<void>) => {
    setBlocks((prev) => {
      const next = new Map(prev)
      next.set(id, { apply, status: prev.get(id)?.status ?? 'idle' })
      return next
    })
  }, [])

  const unregister = useCallback((id: string) => {
    setBlocks((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const setStatus = useCallback((id: string, status: ApplyBlockStatus) => {
    setBlocks((prev) => {
      const existing = prev.get(id)
      if (!existing || existing.status === status) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, status })
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ blocks, register, unregister, setStatus }),
    [blocks, register, unregister, setStatus]
  )

  return <ApplyAllContext.Provider value={value}>{children}</ApplyAllContext.Provider>
}

export function ApplyAllBar(): React.JSX.Element | null {
  const ctx = useApplyAllContext()
  const [applying, setApplying] = useState(false)
  if (!ctx) return null
  const { blocks } = ctx
  const blockArr = [...blocks.values()]
  if (blockArr.length === 0) return null

  const idleBlocks = blockArr.filter((b) => b.status === 'idle')
  const idleCount = idleBlocks.length
  const hasWarning = blockArr.some((b) => b.status === 'notFound')
  const allApplied = blockArr.every((b) => b.status === 'applied')

  const handleApplyAll = async (): Promise<void> => {
    if (applying || idleCount === 0) return
    setApplying(true)
    try {
      for (const b of idleBlocks) {
        await b.apply()
      }
    } finally {
      setApplying(false)
    }
  }

  let variantClass = ''
  let label = `Apply All (${idleCount})`
  let disabled = false

  if (allApplied) {
    variantClass = ' applied'
    label = 'All Applied'
    disabled = true
  } else if (applying) {
    label = 'Applying...'
    disabled = true
  } else if (hasWarning) {
    variantClass = ' warning'
    if (idleCount === 0) {
      label = 'Not Found'
      disabled = true
    }
  } else if (idleCount === 0) {
    disabled = true
  }

  return (
    <div className="md-apply-all-bar">
      <button
        type="button"
        className={`md-apply-all${variantClass}`}
        onClick={handleApplyAll}
        disabled={disabled}
      >
        <Check size={12} />
        <span>{label}</span>
      </button>
    </div>
  )
}
