import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FileNode } from '@shared/types'

interface VaultState {
    vaultPath: string | null
    fileTree: FileNode[]
    isLoading: boolean
    error: string | null

    // Actions
    setVaultPath: (path: string | null) => void
    setFileTree: (tree: FileNode[]) => void
    setLoading: (loading: boolean) => void
    setError: (error: string | null) => void
    openVault: () => Promise<void>
    refreshTree: () => Promise<void>
    createNewFile: (parentPath: string, fileName: string) => Promise<string | null>
    createNewFolder: (parentPath: string, folderName: string) => Promise<boolean>
    moveItem: (sourcePath: string, destFolderPath: string) => Promise<boolean>
    deleteItem: (itemPath: string) => Promise<boolean>
}

// Generate default frontmatter for new files
function generateDefaultContent(title: string): string {
    const now = new Date().toISOString()
    return `---
id: ${crypto.randomUUID()}
title: ${title}
tags: []
created_at: ${now}
updated_at: ${now}
---

# ${title}

`
}

export const useVaultStore = create<VaultState>()(
    persist(
        (set, get) => ({
            vaultPath: null,
            fileTree: [],
            isLoading: false,
            error: null,

            setVaultPath: (path) => set({ vaultPath: path }),
            setFileTree: (tree) => set({ fileTree: tree }),
            setLoading: (loading) => set({ isLoading: loading }),
            setError: (error) => set({ error }),

            openVault: async () => {
                try {
                    const path = await window.api.openFolderDialog()
                    if (path) {
                        set({ vaultPath: path, isLoading: true, error: null })
                        const tree = await window.api.readVaultTree(path)
                        set({ fileTree: tree, isLoading: false })
                    }
                } catch (error) {
                    set({
                        error: error instanceof Error ? error.message : 'Failed to open vault',
                        isLoading: false
                    })
                }
            },

            refreshTree: async () => {
                const { vaultPath } = get()
                if (!vaultPath) return

                try {
                    set({ isLoading: true })
                    const tree = await window.api.readVaultTree(vaultPath)
                    set({ fileTree: tree, isLoading: false })
                } catch (error) {
                    set({
                        error: error instanceof Error ? error.message : 'Failed to refresh',
                        isLoading: false
                    })
                }
            },

            createNewFile: async (parentPath: string, fileName: string) => {
                try {
                    const fullFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`
                    const filePath = `${parentPath}/${fullFileName}`

                    // Check if file already exists
                    const exists = await window.api.pathExists(filePath)
                    if (exists) {
                        set({ error: 'File already exists' })
                        return null
                    }

                    const title = fileName.replace('.md', '')
                    const content = generateDefaultContent(title)
                    await window.api.createFile(filePath, content)

                    // Refresh tree
                    await get().refreshTree()
                    return filePath
                } catch (error) {
                    set({
                        error: error instanceof Error ? error.message : 'Failed to create file'
                    })
                    return null
                }
            },

            createNewFolder: async (parentPath: string, folderName: string) => {
                try {
                    const folderPath = `${parentPath}/${folderName}`

                    // Check if folder already exists
                    const exists = await window.api.pathExists(folderPath)
                    if (exists) {
                        set({ error: 'Folder already exists' })
                        return false
                    }

                    await window.api.createFolder(folderPath)

                    // Refresh tree
                    await get().refreshTree()
                    return true
                } catch (error) {
                    set({
                        error: error instanceof Error ? error.message : 'Failed to create folder'
                    })
                    return false
                }
            },

            moveItem: async (sourcePath: string, destFolderPath: string) => {
                try {
                    const fileName = sourcePath.split('/').pop()
                    if (!fileName) return false

                    const destPath = `${destFolderPath}/${fileName}`

                    // Check if destination already exists
                    const exists = await window.api.pathExists(destPath)
                    if (exists) {
                        set({ error: 'Item already exists at destination' })
                        return false
                    }

                    await window.api.moveFile(sourcePath, destPath)

                    // Refresh tree
                    await get().refreshTree()
                    return true
                } catch (error) {
                    set({
                        error: error instanceof Error ? error.message : 'Failed to move item'
                    })
                    return false
                }
            },

            deleteItem: async (itemPath: string) => {
                try {
                    await window.api.deleteFile(itemPath)
                    await get().refreshTree()
                    return true
                } catch (error) {
                    set({
                        error: error instanceof Error ? error.message : 'Failed to delete item'
                    })
                    return false
                }
            }
        }),
        {
            name: 'cortex-vault',
            partialize: (state) => ({ vaultPath: state.vaultPath })
        }
    )
)
