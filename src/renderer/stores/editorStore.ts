import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Document, Block } from '@shared/types'

export interface Tab {
    id: string
    type: 'document' | 'browser' | 'graph'
    filePath: string
    title: string
    document: Document | null
    isDirty: boolean
    isLoading: boolean
    hasAnimated?: boolean
    url?: string  // For browser tabs
    viewMode: 'edit' | 'preview'

}
export interface EditorGroup {
    id: string
    tabs: Tab[]
    activeTabId: string | null
    widthRatio?: number // Width ratio for split view (0-100)
}

interface SavedTab {
    filePath: string
    title: string
    groupId?: string
}

interface EditorState {
    editorGroups: EditorGroup[]
    activeGroupId: string | null
    savedTabs: SavedTab[] // For persistence

    // Actions
    openTab: (filePath: string, title: string, groupId?: string) => Promise<void>
    openBrowserTab: (url?: string, groupId?: string) => void
    openGraphTab: (groupId?: string) => void
    updateBrowserUrl: (tabId: string, url: string, title?: string) => void
    closeTab: (tabId: string, groupId?: string) => void
    setActiveTab: (tabId: string, groupId?: string) => void
    setActiveGroup: (groupId: string) => void
    updateDocument: (tabId: string, blocks: Block[]) => void
    updateDocumentMeta: (tabId: string, meta: Partial<import('@shared/types').DocumentMeta>) => void
    markDirty: (tabId: string, isDirty: boolean) => void
    toggleViewMode: (tabId: string) => void
    saveTab: (tabId: string) => Promise<void>
    getActiveDocument: () => Document | null
    restoreOpenTabs: () => Promise<void>
    addImageBlock: (tabId: string, imagePath: string) => void
    renameFile: (oldPath: string, newPath: string) => void
    indentBlock: (tabId: string, blockId: string) => void
    outdentBlock: (tabId: string, blockId: string) => void
    markTabAnimated: (tabId: string) => void

    // Split View Actions
    splitEditorRight: () => void
    closeGroup: (groupId: string) => void
    setGroupWidth: (groupId: string, ratio: number) => void

    // Navigation
    selectNextTab: () => void
    selectPrevTab: () => void

    // Graph Interaction
    appendBacklinkToFile: (sourcePath: string, targetName: string) => Promise<void>
}

