import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Check, Plus, Undo2 } from 'lucide-react'
import {
  ApplyAllContext,
  type ApplyBlockInfo,
  type ApplyBlockStatus,
  useApplyAllContext
} from '@renderer/hooks/useApplyAll'

interface FileIncludeContextValue {
  register: (path: string) => void
  unregister: (path: string) => void
  markAdded: (path: string) => void
  paths: Set<string>
  addedPaths: Set<string>
}

const FileIncludeContext = createContext<FileIncludeContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useFileIncludeContext(): FileIncludeContextValue | null {
  return useContext(FileIncludeContext)
}

export function FileIncludeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [paths, setPaths] = useState<Set<string>>(new Set())
  const [addedPaths, setAddedPaths] = useState<Set<string>>(new Set())

  const register = useCallback((path: string) => {
    setPaths((prev) => {
      if (prev.has(path)) return prev
      const next = new Set(prev)
      next.add(path)
      return next
    })
  }, [])

  const unregister = useCallback((path: string) => {
    setPaths((prev) => {
      if (!prev.has(path)) return prev
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }, [])

  const markAdded = useCallback((path: string) => {
    setAddedPaths((prev) => {
      if (prev.has(path)) return prev
      const next = new Set(prev)
      next.add(path)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ paths, addedPaths, register, unregister, markAdded }),
    [paths, addedPaths, register, unregister, markAdded]
  )

  return <FileIncludeContext.Provider value={value}>{children}</FileIncludeContext.Provider>
}

export function FileIncludeBar(): React.JSX.Element | null {
  const ctx = useFileIncludeContext()
  if (!ctx) return null
  const { paths } = ctx
  if (paths.size === 0) return null

  const handleAddAll = (): void => {
    for (const path of paths) {
      const detail: { path: string; matched?: boolean } = { path }
      window.dispatchEvent(new CustomEvent('file-include-add', { detail }))
      if (detail.matched) {
        ctx.markAdded(path)
      }
    }
  }

  return (
    <div className="md-apply-all-bar">
      <button type="button" className="md-apply-all" onClick={handleAddAll}>
        <Plus size={12} />
        <span>Add All ({paths.size})</span>
      </button>
    </div>
  )
}

export function ApplyAllProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [blocks, setBlocks] = useState<Map<string, ApplyBlockInfo>>(new Map())

  const register = useCallback(
    (id: string, apply: () => Promise<void>, unapply?: () => Promise<void>) => {
      setBlocks((prev) => {
        const next = new Map(prev)
        const existing = prev.get(id)
        next.set(id, {
          apply,
          unapply: unapply ?? existing?.unapply,
          status: existing?.status ?? 'idle'
        })
        return next
      })
    },
    []
  )

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
  const [busy, setBusy] = useState<'idle' | 'applying' | 'unapplying'>('idle')
  if (!ctx) return null
  const { blocks } = ctx
  const blockArr = [...blocks.values()]
  if (blockArr.length === 0) return null

  const idleBlocks = blockArr.filter((b) => b.status === 'idle')
  const idleCount = idleBlocks.length
  const appliedBlocks = blockArr.filter((b) => b.status === 'applied' && b.unapply)
  const appliedCount = appliedBlocks.length
  const hasWarning = blockArr.some((b) => b.status === 'notFound')
  const allApplied = blockArr.every((b) => b.status === 'applied')

  const handleApplyAll = async (): Promise<void> => {
    if (busy !== 'idle' || idleCount === 0) return
    setBusy('applying')
    try {
      for (const b of idleBlocks) {
        await b.apply()
      }
    } finally {
      setBusy('idle')
    }
  }

  const handleUnapplyAll = async (): Promise<void> => {
    if (busy !== 'idle' || appliedCount === 0) return
    setBusy('unapplying')
    try {
      for (const b of [...appliedBlocks].reverse()) {
        await b.unapply!()
      }
    } finally {
      setBusy('idle')
    }
  }

  let variantClass = ''
  let label = `Apply All (${idleCount})`
  let applyDisabled = false

  if (allApplied) {
    variantClass = ' applied'
    label = 'All Applied'
    applyDisabled = true
  } else if (busy === 'applying') {
    label = 'Applying...'
    applyDisabled = true
  } else if (hasWarning) {
    variantClass = ' warning'
    if (idleCount === 0) {
      label = 'Not Found'
      applyDisabled = true
    }
  } else if (idleCount === 0) {
    applyDisabled = true
  }

  if (busy === 'unapplying') {
    applyDisabled = true
  }

  let unapplyLabel = `UnApply All (${appliedCount})`
  let unapplyDisabled = appliedCount === 0 || busy !== 'idle'
  if (busy === 'unapplying') {
    unapplyLabel = 'UnApplying...'
    unapplyDisabled = true
  } else if (appliedCount === 0) {
    unapplyDisabled = true
  }

  return (
    <div className="md-apply-all-bar">
      <button
        type="button"
        className="md-unapply-all"
        onClick={handleUnapplyAll}
        disabled={unapplyDisabled}
      >
        <Undo2 size={12} />
        <span>{unapplyLabel}</span>
      </button>
      <button
        type="button"
        className={`md-apply-all${variantClass}`}
        onClick={handleApplyAll}
        disabled={applyDisabled}
      >
        <Check size={12} />
        <span>{label}</span>
      </button>
    </div>
  )
}
