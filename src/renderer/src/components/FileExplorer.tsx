import { useState, useEffect, useMemo, memo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  FolderOpen,
  Eraser,
  Folder as FolderBig
} from 'lucide-react'

export type FileTag = 'PND' | 'INQ' | 'ADD'

const TAG_STYLES: Record<FileTag, React.CSSProperties> = {
  PND: { backgroundColor: 'rgba(249, 226, 175, 0.45)', color: '#f9e2af' },
  INQ: { backgroundColor: 'rgba(203, 166, 247, 0.45)', color: '#cba6f7' },
  ADD: { backgroundColor: 'rgba(166, 227, 161, 0.45)', color: '#a6e3a1' }
}

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  isBinary?: boolean
}

type CheckState = 'checked' | 'unchecked' | 'indeterminate'

function getCheckState(node: FileNode, fileStates: Map<string, FileTag>): CheckState {
  const selectablePaths = getLeafPaths(node)
  if (selectablePaths.length === 0) return 'unchecked'
  let checkedCount = 0
  for (const p of selectablePaths) {
    if (fileStates.has(p)) checkedCount++
  }
  if (checkedCount === 0) return 'unchecked'
  if (checkedCount === selectablePaths.length) return 'checked'
  return 'indeterminate'
}

function getLeafPaths(node: FileNode): string[] {
  if (node.type === 'file') {
    return node.isBinary ? [] : [node.path]
  }
  if (!node.children || node.children.length === 0) return []
  const paths: string[] = []
  node.children.forEach((child) => paths.push(...getLeafPaths(child)))
  return paths
}

const TAG_CHARS: Record<FileTag, string> = {
  PND: 'P',
  INQ: 'I',
  ADD: 'A'
}

const TAG_ORDER: FileTag[] = ['PND', 'INQ', 'ADD']

function getNodeTags(node: FileNode, fileStates: Map<string, FileTag>): FileTag[] {
  if (node.type === 'file') {
    const tag = fileStates.get(node.path)
    return tag ? [tag] : []
  }
  const tagSet = new Set<FileTag>()
  const walk = (n: FileNode): void => {
    if (n.type === 'file') {
      const t = fileStates.get(n.path)
      if (t) tagSet.add(t)
    }
    n.children?.forEach(walk)
  }
  node.children?.forEach(walk)
  return TAG_ORDER.filter((t) => tagSet.has(t))
}

const TreeNode = memo(function TreeNode({
  node,
  level,
  fileStates,
  expandedDirs,
  onToggle,
  onToggleExpand
}: {
  node: FileNode
  level: number
  fileStates: Map<string, FileTag>
  expandedDirs: Set<string>
  onToggle: (paths: string[], checked: boolean) => void
  onToggleExpand: (path: string, expanded: boolean) => void
}): React.JSX.Element {
  const isOpen = expandedDirs.has(node.path)
  const hasChildren = node.type === 'directory' && !!node.children && node.children.length > 0
  const checkState = getCheckState(node, fileStates)
  const tags = getNodeTags(node, fileStates)
  const isBinary = node.type === 'file' && !!node.isBinary

  const selectablePaths = getLeafPaths(node)
  const isDisabled = selectablePaths.length === 0
  const showCheckbox = !isBinary

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    e.stopPropagation()
    const paths = getLeafPaths(node)
    if (paths.length === 0) return
    onToggle(paths, e.target.checked)
  }

  const handleCheckboxClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
  }

  const handleRowClick = (): void => {
    if (hasChildren && node.type === 'directory') {
      onToggleExpand(node.path, !isOpen)
    }
  }

  return (
    <div>
      <div
        className="tree-node"
        style={{ paddingLeft: `${level * 16}px` }}
        onClick={handleRowClick}
      >
        <span className="tree-chevron">
          {hasChildren ? isOpen ? <ChevronDown /> : <ChevronRight /> : null}
        </span>
        {showCheckbox && (
          <span className="tree-checkbox" onClick={handleCheckboxClick}>
            <input
              type="checkbox"
              checked={checkState === 'checked'}
              disabled={isDisabled}
              ref={(el) => {
                if (el) {
                  el.indeterminate = checkState === 'indeterminate'
                }
              }}
              onChange={handleCheckboxChange}
            />
          </span>
        )}
        <span className={`tree-icon ${node.type === 'directory' ? 'folder' : 'file'}`}>
          {node.type === 'directory' ? <Folder size={15} /> : <File size={15} />}
        </span>
        <span className="tree-label" style={isBinary ? { opacity: 0.5 } : undefined}>
          {node.name}
        </span>
        {isBinary && (
          <span
            className="tree-tag"
            style={{ backgroundColor: 'rgba(150, 150, 150, 0.3)', color: '#888' }}
          >
            BIN
          </span>
        )}
        {tags.map((tag) => (
          <span key={tag} className="tree-tag" style={TAG_STYLES[tag]}>
            {node.type === 'file' ? tag : TAG_CHARS[tag]}
          </span>
        ))}
      </div>
      {isOpen && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              fileStates={fileStates}
              expandedDirs={expandedDirs}
              onToggle={onToggle}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
})

