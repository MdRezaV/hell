import { useState, useCallback } from 'react'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

function ChevronRight(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 3 11 8 6 13" />
    </svg>
  )
}

function ChevronDown(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 8 11 13 6" />
    </svg>
  )
}

function FolderIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 3.5A1.5 1.5 0 012.5 2h2.764a1 1 0 01.707.293l.828.828A1 1 0 007.5 3.5H13.5A1.5 1.5 0 0115 5v7.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
    </svg>
  )
}

function FileIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 2.5A1.5 1.5 0 013.5 1h5.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 01.439 1.061V13.5A1.5 1.5 0 0111.5 15h-8A1.5 1.5 0 012 13.5v-11z" />
    </svg>
  )
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

function TreeNode({
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
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => hasChildren && setIsOpen(!isOpen)}
      >
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
        <span className="tree-chevron">
          {hasChildren ? (isOpen ? <ChevronDown /> : <ChevronRight />) : null}
        </span>
        <span className="tree-icon">
          {node.type === 'directory' ? <FolderIcon /> : <FileIcon />}
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
}

function FileExplorer(): React.JSX.Element {
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [tree, setTree] = useState<FileNode[]>([])
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set())

  const handleOpenWorkspace = async (): Promise<void> => {
    const path = await window.electron.ipcRenderer.invoke('open-workspace')
    if (path) {
      setWorkspace(path)
      const files = await window.electron.ipcRenderer.invoke('read-directory', path)
      setTree(files)
      setCheckedPaths(new Set())
    }
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

  if (!workspace) {
    return (
      <div className="explorer-empty">
        <button onClick={handleOpenWorkspace}>Open Workspace</button>
      </div>
    )
  }

  return (
    <div className="file-explorer">
      <div className="explorer-header">
        <span>{workspace.split(/[/\\]/).pop()}</span>
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