export const useEditorStore = create<EditorState>()(
    persist(
        (set, get) => ({
            editorGroups: [{ id: 'default', tabs: [], activeTabId: null }],
            activeGroupId: 'default',
            savedTabs: [],

            openTab: async (filePath: string, title: string, targetGroupId?: string) => {
                const { editorGroups, activeGroupId } = get()
                const groupId = targetGroupId || activeGroupId || editorGroups[0].id

                const groupIndex = editorGroups.findIndex(g => g.id === groupId)
                if (groupIndex === -1) return

                const group = editorGroups[groupIndex]

                // Check if already open in this group
                const existingTab = group.tabs.find(t => t.filePath === filePath)
                if (existingTab) {
                    const newGroups = [...editorGroups]
                    newGroups[groupIndex] = { ...group, activeTabId: existingTab.id }
                    set({ editorGroups: newGroups, activeGroupId: groupId })
                    return
                }

                // Create new tab
                const tabId = crypto.randomUUID()
                const newTab: Tab = {
                    id: tabId,
                    type: 'document',
                    filePath,
                    title: title.replace('.md', ''),
                    document: null,
                    isDirty: false,
                    isLoading: true,
                    hasAnimated: false,
                    viewMode: 'preview'
                }

                const newGroups = [...editorGroups]
                newGroups[groupIndex] = {
                    ...group,
                    tabs: [...group.tabs, newTab],
                    activeTabId: tabId
                }

                set({ editorGroups: newGroups, activeGroupId: groupId })

                // Load document content
                try {
                    const content = await window.api.readFile(filePath)
                    const document = parseMarkdownToDocument(content, filePath)

                    set(state => {
                        const currentGroups = [...state.editorGroups]
                        const gIdx = currentGroups.findIndex(g => g.id === groupId)
                        if (gIdx !== -1) {
                            currentGroups[gIdx] = {
                                ...currentGroups[gIdx],
                                tabs: currentGroups[gIdx].tabs.map(t =>
                                    t.id === tabId ? { ...t, document, isLoading: false } : t
                                )
                            }
                        }
                        return { editorGroups: currentGroups }
                    })
                } catch (error) {
                    console.error('Failed to load document:', error)
                    set(state => {
                        const currentGroups = [...state.editorGroups]
                        const gIdx = currentGroups.findIndex(g => g.id === groupId)
                        if (gIdx !== -1) {
                            currentGroups[gIdx] = {
                                ...currentGroups[gIdx],
                                tabs: currentGroups[gIdx].tabs.map(t =>
                                    t.id === tabId ? { ...t, isLoading: false } : t
                                )
                            }
                        }
                        return { editorGroups: currentGroups }
                    })
                }
            },

            openBrowserTab: (url?: string, targetGroupId?: string) => {
                const { editorGroups, activeGroupId } = get()
                const groupId = targetGroupId || activeGroupId || editorGroups[0].id

                const groupIndex = editorGroups.findIndex(g => g.id === groupId)
                if (groupIndex === -1) return

                const group = editorGroups[groupIndex]
                const tabId = crypto.randomUUID()
                const initialUrl = url || 'https://www.google.com'

                const newTab: Tab = {
                    id: tabId,
                    type: 'browser',
                    filePath: '',
                    title: 'New Tab',
                    document: null,
                    isDirty: false,
                    isLoading: false,
                    hasAnimated: false,
                    url: initialUrl,
                    viewMode: 'edit' // Browser tabs don't really use this, but satisfying type
                }

                const newGroups = [...editorGroups]
                newGroups[groupIndex] = {
                    ...group,
                    tabs: [...group.tabs, newTab],
                    activeTabId: tabId
                }

                set({ editorGroups: newGroups, activeGroupId: groupId })
            },

            openGraphTab: (targetGroupId?: string) => {
                const { editorGroups, activeGroupId } = get()
                const groupId = targetGroupId || activeGroupId || editorGroups[0].id

                const groupIndex = editorGroups.findIndex(g => g.id === groupId)
                if (groupIndex === -1) return

                const group = editorGroups[groupIndex]

                // Check if already has a graph tab in this group?
                // User might want multiple graphs, or just one. Let's allow multiple for now as they are tabs.
                // But typically one graph is enough. Let's start fresh.

                const tabId = crypto.randomUUID()

                const newTab: Tab = {
                    id: tabId,
                    type: 'graph',
                    filePath: 'Graph View',
                    title: 'Graph View',
                    document: null,
                    isDirty: false,
                    isLoading: false,
                    hasAnimated: false,
                    viewMode: 'preview' // Default to preview feel
                }

                const newGroups = [...editorGroups]
                newGroups[groupIndex] = {
                    ...group,
                    tabs: [...group.tabs, newTab],
                    activeTabId: tabId
                }

                set({ editorGroups: newGroups, activeGroupId: groupId })
            },

            updateBrowserUrl: (tabId: string, url: string, title?: string) => {
                set(state => {
                    const newGroups = state.editorGroups.map(group => ({
                        ...group,
                        tabs: group.tabs.map(tab =>
                            tab.id === tabId
                                ? { ...tab, url, title: title || tab.title }
                                : tab
                        )
                    }))
                    return { editorGroups: newGroups }
                })
            },

            closeTab: (tabId: string, groupId?: string) => {
                set(state => {
                    let targetGroupId = groupId
                    if (!targetGroupId) {
                        for (const g of state.editorGroups) {
                            if (g.tabs.some(t => t.id === tabId)) {
                                targetGroupId = g.id
                                break
                            }
                        }
                    }

                    if (!targetGroupId) return state

                    const groupIndex = state.editorGroups.findIndex(g => g.id === targetGroupId)
                    if (groupIndex === -1) return state

                    const group = state.editorGroups[groupIndex]
                    const newTabs = group.tabs.filter(t => t.id !== tabId)
                    let newActiveId = group.activeTabId

                    if (group.activeTabId === tabId) {
                        const index = group.tabs.findIndex(t => t.id === tabId)
                        newActiveId = newTabs[Math.min(index, newTabs.length - 1)]?.id ?? null
                    }

                    const newGroups = [...state.editorGroups]
                    newGroups[groupIndex] = { ...group, tabs: newTabs, activeTabId: newActiveId }

                    return { editorGroups: newGroups }
                })
            },

            renameFile: (oldPath: string, newPath: string) => {
                set(state => {
                    const newGroups = state.editorGroups.map(group => ({
                        ...group,
                        tabs: group.tabs.map(tab => {
                            if (tab.filePath === oldPath) {
                                const newTitle = newPath.split('/').pop()?.replace('.md', '') || tab.title
                                return {
                                    ...tab,
                                    filePath: newPath,
                                    title: newTitle,
                                    document: tab.document ? { ...tab.document, filePath: newPath } : null
                                }
                            }
                            return tab
                        })
                    }))

                    // Update saved tabs
                    const newSavedTabs = state.savedTabs.map(tab =>
                        tab.filePath === oldPath
                            ? { ...tab, filePath: newPath, title: newPath.split('/').pop()?.replace('.md', '') || tab.title }
                            : tab
                    )

                    return { editorGroups: newGroups, savedTabs: newSavedTabs }
                })
            },

            setActiveTab: (tabId: string, groupId?: string) => {
                set(state => {
                    let targetGroupId = groupId
                    if (!targetGroupId) {
                        for (const g of state.editorGroups) {
                            if (g.tabs.some(t => t.id === tabId)) {
                                targetGroupId = g.id
                                break
                            }
                        }
                    }

                    if (!targetGroupId) return state

                    const groupIndex = state.editorGroups.findIndex(g => g.id === targetGroupId)
                    const newGroups = [...state.editorGroups]
                    newGroups[groupIndex] = { ...newGroups[groupIndex], activeTabId: tabId }
                    return { editorGroups: newGroups, activeGroupId: targetGroupId }
                })
            },

            setActiveGroup: (groupId: string) => {
                set({ activeGroupId: groupId })
            },

            updateDocument: (tabId: string, blocks: Block[]) => {
                set(state => {
                    const newGroups = state.editorGroups.map(group => ({
                        ...group,
                        tabs: group.tabs.map(tab =>
                            tab.id === tabId && tab.document
                                ? { ...tab, document: { ...tab.document, blocks }, isDirty: true }
                                : tab
                        )
                    }))
                    return { editorGroups: newGroups }
                })
            },

            updateDocumentMeta: (tabId: string, metaUpdates: Partial<import('@shared/types').DocumentMeta>) => {
                set(state => {
                    const newGroups = state.editorGroups.map(group => ({
                        ...group,
                        tabs: group.tabs.map(tab =>
                            tab.id === tabId && tab.document
                                ? {
                                    ...tab,
                                    document: {
                                        ...tab.document,
                                        meta: { ...tab.document.meta, ...metaUpdates }
                                    },
                                    isDirty: true
                                }
                                : tab
                        )
                    }))
                    return { editorGroups: newGroups }
                })
            },

            markDirty: (tabId: string, isDirty: boolean) => {
                set(state => {
                    const newGroups = state.editorGroups.map(group => ({
                        ...group,
                        tabs: group.tabs.map(tab =>
                            tab.id === tabId ? { ...tab, isDirty } : tab
                        )
                    }))
                    return { editorGroups: newGroups }
                })
            },

            toggleViewMode: (tabId: string) => {
                set(state => {
                    const newGroups = state.editorGroups.map(group => ({
                        ...group,
                        tabs: group.tabs.map(tab =>
                            tab.id === tabId
                                ? { ...tab, viewMode: (tab.viewMode === 'edit' ? 'preview' : 'edit') as 'edit' | 'preview' }
                                : tab
                        )
                    }))
                    return { editorGroups: newGroups }
                })
            },

            saveTab: async (tabId: string) => {
                const { editorGroups } = get()
                let tab: Tab | undefined

                for (const group of editorGroups) {
                    tab = group.tabs.find(t => t.id === tabId)
                    if (tab) break
                }

                if (!tab?.document) return

                try {
                    const content = serializeDocumentToMarkdown(tab.document)
                    await window.api.writeFile(tab.filePath, content)
                    get().markDirty(tabId, false)

                    // Update persistence
                    set(state => ({
                        savedTabs: state.editorGroups.flatMap(g => g.tabs.map(t => ({
                            filePath: t.filePath,
                            title: t.title,
                            groupId: g.id
                        })))
                    }))

                    // Refresh graph to update backlinks
                    const { refreshGraph } = await import('./graphStore').then(m => m.useGraphStore.getState())
                    refreshGraph()
                } catch (error) {
                    console.error('Failed to save:', error)
                }
            },

            getActiveDocument: () => {
                const { editorGroups, activeGroupId } = get()
                const group = editorGroups.find(g => g.id === activeGroupId)
                if (!group || !group.activeTabId) return null

                const tab = group.tabs.find(t => t.id === group.activeTabId)
                return tab?.document ?? null
            },

            restoreOpenTabs: async () => {
                const { savedTabs, openTab } = get()
                // If savedTabs has groupId, we could use it, but for now openTab logic handles assignment.
                // To restore properly into groups, we check if generic openTab can handle it or if we need to pre-create groups.
                // For simplicity, we restore iteratively. 
                // Enhanced Migration: If we want to restore to specific groups, we should create those groups first.
                // But for now, let's just restore linear.
                for (const saved of savedTabs) {
                    try {
                        await openTab(saved.filePath, saved.title, saved.groupId)
                    } catch (error) {
                        console.error('Failed to restore tab:', saved.filePath, error)
                    }
                }
            },

            splitEditorRight: () => {
                set(state => {
                    const newGroupId = crypto.randomUUID()
                    const newGroup: EditorGroup = { id: newGroupId, tabs: [], activeTabId: null, widthRatio: 50 }

                    // Set existing groups to equal width ratios
                    const totalGroups = state.editorGroups.length + 1
                    const equalRatio = 100 / totalGroups
                    const updatedGroups = state.editorGroups.map(g => ({ ...g, widthRatio: equalRatio }))

                    return {
                        editorGroups: [...updatedGroups, { ...newGroup, widthRatio: equalRatio }],
                        activeGroupId: newGroupId
                    }
                })
            },

            closeGroup: (groupId: string) => {
                set(state => {
                    if (state.editorGroups.length <= 1) return state
                    const newGroups = state.editorGroups.filter(g => g.id !== groupId)
                    // Redistribute width ratios equally
                    const equalRatio = 100 / newGroups.length
                    const redistributedGroups = newGroups.map(g => ({ ...g, widthRatio: equalRatio }))
                    const newActiveId = state.activeGroupId === groupId ? redistributedGroups[0].id : state.activeGroupId
                    return { editorGroups: redistributedGroups, activeGroupId: newActiveId }
                })
            },

            setGroupWidth: (groupId: string, ratio: number) => {
                set(state => {
                    const groupIndex = state.editorGroups.findIndex(g => g.id === groupId)
                    if (groupIndex === -1) return state

                    const newGroups = [...state.editorGroups]
                    newGroups[groupIndex] = { ...newGroups[groupIndex], widthRatio: ratio }

                    // Adjust adjacent group to maintain 100% total
                    if (groupIndex < newGroups.length - 1) {
                        const remaining = 100 - ratio
                        // Distribute remaining to other groups proportionally
                        const othersTotal = newGroups.reduce((sum, g, i) => i !== groupIndex ? sum + (g.widthRatio || 50) : sum, 0)
                        newGroups.forEach((g, i) => {
                            if (i !== groupIndex) {
                                const currentRatio = g.widthRatio || 50
                                newGroups[i] = { ...g, widthRatio: (currentRatio / othersTotal) * remaining }
                            }
                        })
                    }

                    return { editorGroups: newGroups }
                })
            },

            selectNextTab: () => {
                set(state => {
                    const { activeGroupId, editorGroups } = state
                    const groupIndex = editorGroups.findIndex(g => g.id === activeGroupId)
                    if (groupIndex === -1) return state

                    const group = editorGroups[groupIndex]
                    if (group.tabs.length <= 1) return state

                    const currentTabIndex = group.tabs.findIndex(t => t.id === group.activeTabId)
                    const nextIndex = (currentTabIndex + 1) % group.tabs.length
                    const nextTabId = group.tabs[nextIndex].id

                    const newGroups = [...editorGroups]
                    newGroups[groupIndex] = { ...group, activeTabId: nextTabId }
                    return { editorGroups: newGroups }
                })
            },

            selectPrevTab: () => {
                set(state => {
                    const { activeGroupId, editorGroups } = state
                    const groupIndex = editorGroups.findIndex(g => g.id === activeGroupId)
                    if (groupIndex === -1) return state

                    const group = editorGroups[groupIndex]
                    if (group.tabs.length <= 1) return state

                    const currentTabIndex = group.tabs.findIndex(t => t.id === group.activeTabId)
                    const prevIndex = (currentTabIndex - 1 + group.tabs.length) % group.tabs.length
                    const prevTabId = group.tabs[prevIndex].id

                    const newGroups = [...editorGroups]
                    newGroups[groupIndex] = { ...group, activeTabId: prevTabId }
                    return { editorGroups: newGroups }
                })
            },

            addImageBlock: (tabId: string, imagePath: string) => {
                set(state => {
                    const newGroups = state.editorGroups.map(group => ({
                        ...group,
                        tabs: group.tabs.map(tab => {
                            if (tab.id !== tabId || !tab.document) return tab

                            // Create new image block
                            const imageBlock: Block = {
                                block_id: crypto.randomUUID(),
                                type: 'image',
                                content: imagePath,
                                alt: ''
                            }

                            // Add image block at the end of document
                            const newBlocks = [...tab.document.blocks, imageBlock]

                            return {
                                ...tab,
                                document: { ...tab.document, blocks: newBlocks },
                                isDirty: true
                            }
                        })
                    }))
                    return { editorGroups: newGroups }
                })
            },

            indentBlock: (tabId: string, blockId: string) => {
                set(state => {
                    const newGroups = state.editorGroups.map(group => ({
                        ...group,
                        tabs: group.tabs.map(tab => {
                            if (tab.id !== tabId || !tab.document) return tab

                            const newBlocks = tab.document.blocks.map(b => {
                                if (b.block_id === blockId) {
                                    return { ...b, indent: (b.indent || 0) + 1 }
                                }
                                return b
                            })

                            return {
                                ...tab,
                                document: { ...tab.document, blocks: newBlocks },
                                isDirty: true
                            }
                        })
                    }))
                    return { editorGroups: newGroups }
                })
            },

            outdentBlock: (tabId: string, blockId: string) => {
                set(state => {
                    const newGroups = state.editorGroups.map(group => ({
                        ...group,
                        tabs: group.tabs.map(tab => {
                            if (tab.id !== tabId || !tab.document) return tab

                            const newBlocks = tab.document.blocks.map(b => {
                                if (b.block_id === blockId) {
                                    const currentIndent = b.indent || 0
                                    return { ...b, indent: Math.max(0, currentIndent - 1) }
                                }
                                return b
                            })

                            return {
                                ...tab,
                                document: { ...tab.document, blocks: newBlocks },
                                isDirty: true
                            }
                        })
                    }))
                    return { editorGroups: newGroups }
                })
            },

            markTabAnimated: (tabId: string) => {
                set(state => {
                    const newGroups = state.editorGroups.map(group => ({
                        ...group,
                        tabs: group.tabs.map(tab =>
                            tab.id === tabId ? { ...tab, hasAnimated: true } : tab
                        )
                    }))
                    return { editorGroups: newGroups }
                })
            },

            appendBacklinkToFile: async (sourcePath: string, targetName: string) => {
                const { editorGroups } = get()
                const linkText = `[[${targetName}]]`

                // 1. Check if file is open in any tab
                let foundTab: Tab | undefined
                for (const group of editorGroups) {
                    foundTab = group.tabs.find(t => t.filePath === sourcePath)
                    if (foundTab) break
                }

                if (foundTab && foundTab.document) {
                    // Update in memory if open
                    const newBlock: Block = {
                        block_id: crypto.randomUUID(),
                        type: 'text',
                        content: linkText,
                    }
                    // Add newline block if needed for spacing, but just link is fine for now
                    const newBlocks = [...foundTab.document.blocks, newBlock]

                    set(state => {
                        const newGroups = state.editorGroups.map(group => ({
                            ...group,
                            tabs: group.tabs.map(tab =>
                                tab.id === foundTab!.id && tab.document
                                    ? { ...tab, document: { ...tab.document, blocks: newBlocks }, isDirty: true }
                                    : tab
                            )
                        }))
                        return { editorGroups: newGroups }
                    })

                    // If we want to save immediately to ensure persistence for graph refresh:
                    // await get().saveTab(foundTab.id) 
                    // But usually user might want to edit more. For graph connection, maybe auto-save is better?
                    // Let's autosave it so the link becomes "real" immediately.
                    await get().saveTab(foundTab.id)

                } else {
                    // 2. Read from disk, append, write back
                    try {
                        const content = await window.api.readFile(sourcePath)
                        // Append to end of file. Ensure newline.
                        const newContent = content.endsWith('\n') ? `${content}${linkText}\n` : `${content}\n${linkText}\n`
                        await window.api.writeFile(sourcePath, newContent)

                        // We need to refresh graph to show the new link
                        const { refreshGraph } = await import('./graphStore').then(m => m.useGraphStore.getState())
                        refreshGraph()

                    } catch (error) {
                        console.error('Failed to append backlink:', error)
                    }
                }
            }

        }),
        {
            name: 'cortex-editor',
            partialize: (state) => ({
                savedTabs: state.editorGroups.flatMap(g => g.tabs.map(t => ({
                    filePath: t.filePath,
                    title: t.title,
                    groupId: g.id
                })))
            })
        }
    )
)

