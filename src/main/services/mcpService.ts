/**
 * MCP (Model Context Protocol) Service
 * 
 * This service runs in the main process and manages connections to MCP servers.
 * It supports stdio (local process), SSE (HTTP), and Streamable HTTP transports.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { EventSource } from 'eventsource'

// Polyfill EventSource for Node.js environment if not present
if (!global.EventSource) {
    global.EventSource = EventSource as any
}

export interface MCPServerConfig {
    id: string
    name: string
    type: 'stdio' | 'sse' | 'streamable-http'
    // For stdio
    command?: string
    args?: string[]
    env?: Record<string, string>
    // For sse and streamable-http
    url?: string
    headers?: Record<string, string>
    // Status
    enabled: boolean
}

export interface MCPTool {
    name: string
    description?: string
    inputSchema: Record<string, unknown>
    serverId: string
}

interface ConnectedServer {
    config: MCPServerConfig
    client: Client
    transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport
    process?: ChildProcess
}

const connectedServers: Map<string, ConnectedServer> = new Map()

/**
 * Connect to an MCP server
 */
export async function connectServer(config: MCPServerConfig): Promise<{ success: boolean; error?: string }> {
    // Disconnect existing connection if any
    if (connectedServers.has(config.id)) {
        await disconnectServer(config.id)
    }

    try {
        if (config.type === 'stdio') {
            if (!config.command) {
                return { success: false, error: 'Command is required for stdio transport' }
            }

            // Create transport
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: { ...process.env, ...config.env } as Record<string, string>
            })

            // Create client
            const client = new Client({
                name: 'cortex',
                version: '1.0.0'
            }, {
                capabilities: {}
            })

            // Connect
            await client.connect(transport)

            connectedServers.set(config.id, {
                config,
                client,
                transport
            })

            console.log(`[MCP] Connected to server: ${config.name}`)
            return { success: true }
        } else if (config.type === 'sse') {
            if (!config.url) {
                return { success: false, error: 'URL is required for SSE transport' }
            }

            // Create transport
            const transport = new SSEClientTransport(new URL(config.url), {
                eventSourceInit: {
                    headers: config.headers
                } as any
            })

            // Create client
            const client = new Client({
                name: 'cortex',
                version: '1.0.0'
            }, {
                capabilities: {}
            })

            // Connect
            await client.connect(transport)

            connectedServers.set(config.id, {
                config,
                client,
                transport
            })

            console.log(`[MCP] Connected to server (SSE): ${config.name}`)
            return { success: true }
        } else if (config.type === 'streamable-http') {
            if (!config.url) {
                return { success: false, error: 'URL is required for Streamable HTTP transport' }
            }

            // Create transport with headers support
            const transport = new StreamableHTTPClientTransport(new URL(config.url), {
                requestInit: {
                    headers: config.headers
                }
            })

            // Create client
            const client = new Client({
                name: 'cortex',
                version: '1.0.0'
            }, {
                capabilities: {}
            })

            // Connect
            await client.connect(transport)

            connectedServers.set(config.id, {
                config,
                client,
                transport
            })

            console.log(`[MCP] Connected to server (Streamable HTTP): ${config.name}`)
            return { success: true }
        } else {
            return { success: false, error: `Unknown transport type: ${config.type}` }
        }
    } catch (error) {
        console.error(`[MCP] Failed to connect to ${config.name}:`, error)
        return { success: false, error: String(error) }
    }
}

/**
 * Disconnect from an MCP server
 */
export async function disconnectServer(serverId: string): Promise<void> {
    const server = connectedServers.get(serverId)
    if (server) {
        try {
            await server.client.close()
        } catch (e) {
            console.warn(`[MCP] Error closing client for ${serverId}:`, e)
        }
        connectedServers.delete(serverId)
        console.log(`[MCP] Disconnected from server: ${server.config.name}`)
    }
}

/**
 * Get all available tools from all connected servers
 */
