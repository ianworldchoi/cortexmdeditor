import { GoogleGenAI } from '@google/genai'
import type { Document, FileNode } from '@shared/types'
import { useAIStore } from '../stores/aiStore'
import { useVaultStore } from '../stores/vaultStore'
import type { AIAttachment } from '../stores/aiStore'

// Define the window.api type locally to satisfy the linter
interface WindowAPI {
    readFile: (path: string) => Promise<string>
    createFile: (path: string, content: string) => Promise<void>
    createFolder: (path: string) => Promise<void>
    processYouTubeUrl: (apiKey: string, url: string) => Promise<{ strategy: string, url: string, fileUri?: string, mimeType?: string }>
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
    if (!documentIndex || documentIndex.length === 0) return ''

    const contextDocs: string[] = []
    const lowerMessage = userMessage.toLowerCase()

    // 1. Always-on docs
    const alwaysOnDocs = documentIndex.filter(d => d.alwaysOn)

    // 2. Tag triggers
    const triggeredDocs = documentIndex.filter(d =>
        !d.alwaysOn &&
        d.tags.some(tag => lowerMessage.includes(tag.toLowerCase()))
    )

    // 3. Merge and limit
    const allDocs = [...alwaysOnDocs, ...triggeredDocs]
    const limitedDocs = allDocs.slice(0, 10)

    if (limitedDocs.length === 0) return ''

    // 4. Load content
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

    if (contextDocs.length === 0) return ''
    return `## Vault Context (Smart Context - ${contextDocs.length} documents)\n\n${contextDocs.join('\n\n---\n\n')}`
}

// Build context from document
function buildActiveDocumentContext(document: Document | null): string {
    if (!document) return 'No document is currently open.'

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
    const recentMessages = activeSession.messages.slice(-10)
    if (recentMessages.length === 0) return ''

    return `
## Chat History
The following is the recent conversation history between the user and you (Assistant). Use this to maintain context.

${recentMessages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n')}
`
}

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

    // Initialize the new Client from google-genai SDK
    const client = new GoogleGenAI({ apiKey: apiKey })

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
            const base64Data = att.data.split(',')[1] || att.data
            parts.push({
                inlineData: {
                    mimeType: att.mimeType,
                    data: base64Data
                }
            })
        })
    }

    // Check for YouTube URL in the message
    // Regex that captures standard youtube.com and youtu.be URLs, ignoring trailing text
    const youtubeRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]+(?:&[a-zA-Z0-9_=-]+)*)/g
    const youtubeMatch = userMessage.match(youtubeRegex)

    if (youtubeMatch) {
        try {
            const url = youtubeMatch[0]
            console.log('Processing YouTube URL:', url)
            const processed = await window.api.processYouTubeUrl(apiKey, url)

            if (processed.strategy === 'file_api' && processed.fileUri) {
                // Configured file upload (legacy path if activated)
                parts.push({
                    fileData: {
                        mimeType: processed.mimeType || 'video/mp4',
                        fileUri: processed.fileUri
                    }
                })
                parts.push({ text: `\n\n(Video Attached: ${url})` })
            } else {
                // Direct URL Strategy (Gemini Video Understanding)
                // New SDK @google/genai supports passing video URI directly.
                parts.push({
                    fileData: {
                        mimeType: 'video/mp4',
                        fileUri: url
                    }
                })
                parts.push({ text: "\n\n(Analyze the video content above)" })
            }
        } catch (error) {
            console.error('Failed to process YouTube URL:', error)
        }
    }

    parts.push({ text: userMessage })

    // Debugging logs
    console.log('[GeminiService] Selected Model:', selectedModel)
    console.log('[GeminiService] User Message:', userMessage)
    if (youtubeMatch) {
        console.log('[GeminiService] Extracted YouTube URL:', youtubeMatch[0])
    }
    console.log('[GeminiService] Constructing request with parts count:', parts.length)

    try {
        // Use the new Client API
        // @ts-ignore - The types for google-genai might be strict, but this pattern matches the documentation
        const response = await client.models.generateContent({
            model: selectedModel,
            contents: [
                {
                    role: 'user',
                    parts: parts
                }
            ]
        })

        // Handle response
        // The new SDK response object typically has a .text property (getter), while older/web versions had .text()
        const respAny = response as any
        if (typeof respAny.text === 'function') {
            return respAny.text()
        }
        // If it's a property (string) or we need to dig into candidates
        return (typeof respAny.text === 'string' ? respAny.text : undefined)
            || respAny.candidates?.[0]?.content?.parts?.[0]?.text
            || ''
    } catch (error) {
        console.error('Gemini API error:', error)
        throw error
    }
}