// Helper functions for parsing/serializing
function parseMarkdownToDocument(content: string, filePath: string): Document {
    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/)
    let meta = {
        id: crypto.randomUUID(),
        title: 'Untitled',
        tags: [] as string[],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        alwaysOn: false
    }

    let bodyContent = content

    if (frontmatterMatch) {
        bodyContent = content.slice(frontmatterMatch[0].length)
        const yamlContent = frontmatterMatch[1]

        // Simple YAML parsing
        const lines = yamlContent.split('\n')
        for (const line of lines) {
            const [keyPart, ...valueParts] = line.split(':')
            if (!keyPart) continue

            const key = keyPart.trim()
            const value = valueParts.join(':').trim()

            if (key === 'id') {
                meta.id = value as any
            } else if (key === 'title') {
                meta.title = value
            } else if (key === 'created_at') {
                meta.created_at = value
            } else if (key === 'updated_at') {
                meta.updated_at = value
            } else if (key === 'alwaysOn') {
                meta.alwaysOn = value === 'true'
            } else if (key === 'tags') {
                const tagMatch = value.match(/\[(.*)\]/)
                if (tagMatch) {
                    meta.tags = tagMatch[1].split(',').map(t => t.trim()).filter(t => t.length > 0)
                }
            } else {
                // Dynamic metadata
                // Try to infer type (boolean, number, string)
                if (value === 'true') (meta as any)[key] = true
                else if (value === 'false') (meta as any)[key] = false
                else if (!isNaN(Number(value)) && value !== '') (meta as any)[key] = Number(value)
                else (meta as any)[key] = value.replace(/^['"](.*)['"]$/, '$1') // Remove quotes if present
            }
        }
    }

    // Parse content into blocks
    const blocks = parseContentToBlocks(bodyContent)

    return { meta, blocks, filePath }
}

function parseContentToBlocks(content: string): Block[] {
    const lines = content.split('\n')
    const blocks: Block[] = []
    let pendingTextLines: string[] = [] // Buffer for consecutive text lines

    // Helper to flush pending text lines as a single block
    const flushPendingText = () => {
        if (pendingTextLines.length > 0) {
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'text',
                content: pendingTextLines.join('\n')
            })
            pendingTextLines = []
        }
    }

    // Helper to check if a line is a special block type
    const isSpecialLine = (line: string): boolean => {
        if (line.startsWith('# ') || line.startsWith('## ') || line.startsWith('### ')) return true
        if (line.match(/^- \[([ x])\] /)) return true
        if (line.startsWith('- ')) return true
        if (line.match(/^\d+\. /)) return true
        if (line.startsWith('>> ')) return true
        if (line.startsWith('> ')) return true
        if (line.match(/^---+$/)) return true
        if (line.startsWith('```')) return true
        if (line.match(/^!\[\[.+?\]\]$/)) return true
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) return true // Table row
        return false
    }

    // Helper to parse table rows
    const parseTableRow = (line: string): string[] => {
        return line.trim().slice(1, -1).split('|').map(cell => cell.trim())
    }

    // Helper to check if line is table separator (|---|---|)
    const isTableSeparator = (line: string): boolean => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false
        const cells = trimmed.slice(1, -1).split('|')
        return cells.every(cell => /^[:\-\s]+$/.test(cell.trim()))
    }

    let i = 0
    while (i < lines.length) {
        const lineVal = lines[i]

        // Calculate indentation (tabs or 4 spaces)
        // We will assume 1 tab = 1 indent, or 2 spaces = 1 indent (for better compatibility)
        // But for storage, we will try to use tabs if possible or just use what's there
        let indent = 0
        let contentLine = lineVal

        // Count leading tabs
        const tabMatch = lineVal.match(/^(\t+)/)
        if (tabMatch) {
            indent = tabMatch[1].length
            contentLine = lineVal.substring(indent)
        } else {
            // Count leading spaces
            const spaceMatch = lineVal.match(/^( +)/)
            if (spaceMatch) {
                // 2 spaces per indent? or 4? Let's go with 2 for now as per common MD usage, or maybe just 4?
                // Let's assume 2 spaces = 1 indent level for UI purposes
                indent = Math.floor(spaceMatch[1].length / 2)
                contentLine = lineVal.trimStart()
            }
        }

        const line = contentLine // Working with trimmed-start line logic below, but need to preserve original content expectation for some blocks?
        // Actually existing logic uses 'line' which was 'lines[i]'.
        // We should be careful. Most existing logic matches ^... which expects start of string. 
        // If we stripped indent, regexes will work fine.

        // Empty line: flush pending text and create empty text block
        if (line.trim() === '') {
            flushPendingText()
            // Create empty text block with indent? Usually empty lines have no indent
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'text',
                content: '',
                indent: 0
            })
            i++
            continue
        }

        // Heading blocks
        if (line.startsWith('### ')) {
            flushPendingText()
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'heading3',
                content: line.slice(4),
                indent
            })
            i++
            continue
        }
        if (line.startsWith('## ')) {
            flushPendingText()
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'heading2',
                content: line.slice(3),
                indent
            })
            i++
            continue
        }
        if (line.startsWith('# ')) {
            flushPendingText()
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'heading1',
                content: line.slice(2),
                indent
            })
            i++
            continue
        }

        // Todo blocks
        if (line.match(/^- \[([ x])\] /)) {
            flushPendingText()
            const checked = line[3] === 'x'
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'todo',
                content: line.slice(6),
                checked,
                indent
            })
            i++
            continue
        }

        // Bullet list
        if (line.startsWith('- ')) {
            flushPendingText()
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'bullet',
                content: line.slice(2),
                indent
            })
            i++
            continue
        }

        // Numbered list
        const numberedMatch = line.match(/^(\d+)\. /)
        if (numberedMatch) {
            flushPendingText()
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'numbered',
                content: line.slice(numberedMatch[0].length),
                indent
            })
            i++
            continue
        }

        // Toggle block (>> header)
        if (line.startsWith('>> ')) {
            flushPendingText()
            const header = line.slice(3)
            const collapsedPrefix = '[collapsed] '
            const isCollapsed = header.startsWith(collapsedPrefix)
            const title = isCollapsed ? header.slice(collapsedPrefix.length) : header

            const toggleBlock: Block = {
                block_id: crypto.randomUUID(),
                type: 'toggle',
                content: title,
                collapsed: isCollapsed,
                children: []
            }
            // Collect children (tab or space-indented lines)
            i++
            while (i < lines.length) {
                const childLine = lines[i]
                const isTabChild = childLine.startsWith('\t')
                const isSpaceChild = childLine.startsWith('  ')
                if (!isTabChild && !isSpaceChild) break

                const content = isTabChild ? childLine.slice(1) : childLine.replace(/^ {2,}/, '')
                toggleBlock.children!.push({
                    block_id: crypto.randomUUID(),
                    type: 'text',
                    content
                })
                i++
            }
            blocks.push(toggleBlock)
            continue
        }

        // Quote - collect consecutive `> ` lines into one block
        if (line.startsWith('> ') && !line.startsWith('> [!')) {
            flushPendingText()
            const quoteLines: string[] = []
            while (i < lines.length && lines[i].startsWith('> ') && !lines[i].startsWith('> [!')) {
                quoteLines.push(lines[i].slice(2))
                i++
            }
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'quote',
                content: quoteLines.join('\n'),
                indent
            })
            continue
        }

        // Divider
        if (line.match(/^---+$/)) {
            flushPendingText()
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'divider',
                content: ''
            })
            i++
            continue
        }

        // Code block
        if (line.startsWith('```')) {
            flushPendingText()
            const language = line.slice(3).trim()
            const codeLines: string[] = []
            i++
            while (i < lines.length && !lines[i].startsWith('```')) {
                codeLines.push(lines[i])
                i++
            }
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'code',
                content: codeLines.join('\n'),
                language: language || 'plaintext'
            })
            i++
            continue
        }

        // Image/File - Obsidian style ![[filename]] or ![[filename|alt]]
        const embedMatch = line.match(/^!\[\[(.+?)(?:\|(.+?))?\]\]$/)
        if (embedMatch) {
            flushPendingText()
            const fileName = embedMatch[1]
            const ext = fileName.split('.').pop()?.toLowerCase() || ''
            const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']

            if (imageExts.includes(ext)) {
                // Image block
                blocks.push({
                    block_id: crypto.randomUUID(),
                    type: 'image',
                    content: fileName,
                    alt: embedMatch[2] || '',
                    indent
                })
            } else {
                // File block (PDF, etc.)
                blocks.push({
                    block_id: crypto.randomUUID(),
                    type: 'file',
                    content: fileName,
                    indent
                })
            }
            i++
            continue
        }


        // Callout - collect all consecutive `> ` lines after header
        if (line.startsWith('> [!NOTE]')) {
            flushPendingText()
            const calloutLines: string[] = []
            i++ // skip header line
            while (i < lines.length && lines[i].startsWith('> ')) {
                calloutLines.push(lines[i].slice(2))
                i++
            }
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'callout',
                content: calloutLines.join('\n'),
                indent
            })
            continue
        }

        // Table block (GFM format)
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            flushPendingText()
            const tableRows: string[][] = []

            // Collect all table rows
            while (i < lines.length) {
                const currentLine = lines[i].trim()
                if (!currentLine.startsWith('|') || !currentLine.endsWith('|')) break

                // Skip separator row (|---|---|)
                if (!isTableSeparator(lines[i])) {
                    tableRows.push(parseTableRow(lines[i]))
                }
                i++
            }

            if (tableRows.length > 0) {
                blocks.push({
                    block_id: crypto.randomUUID(),
                    type: 'table',
                    content: '',
                    tableData: tableRows.map(row => row.map(cell => ({ content: cell }))),
                    indent
                })
            }
            continue
        }

        // Default: accumulate text lines
        // For text blocks, if we have indent, we probably should handle it?
        // But flushPendingText assumes one block.
        // Simple strategy: If indent changes or type suggests block, we break. 
        // For 'text', we just keep adding. 
        // BUT wait, indentation is per-line. If we have multiple lines of text with different indent, 
        // they should probably be separate blocks or we lose that data.
        // Current 'text' type logic in flushPendingText joins properly.
        // Let's just treat text lines as text. 
        // HOWEVER: If we stripped indent above, strictly speaking we lost it for 'text' blocks if we accumulate.
        // Basic text usually doesn't have indent unless it's a code block or something.
        // Since we want to support indentation for lists mainly, let's just push text as is (untrimmed original)
        // if it's just text.
        // The above `line` variable is stripped.
        // Let's use `lineVal` (original) for plain text accumulation to preserve whitespace if it's not a special block?
        // OR: we treat every indent change as a new block?
        // Let's stick to: Text blocks usually don't have structural indent. 
        // If they do, they are likely part of a list or quote but we missed it.
        // Let's just accumulate the ORIGINAL line for text to be safe?
        // But then we mix indentation styles.
        // Revert to using 'line' (stripped) but maybe we need to support indent on text blocks too?
        // For now, let's just use the stripped line and assume indent 0 for plain paragraphs for simplicity
        // unless we want to support indented paragraphs.

        // Let's allow indented text blocks.
        if (pendingTextLines.length > 0) {
            // If we were accumulating, and now we see a line, we continue?
            // But if we want to capture indent, we must flush if indent differs?
            // For simplicity in this iteration: simplified text blocks don't support indent
            // OR verify if we can just push separate text blocks for each line?
            // That might be too granular.
            // Let's just use the original line for text blocks for now to avoid losing spaces.
            pendingTextLines.push(lineVal)
        } else {
            // If it is the first line of text block, maybe we CAN support indent?
            // But subsequent lines might not match.
            // Let's just push original lineVal to pendingTextLines.
            pendingTextLines.push(lineVal)
        }
        i++
    }

    // Flush any remaining pending text
    flushPendingText()

    // Ensure at least one empty text block
    if (blocks.length === 0) {
        blocks.push({
            block_id: crypto.randomUUID(),
            type: 'text',
            content: '',
            indent: 0
        })
    }

    return blocks
}

