import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Eraser,
  File,
  Folder,
  Folder as FolderBig,
  FolderOpen,
  Loader2,
  Search,
  X
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import log from 'electron-log/renderer'
import '../styles/FileExplorer.css'

export type FileTag = 'PND' | 'INQ' | 'ADD'

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

interface FlatNode {
  node: FileNode
  level: number
  isOpen: boolean
  hasChildren: boolean
}

function flattenTree(nodes: FileNode[], expandedDirs: Set<string>, level: number = 0): FlatNode[] {
  const result: FlatNode[] = []
  for (const node of nodes) {
    const isOpen = node.type === 'directory' && expandedDirs.has(node.path)
    const hasChildren = node.type === 'directory' && !!node.children && node.children.length > 0
    result.push({ node, level, isOpen, hasChildren })
    if (isOpen && node.children) {
      result.push(...flattenTree(node.children, expandedDirs, level + 1))
    }
  }
  return result
}

function VirtualTreeNode({
  node,
  level,
  isOpen,
  hasChildren,
  fileStates,
  onToggle,
  onToggleExpand
}: {
  node: FileNode
  level: number
  isOpen: boolean
  hasChildren: boolean
  fileStates: Map<string, FileTag>
  onToggle: (paths: string[], checked: boolean) => void
  onToggleExpand: (path: string, expanded: boolean) => void
}): React.JSX.Element {
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
    <div className="tree-node" style={{ paddingLeft: `${level * 16}px` }} onClick={handleRowClick}>
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
      <span className={`tree-label${isBinary ? ' tree-label--binary' : ''}`}>{node.name}</span>
      {isBinary && <span className="tree-tag tree-tag--BIN">BIN</span>}
      {tags.map((tag) => (
        <span key={tag} className={`tree-tag tree-tag--${tag}`}>
          {node.type === 'file' ? tag : TAG_CHARS[tag]}
        </span>
      ))}
    </div>
  )
}

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

function filterTree(nodes: FileNode[], q: string, contentMatches?: Set<string>): FileNode[] {
  if (!q) return nodes
  const result: FileNode[] = []
  for (const node of nodes) {
    const nameMatch = node.name.toLowerCase().includes(q)
    const contentMatch = contentMatches?.has(node.path) ?? false
    const match = nameMatch || contentMatch
    let filteredChildren: FileNode[] | undefined
    if (node.children) {
      filteredChildren = filterTree(node.children, q, contentMatches)
    }
    if (match || (filteredChildren && filteredChildren.length > 0)) {
      result.push({ ...node, children: filteredChildren ?? node.children })
    }
  }
  return result
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
  dirStructureTag,
  onDirStructureTagChange
}: {
  workspace: string | null
  onWorkspaceChange: (path: string | null) => void
  fileStates: Map<string, FileTag>
  expandedDirs: Set<string>
  onToggleFile: (paths: string[], checked: boolean) => void
  onToggleExpand: (path: string, expanded: boolean) => void
  onClearSelections: () => void
  onFilePathsChange: (paths: Set<string>) => void
  dirStructureTag: FileTag | null
  onDirStructureTagChange: (tag: FileTag | null) => void
}): React.JSX.Element {
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [prevWorkspace, setPrevWorkspace] = useState<string | null>(workspace)
  const [search, setSearch] = useState('')
  const [contentMatches, setContentMatches] = useState<Set<string>>(new Set())
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelRef = useRef(false)

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

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value)
      const q = value.trim().toLowerCase()
      if (!q || !workspace) {
        setContentMatches(new Set())
        setSearchLoading(false)
        cancelRef.current = true
        clearTimeout(debounceRef.current)
        return
      }
      setSearchLoading(true)
      cancelRef.current = false
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        try {
          const results: string[] = await window.electron.ipcRenderer.invoke(
            'search-file-content',
            workspace,
            q
          )
          if (!cancelRef.current) {
            setContentMatches(new Set(results))
            setSearchLoading(false)
          }
        } catch (e) {
          log.error('File content search failed', e)
          if (!cancelRef.current) setSearchLoading(false)
        }
      }, 300)
    },
    [workspace]
  )

  useEffect(() => {
    return () => {
      cancelRef.current = true
      clearTimeout(debounceRef.current)
    }
  }, [])

  const filteredTree = useMemo(() => {
    const q = search.trim().toLowerCase()
    return filterTree(tree, q, contentMatches)
  }, [tree, search, contentMatches])

  const scrollRef = useRef<HTMLDivElement>(null)

  const flatNodes = useMemo(
    () => flattenTree(filteredTree, expandedDirs),
    [filteredTree, expandedDirs]
  )

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is safe to use
  const rowVirtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 10
  })

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
      <div className="explorer-search">
        <Search size={13} className="explorer-search-icon" />
        <input
          type="text"
          placeholder="Search files..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="explorer-search-input"
        />
        {searchLoading && <Loader2 size={12} className="animate-spin text-text-faint" />}
        {search && !searchLoading && (
          <button className="explorer-search-clear" onClick={() => setSearch('')} title="Clear">
            <X size={12} />
          </button>
        )}
      </div>
      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-text-muted">
          <Loader2 size={24} className="animate-spin" />
          <p className="text-[12px]">Loading folder...</p>
        </div>
      ) : (
        <div ref={scrollRef} className="explorer-tree">
          {flatNodes.length > 0 && (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative'
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const flatNode = flatNodes[virtualRow.index]
                return (
                  <div
                    key={flatNode.node.path}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`
                    }}
                  >
                    <VirtualTreeNode
                      node={flatNode.node}
                      level={flatNode.level}
                      isOpen={flatNode.isOpen}
                      hasChildren={flatNode.hasChildren}
                      fileStates={fileStates}
                      onToggle={onToggleFile}
                      onToggleExpand={onToggleExpand}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      {!loading && (
        <div className="explorer-footer">
          <div
            role="button"
            tabIndex={0}
            onClick={() => onDirStructureTagChange(dirStructureTag === null ? 'PND' : null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onDirStructureTagChange(dirStructureTag === null ? 'PND' : null)
              }
            }}
            className="explorer-footer-toggle"
          >
            <span className="tree-checkbox" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={dirStructureTag !== null}
                onChange={() => onDirStructureTagChange(dirStructureTag === null ? 'PND' : null)}
                disabled={!workspace}
              />
            </span>
            <span>Directory Structure</span>
            {dirStructureTag && (
              <span className={`tree-tag tree-tag--${dirStructureTag}`}>{dirStructureTag}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(FileExplorer)
