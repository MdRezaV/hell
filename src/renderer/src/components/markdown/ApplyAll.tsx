import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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
  markNotFound: (path: string) => void
  paths: Set<string>
  addedPaths: Set<string>
  notFoundPaths: Set<string>
}

const FileIncludeContext = createContext<FileIncludeContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useFileIncludeContext(): FileIncludeContextValue | null {
  return useContext(FileIncludeContext)
}

export function FileIncludeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [paths, setPaths] = useState<Set<string>>(new Set())
  const [addedPaths, setAddedPaths] = useState<Set<string>>(new Set())
  const [notFoundPaths, setNotFoundPaths] = useState<Set<string>>(new Set())

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

  const markNotFound = useCallback((path: string) => {
    setNotFoundPaths((prev) => {
      if (prev.has(path)) return prev
      const next = new Set(prev)
      next.add(path)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ paths, addedPaths, notFoundPaths, register, unregister, markAdded, markNotFound }),
    [paths, addedPaths, notFoundPaths, register, unregister, markAdded, markNotFound]
  )

  return <FileIncludeContext.Provider value={value}>{children}</FileIncludeContext.Provider>
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
  const includeCtx = useFileIncludeContext()
  const [busy, setBusy] = useState<'idle' | 'applying' | 'unapplying'>('idle')

  useEffect(() => {
    if (!includeCtx) return
    const listener = (): void => {
      const unadded = [...includeCtx.paths].filter((p) => !includeCtx.addedPaths.has(p))
      const addable = unadded.filter((p) => !includeCtx.notFoundPaths.has(p))
      for (const path of addable) {
        const detail: { path: string; matched?: boolean } = { path }
        window.dispatchEvent(new CustomEvent('file-include-add', { detail }))
        if (detail.matched) {
          includeCtx.markAdded(path)
        }
      }
    }
    window.addEventListener('trigger-include-add-all', listener)
    return () => window.removeEventListener('trigger-include-add-all', listener)
  }, [includeCtx])

  const hasApplyBlocks = !!ctx && ctx.blocks.size > 0
  const hasIncludePaths = !!includeCtx && includeCtx.paths.size > 0

  if (!hasApplyBlocks && !hasIncludePaths) return null

  const blockArr = ctx ? [...ctx.blocks.values()] : []
  const idleBlocks = blockArr.filter((b) => b.status === 'idle')
  const idleCount = idleBlocks.length
  const appliedBlocks = blockArr.filter((b) => b.status === 'applied' && b.unapply)
  const appliedCount = appliedBlocks.length
  const hasWarning = blockArr.some((b) => b.status === 'notFound')
  const allApplied = blockArr.length > 0 && blockArr.every((b) => b.status === 'applied')

  const unaddedPaths = includeCtx
    ? [...includeCtx.paths].filter((p) => !includeCtx.addedPaths.has(p))
    : []
  const unaddedCount = unaddedPaths.length
  const allAdded = hasIncludePaths && unaddedCount === 0
  const hasAddWarning = includeCtx ? includeCtx.notFoundPaths.size > 0 : false
  const addablePaths = includeCtx
    ? unaddedPaths.filter((p) => !includeCtx.notFoundPaths.has(p))
    : []
  const addableCount = addablePaths.length

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

  const handleAddAll = (): void => {
    if (!includeCtx || addableCount === 0) return
    for (const path of addablePaths) {
      const detail: { path: string; matched?: boolean } = { path }
      window.dispatchEvent(new CustomEvent('file-include-add', { detail }))
      if (detail.matched) {
        includeCtx.markAdded(path)
      }
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

  let addLabel = `Add All (${addableCount})`
  let addVariantClass = ''
  let addDisabled = false
  if (allAdded) {
    addLabel = 'All Added'
    addVariantClass = ' applied'
    addDisabled = true
  } else if (hasAddWarning) {
    addVariantClass = ' warning'
    if (addableCount === 0) {
      addLabel = 'Not Found'
      addDisabled = true
    }
  } else if (unaddedCount === 0) {
    addDisabled = true
  }

  return (
    <div className="md-apply-all-bar">
      {hasApplyBlocks && (
        <button
          type="button"
          className="md-unapply-all"
          onClick={handleUnapplyAll}
          disabled={unapplyDisabled}
        >
          <Undo2 size={12} />
          <span>{unapplyLabel}</span>
        </button>
      )}
      {hasIncludePaths && (
        <button
          type="button"
          className={`md-apply-all${addVariantClass}`}
          onClick={handleAddAll}
          disabled={addDisabled}
        >
          <Plus size={12} />
          <span>{addLabel}</span>
        </button>
      )}
      {hasApplyBlocks && (
        <button
          type="button"
          className={`md-apply-all${variantClass}`}
          onClick={handleApplyAll}
          disabled={applyDisabled}
        >
          <Check size={12} />
          <span>{label}</span>
        </button>
      )}
    </div>
  )
}
