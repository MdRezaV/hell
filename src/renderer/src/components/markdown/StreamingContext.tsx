/* eslint-disable react-refresh/only-export-components -- context-only module */
import { createContext, useContext } from 'react'

// Indicates whether the currently-rendering segment is the active (streaming)
// one. Consumed by code-block components to defer expensive syntax
// highlighting until streaming completes.
export const StreamingContext = createContext(false)

export function useIsStreaming(): boolean {
  return useContext(StreamingContext)
}