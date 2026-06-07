import { createContext, useContext } from 'react'

interface WorkspaceContextType {
  workspace: string | null
}

export const WorkspaceContext = createContext<WorkspaceContextType>({ workspace: null })

export const useWorkspace = (): WorkspaceContextType => useContext(WorkspaceContext)