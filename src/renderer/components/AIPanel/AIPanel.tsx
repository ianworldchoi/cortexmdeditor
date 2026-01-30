import { useState, useRef, useEffect } from 'react'
import { Settings, X, FileText, Library, Send, ArrowRight, Zap, Sparkles, Plus, Check, Edit3, Trash2, File, Folder, History, MoreHorizontal, Paperclip, Globe, Square } from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'
import { useAIStore, type AIModel, type AIAttachment } from '../../stores/aiStore'
import SessionHistoryModal from './SessionHistoryModal'
import { useEditorStore, parseContentToBlocks } from '../../stores/editorStore'
import { sendMessage } from '../../services/geminiService'
import SettingsModal from '../Settings/SettingsModal'
import MentionDropdown, { type MentionedItem } from './MentionDropdown'
import type { Block, BlockType, PendingDiff, Document } from '@shared/types'
import { useDiffStore } from '../../stores/diffStore'
import ReviewChangesModal from './ReviewChangesModal'
import Button from '../common/Button'
import { convertActionsToDiffs } from './diffHelpers'
import AIMarkdown from './AIMarkdown'
import CompactDiffCard from './CompactDiffCard'
import { useMultiFileDiff } from './useMultiFileDiff'

const MODEL_OPTIONS: { value: AIModel; label: string; icon: React.ReactNode }[] = [
    { value: 'gemini-3-flash-preview', label: 'Flash', icon: <Zap size={12} /> },
    { value: 'gemini-3-pro-preview', label: 'Pro', icon: <Sparkles size={12} /> }
]

interface AIAction {
    type: 'update' | 'insert' | 'delete' | 'create_file' | 'create_folder' | 'update_meta' | 'update_file'
    id?: string
    afterId?: string
    content?: string
    blockType?: BlockType
    path?: string // For file/folder creation AND update_file
    metaField?: 'title' | 'tags' | 'alwaysOn' // For metadata update
    metaValue?: string | string[] | boolean // For metadata update
}

