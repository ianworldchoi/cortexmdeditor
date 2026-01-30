import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
    readFileTree,
    readFile,
    writeFile,
    createFile,
    deleteFile,
    createFolder,
    moveFile,
    renameFile,
    pathExists,
    copyImageToVault
} from './services/fileService'
import { pathToFileURL } from 'url'
import {
    connectServer as mcpConnectServer,
    disconnectServer as mcpDisconnectServer,
    getAllTools as mcpGetAllTools,
    callTool as mcpCallTool,
    getConnectedServers as mcpGetConnectedServers,
    disconnectAll as mcpDisconnectAll,
    loadMCPConfigFile as mcpLoadConfig,
    type MCPServerConfig
} from './services/mcpService'




// Register privileged schemes
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'media',
        privileges: {
            secure: true,
            supportFetchAPI: true,
            bypassCSP: true,
            stream: true
        }
    }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        show: false,
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        vibrancy: 'under-window',
        visualEffectState: 'active',
        backgroundColor: '#00000000',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    // Load the remote URL for development or the local html file for production
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

// IPC Handlers
function setupIpcHandlers(): void {
    // Open folder dialog
    ipcMain.handle('dialog:open-folder', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
        })
        if (result.canceled) return null
        return result.filePaths[0]
    })

    // Open file dialog
    ipcMain.handle('dialog:open-file', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }
            ]
        })
        if (result.canceled) return null
        return result.filePaths[0]
    })

    // Open PDF file dialog
    ipcMain.handle('dialog:open-pdf', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile']
        })
        if (result.canceled) return null
        return result.filePaths[0]
    })



    // Read vault file tree
    ipcMain.handle('vault:read-tree', async (_, vaultPath: string) => {
        return readFileTree(vaultPath)
    })

    // Read file content
    ipcMain.handle('file:read', async (_, filePath: string) => {
        return readFile(filePath)
    })

    // Write file content
    ipcMain.handle('file:write', async (_, filePath: string, content: string) => {
        return writeFile(filePath, content)
    })

    // Create new file
    ipcMain.handle('file:create', async (_, filePath: string, content: string) => {
        return createFile(filePath, content)
    })

    // Delete file
    ipcMain.handle('file:delete', async (_, filePath: string) => {
        return deleteFile(filePath)
    })

    // Create new folder
    ipcMain.handle('folder:create', async (_, folderPath: string) => {
        return createFolder(folderPath)
    })

    // Move file or folder
    ipcMain.handle('file:move', async (_, sourcePath: string, destPath: string) => {
        return moveFile(sourcePath, destPath)
    })

    // Rename file or folder
    ipcMain.handle('file:rename', async (_, oldPath: string, newPath: string) => {
        return renameFile(oldPath, newPath)
    })

    // Check if path exists
    ipcMain.handle('path:exists', async (_, filePath: string) => {
        return pathExists(filePath)
    })

    // Process YouTube URL
    ipcMain.handle('ai:process-youtube-url', async (_, apiKey: string, url: string) => {
        try {
            // For migration parity, we just return the strategy.
            return { strategy: 'direct_url', url: url }
        } catch (e) {
            console.error('Error in ai:process-youtube-url:', e)
            throw e
        }
    })

    // Copy image to vault
    ipcMain.handle('image:copy-to-vault', async (_, sourcePath: string, vaultPath: string) => {
        return copyImageToVault(sourcePath, vaultPath)
    })

    // MCP Handlers
    ipcMain.handle('mcp:connect-server', async (_, config: MCPServerConfig) => {
        return mcpConnectServer(config)
    })

    ipcMain.handle('mcp:disconnect-server', async (_, serverId: string) => {
        await mcpDisconnectServer(serverId)
        return { success: true }
    })

    ipcMain.handle('mcp:get-tools', async () => {
        return mcpGetAllTools()
    })

    ipcMain.handle('mcp:call-tool', async (_, serverId: string, toolName: string, args: Record<string, unknown>) => {
        return mcpCallTool(serverId, toolName, args)
    })

    ipcMain.handle('mcp:get-connected-servers', async () => {
        return mcpGetConnectedServers()
    })

    ipcMain.handle('mcp:load-config', async (_, workspacePath: string) => {
        return mcpLoadConfig(workspacePath)
    })
}


function setupProtocolHandlers(): void {
    protocol.handle('media', (request) => {
        const url = request.url.replace('media://', '')
        // Decode URL to handle spaces and special characters
        const decodedUrl = decodeURIComponent(url)
        // Convert to file URL
        return net.fetch(pathToFileURL(decodedUrl).toString())
    })
}

app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.cortex.app')

    // Default open or close DevTools by F12 in development
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    setupIpcHandlers()
    setupProtocolHandlers()
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
