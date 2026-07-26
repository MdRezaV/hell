import type { FileTag } from '../components/FileExplorer'

export interface PromptContentSelection {
  /** File paths to read and include in the prompt. */
  pathsToInclude: string[]
  /** File paths that should transition from PND to INQ. */
  pathsToMarkInq: string[]
  /** Whether the directory tree should be read and injected. */
  includeDirStructure: boolean
  /** Whether the directory structure tag should advance from PND to INQ. */
  transitionDirTag: boolean
}

/**
 * Single decision point for what enters the prompt.
 *
 * Files:
 * - PND/INQ files present in the current file tree are included.
 * - PND files are additionally flagged for transition to INQ.
 * - ADD files from the most recent paste are included even though they
 *   would otherwise be excluded by the PND/INQ filter.
 *
 * Directory structure:
 * - Included when its tag is PND or INQ.
 * - Tag transitions from PND to INQ after inclusion.
 */
export function selectPromptContent(
  fileStates: Map<string, FileTag>,
  filePaths: Set<string>,
  lastPasteAdded: Set<string>,
  dirStructureTag: FileTag | null
): PromptContentSelection {
  const pathsToInclude: string[] = []
  const pathsToMarkInq: string[] = []

  fileStates.forEach((state, path) => {
    if (filePaths.has(path)) {
      if (state === 'PND') {
        pathsToMarkInq.push(path)
      }
      if (state === 'PND' || state === 'INQ') {
        pathsToInclude.push(path)
      }
    }
  })

  lastPasteAdded.forEach((path) => {
    if (fileStates.get(path) === 'ADD' && !pathsToInclude.includes(path)) {
      pathsToInclude.push(path)
    }
  })

  return {
    pathsToInclude,
    pathsToMarkInq,
    includeDirStructure: dirStructureTag === 'PND' || dirStructureTag === 'INQ',
    transitionDirTag: dirStructureTag === 'PND'
  }
}