export default function AIPanel() {
    const {
        closePanel,
        sessions,
        activeSessionId,
        createSession,
        addMessage,
        isLoading,
        setLoading,
        apiKey,
        selectedModel,
        setSelectedModel,
        panelWidth,
        setPanelWidth,
        truncateMessagesAfter,
        isPanelOpen,
        webSearchEnabled,
        setWebSearchEnabled,
        selectedTextContext,
        clearSelectedTextContext
    } = useAIStore()
    const { getActiveDocument, editorGroups, activeGroupId, updateDocument, updateDocumentMeta } = useEditorStore()
    const { refreshTree, vaultPath } = useVaultStore()
    const { addDiffs, getDiffsForFile, acceptDiff, rejectDiff, clearDiffsForFile, getAllFileSummaries } = useDiffStore()

    // Multi-file diff handlers (memoized to prevent infinite loops)
    const { handleFileClick, handleApplyFile, handleRejectFile, handleApplyAll, handleRejectAll } = useMultiFileDiff()

    // Get active document for use throughout the component
    const activeDocument = getActiveDocument()

    const [isResizing, setIsResizing] = useState(false)
    const resizeStartXRef = useRef<number | null>(null)
    const resizeStartWidthRef = useRef<number | null>(null)

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing || resizeStartXRef.current === null || resizeStartWidthRef.current === null) return

            const deltaX = resizeStartXRef.current - e.clientX
            // Limit min width to 300px and max to 800px (or window width - sidebar)
            const newWidth = Math.min(Math.max(resizeStartWidthRef.current + deltaX, 300), 800)
            setPanelWidth(newWidth)
        }

        const handleMouseUp = () => {
            setIsResizing(false)
            resizeStartXRef.current = null
            resizeStartWidthRef.current = null
            document.body.style.cursor = 'default'
            document.body.style.userSelect = 'auto'
        }

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
            document.body.style.cursor = 'default'
            document.body.style.userSelect = 'auto'
        }
    }, [isResizing, setPanelWidth])

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault()
        setIsResizing(true)
        resizeStartXRef.current = e.clientX
        resizeStartWidthRef.current = panelWidth
    }

    const stopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        setLoading(false)
    }

    const [input, setInput] = useState('')
    const [showSettings, setShowSettings] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [showReviewModal, setShowReviewModal] = useState(false)
    const [pendingActions, setPendingActions] = useState<AIAction[]>([])
    const [pendingAttachments, setPendingAttachments] = useState<AIAttachment[]>([])
    const [streamingContent, setStreamingContent] = useState('')
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const abortControllerRef = useRef<AbortController | null>(null)

    // Mention dropdown state
    const [showMentionDropdown, setShowMentionDropdown] = useState(false)
    const [mentionQuery, setMentionQuery] = useState('')
    const [mentionedItems, setMentionedItems] = useState<MentionedItem[]>([])
    const mentionStartRef = useRef<number | null>(null)

    // Context chips (active doc + mentioned items)
    interface ContextChip {
        id: string
        type: 'file' | 'folder'
        name: string
        path: string
        icon?: React.ReactNode
    }
    const [contextChips, setContextChips] = useState<ContextChip[]>([])

    // Auto-add active document to context
    useEffect(() => {
        if (activeDocument) {
            const activeChip: ContextChip = {
                id: `active-${activeDocument.filePath}`,
                type: 'file',
                name: activeDocument.filePath.split('/').pop() || 'Untitled',
                path: activeDocument.filePath,
                icon: <FileText size={14} />
            }

            // Only add if not already present
            setContextChips(prev => {
                const exists = prev.some(chip => chip.path === activeDocument.filePath)
                if (!exists) {
                    return [activeChip, ...prev.filter(c => !c.id.startsWith('active-'))]
                }
                return prev
            })
        } else {
            // Remove active document chip if no active doc
            setContextChips(prev => prev.filter(c => !c.id.startsWith('active-')))
        }
    }, [activeDocument])

    // Snapshot for undo functionality
    interface UndoSnapshot {
        blocks: Block[]
        tabId: string
        messageId: string // The assistant message ID that contains the batch-action
    }
    const [undoSnapshots, setUndoSnapshots] = useState<Map<string, UndoSnapshot>>(new Map())

    const activeSession = sessions.find(s => s.id === activeSessionId)

    // Check if active session belongs to current vault
    // If not, treat as no active session (will create new one on message) or show 'New Chat'
    const isSessionInVault = activeSession?.vaultPath === vaultPath || (!activeSession?.vaultPath && !vaultPath) || activeSession?.vaultPath === undefined

    const messages = (activeSession && isSessionInVault) ? activeSession.messages : []
    const sessionTitle = (activeSession && isSessionInVault) ? activeSession.title : 'New Chat'

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Focus input on open
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    // Calculate total vault document count across all groups
    const vaultDocCount = editorGroups.reduce((acc, group) => acc + group.tabs.length, 0)

    const handleSubmit = async () => {
        if ((!input.trim() && pendingAttachments.length === 0 && mentionedItems.length === 0 && !selectedTextContext) || isLoading) return

        if (!apiKey) {
            setShowSettings(true)
            return
        }

        // Build user message with selected text context if present
        let userMessage = input.trim()
        if (selectedTextContext) {
            const contextPrefix = `[Selected Text]\n\`\`\`\n${selectedTextContext.text}\n\`\`\`\n\n`
            userMessage = contextPrefix + userMessage
        }

        const attachmentsToSend = [...pendingAttachments]
        const mentionsToSend = [...mentionedItems]

        setInput('')
        setPendingAttachments([])
        setMentionedItems([])
        clearSelectedTextContext()
        setStreamingContent('')

        addMessage('user', userMessage, attachmentsToSend)
        setLoading(true)

        // Create new AbortController
        const controller = new AbortController()
        abortControllerRef.current = controller

        try {
            const activeDocument = getActiveDocument()
            const response = await sendMessage(
                userMessage,
                activeDocument,
                attachmentsToSend,
                mentionsToSend,
                controller.signal,
                // Streaming callback
                (chunk) => {
                    setStreamingContent(chunk)
                }
            )
            // Clear streaming content and add final message
            setStreamingContent('')
            addMessage('assistant', response)
        } catch (error) {
            setStreamingContent('')
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('Generation aborted by user')
                // If there was streaming content, save it as partial response
                if (streamingContent) {
                    addMessage('assistant', streamingContent + '\n\n*[Generation stopped]*')
                }
            } else {
                addMessage(
                    'assistant',
                    `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`
                )
            }
        } finally {
            setLoading(false)
            abortControllerRef.current = null
        }
    }

    const processFiles = (files: File[]) => {
        for (const file of files) {
            // Support Images and PDFs
            if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
                console.warn('Unsupported file type:', file.type)
                continue
            }

            const reader = new FileReader()
            reader.onload = (event) => {
                const base64String = event.target?.result as string
                const newAttachment: AIAttachment = {
                    id: crypto.randomUUID(),
                    name: file.name,
                    mimeType: file.type,
                    data: base64String
                }
                setPendingAttachments(prev => [...prev, newAttachment])
            }
            reader.readAsDataURL(file)
        }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files)
            processFiles(files)
            // Reset input so same file can be selected again
            e.target.value = ''
        }
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        if (e.clipboardData.files && e.clipboardData.files.length > 0) {
            e.preventDefault()
            const files = Array.from(e.clipboardData.files)
            processFiles(files)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files)
            processFiles(files)
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const [isDragging, setIsDragging] = useState(false)

    const removeAttachment = (id: string) => {
        setPendingAttachments(prev => prev.filter(att => att.id !== id))
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Don't submit if mention dropdown is open (let dropdown handle navigation)
        if (showMentionDropdown) {
            if (e.key === 'Escape') {
                e.preventDefault()
                closeMentionDropdown()
            }
            // Let arrow keys and Enter propagate to dropdown, but prevent default submit
            if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(e.key)) {
                e.preventDefault()
                return
            }
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }

    // Handle input change with @ detection
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value
        const cursorPos = e.target.selectionStart || 0
        setInput(value)

        // Auto-resize
        e.target.style.height = 'auto'
        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'

        // Detect @ trigger
        const textBeforeCursor = value.slice(0, cursorPos)
        const atMatch = textBeforeCursor.match(/@([^\n@]*)?$/)

        if (atMatch) {
            mentionStartRef.current = cursorPos - atMatch[0].length
            setMentionQuery(atMatch[1] || '')
            setShowMentionDropdown(true)
        } else {
            setShowMentionDropdown(false)
            mentionStartRef.current = null
        }
    }

    const handleMentionSelect = (item: MentionedItem) => {
        // Remove the @ trigger from input and add to mentioned items
        if (mentionStartRef.current !== null) {
            const before = input.slice(0, mentionStartRef.current)
            const after = input.slice(inputRef.current?.selectionStart || input.length)
            setInput(before + after)
        }

        // Add to mentioned items (avoid duplicates)
        setMentionedItems(prev => {
            if (prev.some(i => i.path === item.path)) return prev
            return [...prev, item]
        })

        closeMentionDropdown()
        inputRef.current?.focus()
    }

    const closeMentionDropdown = () => {
        setShowMentionDropdown(false)
        setMentionQuery('')
        mentionStartRef.current = null
    }

    const handleMenuSelect = (menuId: 'files' | 'directory') => {
        // Update input to show @files: or @directory:
        if (mentionStartRef.current !== null) {
            const before = input.slice(0, mentionStartRef.current)
            const after = input.slice(inputRef.current?.selectionStart || input.length)
            const newInput = before + `@${menuId}:` + after
            setInput(newInput)
            setMentionQuery(`${menuId}:`)

            // Set cursor position after the colon
            setTimeout(() => {
                if (inputRef.current) {
                    const cursorPos = before.length + menuId.length + 2 // +2 for @ and :
                    inputRef.current.selectionStart = cursorPos
                    inputRef.current.selectionEnd = cursorPos
                    inputRef.current.focus()
                }
            }, 0)
        }
    }

    const removeMentionedItem = (path: string) => {
        setMentionedItems(prev => prev.filter(i => i.path !== path))
    }

    // Remove context chip
    const removeContextChip = (chipId: string) => {
        setContextChips(prev => prev.filter(c => c.id !== chipId))
    }

    // Apply AI-generated content to the active document (Append mode)
    const applyToDocument = (content: string) => {
        const activeGroup = editorGroups.find(g => g.id === activeGroupId)
        const activeTabId = activeGroup?.activeTabId
        const activeDocument = getActiveDocument()

        if (!activeDocument || !activeTabId) return

        // Get current blocks and add new block with the content
        const newBlock: Block = {
            block_id: crypto.randomUUID(),
            type: 'text',
            content: content.trim()
        }

        const updatedBlocks = [...activeDocument.blocks, newBlock]
        updateDocument(activeTabId, updatedBlocks)
    }

    // Dispatch Batch AI Actions (Transactional)
    const dispatchBatchActions = (actions: AIAction[], messageId?: string, skipDiffStore = false) => {
        console.log('Dispatching Batch Actions:', actions)
        const activeDocument = getActiveDocument()
        const activeGroup = editorGroups.find(g => g.id === activeGroupId)
        const activeTabId = activeGroup?.activeTabId

        // Separate document-editing actions from file/folder operations
        const documentEditActions = actions.filter(a =>
            a.type === 'update' || a.type === 'insert' || a.type === 'delete'
        )
        const otherActions = actions.filter(a =>
            a.type !== 'update' && a.type !== 'insert' && a.type !== 'delete'
        )

        // For document edits: Store as diffs instead of applying immediately (unless skipDiffStore)
        if (documentEditActions.length > 0 && !skipDiffStore) {
            if (!activeDocument) {
                console.error('Document edit actions require an active document')
                return
            }

            // Convert AI actions to PendingDiffs
            const pendingDiffs: PendingDiff[] = documentEditActions.map(action => {
                const diff: PendingDiff = {
                    id: crypto.randomUUID(),
                    blockId: action.id || action.afterId || '',
                    type: action.type as 'update' | 'insert' | 'delete',
                    status: 'pending'
                }

                if (action.type === 'update' && action.id) {
                    const oldBlock = activeDocument.blocks.find(b => b.block_id === action.id)
                    diff.oldContent = oldBlock?.content
                    diff.newContent = action.content
                } else if (action.type === 'insert') {
                    diff.newContent = action.content
                    diff.blockType = action.blockType
                } else if (action.type === 'delete' && action.id) {
                    const oldBlock = activeDocument.blocks.find(b => b.block_id === action.id)
                    diff.oldContent = oldBlock?.content
                }

                return diff
            })

            // Store diffs in diffStore
            addDiffs(activeDocument.filePath, pendingDiffs)
            console.log(`Stored ${pendingDiffs.length} diffs for visual review`)
        }

        // For non-document-edit actions: Apply immediately as before
        let modifiedCount = 0
        for (const action of otherActions) {
            if (action.type === 'create_file' && action.path && action.content !== undefined) {
                // Handle file creation
                if (vaultPath) {
                    const fullPath = action.path.startsWith('/') ? action.path : `${vaultPath}/${action.path}`
                    window.api.createFile(fullPath, action.content)
                        .then(() => {
                            console.log(`Created file: ${fullPath}`)
                            refreshTree()
                        })
                        .catch((err: any) => console.error(`Failed to create file: ${fullPath}`, err))
                    modifiedCount++
                }
            } else if (action.type === 'create_folder' && action.path) {
                // Handle folder creation
                if (vaultPath) {
                    const fullPath = action.path.startsWith('/') ? action.path : `${vaultPath}/${action.path}`
                    window.api.createFolder(fullPath)
                        .then(() => {
                            console.log(`Created folder: ${fullPath}`)
                            refreshTree()
                        })
                        .catch((err: any) => console.error(`Failed to create folder: ${fullPath}`, err))
                    modifiedCount++
                }
            } else if (action.type === 'update_meta' && action.metaField && action.metaValue !== undefined && activeTabId) {
                // Handle metadata update
                const metaUpdates: Record<string, any> = {}
                metaUpdates[action.metaField] = action.metaValue
                updateDocumentMeta(activeTabId, metaUpdates)
                modifiedCount++
                console.log(`Updated metadata: ${action.metaField} = ${JSON.stringify(action.metaValue)}`)
            } else if (action.type === 'update_file' && action.path && action.content !== undefined) {
                // Handle file update
                if (vaultPath) {
                    const fullPath = action.path.startsWith('/') ? action.path : `${vaultPath}/${action.path}`
                    window.api.createFile(fullPath, action.content)
                        .then(() => {
                            console.log(`Updated file: ${fullPath}`)
                            refreshTree()
                        })
                        .catch((err: any) => console.error(`Failed to update file: ${fullPath}`, err))
                    modifiedCount++
                }
            }
        }

        if (documentEditActions.length > 0) {
            console.log(`${documentEditActions.length} changes stored as diffs for review`)
        }
        if (modifiedCount > 0) {
            console.log(`Applied ${modifiedCount} non-document changes immediately`)
        }
    }

    // Apply all pending changes directly (for Apply All button)
    const applyAllDiffs = (actions: AIAction[]) => {
        const activeDocument = getActiveDocument()
        const activeGroup = editorGroups.find(g => g.id === activeGroupId)
        const activeTabId = activeGroup?.activeTabId

        if (!activeDocument || !activeTabId) return

        let updatedBlocks = [...activeDocument.blocks]

        for (const action of actions) {
            if (action.type === 'update' && action.id && action.content !== undefined) {
                const index = updatedBlocks.findIndex(b => b.block_id === action.id)
                if (index !== -1) {
                    // Parse the content into blocks
                    const parsedBlocks = parseContentToBlocks(action.content)
                    if (parsedBlocks.length === 1) {
                        updatedBlocks[index] = {
                            ...updatedBlocks[index],
                            content: parsedBlocks[0].content,
                            type: parsedBlocks[0].type
                        }
                    } else {
                        updatedBlocks.splice(index, 1, ...parsedBlocks)
                    }
                }
            } else if (action.type === 'insert' && action.afterId && action.content !== undefined) {
                const index = updatedBlocks.findIndex(b => b.block_id === action.afterId)
                if (index !== -1) {
                    // Parse the content into blocks
                    const parsedBlocks = parseContentToBlocks(action.content)
                    updatedBlocks.splice(index + 1, 0, ...parsedBlocks)
                }
            } else if (action.type === 'delete' && action.id) {
                updatedBlocks = updatedBlocks.filter(b => b.block_id !== action.id)
            }
        }

        updateDocument(activeTabId, updatedBlocks)
        console.log('Applied all changes directly')
    }

    // Handle Undo - restore snapshot and truncate messages
    const handleUndo = (snapshotKey: string) => {
        const snapshot = undoSnapshots.get(snapshotKey)
        if (!snapshot) {
            console.error('Snapshot not found')
            return
        }

        // Show confirmation alert
        const confirmed = window.confirm(
            '되돌리기를 하면 이 메시지 이후의 모든 대화가 삭제됩니다.\n계속하시겠습니까?'
        )

        if (!confirmed) return

        // Restore document to snapshot
        updateDocument(snapshot.tabId, snapshot.blocks)

        // Truncate messages after the message that triggered this action
        // We need to find the user message that preceded the assistant message
        const currentSession = sessions.find(s => s.id === activeSessionId)
        if (currentSession) {
            const messageIndex = currentSession.messages.findIndex(m => m.id === snapshot.messageId)
            if (messageIndex > 0) {
                // Truncate to the user message before the assistant message
                const userMessageId = currentSession.messages[messageIndex - 1].id
                truncateMessagesAfter(userMessageId)
            }
        }

        // Remove the snapshot
        setUndoSnapshots(prev => {
            const newMap = new Map(prev)
            newMap.delete(snapshotKey)
            return newMap
        })

        console.log('Undo completed')
    }

    // Check if a message has been applied (has a snapshot)
    const hasSnapshot = (messageId: string) => undoSnapshots.has(messageId)

    // Extract code from code block
    const extractCodeContent = (code: string): string => {
        return code.trim()
    }
    // ThinkingToggle Component - Collapsible accordion for thinking content
    const ThinkingToggle = ({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) => {
        // Auto-open while streaming, collapse when complete
        const [isOpen, setIsOpen] = useState(isStreaming)
        const contentRef = useRef<HTMLDivElement>(null)

        // Auto-collapse when streaming ends
        useEffect(() => {
            if (!isStreaming && isOpen) {
                setIsOpen(false)
            }
        }, [isStreaming])

        // Auto-scroll to bottom of thinking content
        useEffect(() => {
            if (isOpen && contentRef.current) {
                contentRef.current.scrollTop = contentRef.current.scrollHeight
            }
        }, [content, isOpen])

        return (
            <div className="thinking-toggle">
                <div
                    className="thinking-toggle-header"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <span className={`thinking-toggle-icon ${isOpen ? 'open' : ''}`}>▶</span>
                    <span className="thinking-toggle-label">
                        {isStreaming ? 'Thinking...' : 'Thinking'}
                    </span>
                </div>
                {isOpen && (
                    <div
                        ref={contentRef}
                        className="thinking-toggle-content"
                    >
                        {content}
                    </div>
                )}
            </div>
        )
    }

    // Parse content for thinking sections and render with toggle
    const renderMessageWithThinking = (content: string, messageId: string, isStreaming = false) => {
        // Check if content contains thinking tags
        const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/g)

        if (!thinkingMatch) {
            // Check if streaming and partially has <thinking> but not closed
            const partialThinkingStart = content.indexOf('<thinking>')
            if (isStreaming && partialThinkingStart !== -1 && content.indexOf('</thinking>') === -1) {
                const thinkingContent = content.slice(partialThinkingStart + 10)
                const beforeThinking = content.slice(0, partialThinkingStart)

                return (
                    <>
                        {beforeThinking && <span style={{ whiteSpace: 'pre-wrap' }}>{beforeThinking}</span>}
                        <ThinkingToggle content={thinkingContent} isStreaming={true} />
                    </>
                )
            }

            // No thinking tags, render normally
            return renderMessage(content, messageId)
        }

        // Parse thinking sections and regular content
        const parts: React.ReactNode[] = []
        let lastIndex = 0
        const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g
        let match

        while ((match = thinkingRegex.exec(content)) !== null) {
            // Add content before thinking
            if (match.index > lastIndex) {
                const beforeContent = content.slice(lastIndex, match.index).trim()
                if (beforeContent) {
                    parts.push(
                        <span key={`before-${lastIndex}`} style={{ whiteSpace: 'pre-wrap' }}>
                            {beforeContent}
                        </span>
                    )
                }
            }

            // Add thinking toggle
            parts.push(
                <ThinkingToggle key={`thinking-${match.index}`} content={match[1]} isStreaming={false} />
            )

            lastIndex = match.index + match[0].length
        }

        // Add remaining content after thinking
        if (lastIndex < content.length) {
            const afterContent = content.slice(lastIndex).trim()
            if (afterContent) {
                parts.push(renderMessage(afterContent, messageId))
            }
        }

        return <>{parts}</>
    }

    // Render markdown code blocks with copy and apply buttons
    const renderMessage = (content: string, messageId: string) => {
        // Updated regex to catch batch-action
        const codeBlockRegex = /```(\w+|json:batch-action)?\n([\s\S]*?)\n```/g
        const parts: React.ReactNode[] = []
        let lastIndex = 0
        let match

        while ((match = codeBlockRegex.exec(content)) !== null) {
            // Add text before code block
            if (match.index > lastIndex) {
                parts.push(
                    <AIMarkdown key={lastIndex} content={content.slice(lastIndex, match.index)} />
                )
            }

            const language = match[1] || 'text'
            const code = match[2]

            // Handle Batch AI Action Blocks
            if (language === 'json:batch-action') {
                let actions: AIAction[] = []
                let parseError: string | null = null
                try {
                    let sanitizedCode = code.replace(/^```json\s+/, '').trim()

                    // Multiple attempts to parse with different fixes
                    let parseAttempts = 0
                    let lastError: any = null

                    while (parseAttempts < 4) {
                        try {
                            const parsed = JSON.parse(sanitizedCode)
                            if (Array.isArray(parsed)) {
                                actions = parsed
                            } else {
                                actions = [parsed]
                            }
                            break // Success!
                        } catch (error) {
                            lastError = error
                            parseAttempts++

                            if (parseAttempts === 1) {
                                // Attempt 1: Fix escape sequences
                                sanitizedCode = sanitizedCode.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1')
                            } else if (parseAttempts === 2) {
                                // Attempt 2: Fix unescaped quotes inside content strings
                                // Match "content": "..." and escape inner quotes
                                sanitizedCode = code.replace(/^```json\s+/, '').trim()
                                sanitizedCode = sanitizedCode.replace(
                                    /"content":\s*"([\s\S]*?)"\s*\n\s*\}/g,
                                    (match, content) => {
                                        // Escape unescaped quotes within content
                                        const escaped = content
                                            .replace(/(?<!\\)"/g, '\\"')
                                            .replace(/\n/g, '\\n')
                                        return `"content": "${escaped}"\n  }`
                                    }
                                )
                            } else if (parseAttempts === 3) {
                                // Attempt 3: Try to close incomplete strings
                                const lines = sanitizedCode.split('\n')
                                let fixed = ''
                                let inContent = false

                                for (let i = 0; i < lines.length; i++) {
                                    const line = lines[i]
                                    if (line.includes('"content":')) {
                                        inContent = true
                                    }
                                    fixed += line + '\n'

                                    // If we're at the end and content is not closed
                                    if (i === lines.length - 1 && inContent && !line.includes('}')) {
                                        fixed += '"\n  }\n]'
                                    }
                                }
                                sanitizedCode = fixed
                            } else {
                                // Give up after 4 attempts
                                throw lastError
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Failed to parse AI batch action, showing as raw markdown:', e)
                    parseError = String(e)
                }

                if (actions.length > 0) {
                    // Group actions by file path to count unique files
                    const fileActionGroups = new Map<string, AIAction[]>()

                    for (const action of actions) {
                        if ((action.type === 'update_file' || action.type === 'create_file') && action.path) {
                            if (!fileActionGroups.has(action.path)) {
                                fileActionGroups.set(action.path, [])
                            }
                            fileActionGroups.get(action.path)!.push(action)
                        }
                    }

                    // Check if this is a multi-file update scenario (2+ unique files)
                    const isMultiFileUpdate = fileActionGroups.size >= 2

                    // If 2+ files, use CompactDiffCard
                    if (isMultiFileUpdate) {
                        const fileSummaries: { filePath: string; fileName: string; deletions: number; additions: number; status: 'modified' | 'created' | 'deleted' | 'error' }[] = []

                        for (const [path, fileActions] of fileActionGroups.entries()) {
                            const fileName = path.split('/').pop() || path
                            const hasCreate = fileActions.some(a => a.type === 'create_file')

                            fileSummaries.push({
                                filePath: path,
                                fileName,
                                deletions: 0,
                                additions: 1,
                                status: hasCreate ? 'created' : 'modified'
                            })
                        }

                        // Handler to apply multi-file actions
                        const handleApplyMultiFile = () => {
                            for (const action of actions) {
                                if ((action.type === 'update_file' || action.type === 'create_file') && action.path && action.content !== undefined) {
                                    const fullPath = action.path.startsWith('/') ? action.path : `${vaultPath}/${action.path}`
                                    window.api.createFile(fullPath, action.content)
                                        .then(() => {
                                            console.log(`Applied file: ${fullPath}`)
                                            refreshTree()
                                        })
                                        .catch((err: any) => console.error(`Failed to apply file: ${fullPath}`, err))
                                }
                            }
                        }

                        // Custom file click handler that opens file and stores block-level diffs
                        const handleMultiFileClick = async (filePath: string) => {
                            const action = actions.find(a => a.path === filePath)
                            const fullPath = filePath.startsWith('/') ? filePath : `${vaultPath}/${filePath}`

                            // Open the file first
                            await handleFileClick(filePath)

                            // If we have new content, parse it and create block-level diffs
                            if (action && action.content !== undefined) {
                                // Wait a bit for the file to load in editor
                                setTimeout(() => {
                                    const { editorGroups } = useEditorStore.getState()
                                    // Find the tab with this file
                                    let currentDoc: Document | null = null
                                    for (const group of editorGroups) {
                                        const tab = group.tabs.find(t => t.filePath === fullPath)
                                        if (tab?.document) {
                                            currentDoc = tab.document
                                            break
                                        }
                                    }

                                    if (currentDoc && currentDoc.blocks.length > 0) {
                                        // Parse new content to blocks
                                        const newBlocks = parseContentToBlocks(action.content!)
                                        const diffs: PendingDiff[] = []

                                        // Create proper block-level diffs by comparing
                                        const oldBlocks = currentDoc.blocks
                                        const maxLen = Math.max(oldBlocks.length, newBlocks.length)

                                        for (let i = 0; i < maxLen; i++) {
                                            const oldBlock = oldBlocks[i]
                                            const newBlock = newBlocks[i]

                                            if (oldBlock && newBlock) {
                                                // Both exist - create update diff if content differs
                                                if (oldBlock.content !== newBlock.content) {
                                                    diffs.push({
                                                        id: crypto.randomUUID(),
                                                        blockId: oldBlock.block_id,
                                                        type: 'update',
                                                        status: 'pending',
                                                        oldContent: oldBlock.content,
                                                        newContent: newBlock.content
                                                    })
                                                }
                                            } else if (!oldBlock && newBlock) {
                                                // New block - create insert diff
                                                // Insert after the last old block, with insertIndex for ordering
                                                const afterBlockId = oldBlocks[oldBlocks.length - 1]?.block_id || '__document_start__'
                                                diffs.push({
                                                    id: crypto.randomUUID(),
                                                    blockId: afterBlockId,
                                                    type: 'insert',
                                                    status: 'pending',
                                                    newContent: newBlock.content,
                                                    blockType: newBlock.type,
                                                    insertIndex: i - oldBlocks.length // 0, 1, 2... for ordering multiple inserts
                                                })
                                            } else if (oldBlock && !newBlock) {
                                                // Old block deleted
                                                diffs.push({
                                                    id: crypto.randomUUID(),
                                                    blockId: oldBlock.block_id,
                                                    type: 'delete',
                                                    status: 'pending',
                                                    oldContent: oldBlock.content
                                                })
                                            }
                                        }

                                        if (diffs.length > 0) {
                                            addDiffs(fullPath, diffs)
                                        }
                                    }
                                }, 500) // Wait for document to load
                            }
                        }

                        parts.push(
                            <div key={match.index} className="ai-action-card">
                                <CompactDiffCard
                                    fileSummaries={fileSummaries}
                                    onFileClick={handleMultiFileClick}
                                    onApplyFile={(filePath) => {
                                        const action = actions.find(a => a.path === filePath)
                                        if (action && action.content !== undefined) {
                                            const fullPath = filePath.startsWith('/') ? filePath : `${vaultPath}/${filePath}`
                                            window.api.createFile(fullPath, action.content)
                                                .then(() => {
                                                    console.log(`Applied file: ${fullPath}`)
                                                    clearDiffsForFile(fullPath) // Clear diff after applying
                                                    refreshTree()
                                                })
                                                .catch((err: any) => console.error(`Failed to apply file: ${fullPath}`, err))
                                        }
                                    }}
                                    onRejectFile={(filePath) => {
                                        const fullPath = filePath.startsWith('/') ? filePath : `${vaultPath}/${filePath}`
                                        clearDiffsForFile(fullPath)
                                    }}
                                    onApplyAll={handleApplyMultiFile}
                                    onRejectAll={() => {
                                        // Clear all diffs for these files
                                        for (const summary of fileSummaries) {
                                            const fullPath = summary.filePath.startsWith('/') ? summary.filePath : `${vaultPath}/${summary.filePath}`
                                            clearDiffsForFile(fullPath)
                                        }
                                    }}
                                    isApplied={hasSnapshot(messageId)}
                                    onUndo={hasSnapshot(messageId) ? () => handleUndo(messageId) : undefined}
                                />
                            </div>
                        )
                    } else {
                        // Single-document edit scenario - use verbose display
                        parts.push(
                            <div key={match.index} className="ai-action-card">
                                <div className="ai-action-header">
                                    <span>Suggested Changes ({actions.length})</span>
                                </div>
                                <div className="ai-action-content">
                                    {actions.map((action, i) => {
                                        // Handle File/Folder Creation
                                        if (action.type === 'create_file' || action.type === 'create_folder') {
                                            return (
                                                <div key={i} className={`ai-diff-item ${action.type}`}>
                                                    <div className="ai-diff-header">
                                                        {action.type === 'create_file' ? <File size={12} /> : <Folder size={12} />}
                                                        <span className="ai-diff-type">{action.type.replace('_', ' ').toUpperCase()}</span>
                                                    </div>
                                                    <div className="ai-diff-body">
                                                        <div className="ai-diff-new" style={{ fontWeight: 600 }}>{action.path}</div>
                                                        {action.type === 'create_file' && (
                                                            <div className="ai-diff-new" style={{ fontSize: '10px', opacity: 0.8 }}>
                                                                {action.content?.slice(0, 100)}
                                                                {(action.content?.length || 0) > 100 ? '...' : ''}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        }

                                        // Handle Metadata Updates
                                        if (action.type === 'update_meta') {
                                            return (
                                                <div key={i} className="ai-diff-item update_meta">
                                                    <div className="ai-diff-header">
                                                        <Settings size={12} />
                                                        <span className="ai-diff-type">UPDATE META</span>
                                                    </div>
                                                    <div className="ai-diff-body">
                                                        <div className="ai-diff-new">
                                                            <strong>{action.metaField}</strong>: {JSON.stringify(action.metaValue)}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        // Handle File Updates (modify existing files by path)
                                        if (action.type === 'update_file') {
                                            return (
                                                <div key={i} className="ai-diff-item update_file">
                                                    <div className="ai-diff-header">
                                                        <Edit3 size={12} />
                                                        <span className="ai-diff-type">UPDATE FILE</span>
                                                    </div>
                                                    <div className="ai-diff-body">
                                                        <div className="ai-diff-new" style={{ fontWeight: 600 }}>{action.path}</div>
                                                        <div className="ai-diff-new" style={{ fontSize: '10px', opacity: 0.8, maxHeight: 80, overflow: 'hidden' }}>
                                                            {action.content?.slice(0, 200)}
                                                            {(action.content?.length || 0) > 200 ? '...' : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        // Handle Document Edits (Update, Insert, Delete)
                                        const oldBlock = activeDocument?.blocks.find(b => b.block_id === action.id)

                                        return (
                                            <div key={i} className={`ai-diff-item ${action.type}`}>
                                                <div className="ai-diff-header">
                                                    {action.type === 'update' && <Edit3 size={12} />}
                                                    {action.type === 'insert' && <Plus size={12} />}
                                                    {action.type === 'delete' && <Trash2 size={12} />}
                                                    <span className="ai-diff-type">{action.type.toUpperCase()}</span>
                                                    {action.type === 'update' && <span className="ai-diff-id">ID: {action.id?.slice(0, 8)}...</span>}
                                                </div>

                                                {action.type === 'update' && (
                                                    <div className="ai-diff-body">
                                                        {oldBlock && (
                                                            <div className="ai-diff-old">
                                                                {oldBlock.content.length > 50 ? oldBlock.content.slice(0, 50) + '...' : oldBlock.content}
                                                            </div>
                                                        )}

                                                        <div className="ai-diff-new">{action.content}</div>
                                                    </div>
                                                )}

                                                {action.type === 'insert' && (
                                                    <div className="ai-diff-body">
                                                        <div className="ai-diff-new">{action.content}</div>
                                                    </div>
                                                )}

                                                {action.type === 'delete' && oldBlock && (
                                                    <div className="ai-diff-body">
                                                        <div className="ai-diff-old" style={{ textDecoration: 'line-through' }}>
                                                            {oldBlock.content}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                                <div className="ai-action-footer">
                                    {hasSnapshot(messageId) ? (
                                        <button
                                            className="ai-action-undo-btn"
                                            onClick={() => handleUndo(messageId)}
                                        >
                                            ↩ Undo Changes
                                        </button>
                                    ) : (
                                        <div className="ai-action-group">
                                            <Button
                                                variant="default"
                                                onClick={() => {
                                                    const diffsToReview = convertActionsToDiffs(actions, activeDocument)
                                                    console.log('Review Changes clicked - adding inline diffs', { actions, diffsToReview })

                                                    if (activeDocument) {
                                                        // Add diffs to store - editor will render inline
                                                        addDiffs(activeDocument.filePath, diffsToReview)
                                                    }
                                                    // No modal - diffs will be shown inline in editor
                                                }}
                                                style={{ flex: 1 }}
                                            >
                                                Review Changes
                                            </Button>
                                            <Button
                                                variant="primary"
                                                onClick={() => {
                                                    applyAllDiffs(actions)
                                                    // Clear any pending diffs for this file to prevent duplicates
                                                    if (activeDocument) {
                                                        clearDiffsForFile(activeDocument.filePath)
                                                    }
                                                    dispatchBatchActions(actions, messageId, true) // skipDiffStore=true for Apply All
                                                }}
                                                style={{ flex: 1 }}
                                            >
                                                <Check size={12} /> Apply All
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div >
                        )
                    } // End of if/else for hasMultiFileUpdates
                } else {
                    // Parse failed - show raw JSON as copyable code block
                    parts.push(
                        <div key={match.index} className="code-block-wrapper">
                            <div className="code-block-header">
                                <span style={{ color: 'var(--color-warning)' }}>⚠️ JSON Parse Error</span>
                                <button
                                    className="code-copy-btn"
                                    onClick={() => navigator.clipboard.writeText(code)}
                                >
                                    Copy Raw
                                </button>
                            </div>
                            <pre className="code-block-content" style={{ maxHeight: 200, overflow: 'auto' }}>
                                <code>{code}</code>
                            </pre>
                        </div>
                    )
                }
            } else {
                // Standard Code Block
                parts.push(
                    <div key={match.index} className="code-block-wrapper">
                        <div className="code-block-header">
                            <span>{language}</span>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                    className="code-copy-btn"
                                    onClick={() => navigator.clipboard.writeText(code)}
                                >
                                    Copy
                                </button>
                                {activeDocument && (
                                    <button
                                        className="code-apply-btn"
                                        onClick={() => applyToDocument(extractCodeContent(code))}
                                        title="Add to document"
                                    >
                                        <Plus size={12} />
                                        Apply
                                    </button>
                                )}
                            </div>
                        </div>
                        <pre className="code-block-content">
                            <code>{code}</code>
                        </pre>
                    </div>
                )
            }

            lastIndex = match.index + match[0].length
        }

        // Add remaining text
        if (lastIndex < content.length) {
            parts.push(
                <AIMarkdown key={lastIndex} content={content.slice(lastIndex)} />
            )
        }

        return parts.length > 0 ? parts : <AIMarkdown content={content} />
    }

    return (
        <>
            <div
                className="ai-panel"
                style={{
                    width: isPanelOpen ? panelWidth : 0,
                    borderLeftWidth: isPanelOpen ? '0.5px' : '0px',
                    margin: 0,
                    padding: 0,
                    position: 'relative' // Needed for overlay if we used one, but also good for boundary
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Drag Overlay */}
                {isDragging && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'var(--color-bg-primary)',
                        opacity: 0.9,
                        zIndex: 100,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none' // Let events pass through to handle drop on parent
                    }}>
                        <div style={{
                            border: '2px dashed var(--color-accent)',
                            borderRadius: 'var(--radius-md)',
                            padding: '40px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '12px',
                            color: 'var(--color-accent)'
                        }}>
                            <Plus size={48} />
                            <span style={{ fontWeight: 600 }}>Drop files here</span>
                        </div>
                    </div>
                )}
                {/* Resize Handle */}
                <div
                    className="ai-panel-resize-handle"
                    onMouseDown={handleResizeStart}
                />

                <div className="ai-panel-header titlebar-drag-region">
                    <span className="ai-panel-title" title={sessionTitle}>{sessionTitle}</span>
                    <div className="titlebar-no-drag" style={{ display: 'flex', gap: 4 }}>
                        <button
                            className="ai-panel-action"
                            onClick={() => createSession()}
                            title="New Chat"
                        >
                            <Plus size={16} />
                        </button>
                        <button
                            className="ai-panel-action"
                            onClick={() => setShowHistory(true)}
                            title="History"
                        >
                            <History size={16} />
                        </button>
                        <button
                            className="ai-panel-action"
                            onClick={() => setShowSettings(true)}
                            title="Settings"
                        >
                            <MoreHorizontal size={16} />
                        </button>
                        <button
                            className="ai-panel-action"
                            onClick={closePanel}
                            title="Close (⌘E)"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>



                {/* Messages */}
                <div className="ai-messages" style={{ flex: 1, overflowY: 'auto' }}>
                    {messages.length === 0 && (
                        <div
                            style={{
                                textAlign: 'center',
                                color: 'var(--color-text-tertiary)',
                                padding: 'var(--space-8)'
                            }}
                        >
                            <p style={{ marginBottom: 8 }}>Hi! I'm your AI assistant.</p>
                            <p style={{ fontSize: 'var(--text-sm)' }}>
                                Hi.
                            </p>
                        </div>
                    )}

                    {messages.map((message) => (
                        <div key={message.id} className={`ai-message ${message.role}`}>
                            <div className="ai-message-content">
                                {message.attachments && message.attachments.length > 0 && (
                                    <div className="ai-message-attachments">
                                        {message.attachments.map(att => (
                                            <div key={att.id} className="attachment-chip">
                                                {att.mimeType.startsWith('image/') ? (
                                                    <img src={att.data} alt={att.name} className="attachment-thumb" />
                                                ) : (
                                                    <FileText size={14} />
                                                )}
                                                <span className="attachment-name">{att.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {message.role === 'assistant'
                                    ? renderMessageWithThinking(message.content, message.id, false)
                                    : message.content}
                            </div>
                        </div>
                    ))}

                    {/* Streaming content display */}
                    {isLoading && streamingContent && (
                        <div className="ai-message assistant">
                            <div className="ai-message-content">
                                {renderMessageWithThinking(streamingContent, 'streaming', true)}
                            </div>
                        </div>
                    )}

                    {/* Shimmer loading indicator when no streaming content yet */}
                    {isLoading && !streamingContent && (
                        <div className="ai-message assistant">
                            <div className="ai-message-content">
                                <span className="shimmer-text">Thinking...</span>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="ai-input-area">
                    {!apiKey && (
                        <div
                            style={{
                                marginBottom: 8,
                                padding: '8px 12px',
                                background: 'var(--color-warning)',
                                color: 'white',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: 'var(--text-sm)',
                                cursor: 'pointer'
                            }}
                            onClick={() => setShowSettings(true)}
                        >
                            ⚠️ Set your Gemini API key to start chatting
                        </div>
                    )}

                    {/* Pending Attachments Preview */}
                    {pendingAttachments.length > 0 && (
                        <div className="pending-attachments" style={{ marginBottom: 8 }}>
                            {pendingAttachments.map(att => (
                                <div key={att.id} className="pending-attachment">
                                    <span className="attachment-name">{att.name}</span>
                                    <button onClick={() => removeAttachment(att.id)} className="remove-btn">
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Mentioned Items Tags */}
                    {mentionedItems.length > 0 && (
                        <div className="mentioned-items" style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 6,
                            marginBottom: 8
                        }}>
                            {mentionedItems.map(item => (
                                <div
                                    key={item.path}
                                    className="mentioned-tag"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '4px 8px',
                                        background: 'var(--color-accent-alpha)',
                                        border: '1px solid var(--color-accent)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: 'var(--text-xs)',
                                        color: 'var(--color-accent)'
                                    }}
                                >
                                    {item.type === 'file' ? <FileText size={12} /> : <Folder size={12} />}
                                    <span>{item.name}</span>
                                    <button
                                        onClick={() => removeMentionedItem(item.path)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: 0,
                                            display: 'flex',
                                            color: 'inherit'
                                        }}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Unified Input Container */}
                    <div className="ai-input-container"
                        style={{
                            border: `1px solid ${isDragging ? 'var(--color-accent)' : 'var(--color-border)'}`,

                            background: isDragging ? 'var(--color-bg-secondary)' : 'var(--color-bg-primary)',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                            transition: 'all 0.2s ease',
                        }}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        {/* Mention Dropdown */}
                        {showMentionDropdown && (
                            <MentionDropdown
                                query={mentionQuery}
                                onSelect={handleMentionSelect}
                                onMenuSelect={handleMenuSelect}
                                onClose={closeMentionDropdown}
                                inputRef={inputRef}
                            />
                        )}

                        {/* Context Chips */}
                        {contextChips.length > 0 && (
                            <div className="ai-context-chip-container">
                                {contextChips.map(chip => (
                                    <div key={chip.id} className="ai-context-chip">
                                        {chip.icon}
                                        <div className="ai-context-chip-content">
                                            <span className="ai-context-chip-name">{chip.name}</span>
                                            {chip.path && (
                                                <span className="ai-context-chip-path">{chip.path}</span>
                                            )}
                                        </div>
                                        <button
                                            className="ai-context-chip-remove"
                                            onClick={() => removeContextChip(chip.id)}
                                            title="Remove"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Selected Text Chip */}
                        {selectedTextContext && (
                            <div className="ai-selected-text-chip-container" style={{
                                padding: '0 12px 8px',
                            }}>
                                <div className="ai-selected-text-chip" style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    maxWidth: '100%',
                                    padding: '4px 8px',
                                    background: 'var(--color-bg-tertiary)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--color-text-secondary)',
                                }}>
                                    <span style={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        maxWidth: 200,
                                    }}>
                                        "{selectedTextContext.text}"
                                    </span>
                                    <button
                                        onClick={clearSelectedTextContext}
                                        style={{
                                            flexShrink: 0,
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: 0,
                                            display: 'flex',
                                            color: 'var(--color-text-tertiary)',
                                        }}
                                        title="Remove"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 1. Text Input */}
                        <textarea
                            ref={inputRef}
                            className="ai-input-unified"
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            placeholder="Ask anything, @ to mention"
                            rows={1}
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                border: 'none',
                                background: 'transparent',
                                resize: 'none',
                                outline: 'none',
                                minHeight: '44px',
                                maxHeight: '200px',
                                lineHeight: '1.5',
                                fontSize: 'var(--text-sm)'
                            }}
                        />

                        <div className="ai-input-toolbar">
                            <div className="ai-toolbar-left">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={handleFileSelect}
                                    multiple
                                    accept="image/*,application/pdf"
                                />
                                <button
                                    className="ai-toolbar-btn"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Add Attachment"
                                    style={{ padding: 4, color: 'var(--color-text-tertiary)', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                >
                                    <Plus size={16} />
                                </button>
                                <div style={{ width: 1, height: 16, background: 'var(--color-divider)', margin: '0 4px' }} />
                                {/* Web Search Toggle */}
                                <button
                                    onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                                    title={webSearchEnabled ? 'Web Search Enabled' : 'Enable Web Search'}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 4,
                                        borderRadius: 4,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: webSearchEnabled ? 'var(--color-accent-alpha)' : 'transparent',
                                        color: webSearchEnabled ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Globe size={16} />
                                </button>
                                <div style={{ width: 1, height: 16, background: 'var(--color-divider)', margin: '0 4px' }} />
                                {/* Simple Model Selector Trigger (Dropdown logic can be added later or simple toggle) */}
                                <div
                                    className="ai-model-trigger"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        fontSize: 'var(--text-xs)',
                                        color: 'var(--color-text-secondary)',
                                        cursor: 'pointer',
                                        padding: '4px 8px',
                                        borderRadius: 4,
                                        // user might want a dropdown, for now specific selection logic is simplified or cycles
                                    }}
                                    onClick={() => {
                                        // Cycle models for now or open a simple menu
                                        const nextModel = selectedModel === 'gemini-3-flash-preview' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview'
                                        setSelectedModel(nextModel)
                                    }}
                                >
                                    {selectedModel === 'gemini-3-flash-preview' ? <Zap size={14} /> : <Sparkles size={14} />}
                                    <span>{selectedModel === 'gemini-3-flash-preview' ? 'Gemini 3 Flash' : 'Gemini 3 Pro'}</span>
                                </div>
                            </div>

                            <div className="ai-toolbar-right">
                                <button
                                    className={`ai-send-btn-unified ${isLoading ? 'loading' : ''}`}
                                    onClick={isLoading ? stopGeneration : handleSubmit}
                                    disabled={!isLoading && (!input.trim() && pendingAttachments.length === 0)}
                                >
                                    {isLoading ? (
                                        <Square size={12} fill="white" />
                                    ) : (
                                        <ArrowRight size={16} />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>


                </div>
            </div>

            {
                showSettings && (
                    <SettingsModal onClose={() => setShowSettings(false)} />
                )
            }
            {
                showHistory && (
                    <SessionHistoryModal onClose={() => setShowHistory(false)} />
                )
            }
            {
                showReviewModal && activeDocument && (
                    <ReviewChangesModal
                        isOpen={showReviewModal}
                        onClose={() => setShowReviewModal(false)}
                        diffs={getDiffsForFile(activeDocument.filePath)}
                        onAcceptDiff={(diffId) => {
                            const diff = acceptDiff(activeDocument.filePath, diffId)
                            if (diff && activeDocument) {
                                const activeGroup = editorGroups.find(g => g.id === activeGroupId)
                                const activeTabId = activeGroup?.activeTabId
                                if (!activeTabId) return

                                let updatedBlocks = [...activeDocument.blocks]

                                if (diff.type === 'update' && diff.blockId && diff.newContent !== undefined) {
                                    const index = updatedBlocks.findIndex(b => b.block_id === diff.blockId)
                                    if (index !== -1) {
                                        // Parse the new content into blocks
                                        const parsedBlocks = parseContentToBlocks(diff.newContent)
                                        if (parsedBlocks.length === 1) {
                                            // Single block: just update content
                                            updatedBlocks[index] = {
                                                ...updatedBlocks[index],
                                                content: parsedBlocks[0].content,
                                                type: parsedBlocks[0].type
                                            }
                                        } else {
                                            // Multiple blocks: replace the target block with parsed blocks
                                            updatedBlocks.splice(index, 1, ...parsedBlocks)
                                        }
                                    }
                                } else if (diff.type === 'insert' && diff.blockId && diff.newContent !== undefined) {
                                    const index = updatedBlocks.findIndex(b => b.block_id === diff.blockId)
                                    if (index !== -1) {
                                        // Parse the new content into blocks
                                        const parsedBlocks = parseContentToBlocks(diff.newContent)
                                        updatedBlocks.splice(index + 1, 0, ...parsedBlocks)
                                    }
                                } else if (diff.type === 'delete' && diff.blockId) {
                                    updatedBlocks = updatedBlocks.filter(b => b.block_id !== diff.blockId)
                                }

                                updateDocument(activeTabId, updatedBlocks)
                            }
                        }}
                        onRejectDiff={(diffId) => {
                            if (activeDocument) {
                                rejectDiff(activeDocument.filePath, diffId)
                            }
                        }}
                        onApplyAll={() => {
                            if (activeDocument) {
                                applyAllDiffs(pendingActions)
                                clearDiffsForFile(activeDocument.filePath)
                            }
                        }}
                    />
                )
            }
        </>
    )
}

