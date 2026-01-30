import { GoogleGenAI } from '@google/genai'
import type { Document, FileNode } from '@shared/types'
import { useAIStore } from '../stores/aiStore'
import { useVaultStore } from '../stores/vaultStore'
import type { AIAttachment } from '../stores/aiStore'

// MCP Tool types (mirroring what preload exposes)
interface MCPTool {
    name: string
    description?: string
    inputSchema: Record<string, unknown>
    serverId: string
}

/**
 * Convert MCP tools to Gemini function declarations
 */
function mcpToolsToGeminiFunctions(mcpTools: MCPTool[]): any[] {
    return mcpTools.map(tool => ({
        name: tool.name.replace(/[^a-zA-Z0-9_]/g, '_'), // Gemini requires alphanumeric names
        description: tool.description || `Tool: ${tool.name}`,
        parameters: tool.inputSchema
    }))
}

/**
 * Get all MCP tools from connected servers
 */
async function getMCPTools(): Promise<MCPTool[]> {
    try {
        const tools = await window.api.mcpGetTools()
        return tools
    } catch (e) {
        console.warn('[GeminiService] Failed to get MCP tools:', e)
        return []
    }
}

/**
 * Execute an MCP tool call
 */
async function executeMCPTool(
    toolName: string,
    args: Record<string, unknown>,
    mcpTools: MCPTool[]
): Promise<{ success: boolean; result?: unknown; error?: string }> {
    // Find which server has this tool
    const tool = mcpTools.find(t => t.name.replace(/[^a-zA-Z0-9_]/g, '_') === toolName || t.name === toolName)
    if (!tool) {
        return { success: false, error: `Tool ${toolName} not found` }
    }

    try {
        const result = await window.api.mcpCallTool(tool.serverId, tool.name, args)
        return result
    } catch (e) {
        return { success: false, error: String(e) }
    }
}

// WindowAPI is defined globally in vite-env.d.ts

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

export interface MentionedItem {
    type: 'file' | 'directory'
    path: string
    name: string
}

// Build context from mentioned items (files and directories)
async function buildMentionedContext(mentionedItems: MentionedItem[]): Promise<string> {
    if (!mentionedItems || mentionedItems.length === 0) return ''

    const contextParts: string[] = []

    for (const item of mentionedItems) {
        try {
            if (item.type === 'file') {
                const content = await window.api.readFile(item.path)
                contextParts.push(`## Mentioned File: ${item.name}\n${content.slice(0, 5000)}`)
            } else if (item.type === 'directory') {
                // Read all .md files in the directory recursively
                const { fileTree } = useVaultStore.getState()

                // Find the folder node and get all .md files
                const findFolder = (nodes: FileNode[], targetPath: string): FileNode | null => {
                    for (const node of nodes) {
                        if (node.path === targetPath) return node
                        if (node.children) {
                            const found = findFolder(node.children, targetPath)
                            if (found) return found
                        }
                    }
                    return null
                }

                const getMdFiles = (node: FileNode): string[] => {
                    let paths: string[] = []
                    if (!node.isDirectory && node.name.endsWith('.md')) {
                        paths.push(node.path)
                    } else if (node.children) {
                        for (const child of node.children) {
                            paths = [...paths, ...getMdFiles(child)]
                        }
                    }
                    return paths
                }

                const folderNode = findFolder(fileTree, item.path)
                if (folderNode && folderNode.children) {
                    const mdFiles = getMdFiles(folderNode).slice(0, 10) // Limit to 10 files
                    const folderContents: string[] = []

                    for (const filePath of mdFiles) {
                        try {
                            const content = await window.api.readFile(filePath)
                            const fileName = filePath.split('/').pop() || 'Unknown'
                            folderContents.push(`### ${fileName}\n${content.slice(0, 2000)}`)
                        } catch (e) {
                            console.warn(`Failed to read ${filePath}`, e)
                        }
                    }

                    if (folderContents.length > 0) {
                        contextParts.push(`## Mentioned Folder: ${item.name} (${folderContents.length} files)\n${folderContents.join('\n\n---\n\n')}`)
                    }
                }
            }
        } catch (e) {
            console.warn(`Failed to read mentioned item ${item.path}`, e)
        }
    }

    if (contextParts.length === 0) return ''
    return `## Mentioned Context (User explicitly referenced these)\n\n${contextParts.join('\n\n---\n\n')}`
}

