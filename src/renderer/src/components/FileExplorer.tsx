import { useState } from 'react'

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

function TreeNode({ node, level }: { node: FileNode; level: number }): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const hasChildren = node.type === 'directory' && !!node.children && node.children.length > 0

  return (
    <div>
      <div
        className="tree-node"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => hasChildren && setIsOpen(!isOpen)}
      >
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
            <TreeNode key={child.path} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function FileExplorer(): React.JSX.Element {
  const [workspace, setWorkspace] = useState<string | null>(null)
  const [tree, setTree] = useState<FileNode[]>([])

  const handleOpenWorkspace = async (): Promise<void> => {
    const path = await window.electron.ipcRenderer.invoke('open-workspace')
    if (path) {
      setWorkspace(path)
      const files = await window.electron.ipcRenderer.invoke('read-directory', path)
      setTree(files)
    }
  }

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
          <TreeNode key={node.path} node={node} level={0} />
        ))}
      </div>
    </div>
  )
}

export default FileExplorer