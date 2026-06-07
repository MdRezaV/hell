import { useState } from 'react'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

function TreeNode({ node, level }: { node: FileNode; level: number }): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div style={{ paddingLeft: `${level * 12}px` }}>
      <div
        className="tree-node"
        onClick={() => node.type === 'directory' && setIsOpen(!isOpen)}
      >
        {node.type === 'directory' ? (isOpen ? '📂' : '📁') : '📄'} {node.name}
      </div>
      {isOpen && node.children && (
        <div>
          {node.children.map(child => (
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