function serializeDocumentToMarkdown(doc: Document): string {
    // Serialize frontmatter
    const frontmatterLines = [
        '---',
        `id: ${doc.meta.id}`,
        `title: ${doc.meta.title}`,
        `tags: [${doc.meta.tags.join(', ')}]`,
        `created_at: ${doc.meta.created_at}`,
        `updated_at: ${new Date().toISOString()}`
    ]

    // Only include alwaysOn if true (to keep frontmatter clean)
    if (doc.meta.alwaysOn) {
        frontmatterLines.push('alwaysOn: true')
    }

    frontmatterLines.push('---', '')
    const frontmatter = frontmatterLines.join('\n')

    // Serialize blocks
    const content = doc.blocks.map(block => {
        const indentTab = '\t'.repeat(block.indent || 0)

        switch (block.type) {
            case 'heading1':
                return `${indentTab}# ${block.content}`
            case 'heading2':
                return `${indentTab}## ${block.content}`
            case 'heading3':
                return `${indentTab}### ${block.content}`
            case 'bullet':
                return `${indentTab}- ${block.content}`
            case 'numbered':
                return `${indentTab}1. ${block.content}`
            case 'todo':
                return `${indentTab}- [${block.checked ? 'x' : ' '}] ${block.content}`
            case 'quote':
                return block.content.split('\n').map(line => `${indentTab}> ${line}`).join('\n')
            case 'divider':
                return `${indentTab}---`
            case 'code':
                return `${indentTab}\`\`\`${block.language || ''}\n${block.content}\n${indentTab}\`\`\``
            case 'image':
                return block.alt ? `${indentTab}![[${block.content}|${block.alt}]]` : `${indentTab}![[${block.content}]]`
            case 'file':
                // Extract just the filename from full path for cleaner storage
                const fileName = block.content.split('/').pop() || block.content
                return `${indentTab}![[${fileName}]]`
            case 'callout': {
                const calloutBody = block.content.split('\n').map(line => `${indentTab}> ${line}`).join('\n')
                return `${indentTab}> [!NOTE]\n${calloutBody}`
            }
            case 'toggle': {
                // Toggle block: >> header, children indented (tab; reader also accepts spaces)
                const header = block.collapsed
                    ? `${indentTab}>> [collapsed] ${block.content}`
                    : `${indentTab}>> ${block.content}`
                if (block.children && block.children.length > 0) {
                    // Children are serialized with their own logic but here they are nested in toggle.
                    // The toggle format in this custom parser/serializer is a bit unique. 
                    // It expects children to be physically indented relative to the toggle.
                    // But our Block structure might flatten them effectively or use children array?
                    // The current parser (before my changes) used `children` array and ignored indent property for toggles.
                    // Now we are adding generic indent. 
                    // Let's respect the existing toggle serialization but add base indent.
                    const childLines = block.children.map(child => `\t${indentTab}${child.content}`).join('\n')
                    return `${header}\n${childLines}`
                }
                return header
            }
            case 'table': {
                if (!block.tableData || block.tableData.length === 0) return ''
                const rows = block.tableData.map(row =>
                    `${indentTab}| ` + row.map(cell => cell.content || '').join(' | ') + ' |'
                )
                // Insert separator after first row (header)
                if (rows.length > 0) {
                    const colCount = block.tableData[0].length
                    const separator = `${indentTab}| ` + Array(colCount).fill('---').join(' | ') + ' |'
                    rows.splice(1, 0, separator)
                }
                return rows.join('\n')
            }
            default:
                // For text, just return content (which might have its own newlines)
                // If it's single line, add indent. Multi-line? 
                // We stored original lines for text blocks in parser.
                // So adding indent here might double indent if we are not careful?
                // But in new blocks created in UI, content won't have indentation.
                // So we should prepend indent.
                // Let's assume content is pure text and we need to indent it.
                return block.content.split('\n').map(line => `${indentTab}${line}`).join('\n')
        }
    }).join('\n')

    return frontmatter + content
}
