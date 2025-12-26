import { contextBridge, ipcRenderer } from 'electron'
import type { FileNode } from '@shared/types'

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const api = {
    // Dialog
    openFolderDialog: (): Promise<string | null> =>
        ipcRenderer.invoke('dialog:open-folder'),

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
        ipcRenderer.invoke('path:exists', filePath)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled
contextBridge.exposeInMainWorld('api', api)

// TypeScript support for the exposed API
export type ElectronAPI = typeof api