function sortTree(nodes: FileNode[]): FileNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    .map((node) => {
      if (node.children) {
        return { ...node, children: sortTree(node.children) }
      }
      return node
    })
}

function collectFilePaths(nodes: FileNode[]): Set<string> {
  const paths = new Set<string>()
  const walk = (list: FileNode[]): void => {
    for (const n of list) {
      if (n.type === 'file') paths.add(n.path)
      if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return paths
}

function FileExplorer({
  workspace,
  onWorkspaceChange,
  fileStates,
  expandedDirs,
  onToggleFile,
  onToggleExpand,
  onClearSelections,
  onFilePathsChange
}: {
  workspace: string | null
  onWorkspaceChange: (path: string | null) => void
  fileStates: Map<string, FileTag>
  expandedDirs: Set<string>
  onToggleFile: (paths: string[], checked: boolean) => void
  onToggleExpand: (path: string, expanded: boolean) => void
  onClearSelections: () => void
  onFilePathsChange: (paths: Set<string>) => void
}): React.JSX.Element {
  const [tree, setTree] = useState<FileNode[]>([])

  useEffect(() => {
    if (!workspace) {
      queueMicrotask(() => {
        setTree([])
        onFilePathsChange(new Set())
      })
      return
    }

    let cancelled = false

    const refresh = (): void => {
      window.electron.ipcRenderer.invoke('read-directory', workspace).then((files: FileNode[]) => {
        if (cancelled) return
        const sorted = sortTree(files)
        setTree(sorted)
        onFilePathsChange(collectFilePaths(sorted))
      })
    }

    refresh()

    const handleChange = (): void => refresh()
    window.electron.ipcRenderer.on('workspace:changed', handleChange)

    return () => {
      cancelled = true
      window.electron.ipcRenderer.removeListener('workspace:changed', handleChange)
    }
  }, [workspace, onFilePathsChange])

  const handleOpenWorkspace = async (): Promise<void> => {
    const path = await window.electron.ipcRenderer.invoke('open-workspace')
    if (path) {
      onWorkspaceChange(path)
    }
  }

  const filePathSet = useMemo(() => collectFilePaths(tree), [tree])
  const fileCount = filePathSet.size

  const checkedCount = useMemo(() => {
    let count = 0
    fileStates.forEach((_, p) => {
      if (filePathSet.has(p)) count++
    })
    return count
  }, [filePathSet, fileStates])

  if (!workspace) {
    return (
      <div className="explorer-empty">
        <FolderBig className="explorer-empty-icon" size={48} strokeWidth={1.25} />
        <p>No folder opened</p>
        <button onClick={handleOpenWorkspace}>Open Workspace</button>
      </div>
    )
  }

  return (
    <div className="file-explorer">
      <div className="explorer-header">
        <div className="explorer-header-left">
          <span className="explorer-header-title">{workspace.split(/[/\\]/).pop()}</span>
          <span className="explorer-count">
            {checkedCount}/{fileCount}
          </span>
        </div>
        <div className="explorer-header-actions">
          <button onClick={onClearSelections} title="Clear selections">
            <Eraser size={14} strokeWidth={2} />
          </button>
          <button onClick={handleOpenWorkspace} title="Open Folder">
            <FolderOpen size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="explorer-tree">
        {tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            level={0}
            fileStates={fileStates}
            expandedDirs={expandedDirs}
            onToggle={onToggleFile}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </div>
    </div>
  )
}

export default FileExplorer
