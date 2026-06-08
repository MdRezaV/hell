import { useState, useEffect, useMemo, memo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  FolderOpen,
  RefreshCw,
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
}

type CheckState = 'checked' | 'unchecked' | 'indeterminate'

function getCheckState(node: FileNode, fileStates: Map<string, FileTag>): CheckState {
  if (node.type === 'file' || !node.children || node.children.length === 0) {
    return fileStates.has(node.path) ? 'checked' : 'unchecked'
  }
  const childStates = node.children.map((child) => getCheckState(child, fileStates))
  const hasChecked = childStates.some((s) => s === 'checked' || s === 'indeterminate')
  const allChecked = childStates.every((s) => s === 'checked')
  if (allChecked) return 'checked'
  if (hasChecked) return 'indeterminate'
  return 'unchecked'
}

function getAllPaths(node: FileNode): string[] {
  const paths = [node.path]
  if (node.children) {
    node.children.forEach((child) => {
      paths.push(...getAllPaths(child))
    })
  }
  return paths
}

const TreeNode = memo(function TreeNode({
  node,
  level,
  fileStates,
  onToggle
}: {
  node: FileNode
  level: number
  fileStates: Map<string, FileTag>
  onToggle: (paths: string[], checked: boolean) => void
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const hasChildren = node.type === 'directory' && !!node.children && node.children.length > 0
  const checkState = getCheckState(node, fileStates)
  const tag = fileStates.get(node.path)

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    e.stopPropagation()
    onToggle(getAllPaths(node), e.target.checked)
  }

  const handleCheckboxClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
  }

  return (
    <div>
      <div
        className="tree-node"
        style={{ paddingLeft: `${level * 16}px` }}
        onClick={() => hasChildren && setIsOpen(!isOpen)}
      >
        <span className="tree-chevron">
          {hasChildren ? isOpen ? <ChevronDown /> : <ChevronRight /> : null}
        </span>
        <span className="tree-checkbox" onClick={handleCheckboxClick}>
          <input
            type="checkbox"
            checked={checkState === 'checked'}
            ref={(el) => {
              if (el) {
                el.indeterminate = checkState === 'indeterminate'
              }
            }}
            onChange={handleCheckboxChange}
          />
        </span>
        <span className={`tree-icon ${node.type === 'directory' ? 'folder' : 'file'}`}>
          {node.type === 'directory' ? <Folder size={15} /> : <File size={15} />}
        </span>
        <span className="tree-label">{node.name}</span>
        {tag && (
          <span className="tree-tag" style={TAG_STYLES[tag]}>
            {tag}
          </span>
        )}
      </div>
      {isOpen && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              fileStates={fileStates}
              onToggle={onToggle}
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
  onToggleFile,
  onFilePathsChange
}: {
  workspace: string | null
  onWorkspaceChange: (path: string | null) => void
  fileStates: Map<string, FileTag>
  onToggleFile: (paths: string[], checked: boolean) => void
  onFilePathsChange: (paths: Set<string>) => void
}): React.JSX.Element {
  const [tree, setTree] = useState<FileNode[]>([])

  useEffect(() => {
    let cancelled = false
    if (workspace) {
      window.electron.ipcRenderer.invoke('read-directory', workspace).then((files: FileNode[]) => {
        if (!cancelled) {
          const sorted = sortTree(files)
          setTree(sorted)
          onFilePathsChange(collectFilePaths(sorted))
        }
      })
    } else {
      queueMicrotask(() => {
        setTree([])
        onFilePathsChange(new Set())
      })
    }
    return () => {
      cancelled = true
    }
  }, [workspace, onFilePathsChange])

  const handleOpenWorkspace = async (): Promise<void> => {
    const path = await window.electron.ipcRenderer.invoke('open-workspace')
    if (path) {
      onWorkspaceChange(path)
    }
  }

  const handleRefresh = async (): Promise<void> => {
    if (!workspace) return
    const files = await window.electron.ipcRenderer.invoke('read-directory', workspace)
    const sorted = sortTree(files)
    setTree(sorted)
    onFilePathsChange(collectFilePaths(sorted))
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
          <button onClick={handleRefresh} title="Refresh">
            <RefreshCw size={14} strokeWidth={2} />
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
            onToggle={onToggleFile}
          />
        ))}
      </div>
    </div>
  )
}

export default FileExplorer