export async function getAllTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = []

    for (const [serverId, server] of connectedServers) {
        try {
            const result = await server.client.listTools()
            for (const tool of result.tools) {
                allTools.push({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema as Record<string, unknown>,
                    serverId
                })
            }
        } catch (error) {
            console.error(`[MCP] Failed to list tools from ${server.config.name}:`, error)
        }
    }

    return allTools
}

/**
 * Call a tool on a specific server
 */
export async function callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const server = connectedServers.get(serverId)
    if (!server) {
        return { success: false, error: `Server ${serverId} not connected` }
    }

    try {
        const result = await server.client.callTool({
            name: toolName,
            arguments: args
        })
        return { success: true, result: result.content }
    } catch (error) {
        console.error(`[MCP] Tool call failed (${toolName}):`, error)
        return { success: false, error: String(error) }
    }
}

/**
 * Get connected server status
 */
export function getConnectedServers(): { id: string; name: string; connected: boolean }[] {
    return Array.from(connectedServers.values()).map(s => ({
        id: s.config.id,
        name: s.config.name,
        connected: true
    }))
}

/**
 * Disconnect all servers (cleanup)
 */
export async function disconnectAll(): Promise<void> {
    for (const serverId of connectedServers.keys()) {
        await disconnectServer(serverId)
    }
}

/**
 * Determine transport type from server definition
 */
function detectTransportType(def: any): 'stdio' | 'sse' | 'streamable-http' {
    // If explicitly specified, use that
    if (def.type) {
        return def.type
    }
    // If has command, it's stdio
    if (def.command) {
        return 'stdio'
    }
    // If has url, check if it ends with /sse for SSE, otherwise default to streamable-http
    if (def.url) {
        const urlLower = def.url.toLowerCase()
        if (urlLower.endsWith('/sse') || urlLower.includes('/sse?')) {
            return 'sse'
        }
        // Default to streamable-http for remote URLs
        return 'streamable-http'
    }
    // Fallback
    return 'stdio'
}

/**
 * Load MCP configuration from a local mcp.json file
 */
export async function loadMCPConfigFile(workspacePath: string): Promise<MCPServerConfig[]> {
    // Priority: 1. Provided workspacePath, 2. Env var, 3. process.cwd()
    let targetPath = workspacePath
    if (!targetPath || targetPath === '') {
        targetPath = process.cwd()
    }

    // In dev, sometimes cwd is not the project root
    const configPath = path.isAbsolute(targetPath)
        ? path.join(targetPath, 'mcp.json')
        : path.resolve(process.cwd(), targetPath, 'mcp.json')

    console.log(`[MCP] Trying to load config from: ${configPath}`)

    if (!fs.existsSync(configPath)) {
        // One last fallback: check if we are in a subfolder of the project
        const fallbackPath = path.join(process.cwd(), 'mcp.json')
        if (targetPath !== process.cwd() && fs.existsSync(fallbackPath)) {
            console.log(`[MCP] Found config at fallback: ${fallbackPath}`)
            return loadMCPConfigFile(process.cwd())
        }
        console.warn(`[MCP] Config file NOT found at: ${configPath}`)
        return []
    }

    try {
        const content = fs.readFileSync(configPath, 'utf8')
        const config = JSON.parse(content)

        if (!config.mcpServers) {
            console.warn('[MCP] No mcpServers found in config')
            return []
        }

        const servers: MCPServerConfig[] = []
        for (const [name, serverDef] of Object.entries(config.mcpServers)) {
            const def = serverDef as any
            servers.push({
                id: `local-${name}`,
                name: name,
                type: detectTransportType(def),
                command: def.command,
                args: def.args || [],
                env: def.env || {},
                url: def.url,
                headers: def.headers,
                enabled: true
            })
        }
        console.log(`[MCP] Successfully loaded ${servers.length} servers from mcp.json`)
        return servers
    } catch (e) {
        console.error('[MCP] Failed to parse mcp.json:', e)
        return []
    }
}

