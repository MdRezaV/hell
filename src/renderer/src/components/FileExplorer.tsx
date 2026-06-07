import { useState, useCallback, useEffect, useMemo, memo } from 'react'
import { ChevronRight, ChevronDown, Folder, File } from 'lucide-react'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

type CheckState = 'checked' | 'unchecked' | 'indeterminate'

function getCheckState(
  node: FileNode,
  checkedPaths: Set<string>
): CheckState {
  if (node.type === 'file') {
    return checkedPaths.has(node.path) ? 'checked' : 'unchecked'
  }

  if (!node.children || node.children.length === 0) {
    return checkedPaths.has(node.path) ? 'checked' : 'unchecked'
  }

  const childStates = node.children.map(child => getCheckState(child, checkedPaths))
  const hasChecked = childStates.some(s => s === 'checked' || s === 'indeterminate')
  const allChecked = childStates.every(s => s === 'checked')

  if (allChecked) return 'checked'
  if (hasChecked) return 'indeterminate'
  return 'unchecked'
}

function getAllPaths(node: FileNode): string[] {
  const paths = [node.path]
  if (node.children) {
    node.children.forEach(child => {
      paths.push(...getAllPaths(child))
    })
  }
  return paths
}

const TreeNode = memo(function TreeNode({
  node,
  level,
  checkedPaths,
  onToggle
}: {
  node: FileNode
  level: number
  checkedPaths: Set<string>
  onToggle: (node: FileNode, checked: boolean) => void
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const hasChildren = node.type === 'directory' && !!node.children && node.children.length > 0
  const checkState = getCheckState(node, checkedPaths)

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    e.stopPropagation()
    onToggle(node, e.target.checked)
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
          {hasChildren ? (isOpen ? <ChevronDown /> : <ChevronRight />) : null}
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
      </div>
      {isOpen && hasChildren && (
        <div>
          {node.children!.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              checkedPaths={checkedPaths}
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
    .map(node => {
      if (node.children) {
        return { ...node, children: sortTree(node.children) }
      }
      return node
    })
}

import { FolderOpen, RefreshCw, Folder as FolderBig } from 'lucide-react'

function FileExplorer({
  workspace,
  onWorkspaceChange
}: {
  workspace: string | null
  onWorkspaceChange: (path: string | null) => void
}): React.JSX.Element {
  const [tree, setTree] = useState<FileNode[]>([])
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    if (workspace) {
      window.electron.ipcRenderer.invoke('read-directory', workspace).then((files: FileNode[]) => {
        if (!cancelled) {
          setTree(sortTree(files))
          setCheckedPaths(new Set())
        }
      })
    } else {
      queueMicrotask(() => {
        setTree([])
        setCheckedPaths(new Set())
      })
    }
    return () => { cancelled = true }
  }, [workspace])

  const handleOpenWorkspace = async (): Promise<void> => {
    const path = await window.electron.ipcRenderer.invoke('open-workspace')
    if (path) {
      onWorkspaceChange(path)
    }
  }

  const handleRefresh = async (): Promise<void> => {
    if (!workspace) return
    const files = await window.electron.ipcRenderer.invoke('read-directory', workspace)
    setTree(sortTree(files))
    setCheckedPaths(new Set())
  }

  const handleToggle = useCallback((node: FileNode, checked: boolean): void => {
    setCheckedPaths(prev => {
      const next = new Set(prev)
      const paths = getAllPaths(node)

      if (checked) {
        paths.forEach(p => next.add(p))
      } else {
        paths.forEach(p => next.delete(p))
      }

      return next
    })
  }, [])

  const filePathSet = useMemo(() => {
    const paths = new Set<string>()
    const collect = (nodes: FileNode[]): void => {
      for (const node of nodes) {
        if (node.type === 'file') paths.add(node.path)
        if (node.children) collect(node.children)
      }
    }
    collect(tree)
    return paths
  }, [tree])

  const fileCount = useMemo(() => filePathSet.size, [filePathSet])

  const checkedCount = useMemo(() => {
    let count = 0
    checkedPaths.forEach(p => {
      if (filePathSet.has(p)) count++
    })
    return count
  }, [filePathSet, checkedPaths])

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
          <span className="explorer-count">{checkedCount}/{fileCount}</span>
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
        {tree.map(node => (
          <TreeNode
            key={node.path}
            node={node}
            level={0}
            checkedPaths={checkedPaths}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </div>
  )
}

export default FileExplorer
