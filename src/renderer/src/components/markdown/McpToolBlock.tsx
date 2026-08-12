import React, { memo, useCallback, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, CircleAlert, Copy, Play, X, Zap } from 'lucide-react'
import { useWorkspace } from '../../WorkspaceContext'
import { useApplyAllContext, useApplyRegistration, type ApplyBlockStatus } from '../../hooks/useApplyAll'
import '../../styles/McpToolBlock.css'

interface ParsedMcpTool {
  toolName: string
  params: Record<string, unknown>
  paramsError: string | null
}

function parseMcpToolCode(code: string): ParsedMcpTool {
  const lines = code.split('\n')
  let toolName = ''
  let paramsStr = ''
  for (const line of lines) {
    const toolMatch = /^tool:\s*(.+)$/.exec(line)
    if (toolMatch) {
      toolName = toolMatch[1].trim()
      continue
    }
    const paramsMatch = /^params:\s*(.+)$/.exec(line)
    if (paramsMatch) {
      paramsStr = paramsMatch[1].trim()
    }
  }
  let params: Record<string, unknown> = {}
  let paramsError: string | null = null
  if (paramsStr) {
    try {
      params = JSON.parse(paramsStr) as Record<string, unknown>
    } catch (e) {
      paramsError = e instanceof Error ? e.message : String(e)
    }
  }
  return { toolName, params, paramsError }
}

type ExecState = 'idle' | 'executing' | 'success' | 'error'

export const McpToolBlock = memo(function McpToolBlock({
  serverId,
  code
}: {
  serverId: string
  code: string
}): React.JSX.Element {
  const { workspace } = useWorkspace()
  const { toolName, params, paramsError } = useMemo(() => parseMcpToolCode(code), [code])
  const [execState, setExecState] = useState<ExecState>('idle')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showParams, setShowParams] = useState(true)
  const [showResult, setShowResult] = useState(true)
  const [resultCopied, setResultCopied] = useState(false)
  const ctx = useApplyAllContext()
  const stableKey = `mcp:${serverId}:${toolName}:${JSON.stringify(params)}`

  const handleExecute = useCallback(async (): Promise<void> => {
    if (!toolName || paramsError) return
    setExecState('executing')
    setResult(null)
    setError(null)
    try {
      const res = (await window.electron.ipcRenderer.invoke(
        'mcp:call-tool',
        workspace,
        serverId,
        toolName,
        params
      )) as { success: boolean; content: string; isError: boolean; error?: string }
      if (res.success && !res.isError) {
        setResult(res.content)
        setExecState('success')
        ctx?.registerMcpResult(stableKey, serverId, toolName, res.content)
      } else {
        setError(res.error || res.content || 'Tool execution failed')
        setExecState('error')
        throw new Error(res.error || 'Tool execution failed')
      }
    } catch (e) {
      if (execState !== 'error') {
        setError(e instanceof Error ? e.message : String(e))
        setExecState('error')
      }
      throw e
    }
  }, [workspace, serverId, toolName, params, paramsError, execState, ctx, stableKey])

  const handleCopyResult = useCallback(async (): Promise<void> => {
    if (result === null) return
    try {
      await window.electron.ipcRenderer.invoke('clipboard:write-text', result)
      setResultCopied(true)
      window.setTimeout(() => setResultCopied(false), 1500)
    } catch {
      /* ignore clipboard errors */
    }
  }, [result])

  const applyStatus: ApplyBlockStatus =
    execState === 'success' ? 'applied' : execState === 'error' ? 'error' : 'idle'
  const effectiveStatus = useApplyRegistration(handleExecute, applyStatus, undefined, stableKey)

  const paramsJson = useMemo(() => {
    try {
      return JSON.stringify(params, null, 2)
    } catch {
      return '{}'
    }
  }, [params])

  const isDisabled = !toolName || !!paramsError || effectiveStatus === 'applied'

  return (
    <div className="md-mcp-block">
      <div className="md-mcp-header">
        <div className="md-mcp-header-left">
          <span className="md-mcp-badge">
            <Zap size={12} />
            MCP
          </span>
          <span className="md-mcp-server">{serverId}</span>
          <span className="md-mcp-separator">›</span>
          <span className="md-mcp-tool-name">{toolName || '(no tool)'}</span>
        </div>
        <div className="md-mcp-header-actions">
          {paramsError && (
            <span className="md-mcp-params-error" title={paramsError}>
              <CircleAlert size={12} />
              Invalid params
            </span>
          )}
          <button
            type="button"
            className={`md-mcp-execute${effectiveStatus === 'applied' ? ' executed' : ''}${effectiveStatus === 'error' ? ' error' : ''}`}
            onClick={handleExecute}
            disabled={isDisabled || effectiveStatus === 'applied'}
            title={
              effectiveStatus === 'applied'
                ? 'Already executed'
                : effectiveStatus === 'error'
                  ? 'Execution failed — retry'
                  : 'Execute tool'
            }
          >
            {effectiveStatus === 'applied' ? (
              <>
                <Check size={12} />
                <span>Done</span>
              </>
            ) : effectiveStatus === 'error' ? (
              <>
                <X size={12} />
                <span>Retry</span>
              </>
            ) : execState === 'executing' ? (
              <span>Running…</span>
            ) : (
              <>
                <Play size={12} />
                <span>Execute</span>
              </>
            )}
          </button>
        </div>
      </div>

      {Object.keys(params).length > 0 && (
        <div className="md-mcp-section">
          <button
            type="button"
            className="md-mcp-section-toggle"
            onClick={() => setShowParams((v) => !v)}
          >
            {showParams ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Parameters</span>
          </button>
          {showParams && <pre className="md-mcp-params">{paramsJson}</pre>}
        </div>
      )}

      {result !== null && (
        <div className="md-mcp-section">
          <div className="md-mcp-section-header">
            <button
              type="button"
              className="md-mcp-section-toggle"
              onClick={() => setShowResult((v) => !v)}
            >
              {showResult ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Result</span>
            </button>
            <button
              type="button"
              className="md-mcp-copy-result"
              onClick={handleCopyResult}
              title="Copy result to clipboard"
            >
              {resultCopied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
          {showResult && <pre className="md-mcp-result">{result}</pre>}
        </div>
      )}

      {error !== null && (
        <div className="md-mcp-error">
          <CircleAlert size={12} />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
})