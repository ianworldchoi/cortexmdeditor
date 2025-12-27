import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Document, FileNode } from '@shared/types'
import { useAIStore } from '../stores/aiStore'
import { useVaultStore } from '../stores/vaultStore'

// Define the window.api type locally to satisfy the linter if global augmentation is missing
interface WindowAPI {
    readFile: (path: string) => Promise<string>
    createFile: (path: string, content: string) => Promise<void>
    createFolder: (path: string) => Promise<void>
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

// Build smart context from vault using Always-on and Tag triggers
async function getSmartContext(userMessage: string): Promise<string> {
    const { documentIndex } = useVaultStore.getState()

    if (!documentIndex || documentIndex.length === 0) {
        return ''
    }

    const contextDocs: string[] = []
    const lowerMessage = userMessage.toLowerCase()

    // 1. Always-on 문서 수집
    const alwaysOnDocs = documentIndex.filter(d => d.alwaysOn)

    // 2. 태그 트리거 매칭 (대소문자 무시)
    const triggeredDocs = documentIndex.filter(d =>
        !d.alwaysOn && // alwaysOn 문서는 이미 포함됨
        d.tags.some(tag => lowerMessage.includes(tag.toLowerCase()))
    )

    // 3. 중복 제거 후 합치기
    const allDocs = [...alwaysOnDocs, ...triggeredDocs]

    // 최대 10개 문서로 제한
    const limitedDocs = allDocs.slice(0, 10)

    if (limitedDocs.length === 0) {
        return ''
    }

    // 4. 각 문서 내용 로드
    for (const doc of limitedDocs) {
        try {
            const content = await window.api.readFile(doc.path)
            const isAlwaysOn = doc.alwaysOn ? ' [Always-on]' : ''
            const matchedTags = doc.tags.filter(tag => lowerMessage.includes(tag.toLowerCase()))
            const triggerInfo = matchedTags.length > 0 ? ` [Triggered by: ${matchedTags.join(', ')}]` : ''

            contextDocs.push(`## ${doc.title}${isAlwaysOn}${triggerInfo}\n${content.slice(0, 3000)}`)
        } catch (e) {
            console.warn(`Failed to read ${doc.path}`, e)
        }
    }

    if (contextDocs.length === 0) {
        return ''
    }

    return `## Vault Context (Smart Context - ${contextDocs.length} documents)\n\n${contextDocs.join('\n\n---\n\n')}`
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
    const { sessions, activeSessionId } = useAIStore.getState()
    const activeSession = sessions.find(s => s.id === activeSessionId)

    if (!activeSession || activeSession.messages.length === 0) return ''

    // Filter out the very fast/transient checks if any, or just take last 10 messages
    const recentMessages = activeSession.messages.slice(-10)

    if (recentMessages.length === 0) return ''

    return `
## Chat History
The following is the recent conversation history between the user and you (Assistant). Use this to maintain context.

${recentMessages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n')}
`
}

import type { AIAttachment } from '../stores/aiStore'

export async function sendMessage(
    userMessage: string,
    activeDocument: Document | null,
    attachments: AIAttachment[] = []
): Promise<string> {
    const vaultPath = useVaultStore.getState().vaultPath
    const { apiKey, customSystemPrompt, vaultSystemPrompts, selectedModel } = useAIStore.getState()

    if (!apiKey) {
        throw new Error('API key not set. Please configure your Gemini API key in settings.')
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: selectedModel })

    // Determine effective system prompt
    let effectiveSystemPrompt = customSystemPrompt
    if (vaultPath && vaultSystemPrompts[vaultPath]) {
        effectiveSystemPrompt = vaultSystemPrompts[vaultPath]
    }

    // Gather all contexts
    const activeDocContext = buildActiveDocumentContext(activeDocument)
    const chatHistory = buildChatHistory()
    const vaultContext = await getSmartContext(userMessage)

    const contextPart = `
${effectiveSystemPrompt}

---

${vaultContext}

---

${activeDocContext}

---

${chatHistory}

---

## User Message (Respond to this)
`

    // Construct parts array
    const parts: any[] = [{ text: contextPart }]

    // Add attachments if any
    if (attachments.length > 0) {
        attachments.forEach(att => {
            // Remove data:image/png;base64, prefix if present
            const base64Data = att.data.split(',')[1] || att.data
            parts.push({
                inlineData: {
                    mimeType: att.mimeType,
                    data: base64Data
                }
            })
        })
    }

    // Add user text message last
    parts.push({ text: userMessage })

    try {
        const result = await model.generateContent(parts)
        const response = result.response
        const text = response.text()

        return text
    } catch (error) {
        console.error('Gemini API error:', error)
        throw error
    }
}
