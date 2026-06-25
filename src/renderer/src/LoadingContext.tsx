import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

export interface LoadingContextValue {
  isLoading: boolean
  beginTask: () => void
  endTask: () => void
  withLoading: <T>(fn: () => Promise<T>) => Promise<T>
}

const LoadingContext = createContext<LoadingContextValue | null>(null)

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const countRef = useRef(0)
  const [isLoading, setIsLoading] = useState(false)

  const beginTask = useCallback(() => {
    countRef.current += 1
    if (countRef.current === 1) setIsLoading(true)
  }, [])

  const endTask = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1)
    if (countRef.current === 0) setIsLoading(false)
  }, [])

  const withLoading = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      beginTask()
      try {
        return await fn()
      } finally {
        endTask()
      }
    },
    [beginTask, endTask]
  )

  const value = useMemo<LoadingContextValue>(
    () => ({ isLoading, beginTask, endTask, withLoading }),
    [isLoading, beginTask, endTask, withLoading]
  )

  return <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
}

export const useLoading = (): LoadingContextValue => {
  const ctx = useContext(LoadingContext)
  if (!ctx) {
    throw new Error('useLoading must be used within a LoadingProvider')
  }
  return ctx
}