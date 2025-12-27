import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FileNode } from '@shared/types'

interface VaultState {
    vaultPath: string | null
    fileTree: FileNode[]
    isLoading: boolean
    error: string | null
    documentIndex: DocumentIndexEntry[]  // 모든 문서의 메타 캐시

    // Actions
    setVaultPath: (path: string | null) => void
    setFileTree: (tree: FileNode[]) => void
    setLoading: (loading: boolean) => void
    setError: (error: string | null) => void
    openVault: () => Promise<void>
    refreshTree: () => Promise<void>
    indexDocuments: () => Promise<void>  // 문서 인덱싱
    createNewFile: (parentPath: string, fileName: string) => Promise<string | null>
    createNewFolder: (parentPath: string, folderName: string) => Promise<boolean>
    moveItem: (sourcePath: string, destFolderPath: string) => Promise<boolean>
    renameItem: (path: string, newName: string) => Promise<boolean>
    deleteItem: (itemPath: string) => Promise<boolean>
}

// 문서 인덱스 엔트리
interface DocumentIndexEntry {
    path: string
    title: string
    tags: string[]
    alwaysOn: boolean
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
            documentIndex: [],

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
                        // 볼트 열 때 인덱싱도 수행
                        await get().indexDocuments()
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
                    // 트리 새로고침 시 인덱싱도 수행
                    await get().indexDocuments()
                } catch (error) {
                    set({
                        error: error instanceof Error ? error.message : 'Failed to refresh',
                        isLoading: false
                    })
                }
            },

            indexDocuments: async () => {
                const { fileTree } = get()

                // 모든 md 파일 경로 수집
                function getAllMdPaths(nodes: FileNode[]): string[] {
                    let paths: string[] = []
                    for (const node of nodes) {
                        if (!node.isDirectory && node.name.endsWith('.md')) {
                            paths.push(node.path)
                        } else if (node.children) {
                            paths = [...paths, ...getAllMdPaths(node.children)]
                        }
                    }
                    return paths
                }

                const mdPaths = getAllMdPaths(fileTree)
                const indexEntries: DocumentIndexEntry[] = []

                // 각 파일의 frontmatter만 빠르게 파싱
                for (const path of mdPaths) {
                    try {
                        const content = await window.api.readFile(path)
                        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)

                        if (frontmatterMatch) {
                            const fm = frontmatterMatch[1]

                            // 간단한 YAML 파싱
                            const titleMatch = fm.match(/title:\s*(.+)/)
                            const tagsMatch = fm.match(/tags:\s*\[(.*?)\]/)
                            const alwaysOnMatch = fm.match(/alwaysOn:\s*(true|false)/)

                            indexEntries.push({
                                path,
                                title: titleMatch ? titleMatch[1].trim() : path.split('/').pop()?.replace('.md', '') || '',
                                tags: tagsMatch
                                    ? tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '')).filter(Boolean)
                                    : [],
                                alwaysOn: alwaysOnMatch ? alwaysOnMatch[1] === 'true' : false
                            })
                        }
                    } catch (e) {
                        console.warn(`Failed to index ${path}`, e)
                    }
                }

                set({ documentIndex: indexEntries })
                console.log(`Indexed ${indexEntries.length} documents`)
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

            renameItem: async (path: string, newName: string) => {
                try {
                    const parentPath = path.substring(0, path.lastIndexOf('/'))
                    const destPath = `${parentPath}/${newName}`

                    // Check if destination already exists
                    const exists = await window.api.pathExists(destPath)
                    if (exists) {
                        set({ error: 'Item with this name already exists' })
                        return false
                    }

                    await window.api.moveFile(path, destPath)

                    // Refresh tree
                    await get().refreshTree()
                    return true
                } catch (error) {
                    set({
                        error: error instanceof Error ? error.message : 'Failed to rename item'
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