export async function sendMessage(
    userMessage: string,
    activeDocument: Document | null,
    attachments: AIAttachment[] = [],
    mentionedItems: MentionedItem[] = [],
    signal?: AbortSignal,
    onChunk?: (text: string) => void
): Promise<string> {
    const vaultPath = useVaultStore.getState().vaultPath
    const { apiKey, customSystemPrompt, vaultSystemPrompts, selectedModel, webSearchEnabled, getFolderPromptForPath } = useAIStore.getState()

    if (!apiKey) {
        throw new Error('API key not set. Please configure your Gemini API key in settings.')
    }

    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
    }

    // Initialize the new Client from google-genai SDK
    const client = new GoogleGenAI({ apiKey: apiKey })

    // Fetch MCP tools from connected servers
    const mcpTools = await getMCPTools()
    const mcpFunctionDeclarations = mcpToolsToGeminiFunctions(mcpTools)

    // Configure tools based on settings
    const tools: any[] = []
    if (webSearchEnabled) {
        tools.push({ googleSearch: {} })
    }
    if (mcpFunctionDeclarations.length > 0) {
        tools.push({ functionDeclarations: mcpFunctionDeclarations })
    }

    console.log('[GeminiService] MCP tools available:', mcpTools.length)

    // Determine effective system prompt
    let effectiveSystemPrompt = customSystemPrompt
    if (vaultPath && vaultSystemPrompts[vaultPath]) {
        effectiveSystemPrompt = vaultSystemPrompts[vaultPath]
    }

    // Gather all contexts
    const activeDocContext = buildActiveDocumentContext(activeDocument)
    const chatHistory = buildChatHistory()
    const vaultContext = await getSmartContext(userMessage)
    const mentionedContext = await buildMentionedContext(mentionedItems)

    // Get folder-specific prompt if available
    const folderPrompt = activeDocument?.filePath
        ? getFolderPromptForPath(activeDocument.filePath)
        : null

    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
    }

    const contextPart = `
${effectiveSystemPrompt}

---

${folderPrompt ? `## Folder Context (Auto-applied from folder settings)\n\n${folderPrompt}\n\n---\n\n` : ''}${mentionedContext}

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

    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
    }

    try {
        // Use streaming API for real-time response
        // @ts-ignore - The types for google-genai might be strict, but this pattern matches the documentation
        const stream = await client.models.generateContentStream({
            model: selectedModel,
            contents: [
                {
                    role: 'user',
                    parts: parts
                }
            ],
            config: tools.length > 0 ? { tools } : undefined
        })

        let fullResponse = ''
        let pendingFunctionCalls: Array<{ name: string; id?: string; args: Record<string, unknown>; thoughtSignature?: string }> = []

        // Process the stream
        for await (const chunk of stream) {
            if (signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError')
            }

            // Extract text from chunk
            const chunkAny = chunk as any
            let chunkText = ''

            // Check for function calls in the response parts
            // Iterate over all parts, as function calls might not be the first part
            const parts = chunkAny.candidates?.[0]?.content?.parts || []
            for (const part of parts) {
                if (part.functionCall) {
                    console.log('[GeminiService] Function call detected:', part.functionCall.name)

                    // Check if we already have this function call (by name)
                    // Note: In streaming, we might get updates or duplicates. 
                    // For now, we assume distinct function calls or the final state in the chunk.
                    // If the SDK streams partial args, this logic implies we take the latest state 
                    // (since we replace or ignore if exists? Actually better to update args if matching).
                    // However, to be safe and simple given the "missing thought_signature" error:
                    // We primarily ensure we capture the thoughtSignature.

                    const existingIndex = pendingFunctionCalls.findIndex(fc => fc.name === part.functionCall.name)
                    if (existingIndex !== -1) {
                        // Update existing (e.g. streaming args)
                        pendingFunctionCalls[existingIndex].args = part.functionCall.args || pendingFunctionCalls[existingIndex].args
                        if (part.thoughtSignature) {
                            pendingFunctionCalls[existingIndex].thoughtSignature = part.thoughtSignature
                        }
                        if (part.functionCall.id) {
                            pendingFunctionCalls[existingIndex].id = part.functionCall.id
                        }
                    } else {
                        // Add new
                        // @ts-ignore - thoughtSignature is available on the part in newer API versions
                        pendingFunctionCalls.push({
                            name: part.functionCall.name,
                            id: part.functionCall.id,
                            args: part.functionCall.args || {},
                            thoughtSignature: part.thoughtSignature
                        })
                    }
                }

                if (part.text) {
                    chunkText += part.text
                }
            }

            // Fallback for text if not found in parts (legacy/safety)
            if (!chunkText && typeof chunkAny.text === 'function') {
                chunkText = chunkAny.text()
            } else if (!chunkText && typeof chunkAny.text === 'string') {
                chunkText = chunkAny.text
            }

            if (chunkText) {
                fullResponse += chunkText
                // Call the streaming callback if provided
                if (onChunk) {
                    onChunk(fullResponse)
                }
            }
        }

        // Handle function calls in a loop (Gemini may request multiple rounds)
        const MAX_FUNCTION_CALL_ROUNDS = 5
        let currentRound = 0
        let conversationHistory: any[] = [
            {
                role: 'user',
                parts: parts
            }
        ]

        while (pendingFunctionCalls.length > 0 && mcpTools.length > 0 && currentRound < MAX_FUNCTION_CALL_ROUNDS) {
            currentRound++
            console.log(`[GeminiService] Function call round ${currentRound}: Executing ${pendingFunctionCalls.length} function call(s)`)

            // Execute each function call
            const functionResults: Array<{ name: string; id?: string; response: unknown }> = []
            for (const fc of pendingFunctionCalls) {
                if (onChunk) {
                    onChunk(fullResponse + `\n\n🔧 *도구 실행 중: ${fc.name}...*`)
                }
                const result = await executeMCPTool(fc.name, fc.args, mcpTools)
                console.log(`[GeminiService] Tool ${fc.name} result:`, result.success ? 'success' : result.error)
                functionResults.push({
                    name: fc.name,
                    id: fc.id,
                    response: result.success ? result.result : { error: result.error }
                })
            }

            // Add function call and response to conversation history
            conversationHistory.push({
                role: 'model',
                parts: pendingFunctionCalls.map(fc => {
                    const part: any = {
                        functionCall: { name: fc.name, args: fc.args }
                    }
                    if (fc.id) {
                        part.functionCall.id = fc.id
                    }
                    if (fc.thoughtSignature) {
                        part.thoughtSignature = fc.thoughtSignature
                    }
                    return part
                })
            })
            conversationHistory.push({
                role: 'user',
                parts: functionResults.map(fr => {
                    const part: any = {
                        functionResponse: {
                            name: fr.name,
                            response: { output: fr.response }
                        }
                    }
                    if (fr.id) {
                        part.functionResponse.id = fr.id
                    }
                    return part
                })
            })

            // Reset for next round
            pendingFunctionCalls = []
            fullResponse = ''

            // Send function results back to Gemini
            // @ts-ignore
            const followUpStream = await client.models.generateContentStream({
                model: selectedModel,
                contents: conversationHistory,
                config: tools.length > 0 ? { tools } : undefined
            })

            // Process the follow-up response
            for await (const chunk of followUpStream) {
                if (signal?.aborted) {
                    throw new DOMException('Aborted', 'AbortError')
                }

                const chunkAny = chunk as any
                let chunkText = ''

                // Check parts for text and more function calls
                const responseParts = chunkAny.candidates?.[0]?.content?.parts || []
                for (const part of responseParts) {
                    // Check for additional function calls
                    if (part.functionCall) {
                        console.log('[GeminiService] Additional function call detected:', part.functionCall.name)
                        const existingIndex = pendingFunctionCalls.findIndex(fc => fc.name === part.functionCall.name)
                        if (existingIndex !== -1) {
                            pendingFunctionCalls[existingIndex].args = part.functionCall.args || pendingFunctionCalls[existingIndex].args
                            if (part.thoughtSignature) {
                                pendingFunctionCalls[existingIndex].thoughtSignature = part.thoughtSignature
                            }
                            if (part.functionCall.id) {
                                pendingFunctionCalls[existingIndex].id = part.functionCall.id
                            }
                        } else {
                            pendingFunctionCalls.push({
                                name: part.functionCall.name,
                                id: part.functionCall.id,
                                args: part.functionCall.args || {},
                                thoughtSignature: part.thoughtSignature
                            })
                        }
                    }

                    if (part.text) {
                        chunkText += part.text
                    }
                }

                if (chunkText) {
                    fullResponse += chunkText
                    if (onChunk) {
                        onChunk(fullResponse)
                    }
                }
            }
        }

        if (currentRound >= MAX_FUNCTION_CALL_ROUNDS) {
            console.warn('[GeminiService] Max function call rounds reached, stopping.')
            fullResponse += '\n\n⚠️ *최대 도구 호출 횟수에 도달했습니다.*'
        }

        return fullResponse
    } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
            throw new DOMException('Aborted', 'AbortError')
        }
        console.error('Gemini API error:', error)
        throw error
    }
}
