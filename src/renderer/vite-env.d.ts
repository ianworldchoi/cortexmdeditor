/// <reference types="vite/client" />

declare module '*.svg?url' {
    const src: string
    export default src
}

declare module '*.svg?component' {
    import React from 'react'
    const component: React.FC<React.SVGProps<SVGSVGElement>>
    export default component
}

declare module '*.svg' {
    const src: string
    export default src
}

interface WindowAPI {
    getFilePath: (file: File) => string
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<void>
    createFile: (path: string, content: string) => Promise<void>
    createFolder: (path: string) => Promise<void>
    deleteFile: (path: string) => Promise<void>
    moveFile: (source: string, dest: string) => Promise<void>
    renameFile: (oldPath: string, newPath: string) => Promise<void>
    pathExists: (path: string) => Promise<boolean>
    readVaultTree: (path: string) => Promise<import('@shared/types').FileNode[]>
    openFolderDialog: () => Promise<string | null>
    openFileDialog: () => Promise<string | null>
    openPdfDialog: () => Promise<string | null>
    processYouTubeUrl: (apiKey: string, url: string) => Promise<{ strategy: string, url: string, fileUri?: string, mimeType?: string }>
    copyImageToVault: (sourcePath: string, vaultPath: string) => Promise<string>
    // MCP Operations
    mcpConnectServer: (config: {
        id: string
        name: string
        type: 'stdio' | 'sse' | 'streamable-http'
        command?: string
        args?: string[]
        env?: Record<string, string>
        url?: string
        headers?: Record<string, string>
        enabled: boolean
    }) => Promise<{ success: boolean; error?: string }>
    mcpDisconnectServer: (serverId: string) => Promise<{ success: boolean }>
    mcpGetTools: () => Promise<Array<{
        name: string
        description?: string
        inputSchema: Record<string, unknown>
        serverId: string
    }>>
    mcpCallTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<{
        success: boolean
        result?: unknown
        error?: string
    }>
    mcpGetConnectedServers: () => Promise<Array<{ id: string; name: string; connected: boolean }>>
    mcpLoadConfig: (workspacePath: string) => Promise<Array<{
        id: string
        name: string
        type: 'stdio' | 'sse' | 'streamable-http'
        command?: string
        args?: string[]
        env?: Record<string, string>
        url?: string
        headers?: Record<string, string>
        enabled: boolean
    }>>
}

interface Window {
    api: WindowAPI
}
