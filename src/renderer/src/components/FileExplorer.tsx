import { memo, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Eraser,
  File,
  Folder,
  Folder as FolderBig,
  FolderOpen,
  Loader2,
  X
} from 'lucide-react'
import log from 'electron-log/renderer'
import '../styles/FileExplorer.css'

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
  leafPaths: string[]
}

type CheckState = 'checked' | 'unchecked' | 'indeterminate'

function getCheckState(node: FileNode, fileStates: Map<string, FileTag>): CheckState {
  const selectablePaths = node.leafPaths
  if (selectablePaths.length === 0) return 'unchecked'
  let checkedCount = 0
  for (const p of selectablePaths) {
    if (fileStates.has(p)) checkedCount++
  }
  if (checkedCount === 0) return 'unchecked'
  if (checkedCount === selectablePaths.length) return 'checked'
  return 'indeterminate'
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
  for (const p of node.leafPaths) {
    const t = fileStates.get(p)
    if (t) tagSet.add(t)
  }
  return TAG_ORDER.filter((t) => tagSet.has(t))
}

const TreeNode = memo(
  function TreeNode({
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

    const selectablePaths = node.leafPaths
    const isDisabled = selectablePaths.length === 0
    const showCheckbox = !isBinary

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
      e.stopPropagation()
      const paths = node.leafPaths
      if (paths.length === 0) return
      onToggle(paths, e.target.checked)
    }

    const handleCheckboxClick = (e: React.MouseEvent): void => {
      e.stopPropagation()
    }

    const handleRowClick = (): void => {
      if (hasChildren && node.type === 'directory') {
        onToggleExpand(node.path, !isOpen)
      } else if (node.type === 'file' && !isDisabled) {
        if (node.leafPaths.length > 0) {
          onToggle(node.leafPaths, checkState !== 'checked')
        }
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
  },
  (prevProps, nextProps) => {
    if (prevProps.node !== nextProps.node) return false
    if (prevProps.level !== nextProps.level) return false
    if (prevProps.onToggle !== nextProps.onToggle) return false
    if (prevProps.onToggleExpand !== nextProps.onToggleExpand) return false
    if (prevProps.expandedDirs !== nextProps.expandedDirs) return false
    if (prevProps.fileStates !== nextProps.fileStates) {
      for (const p of prevProps.node.leafPaths) {
        if (prevProps.fileStates.get(p) !== nextProps.fileStates.get(p)) return false
      }
    }
    return true
  }
)

function sortTree(nodes: FileNode[]): FileNode[] {
  const sorted = [...nodes]
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
  return populateLeafPaths(sorted)
}

function populateLeafPaths(nodes: FileNode[]): FileNode[] {
  return nodes.map((node) => {
    if (node.type === 'file') {
      return { ...node, leafPaths: node.isBinary ? [] : [node.path] }
    }
    if (!node.children || node.children.length === 0) {
      return { ...node, leafPaths: [] }
    }
    const children = populateLeafPaths(node.children)
    const leafPaths = children.flatMap((c) => c.leafPaths)
    return { ...node, children, leafPaths }
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

function collectDirPaths(nodes: FileNode[]): Set<string> {
  const paths = new Set<string>()
  const walk = (list: FileNode[]): void => {
    for (const n of list) {
      if (n.type === 'directory') paths.add(n.path)
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
  onFilePathsChange,
  includeDirStructure,
  onIncludeDirStructureChange
}: {
  workspace: string | null
  onWorkspaceChange: (path: string | null) => void
  fileStates: Map<string, FileTag>
  expandedDirs: Set<string>
  onToggleFile: (paths: string[], checked: boolean) => void
  onToggleExpand: (path: string, expanded: boolean) => void
  onClearSelections: () => void
  onFilePathsChange: (paths: Set<string>) => void
  includeDirStructure: boolean
  onIncludeDirStructureChange: (value: boolean) => void
}): React.JSX.Element {
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [prevWorkspace, setPrevWorkspace] = useState<string | null>(workspace)

  if (workspace !== prevWorkspace) {
    setPrevWorkspace(workspace)
    if (workspace === null) {
      setTree([])
      setLoading(false)
    } else {
      setLoading(true)
    }
  }

  useEffect(() => {
    if (!workspace) {
      queueMicrotask(() => {
        onFilePathsChange(new Set())
      })
      return
    }

    let cancelled = false

    const processFiles = (files: FileNode[]): void => {
      if (cancelled) return
      const sorted = sortTree(files)
      setTree(sorted)
      const filePaths = collectFilePaths(sorted)
      const dirPaths = collectDirPaths(sorted)
      onFilePathsChange(filePaths)
      window.electron.ipcRenderer
        .invoke('db:prune-workspace-state', workspace, Array.from(filePaths), Array.from(dirPaths))
        .catch((e) => log.error('Failed to prune workspace state:', e))
    }

    window.electron.ipcRenderer
      .invoke('read-directory', workspace)
      .then((files: FileNode[]) => {
        if (cancelled) return
        processFiles(files)
        setLoading(false)
      })
      .catch((e) => {
        log.error('Failed to read directory:', e)
        if (!cancelled) setLoading(false)
      })

    let lastRefresh = 0
    const MIN_REFRESH_MS = 300
    const handleChange = (): void => {
      const now = Date.now()
      if (now - lastRefresh < MIN_REFRESH_MS) return
      lastRefresh = now
      window.electron.ipcRenderer
        .invoke('read-directory', workspace)
        .then((files: FileNode[]) => {
          if (cancelled) return
          processFiles(files)
        })
        .catch((e) => log.error('Failed to read directory:', e))
    }
    window.electron.ipcRenderer.on('workspace:changed', handleChange)

    return () => {
      cancelled = true
      window.electron.ipcRenderer.removeListener('workspace:changed', handleChange)
    }
  }, [workspace, onFilePathsChange])

  const handleOpenWorkspace = async (): Promise<void> => {
    try {
      const path = await window.electron.ipcRenderer.invoke('open-workspace')
      if (path) {
        onWorkspaceChange(path)
      }
    } catch (e) {
      log.error('Failed to open workspace:', e)
    }
  }

  const handleCancelLoad = (): void => {
    onWorkspaceChange(null)
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
          {!loading && (
            <button onClick={onClearSelections} title="Clear selections">
              <Eraser size={14} strokeWidth={2} />
            </button>
          )}
          {loading ? (
            <button onClick={handleCancelLoad} title="Cancel loading">
              <X size={14} strokeWidth={2} />
            </button>
          ) : (
            <button onClick={handleOpenWorkspace} title="Open Folder">
              <FolderOpen size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-text-muted">
          <Loader2 size={24} className="animate-spin" />
          <p className="text-[12px]">Loading folder...</p>
        </div>
      ) : (
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
      )}
      {!loading && (
        <div
          style={{
            padding: '8px 12px',
            borderTop: '1px solid var(--border, #333)',
            marginTop: 'auto'
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            <input
              type="checkbox"
              checked={includeDirStructure}
              onChange={(e) => onIncludeDirStructureChange(e.target.checked)}
              disabled={!workspace}
            />
            <span>Include directory structure</span>
          </label>
        </div>
      )}
    </div>
  )
}

export default memo(FileExplorer)
