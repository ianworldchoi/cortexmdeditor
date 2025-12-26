import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Document, FileNode } from '@shared/types'
import { useAIStore } from '../stores/aiStore'
import { useVaultStore } from '../stores/vaultStore'

// Define the window.api type locally to satisfy the linter if global augmentation is missing
interface WindowAPI {
    readFile: (path: string) => Promise<string>
}
declare global {
    interface Window {
        api: WindowAPI
    }
}

// Helper to get all file paths from the tree
function getAllFilePaths(nodes: FileNode[]): string[] {
    let paths: string[] = []

    for (const node of nodes) {
        if (!node.isDirectory && (node.name.endsWith('.md') || node.name.endsWith('.txt'))) {
            paths.push(node.path)
        } else if (node.children) {
            paths = [...paths, ...getAllFilePaths(node.children)]
        }
    }

    return paths
}

// Build context from all vault files
async function getVaultContext(): Promise<string> {
    const { fileTree } = useVaultStore.getState()
    const paths = getAllFilePaths(fileTree)

    // Limit to reasonable number of files to avoid context window explosion
    // For now, let's take up to 20 files. In production this should be smarter (RAG).
    const selectedPaths = paths.slice(0, 20)

    const fileContents = await Promise.all(
        selectedPaths.map(async (path) => {
            try {
                const content = await window.api.readFile(path)
                // Extract filename for context
                const filename = path.split('/').pop()
                return `File: ${filename}\n---\n${content.slice(0, 1000)}\n---` // Limit each file to 1000 chars roughly
            } catch (e) {
                console.warn(`Failed to read file ${path}`, e)
                return null
            }
        })
    )

    const validContents = fileContents.filter(Boolean).join('\n\n')

    return validContents ? `## Vault Context (Related Files)\n\n${validContents}` : ''
}

// Build context from document
function buildActiveDocumentContext(document: Document | null): string {
    if (!document) {
        return 'No document is currently open.'
    }

    const blocksContent = document.blocks
        .map(block => {
            const idPrefix = `[Block ID: ${block.block_id}] `

            if (block.type === 'divider') return `${idPrefix}---`
            if (block.type === 'heading1') return `${idPrefix}# ${block.content}`
            if (block.type === 'heading2') return `${idPrefix}## ${block.content}`
            if (block.type === 'heading3') return `${idPrefix}### ${block.content}`
            if (block.type === 'bullet') return `${idPrefix}- ${block.content}`
            if (block.type === 'numbered') return `${idPrefix}1. ${block.content}`
            if (block.type === 'todo') return `${idPrefix}- [${block.checked ? 'x' : ' '}] ${block.content}`
            if (block.type === 'quote') return `${idPrefix}> ${block.content}`
            if (block.type === 'code') return `${idPrefix}\`\`\`\n${block.content}\n\`\`\``
            if (block.type === 'callout') return `${idPrefix}> [!NOTE]\n> ${block.content}`
            return `${idPrefix}${block.content}`
        })
        .join('\n')

    return `
## Active Document (User is currently looking at this)

**Title:** ${document.meta.title}
**ID:** ${document.meta.id}
**Tags:** ${document.meta.tags.join(', ') || 'none'}
**Created:** ${document.meta.created_at}
**Updated:** ${document.meta.updated_at}

### Content:
${blocksContent}
`
}

function buildChatHistory(): string {
    const { messages } = useAIStore.getState()

    // Filter out the very fast/transient checks if any, or just take last 10 messages
    const recentMessages = messages.slice(-10)

    if (recentMessages.length === 0) return ''

    return `
## Chat History
The following is the recent conversation history between the user and you (Assistant). Use this to maintain context.

${recentMessages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n')}
`
}

export async function sendMessage(
    userMessage: string,
    activeDocument: Document | null
): Promise<string> {
    const { apiKey, customSystemPrompt, selectedModel } = useAIStore.getState()

    if (!apiKey) {
        throw new Error('API key not set. Please configure your Gemini API key in settings.')
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: selectedModel })

    // Gather all contexts
    const activeDocContext = buildActiveDocumentContext(activeDocument)
    const chatHistory = buildChatHistory()
    const vaultContext = await getVaultContext()

    const fullPrompt = `
${customSystemPrompt}

---

${vaultContext}

---

${activeDocContext}

---

${chatHistory}

---

## User Message (Respond to this)

${userMessage}
`

    // Log the prompt for debugging
    // console.log('Full Prompt sent to Gemini:', fullPrompt)

    try {
        const result = await model.generateContent(fullPrompt)
        const response = result.response
        const text = response.text()

        return text
    } catch (error) {
        console.error('Gemini API error:', error)
        throw error
    }
}
