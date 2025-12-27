import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Document, Block } from '@shared/types'

export interface Tab {
    id: string
    type: 'document' | 'browser'
    filePath: string
    title: string
    document: Document | null
    isDirty: boolean
    isLoading: boolean
    url?: string  // For browser tabs
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
    updateBrowserUrl: (tabId: string, url: string, title?: string) => void
    closeTab: (tabId: string, groupId?: string) => void
    setActiveTab: (tabId: string, groupId?: string) => void
    setActiveGroup: (groupId: string) => void
    updateDocument: (tabId: string, blocks: Block[]) => void
    updateDocumentMeta: (tabId: string, meta: Partial<import('@shared/types').DocumentMeta>) => void
    markDirty: (tabId: string, isDirty: boolean) => void
    saveTab: (tabId: string) => Promise<void>
    getActiveDocument: () => Document | null
    restoreOpenTabs: () => Promise<void>

    // Split View Actions
    splitEditorRight: () => void
    closeGroup: (groupId: string) => void
    setGroupWidth: (groupId: string, ratio: number) => void

    // Navigation
    selectNextTab: () => void
    selectPrevTab: () => void
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
                    isLoading: true
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
                    url: initialUrl
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
            const [key, ...valueParts] = line.split(':')
            const value = valueParts.join(':').trim()

            if (key === 'id') meta.id = value
            if (key === 'title') meta.title = value
            if (key === 'created_at') meta.created_at = value
            if (key === 'updated_at') meta.updated_at = value
            if (key === 'alwaysOn') meta.alwaysOn = value === 'true'
            if (key === 'tags') {
                const tagMatch = value.match(/\[(.*)\]/)
                if (tagMatch) {
                    meta.tags = tagMatch[1].split(',').map(t => t.trim())
                }
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

    let i = 0
    while (i < lines.length) {
        const line = lines[i]

        // Skip empty lines at start
        if (line.trim() === '' && blocks.length === 0) {
            i++
            continue
        }

        // Heading blocks
        if (line.startsWith('### ')) {
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'heading3',
                content: line.slice(4)
            })
            i++
            continue
        }
        if (line.startsWith('## ')) {
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'heading2',
                content: line.slice(3)
            })
            i++
            continue
        }
        if (line.startsWith('# ')) {
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'heading1',
                content: line.slice(2)
            })
            i++
            continue
        }

        // Todo blocks
        if (line.match(/^- \[([ x])\] /)) {
            const checked = line[3] === 'x'
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'todo',
                content: line.slice(6),
                checked
            })
            i++
            continue
        }

        // Bullet list
        if (line.startsWith('- ')) {
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'bullet',
                content: line.slice(2)
            })
            i++
            continue
        }

        // Numbered list
        const numberedMatch = line.match(/^(\d+)\. /)
        if (numberedMatch) {
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'numbered',
                content: line.slice(numberedMatch[0].length)
            })
            i++
            continue
        }

        // Toggle block (>> header)
        if (line.startsWith('>> ')) {
            const toggleBlock: Block = {
                block_id: crypto.randomUUID(),
                type: 'toggle',
                content: line.slice(3),
                collapsed: false,
                children: []
            }
            // Collect children (tab-indented lines) - SIMPLE IMPLEMENTATION (Text only)
            i++
            while (i < lines.length && lines[i].startsWith('\t')) {
                toggleBlock.children!.push({
                    block_id: crypto.randomUUID(),
                    type: 'text',
                    content: lines[i].slice(1) // Remove leading tab
                })
                i++
            }
            blocks.push(toggleBlock)
            continue
        }

        // Quote
        if (line.startsWith('> ')) {
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'quote',
                content: line.slice(2)
            })
            i++
            continue
        }

        // Divider
        if (line.match(/^---+$/)) {
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

        // Image - Obsidian style ![[filename]] or ![[filename|alt]]
        const imageMatch = line.match(/^!\[\[(.+?)(?:\|(.+?))?\]\]$/)
        if (imageMatch) {
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'image',
                content: imageMatch[1], // filename/path
                alt: imageMatch[2] || '' // Alt text (after |)
            })
            i++
            continue
        }

        // Callout
        if (line.startsWith('> [!NOTE]')) {
            let content = ''
            if (i + 1 < lines.length && lines[i + 1].startsWith('> ')) {
                content = lines[i + 1].slice(2)
                i += 2
            } else {
                i++
            }
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'callout',
                content: content
            })
            continue
        }

        // Default: text block
        blocks.push({
            block_id: crypto.randomUUID(),
            type: 'text',
            content: line
        })
        i++
    }

    // Ensure at least one empty text block
    if (blocks.length === 0) {
        blocks.push({
            block_id: crypto.randomUUID(),
            type: 'text',
            content: ''
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
        switch (block.type) {
            case 'heading1':
                return `# ${block.content}`
            case 'heading2':
                return `## ${block.content}`
            case 'heading3':
                return `### ${block.content}`
            case 'bullet':
                return `- ${block.content}`
            case 'numbered':
                return `1. ${block.content}`
            case 'todo':
                return `- [${block.checked ? 'x' : ' '}] ${block.content}`
            case 'quote':
                return `> ${block.content}`
            case 'divider':
                return '---'
            case 'code':
                return `\`\`\`${block.language || ''}\n${block.content}\n\`\`\``
            case 'image':
                return block.alt ? `![[${block.content}|${block.alt}]]` : `![[${block.content}]]`
            case 'callout':
                return `> [!NOTE]\n> ${block.content}`
            case 'toggle': {
                // Toggle block: >> header, children indented with tab
                const header = `>> ${block.content}`
                if (block.children && block.children.length > 0) {
                    const childLines = block.children.map(child => `\t${child.content}`).join('\n')
                    return `${header}\n${childLines}`
                }
                return header
            }
            default:
                return block.content
        }
    }).join('\n')

    return frontmatter + content
}
