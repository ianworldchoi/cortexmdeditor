import { contextBridge, ipcRenderer, webUtils, webFrame } from 'electron'
import type { FileNode } from '@shared/types'

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const api = {
    // Utilities
    getFilePath: (file: File): string => webUtils.getPathForFile(file),

    // Dialog
    openFolderDialog: (): Promise<string | null> =>
        ipcRenderer.invoke('dialog:open-folder'),

    openFileDialog: (): Promise<string | null> =>
        ipcRenderer.invoke('dialog:open-file'),

    openPdfDialog: (): Promise<string | null> =>
        ipcRenderer.invoke('dialog:open-pdf'),


    // Vault operations
    readVaultTree: (vaultPath: string): Promise<FileNode[]> =>
        ipcRenderer.invoke('vault:read-tree', vaultPath),

    // File operations
    readFile: (filePath: string): Promise<string> =>
        ipcRenderer.invoke('file:read', filePath),

    writeFile: (filePath: string, content: string): Promise<void> =>
        ipcRenderer.invoke('file:write', filePath, content),

    createFile: (filePath: string, content: string): Promise<void> =>
        ipcRenderer.invoke('file:create', filePath, content),

    deleteFile: (filePath: string): Promise<void> =>
        ipcRenderer.invoke('file:delete', filePath),

    // Folder operations
    createFolder: (folderPath: string): Promise<void> =>
        ipcRenderer.invoke('folder:create', folderPath),

    // Move and rename
    moveFile: (sourcePath: string, destPath: string): Promise<void> =>
        ipcRenderer.invoke('file:move', sourcePath, destPath),

    renameFile: (oldPath: string, newPath: string): Promise<void> =>
        ipcRenderer.invoke('file:rename', oldPath, newPath),

    // Path utilities
    pathExists: (filePath: string): Promise<boolean> =>
        ipcRenderer.invoke('path:exists', filePath),

    // AI Operations
    processYouTubeUrl: (apiKey: string, url: string): Promise<{ strategy: string, url: string, fileUri?: string, mimeType?: string }> =>
        ipcRenderer.invoke('ai:process-youtube-url', apiKey, url),

    // Image operations
    copyImageToVault: (sourcePath: string, vaultPath: string): Promise<string> =>
        ipcRenderer.invoke('image:copy-to-vault', sourcePath, vaultPath),

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
    }): Promise<{ success: boolean; error?: string }> =>
        ipcRenderer.invoke('mcp:connect-server', config),

    mcpDisconnectServer: (serverId: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('mcp:disconnect-server', serverId),

    mcpGetTools: (): Promise<Array<{
        name: string
        description?: string
        inputSchema: Record<string, unknown>
        serverId: string
    }>> => ipcRenderer.invoke('mcp:get-tools'),

    mcpCallTool: (serverId: string, toolName: string, args: Record<string, unknown>): Promise<{
        success: boolean
        result?: unknown
        error?: string
    }> => ipcRenderer.invoke('mcp:call-tool', serverId, toolName, args),

    mcpGetConnectedServers: (): Promise<Array<{ id: string; name: string; connected: boolean }>> =>
        ipcRenderer.invoke('mcp:get-connected-servers'),

    mcpLoadConfig: (workspacePath: string): Promise<Array<{
        id: string
        name: string
        type: 'stdio' | 'sse' | 'streamable-http'
        command?: string
        args?: string[]
        env?: Record<string, string>
        url?: string
        headers?: Record<string, string>
        enabled: boolean
    }>> => ipcRenderer.invoke('mcp:load-config', workspacePath),

    // Zoom controls
    zoomIn: () => webFrame.setZoomLevel(webFrame.getZoomLevel() + 0.5),
    zoomOut: () => webFrame.setZoomLevel(webFrame.getZoomLevel() - 0.5),
    resetZoom: () => webFrame.setZoomLevel(0),
    getZoomLevel: () => webFrame.getZoomLevel()
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled
contextBridge.exposeInMainWorld('api', api)

// TypeScript support for the exposed API
export type ElectronAPI = typeof api
