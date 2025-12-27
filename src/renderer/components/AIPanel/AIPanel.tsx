import { useState, useRef, useEffect } from 'react'
import { Settings, X, FileText, Library, Send, Zap, Sparkles, Plus, Check, Edit3, Trash2, File, Folder, History, MoreHorizontal, Paperclip } from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'
import { useAIStore, type AIModel, type AIAttachment } from '../../stores/aiStore'
import SessionHistoryModal from './SessionHistoryModal'
import { useEditorStore } from '../../stores/editorStore'
import { sendMessage } from '../../services/geminiService'
import SettingsModal from '../Settings/SettingsModal'
import type { Block, BlockType } from '@shared/types'

const MODEL_OPTIONS: { value: AIModel; label: string; icon: React.ReactNode }[] = [
    { value: 'gemini-3-flash-preview', label: 'Flash', icon: <Zap size={12} /> },
    { value: 'gemini-3-pro-preview', label: 'Pro', icon: <Sparkles size={12} /> }
]

interface AIAction {
    type: 'update' | 'insert' | 'delete' | 'create_file' | 'create_folder' | 'update_meta'
    id?: string
    afterId?: string
    content?: string
    blockType?: BlockType
    path?: string // For file/folder creation
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
        truncateMessagesAfter
    } = useAIStore()
    const { getActiveDocument, editorGroups, activeGroupId, updateDocument, updateDocumentMeta } = useEditorStore()
    const { refreshTree, vaultPath } = useVaultStore()

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

    const [input, setInput] = useState('')
    const [showSettings, setShowSettings] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [pendingAttachments, setPendingAttachments] = useState<AIAttachment[]>([])
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

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
        if ((!input.trim() && pendingAttachments.length === 0) || isLoading) return

        if (!apiKey) {
            setShowSettings(true)
            return
        }

        const userMessage = input.trim()
        const attachmentsToSend = [...pendingAttachments]

        setInput('')
        setPendingAttachments([])

        addMessage('user', userMessage, attachmentsToSend)
        setLoading(true)

        try {
            const activeDocument = getActiveDocument() // Ensure activeDocument is available here
            const response = await sendMessage(userMessage, activeDocument, attachmentsToSend)
            addMessage('assistant', response)
        } catch (error) {
            addMessage(
                'assistant',
                `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`
            )
        } finally {
            setLoading(false)
        }
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files)

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
            // Reset input so same file can be selected again
            e.target.value = ''
        }
    }

    const removeAttachment = (id: string) => {
        setPendingAttachments(prev => prev.filter(att => att.id !== id))
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
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
    const dispatchBatchActions = (actions: AIAction[], messageId?: string) => {
        console.log('Dispatching Batch Actions:', actions)
        const activeDocument = getActiveDocument()
        const activeGroup = editorGroups.find(g => g.id === activeGroupId)
        const activeTabId = activeGroup?.activeTabId

        // Check if there are document-editing actions that require an active document
        const hasDocumentEditActions = actions.some(a =>
            a.type === 'update' || a.type === 'insert' || a.type === 'delete'
        )

        if (hasDocumentEditActions && !activeDocument) {
            console.error('Document edit actions require an active document')
            return
        }

        // Save snapshot for undo (only if we have a document and editing it)
        if (messageId && activeDocument && activeTabId && hasDocumentEditActions) {
            const snapshot: UndoSnapshot = {
                blocks: [...activeDocument.blocks],
                tabId: activeTabId,
                messageId: messageId
            }
            setUndoSnapshots(prev => new Map(prev).set(messageId, snapshot))
        }

        let updatedBlocks = activeDocument ? [...activeDocument.blocks] : []
        let modifiedCount = 0
        let documentModified = false

        // Apply actions sequentially
        for (const action of actions) {
            if (action.type === 'update' && action.id && action.content !== undefined && activeDocument) {
                const index = updatedBlocks.findIndex(b => b.block_id === action.id)
                if (index !== -1) {
                    updatedBlocks[index] = { ...updatedBlocks[index], content: action.content }
                    modifiedCount++
                    documentModified = true
                } else {
                    console.warn(`Update failed: Block ${action.id} not found`)
                }
            } else if (action.type === 'insert' && action.afterId && action.content !== undefined && activeDocument) {
                const index = updatedBlocks.findIndex((b) => b.block_id === action.afterId)
                if (index !== -1) {
                    const newBlock: Block = {
                        block_id: crypto.randomUUID(),
                        type: action.blockType || 'text',
                        content: action.content
                    }
                    updatedBlocks.splice(index + 1, 0, newBlock)
                    modifiedCount++
                    documentModified = true
                } else {
                    console.warn(`Insert failed: Block ${action.afterId} not found`)
                }
            } else if (action.type === 'delete' && action.id && activeDocument) {
                const initialLen = updatedBlocks.length
                updatedBlocks = updatedBlocks.filter((b) => b.block_id !== action.id)
                if (updatedBlocks.length < initialLen) {
                    modifiedCount++
                    documentModified = true
                }
            } else if (action.type === 'create_file' && action.path && action.content !== undefined) {
                // Handle file creation - works WITHOUT active document!
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
                // Handle folder creation - works WITHOUT active document!
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
                // Handle metadata update - requires active document
                const metaUpdates: Record<string, any> = {}
                metaUpdates[action.metaField] = action.metaValue
                updateDocumentMeta(activeTabId, metaUpdates)
                modifiedCount++
                console.log(`Updated metadata: ${action.metaField} = ${JSON.stringify(action.metaValue)}`)
            }
        }

        // Only update document if we actually modified blocks
        if (documentModified && activeTabId) {
            updateDocument(activeTabId, updatedBlocks)
        }

        if (modifiedCount > 0) {
            console.log(`Applied ${modifiedCount} changes successfully`)
        } else {
            console.warn('No changes were applied')
        }
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

    // Render markdown code blocks with copy and apply buttons
    const renderMessage = (content: string, messageId: string) => {
        // Updated regex to catch batch-action
        const codeBlockRegex = /```(\w+|json:batch-action)?\n([\s\S]*?)```/g
        const parts: React.ReactNode[] = []
        let lastIndex = 0
        let match

        while ((match = codeBlockRegex.exec(content)) !== null) {
            // Add text before code block
            if (match.index > lastIndex) {
                parts.push(
                    <span key={lastIndex} style={{ whiteSpace: 'pre-wrap' }}>
                        {content.slice(lastIndex, match.index)}
                    </span>
                )
            }

            const language = match[1] || 'text'
            const code = match[2]

            // Handle Batch AI Action Blocks
            if (language === 'json:batch-action') {
                let actions: AIAction[] = []
                try {
                    const sanitizedCode = code.replace(/```json/g, '').replace(/```/g, '').trim()
                    const parsed = JSON.parse(sanitizedCode)
                    if (Array.isArray(parsed)) {
                        actions = parsed
                    } else {
                        // Handle legacy single object case just in case
                        actions = [parsed]
                    }
                } catch (e) {
                    console.error('Failed to parse AI batch action', e)
                }

                if (actions.length > 0) {
                    parts.push(
                        <div key={match.index} className="ai-action-card">
                            <div className="ai-action-header">
                                <Sparkles size={14} />
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
                                                    <div className="ai-diff-arrow">Run ↓</div>
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
                            {hasSnapshot(messageId) ? (
                                <button
                                    className="ai-action-undo-btn"
                                    onClick={() => handleUndo(messageId)}
                                >
                                    ↩ Undo Changes
                                </button>
                            ) : (
                                <button
                                    className="ai-action-apply-btn"
                                    onClick={() => dispatchBatchActions(actions, messageId)}
                                >
                                    <Check size={12} /> Apply All Changes
                                </button>
                            )}
                        </div >
                    )
                } else {
                    parts.push(
                        <div key={match.index} className="code-block-wrapper error">
                            Invalid Batch JSON
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
                <span key={lastIndex} style={{ whiteSpace: 'pre-wrap' }}>
                    {content.slice(lastIndex)}
                </span>
            )
        }

        return parts.length > 0 ? parts : <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>
    }

    return (
        <>
            <style>
                {`
                .ai-action-card {
                    background: var(--color-bg-secondary);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-md);
                    margin: 8px 0;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                .ai-action-header {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 12px;
                    background: var(--color-bg-tertiary);
                    border-bottom: 1px solid var(--color-border);
                    font-size: var(--text-sm);
                    font-weight: 600;
                    color: var(--color-text-primary);
                }
                .ai-action-content {
                    padding: 8px;
                    max-height: 300px;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .ai-diff-item {
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    background: var(--color-bg-primary);
                    padding: 8px;
                    font-size: var(--text-xs);
                }
                .ai-diff-item.update { border-left: 3px solid var(--color-info); }
                .ai-diff-item.insert { border-left: 3px solid var(--color-success); }
                .ai-diff-item.delete { border-left: 3px solid var(--color-danger); }
                .ai-diff-item.create_file { border-left: 3px solid var(--color-accent); }
                .ai-diff-item.create_folder { border-left: 3px solid var(--color-accent); }
                .ai-diff-item.update_meta { border-left: 3px solid #8b5cf6; }
                
                .ai-diff-header {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 6px;
                    color: var(--color-text-secondary);
                    font-weight: 500;
                }
                .ai-diff-type { font-weight: 700; font-size: 10px; }
                .ai-diff-id { margin-left: auto; font-family: monospace; opacity: 0.5; }

                .ai-diff-body {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .ai-diff-old {
                    color: var(--color-text-tertiary);
                    background: rgba(255, 0, 0, 0.05);
                    padding: 4px;
                    border-radius: 2px;
                }
                .ai-diff-new {
                    color: var(--color-text-primary);
                    background: rgba(0, 255, 0, 0.05);
                    padding: 4px;
                    border-radius: 2px;
                    white-space: pre-wrap;
                }
                .ai-diff-arrow {
                    text-align: center;
                    font-size: 10px;
                    color: var(--color-text-tertiary);
                }

                .ai-action-apply-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    width: 100%;
                    padding: 10px;
                    background: var(--color-accent);
                    color: white;
                    border: none;
                    border-top: 1px solid var(--color-border);
                    font-size: var(--text-sm);
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .ai-action-apply-btn:hover {
                    background: var(--color-accent-hover);
                }
                .ai-action-undo-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    width: 100%;
                    padding: 10px;
                    background: #dc2626;
                    color: white;
                    border: none;
                    border-top: 1px solid var(--color-border);
                    font-size: var(--text-sm);
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .ai-action-undo-btn:hover {
                    background: #b91c1c;
                }
                
                .ai-panel-title {
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    margin-right: 8px;
                }

                .ai-panel-action {
                    background: transparent;
                    border: none;
                    color: var(--color-text-tertiary);
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .ai-panel-action:hover {
                    background: var(--color-bg-tertiary);
                    color: var(--color-text-primary);
                }
                .ai-attach-btn {
                    background: transparent;
                    border: none;
                    color: var(--color-text-tertiary);
                    cursor: pointer;
                    padding: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .ai-attach-btn:hover {
                    color: var(--color-text-primary);
                }
                .pending-attachments {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    padding: 0 8px 8px;
                }
                .pending-attachment {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: var(--color-bg-secondary);
                    border: 1px solid var(--color-border);
                    border-radius: 4px;
                    padding: 4px 8px;
                    font-size: 11px;
                }
                .remove-btn {
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    color: var(--color-text-tertiary);
                    padding: 0;
                    display: flex;
                }
                .remove-btn:hover { color: var(--color-danger); }
                
                .ai-message-attachments {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 8px;
                }
                .attachment-chip {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(0,0,0,0.1);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                }
                .attachment-thumb {
                    width: 20px;
                    height: 20px;
                    object-fit: cover;
                    border-radius: 2px;
                }
                `}
            </style>
            <div
                className="ai-panel"
                style={{ width: panelWidth }}
            >
                {/* Resize Handle */}
                <div
                    className="ai-panel-resize-handle"
                    onMouseDown={handleResizeStart}
                />

                <div className="ai-panel-header">
                    <span className="ai-panel-title" title={sessionTitle}>{sessionTitle}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
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

                {/* Context Display */}
                <div className="ai-context">
                    <div className="ai-context-title">Context</div>
                    <div className="ai-context-item">
                        <FileText size={12} />
                        <span>
                            {activeDocument
                                ? `Active: ${activeDocument.meta.title}`
                                : 'No document open'}
                        </span>
                    </div>
                    <div className="ai-context-item">
                        <Library size={12} />
                        <span>{vaultDocCount} documents in session</span>
                    </div>
                </div>

                {/* Messages */}
                <div className="ai-messages">
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
                                Ask me to write content and click "Apply" to add it to your document.
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
                                    ? renderMessage(message.content, message.id)
                                    : message.content}
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="ai-message assistant">
                            <div
                                className="ai-message-content"
                                style={{ display: 'flex', gap: 4 }}
                            >
                                <span style={{ animation: 'pulse 1.5s infinite' }}>●</span>
                                <span style={{ animation: 'pulse 1.5s infinite 0.2s' }}>●</span>
                                <span style={{ animation: 'pulse 1.5s infinite 0.4s' }}>●</span>
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

                    {/* Model Selector */}
                    <div className="ai-model-selector">
                        {MODEL_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                className={`ai-model-btn ${selectedModel === option.value ? 'active' : ''}`}
                                onClick={() => setSelectedModel(option.value)}
                                title={option.value}
                            >
                                {option.icon}
                                <span>{option.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Pending Attachments Preview */}
                    {pendingAttachments.length > 0 && (
                        <div className="pending-attachments">
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

                    <div className="ai-input-container">
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                            multiple
                            accept="image/*,application/pdf"
                        />
                        <button
                            className="ai-attach-btn"
                            onClick={() => fileInputRef.current?.click()}
                            title="Attach Image or PDF"
                        >
                            <Paperclip size={16} />
                        </button>
                        <textarea
                            ref={inputRef}
                            className="ai-input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask me something..."
                            rows={1}
                            disabled={isLoading}
                        />
                        <button
                            className="ai-send-btn"
                            onClick={handleSubmit}
                            disabled={(!input.trim() && pendingAttachments.length === 0) || isLoading}
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {showSettings && (
                <SettingsModal onClose={() => setShowSettings(false)} />
            )}
            {showHistory && (
                <SessionHistoryModal onClose={() => setShowHistory(false)} />
            )}
        </>
    )
}


