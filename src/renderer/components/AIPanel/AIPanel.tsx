import { useState, useRef, useEffect } from 'react'
import { Settings, X, FileText, Library, Send, Zap, Sparkles, Plus, Check, Edit3, Trash2 } from 'lucide-react'
import { useAIStore, type AIModel } from '../../stores/aiStore'
import { useEditorStore } from '../../stores/editorStore'
import { sendMessage } from '../../services/geminiService'
import SettingsModal from '../Settings/SettingsModal'
import type { Block, BlockType } from '@shared/types'

const MODEL_OPTIONS: { value: AIModel; label: string; icon: React.ReactNode }[] = [
    { value: 'gemini-3-flash-preview', label: 'Flash', icon: <Zap size={12} /> },
    { value: 'gemini-3-pro-preview', label: 'Pro', icon: <Sparkles size={12} /> }
]

interface AIAction {
    type: 'update' | 'insert' | 'delete'
    id?: string
    afterId?: string
    content?: string
    blockType?: BlockType
}

export default function AIPanel() {
    const {
        closePanel,
        messages,
        addMessage,
        isLoading,
        setLoading,
        apiKey,
        selectedModel,
        setSelectedModel
    } = useAIStore()
    const { getActiveDocument, tabs, activeTabId, updateDocument } = useEditorStore()

    const [input, setInput] = useState('')
    const [showSettings, setShowSettings] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Focus input on open
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const activeDocument = getActiveDocument()
    const vaultDocCount = tabs.length

    const handleSubmit = async () => {
        if (!input.trim() || isLoading) return

        if (!apiKey) {
            setShowSettings(true)
            return
        }

        const userMessage = input.trim()
        setInput('')
        addMessage('user', userMessage)
        setLoading(true)

        try {
            const response = await sendMessage(userMessage, activeDocument)
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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }

    // Apply AI-generated content to the active document (Append mode)
    const applyToDocument = (content: string) => {
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
    const dispatchBatchActions = (actions: AIAction[]) => {
        console.log('Dispatching Batch Actions:', actions)
        if (!activeDocument) {
            console.error('No active document found')
            return
        }
        if (!activeTabId) {
            console.error('No active tab ID found')
            return
        }

        let updatedBlocks = [...activeDocument.blocks]
        let modifiedCount = 0

        // Apply actions sequentially to the copy
        for (const action of actions) {
            if (action.type === 'update' && action.id && action.content !== undefined) {
                const index = updatedBlocks.findIndex(b => b.block_id === action.id)
                if (index !== -1) {
                    updatedBlocks[index] = { ...updatedBlocks[index], content: action.content }
                    modifiedCount++
                } else {
                    console.warn(`Update failed: Block ${action.id} not found`)
                }
            } else if (action.type === 'insert' && action.afterId && action.content !== undefined) {
                const index = updatedBlocks.findIndex((b) => b.block_id === action.afterId)
                if (index !== -1) {
                    const newBlock: Block = {
                        block_id: crypto.randomUUID(),
                        type: action.blockType || 'text',
                        content: action.content
                    }
                    updatedBlocks.splice(index + 1, 0, newBlock)
                    modifiedCount++
                } else {
                    // Fallback: If afterId not found, try inserting at end? Or just fail safety.
                    console.warn(`Insert failed: Block ${action.afterId} not found`)
                }
            } else if (action.type === 'delete' && action.id) {
                const initialLen = updatedBlocks.length
                updatedBlocks = updatedBlocks.filter((b) => b.block_id !== action.id)
                if (updatedBlocks.length < initialLen) modifiedCount++
            }
        }

        if (modifiedCount > 0) {
            updateDocument(activeTabId, updatedBlocks)
            console.log(`Applied ${modifiedCount} changes successfully`)
        } else {
            console.warn('No changes were applied')
        }
    }

    // Extract code from code block
    const extractCodeContent = (code: string): string => {
        return code.trim()
    }

    // Render markdown code blocks with copy and apply buttons
    const renderMessage = (content: string) => {
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
                                    // Find old content if update/delete
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
                            <button
                                className="ai-action-apply-btn"
                                onClick={() => dispatchBatchActions(actions)}
                            >
                                <Check size={12} /> Apply All Changes
                            </button>
                        </div>
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
                `}
            </style>
            <div className="ai-panel">
                <div className="ai-panel-header">
                    <span className="ai-panel-title">AI Assistant</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className="ai-panel-close"
                            onClick={() => setShowSettings(true)}
                            title="Settings"
                        >
                            <Settings size={16} />
                        </button>
                        <button
                            className="ai-panel-close"
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
                                {message.role === 'assistant'
                                    ? renderMessage(message.content)
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

                    <div className="ai-input-container">
                        <textarea
                            ref={inputRef}
                            className="ai-input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask me to write something..."
                            rows={1}
                            disabled={isLoading}
                        />
                        <button
                            className="ai-send-btn"
                            onClick={handleSubmit}
                            disabled={!input.trim() || isLoading}
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {showSettings && (
                <SettingsModal onClose={() => setShowSettings(false)} />
            )}
        </>
    )
}
