import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Server, Terminal, Globe, RefreshCw, Download } from 'lucide-react'
import { useAIStore, type MCPServerConfig } from '../../stores/aiStore'
import { useVaultStore } from '../../stores/vaultStore'

interface ConnectedServerStatus {
    id: string
    name: string
    connected: boolean
}

export default function MCPSettings() {
    const { mcpServers, addMCPServer, removeMCPServer, toggleMCPServer, setMCPServers } = useAIStore()
    const { vaultPath } = useVaultStore()
    const [connectedServers, setConnectedServers] = useState<ConnectedServerStatus[]>([])
    const [isAdding, setIsAdding] = useState(false)
    const [isConnecting, setIsConnecting] = useState<string | null>(null)

    // New server form state
    const [newServer, setNewServer] = useState<Partial<MCPServerConfig>>({
        name: '',
        type: 'stdio',
        command: '',
        args: [],
        enabled: true
    })
    const [newArgs, setNewArgs] = useState('')

    // Fetch connected servers status
    const refreshStatus = useCallback(async () => {
        try {
            const status = await window.api.mcpGetConnectedServers()
            setConnectedServers(status)
        } catch (e) {
            console.warn('Failed to get MCP server status:', e)
        }
    }, [])

    const syncFromConfig = useCallback(async () => {
        try {
            console.log('[MCPSettings] Starting sync from mcp.json. Current vaultPath:', vaultPath)
            // Pass vaultPath but service will fallback to cwd if null
            const configServers = await window.api.mcpLoadConfig(vaultPath || '')

            if (!configServers || configServers.length === 0) {
                console.log('[MCPSettings] No servers found in config or file missing.')
                return
            }

            console.log(`[MCPSettings] Found ${configServers.length} servers in config:`, configServers)

            // Create a map for easy lookup by name
            const configMap = new Map(configServers.map(s => [s.name, s]))
            const merged = [...mcpServers]
            let changed = false

            // 1. Update existing servers or add new ones
            for (const cfgServer of configServers) {
                const existingIndex = merged.findIndex(s => s.name === cfgServer.name)

                if (existingIndex >= 0) {
                    // Update only if something changed
                    const existing = merged[existingIndex]
                    const hasChanged =
                        existing.command !== cfgServer.command ||
                        JSON.stringify(existing.args) !== JSON.stringify(cfgServer.args) ||
                        JSON.stringify(existing.env) !== JSON.stringify(cfgServer.env) ||
                        existing.url !== cfgServer.url

                    if (hasChanged) {
                        console.log(`[MCPSettings] Updating existing server: ${cfgServer.name}`)
                        merged[existingIndex] = { ...existing, ...cfgServer, id: existing.id } // Keep ID
                        changed = true
                    }
                } else {
                    // New server
                    console.log(`[MCPSettings] Adding new server from config: ${cfgServer.name}`)
                    merged.push(cfgServer)
                    changed = true
                }
            }

            if (changed) {
                console.log('[MCPSettings] Updating store with merged servers:', merged)
                setMCPServers(merged)
            } else {
                console.log('[MCPSettings] No changes detected between UI and mcp.json')
            }
        } catch (e) {
            console.error('[MCPSettings] Failed to sync from mcp.json:', e)
        }
    }, [vaultPath, mcpServers, setMCPServers])

    useEffect(() => {
        refreshStatus()
        syncFromConfig()
    }, [refreshStatus, syncFromConfig])

    // Connect/disconnect when toggle changes
    const handleToggle = async (server: MCPServerConfig) => {
        setIsConnecting(server.id)
        console.log('[MCPSettings] Toggle server:', server.id, 'current enabled:', server.enabled)

        if (server.enabled) {
            // Currently enabled, disconnect first then disable
            try {
                await window.api.mcpDisconnectServer(server.id)
                console.log('[MCPSettings] Disconnected:', server.id)
            } catch (e) {
                console.warn('[MCPSettings] Failed to disconnect:', e)
            }
        } else {
            // Currently disabled, enable and connect
            try {
                console.log('[MCPSettings] Attempting to connect:', server.name, 'type:', server.type, 'config:', server)
                const result = await window.api.mcpConnectServer({ ...server, enabled: true })
                console.log('[MCPSettings] Connection result:', result)
                if (!result.success) {
                    console.error('[MCPSettings] Connection failed:', result.error)
                }
            } catch (e) {
                console.error('[MCPSettings] Failed to connect (exception):', e)
            }
        }

        toggleMCPServer(server.id)
        await refreshStatus()
        setIsConnecting(null)
    }

    // Add new server
    const handleAddServer = async () => {
        if (!newServer.name || !newServer.command) return

        const server: MCPServerConfig = {
            id: crypto.randomUUID(),
            name: newServer.name,
            type: newServer.type as 'stdio' | 'sse',
            command: newServer.command,
            args: newArgs.split(' ').filter(Boolean),
            enabled: true
        }

        addMCPServer(server)

        // Auto-connect the new server
        try {
            await window.api.mcpConnectServer(server)
            await refreshStatus()
        } catch (e) {
            console.warn('Failed to auto-connect new server:', e)
        }

        setIsAdding(false)
        setNewServer({
            name: '',
            type: 'stdio',
            command: '',
            args: [],
            enabled: true
        })
        setNewArgs('')
    }

    // Remove server
    const handleRemoveServer = async (serverId: string) => {
        // Disconnect first if connected
        if (connectedServers.some(s => s.id === serverId)) {
            await window.api.mcpDisconnectServer(serverId)
        }
        removeMCPServer(serverId)
        await refreshStatus()
    }

    return (
        <div className="mcp-settings">
            <div className="mcp-settings-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>MCP 서버</span>
                    <span style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-tertiary)'
                    }}>
                        ({mcpServers.length}개)
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={syncFromConfig}
                        title="mcp.json에서 가져오기"
                    >
                        <Download size={14} />
                        mcp.json
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={refreshStatus}
                        title="상태 새로고침"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setIsAdding(true)}
                    >
                        <Plus size={14} />
                        추가
                    </button>
                </div>
            </div>

            {/* Server List */}
            <div className="mcp-server-list">
                {mcpServers.length === 0 && !isAdding ? (
                    <div className="mcp-empty-state">
                        <Server size={32} style={{ opacity: 0.3 }} />
                        <p>등록된 MCP 서버가 없습니다</p>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setIsAdding(true)}
                        >
                            서버 추가하기
                        </button>
                    </div>
                ) : (
                    mcpServers.map(server => {
                        const status = connectedServers.find(s => s.id === server.id)
                        const isConnected = !!status?.connected
                        const isLoading = isConnecting === server.id

                        return (
                            <div key={server.id} className={`mcp-server-item ${!server.enabled ? 'disabled' : ''}`}>
                                <div className="mcp-server-info">
                                    <div className="mcp-server-name">
                                        {server.type === 'stdio' ? (
                                            <Terminal size={14} style={{ opacity: 0.5 }} />
                                        ) : (
                                            <Globe size={14} style={{ opacity: 0.5 }} />
                                        )}
                                        <span>{server.name}</span>
                                        {server.enabled && (
                                            <span className={`mcp-status ${isConnected ? 'connected' : 'disconnected'}`}>
                                                {isConnected ? '연결됨' : '연결 중...'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mcp-server-detail">
                                        {server.type === 'stdio'
                                            ? `${server.command} ${server.args?.join(' ') || ''}`
                                            : server.url
                                        }
                                    </div>
                                </div>
                                <div className="mcp-server-actions">
                                    {/* Toggle Switch */}
                                    <label className="toggle-switch">
                                        <input
                                            type="checkbox"
                                            checked={server.enabled}
                                            onChange={() => handleToggle(server)}
                                            disabled={isLoading}
                                        />
                                        <span className={`toggle-slider ${isLoading ? 'loading' : ''}`}></span>
                                    </label>
                                    <button
                                        className="btn btn-ghost btn-sm danger"
                                        onClick={() => handleRemoveServer(server.id)}
                                        title="삭제"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        )
                    })
                )}

                {/* Add New Server Form */}
                {isAdding && (
                    <div className="mcp-add-form">
                        <div className="form-group">
                            <label className="form-label">서버 이름</label>
                            <input
                                type="text"
                                className="form-input"
                                value={newServer.name}
                                onChange={e => setNewServer({ ...newServer, name: e.target.value })}
                                placeholder="예: Figma MCP"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">타입</label>
                            <select
                                className="form-input"
                                value={newServer.type}
                                onChange={e => setNewServer({ ...newServer, type: e.target.value as 'stdio' | 'sse' })}
                            >
                                <option value="stdio">Stdio (로컬 명령어)</option>
                                <option value="sse">SSE (HTTP 서버)</option>
                            </select>
                        </div>
                        {newServer.type === 'stdio' ? (
                            <>
                                <div className="form-group">
                                    <label className="form-label">명령어</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={newServer.command}
                                        onChange={e => setNewServer({ ...newServer, command: e.target.value })}
                                        placeholder="예: npx"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">인수 (공백으로 구분)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={newArgs}
                                        onChange={e => setNewArgs(e.target.value)}
                                        placeholder="예: -y @anthropic-ai/mcp-server-filesystem"
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="form-group">
                                <label className="form-label">서버 URL</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newServer.url || ''}
                                    onChange={e => setNewServer({ ...newServer, url: e.target.value })}
                                    placeholder="예: http://localhost:3001/sse"
                                />
                            </div>
                        )}
                        <div className="mcp-form-actions">
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setIsAdding(false)}
                            >
                                취소
                            </button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handleAddServer}
                                disabled={!newServer.name || (!newServer.command && newServer.type === 'stdio')}
                            >
                                추가
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <p style={{
                marginTop: 12,
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-tertiary)'
            }}>
                MCP 서버를 연결하면 AI가 외부 도구(Figma, 파일 시스템 등)를 사용할 수 있어요.
            </p>
        </div>
    )
}
