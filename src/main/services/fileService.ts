import * as fs from 'fs/promises'
import * as path from 'path'
import type { FileNode } from '@shared/types'

/**
 * Recursively read directory structure for vault file tree
 */
export async function readFileTree(dirPath: string): Promise<FileNode[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const nodes: FileNode[] = []

    for (const entry of entries) {
        // Skip hidden files and directories
        if (entry.name.startsWith('.')) continue

        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
            const children = await readFileTree(fullPath)
            nodes.push({
                name: entry.name,
                path: fullPath,
                isDirectory: true,
                children
            })
        } else if (entry.name.endsWith('.md')) {
            nodes.push({
                name: entry.name,
                path: fullPath,
                isDirectory: false
            })
        }
    }

    // Sort: directories first, then alphabetically
    nodes.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
    })

    return nodes
}

/**
 * Read file content
 */
export async function readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8')
}

/**
 * Write content to file
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8')
}

/**
 * Create a new file with content
 */
export async function createFile(filePath: string, content: string): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
}

/**
 * Delete a file
 */
export async function deleteFile(filePath: string): Promise<void> {
    const stats = await fs.lstat(filePath)
    if (stats.isDirectory()) {
        // Remove directory contents recursively (used for folder deletions in UI)
        await fs.rm(filePath, { recursive: true, force: true })
    } else {
        await fs.unlink(filePath)
    }
}

/**
 * Create a new folder
 */
export async function createFolder(folderPath: string): Promise<void> {
    await fs.mkdir(folderPath, { recursive: true })
}

/**
 * Move a file or folder to a new location
 */
export async function moveFile(sourcePath: string, destPath: string): Promise<void> {
    await fs.rename(sourcePath, destPath)
}

/**
 * Rename a file or folder
 */
export async function renameFile(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath)
}

/**
 * Check if path exists
 */
export async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath)
        return true
    } catch {
        return false
    }
}
