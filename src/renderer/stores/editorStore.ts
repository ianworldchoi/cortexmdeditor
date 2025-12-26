import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Document, Block } from '@shared/types'

export interface Tab {
    id: string
    filePath: string
    title: string
    document: Document | null
    isDirty: boolean
    isLoading: boolean
}

interface SavedTab {
    filePath: string
    title: string
}

interface EditorState {
    tabs: Tab[]
    activeTabId: string | null
    savedTabs: SavedTab[] // For persistence

    // Actions
    openTab: (filePath: string, title: string) => Promise<void>
    closeTab: (tabId: string) => void
    setActiveTab: (tabId: string) => void
    updateDocument: (tabId: string, blocks: Block[]) => void
    markDirty: (tabId: string, isDirty: boolean) => void
    saveTab: (tabId: string) => Promise<void>
    getActiveDocument: () => Document | null
    restoreOpenTabs: () => Promise<void>
}

export const useEditorStore = create<EditorState>()(
    persist(
        (set, get) => ({
            tabs: [],
            activeTabId: null,
            savedTabs: [],

            openTab: async (filePath: string, title: string) => {
                const { tabs } = get()

                // Check if already open
                const existingTab = tabs.find(t => t.filePath === filePath)
                if (existingTab) {
                    set({ activeTabId: existingTab.id })
                    return
                }

                // Create new tab
                const tabId = crypto.randomUUID()
                const newTab: Tab = {
                    id: tabId,
                    filePath,
                    title: title.replace('.md', ''),
                    document: null,
                    isDirty: false,
                    isLoading: true
                }

                set(state => ({
                    tabs: [...state.tabs, newTab],
                    activeTabId: tabId
                }))

                // Load document content
                try {
                    const content = await window.api.readFile(filePath)
                    const document = parseMarkdownToDocument(content, filePath)

                    set(state => ({
                        tabs: state.tabs.map(t =>
                            t.id === tabId
                                ? { ...t, document, isLoading: false }
                                : t
                        )
                    }))
                } catch (error) {
                    console.error('Failed to load document:', error)
                    set(state => ({
                        tabs: state.tabs.map(t =>
                            t.id === tabId
                                ? { ...t, isLoading: false }
                                : t
                        )
                    }))
                }
            },

            closeTab: (tabId: string) => {
                set(state => {
                    const newTabs = state.tabs.filter(t => t.id !== tabId)
                    let newActiveId = state.activeTabId

                    if (state.activeTabId === tabId) {
                        const index = state.tabs.findIndex(t => t.id === tabId)
                        newActiveId = newTabs[Math.min(index, newTabs.length - 1)]?.id ?? null
                    }

                    return { tabs: newTabs, activeTabId: newActiveId }
                })
            },

            setActiveTab: (tabId: string) => {
                set({ activeTabId: tabId })
            },

            updateDocument: (tabId: string, blocks: Block[]) => {
                set(state => ({
                    tabs: state.tabs.map(t =>
                        t.id === tabId && t.document
                            ? {
                                ...t,
                                document: { ...t.document, blocks },
                                isDirty: true
                            }
                            : t
                    )
                }))
            },

            markDirty: (tabId: string, isDirty: boolean) => {
                set(state => ({
                    tabs: state.tabs.map(t =>
                        t.id === tabId ? { ...t, isDirty } : t
                    )
                }))
            },

            saveTab: async (tabId: string) => {
                const { tabs } = get()
                const tab = tabs.find(t => t.id === tabId)
                if (!tab?.document) return

                try {
                    const content = serializeDocumentToMarkdown(tab.document)
                    await window.api.writeFile(tab.filePath, content)
                    set(state => ({
                        tabs: state.tabs.map(t =>
                            t.id === tabId ? { ...t, isDirty: false } : t
                        ),
                        // Update savedTabs when saving
                        savedTabs: state.tabs.map(t => ({ filePath: t.filePath, title: t.title }))
                    }))
                } catch (error) {
                    console.error('Failed to save:', error)
                }
            },

            getActiveDocument: () => {
                const { tabs, activeTabId } = get()
                return tabs.find(t => t.id === activeTabId)?.document ?? null
            },

            restoreOpenTabs: async () => {
                const { savedTabs, openTab } = get()
                for (const savedTab of savedTabs) {
                    try {
                        await openTab(savedTab.filePath, savedTab.title)
                    } catch (error) {
                        console.error('Failed to restore tab:', savedTab.filePath, error)
                    }
                }
            }
        }),
        {
            name: 'cortex-editor',
            partialize: (state) => ({
                savedTabs: state.tabs.map(t => ({ filePath: t.filePath, title: t.title }))
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
        updated_at: new Date().toISOString()
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

        // Image
        const imageMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/)
        if (imageMatch) {
            blocks.push({
                block_id: crypto.randomUUID(),
                type: 'image',
                content: imageMatch[2] // URL
            })
            i++
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
    const frontmatter = [
        '---',
        `id: ${doc.meta.id}`,
        `title: ${doc.meta.title}`,
        `tags: [${doc.meta.tags.join(', ')}]`,
        `created_at: ${doc.meta.created_at}`,
        `updated_at: ${new Date().toISOString()}`,
        '---',
        ''
    ].join('\n')

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
                return `![](${block.content})`
            case 'callout':
                return `> [!NOTE]\n> ${block.content}`
            default:
                return block.content
        }
    }).join('\n')

    return frontmatter + content
}
