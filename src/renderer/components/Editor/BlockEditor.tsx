import { useState, useRef, useCallback, useEffect } from 'react'
import { GripVertical, Check, Square, CheckSquare } from 'lucide-react'
import type { Document, Block, BlockType } from '@shared/types'
import { useEditorStore } from '../../stores/editorStore'
import SlashMenu from './SlashMenu'

interface BlockEditorProps {
    document: Document
    tabId: string
}

export default function BlockEditor({ document, tabId }: BlockEditorProps) {
    const { updateDocument, saveTab } = useEditorStore()
    const [blocks, setBlocks] = useState<Block[]>(document.blocks)
    const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)
    const [slashMenuPosition, setSlashMenuPosition] = useState<{ x: number; y: number } | null>(null)
    const [slashMenuBlockId, setSlashMenuBlockId] = useState<string | null>(null)
    const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set())
    const blockRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
    const isLocalUpdate = useRef(false)
    const editorRef = useRef<HTMLDivElement>(null)

    // Sync blocks to store (only when local blocks change)
    useEffect(() => {
        if (isLocalUpdate.current) {
            updateDocument(tabId, blocks)
        }
        isLocalUpdate.current = false
    }, [blocks, tabId, updateDocument])

    // Sync blocks from store (e.g. AI updates)
    useEffect(() => {
        // Only update if this is an external change (not from our own update)
        if (!isLocalUpdate.current) {
            setBlocks(document.blocks)
        }
    }, [document.blocks])

    // Handle keyboard shortcuts (Cmd+S, Cmd+A, Escape, Backspace for selected)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + S to save
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault()
                saveTab(tabId)
            }
            // Cmd/Ctrl + A to select all blocks
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault()
                setSelectedBlockIds(new Set(blocks.map(b => b.block_id)))
                // Blur any focused textarea
                const activeEl = window.document.activeElement
                if (activeEl instanceof HTMLElement) {
                    activeEl.blur()
                }
            }
            // Escape to clear selection
            if (e.key === 'Escape' && selectedBlockIds.size > 0) {
                e.preventDefault()
                setSelectedBlockIds(new Set())
            }
            // Backspace/Delete to remove selected blocks
            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedBlockIds.size > 0 && !focusedBlockId) {
                e.preventDefault()
                deleteSelectedBlocks()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [tabId, saveTab, blocks, selectedBlockIds, focusedBlockId])

    // Delete all selected blocks
    const deleteSelectedBlocks = useCallback(() => {
        if (selectedBlockIds.size === 0) return
        isLocalUpdate.current = true
        setBlocks(prev => {
            const remaining = prev.filter(b => !selectedBlockIds.has(b.block_id))
            // Ensure at least one empty block
            if (remaining.length === 0) {
                return [{
                    block_id: crypto.randomUUID(),
                    type: 'text',
                    content: ''
                }]
            }
            return remaining
        })
        setSelectedBlockIds(new Set())
    }, [selectedBlockIds])

    const createNewBlock = useCallback((afterId: string): Block => {
        return {
            block_id: crypto.randomUUID(),
            type: 'text',
            content: ''
        }
    }, [])

    const updateBlock = useCallback((blockId: string, updates: Partial<Block>) => {
        isLocalUpdate.current = true
        setBlocks(prev => prev.map(block =>
            block.block_id === blockId
                ? { ...block, ...updates }
                : block
        ))
    }, [])

    const insertBlockAfter = useCallback((afterId: string, newBlock: Block) => {
        isLocalUpdate.current = true
        setBlocks(prev => {
            const index = prev.findIndex(b => b.block_id === afterId)
            if (index === -1) return prev
            return [...prev.slice(0, index + 1), newBlock, ...prev.slice(index + 1)]
        })
    }, [])

    const deleteBlock = useCallback((blockId: string) => {
        isLocalUpdate.current = true
        setBlocks(prev => {
            if (prev.length <= 1) return prev
            return prev.filter(b => b.block_id !== blockId)
        })
    }, [])

    const mergeWithPrevious = useCallback((blockId: string) => {
        isLocalUpdate.current = true
        setBlocks(prev => {
            const index = prev.findIndex(b => b.block_id === blockId)
            if (index <= 0) return prev

            const prevBlock = prev[index - 1]
            const currentBlock = prev[index]

            // Can't merge with divider
            if (prevBlock.type === 'divider') return prev

            const mergedContent = prevBlock.content + currentBlock.content

            return [
                ...prev.slice(0, index - 1),
                { ...prevBlock, content: mergedContent },
                ...prev.slice(index + 1)
            ]
        })
    }, [])

    const focusBlock = useCallback((blockId: string, cursorPosition?: number) => {
        setTimeout(() => {
            const textarea = blockRefs.current.get(blockId)
            if (textarea) {
                textarea.focus()
                if (cursorPosition !== undefined) {
                    textarea.setSelectionRange(cursorPosition, cursorPosition)
                }
            }
        }, 0)
    }, [])

    const handleBlockKeyDown = useCallback((
        e: React.KeyboardEvent<HTMLTextAreaElement>,
        block: Block
    ) => {
        const textarea = e.currentTarget
        const { selectionStart, selectionEnd } = textarea

        // Enter: Create new block
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()

            // Close slash menu if open
            if (slashMenuPosition) {
                setSlashMenuPosition(null)
                setSlashMenuBlockId(null)
                return
            }

            const beforeCursor = block.content.slice(0, selectionStart)
            const afterCursor = block.content.slice(selectionEnd)

            // Update current block with content before cursor
            updateBlock(block.block_id, { content: beforeCursor })

            // Create new block with content after cursor
            const newBlock = createNewBlock(block.block_id)
            newBlock.content = afterCursor
            insertBlockAfter(block.block_id, newBlock)

            // Focus new block
            focusBlock(newBlock.block_id, 0)
        }

        // Backspace at start: Merge with previous or delete empty block
        if (e.key === 'Backspace' && selectionStart === 0 && selectionStart === selectionEnd) {
            if (block.content === '') {
                e.preventDefault()
                const blockIndex = blocks.findIndex(b => b.block_id === block.block_id)
                if (blockIndex > 0) {
                    const prevBlock = blocks[blockIndex - 1]
                    deleteBlock(block.block_id)
                    focusBlock(prevBlock.block_id, prevBlock.content.length)
                }
            } else if (block.type !== 'text') {
                // Convert to text block
                e.preventDefault()
                updateBlock(block.block_id, { type: 'text' })
            } else {
                // Merge with previous
                e.preventDefault()
                const blockIndex = blocks.findIndex(b => b.block_id === block.block_id)
                if (blockIndex > 0) {
                    const prevBlock = blocks[blockIndex - 1]
                    const cursorPos = prevBlock.content.length
                    mergeWithPrevious(block.block_id)
                    focusBlock(prevBlock.block_id, cursorPos)
                }
            }
        }

        // Arrow up: Move to previous block
        if (e.key === 'ArrowUp' && selectionStart === 0) {
            e.preventDefault()
            const blockIndex = blocks.findIndex(b => b.block_id === block.block_id)
            if (blockIndex > 0) {
                focusBlock(blocks[blockIndex - 1].block_id)
            }
        }

        // Arrow down: Move to next block
        if (e.key === 'ArrowDown' && selectionStart === block.content.length) {
            e.preventDefault()
            const blockIndex = blocks.findIndex(b => b.block_id === block.block_id)
            if (blockIndex < blocks.length - 1) {
                focusBlock(blocks[blockIndex + 1].block_id, 0)
            }
        }
    }, [blocks, slashMenuPosition, updateBlock, createNewBlock, insertBlockAfter, deleteBlock, mergeWithPrevious, focusBlock])

    const handleBlockChange = useCallback((block: Block, value: string, blockIndex: number) => {
        // Check for slash command
        if (value === '/' && block.content === '') {
            const textarea = blockRefs.current.get(block.block_id)
            if (textarea) {
                const rect = textarea.getBoundingClientRect()
                setSlashMenuPosition({ x: rect.left, y: rect.bottom + 4 })
                setSlashMenuBlockId(block.block_id)
            }
            return
        } else if (slashMenuPosition && !value.startsWith('/')) {
            setSlashMenuPosition(null)
            setSlashMenuBlockId(null)
        }

        // Detect markdown shortcuts on space
        if (value.endsWith(' ') && block.type === 'text') {
            const trimmed = value.trimEnd()
            let newType: BlockType | null = null
            let newContent = ''

            // Headings
            if (trimmed === '#') {
                newType = 'heading1'
            } else if (trimmed === '##') {
                newType = 'heading2'
            } else if (trimmed === '###') {
                newType = 'heading3'
            }
            // Lists
            else if (trimmed === '-' || trimmed === '*') {
                newType = 'bullet'
            } else if (/^\d+\.$/.test(trimmed)) {
                newType = 'numbered'
            }
            // Todo
            else if (trimmed === '[]' || trimmed === '[ ]') {
                newType = 'todo'
            }
            // Quote
            else if (trimmed === '>') {
                newType = 'quote'
            }
            // Code
            else if (trimmed === '```') {
                newType = 'code'
            }
            // Divider
            else if (trimmed === '---' || trimmed === '***') {
                newType = 'divider'
            }
            // Callout
            else if (trimmed === '!!' || trimmed === ':::') {
                newType = 'callout'
            }

            if (newType) {
                updateBlock(block.block_id, { type: newType, content: newContent })
                return
            }
        }

        updateBlock(block.block_id, { content: value })
    }, [slashMenuPosition, updateBlock])

    const handleSlashMenuSelect = useCallback((type: BlockType) => {
        if (!slashMenuBlockId) return

        updateBlock(slashMenuBlockId, { type, content: '' })
        setSlashMenuPosition(null)
        setSlashMenuBlockId(null)
        focusBlock(slashMenuBlockId)
    }, [slashMenuBlockId, updateBlock, focusBlock])

    const handleTodoToggle = useCallback((blockId: string, checked: boolean) => {
        updateBlock(blockId, { checked })
    }, [updateBlock])

    return (
        <div className="block-editor">
            {/* Document Header */}
            <div className="document-header">
                <div className="document-breadcrumb">{document.meta.title}</div>
                <div className="document-meta">
                    {document.meta.tags?.length > 0 && (
                        <span className="meta-tags">
                            {document.meta.tags.map((tag, i) => (
                                <span key={i} className="meta-tag">{tag}</span>
                            ))}
                        </span>
                    )}
                    <span className="meta-date">
                        {new Date(document.meta.created_at).toLocaleDateString('ko-KR')}
                    </span>
                </div>
            </div>

            {/* Blocks */}
            {blocks.map((block, index) => (
                <BlockComponent
                    key={block.block_id}
                    block={block}
                    index={index}
                    isFocused={focusedBlockId === block.block_id}
                    isSelected={selectedBlockIds.has(block.block_id)}
                    onFocus={() => {
                        setFocusedBlockId(block.block_id)
                        // Clear selection when focusing a block
                        if (selectedBlockIds.size > 0) {
                            setSelectedBlockIds(new Set())
                        }
                    }}
                    onBlur={() => setFocusedBlockId(null)}
                    onChange={(value) => handleBlockChange(block, value, index)}
                    onKeyDown={(e) => handleBlockKeyDown(e, block)}
                    onTodoToggle={(checked) => handleTodoToggle(block.block_id, checked)}
                    isFirstBlock={index === 0}
                    registerRef={(el) => {
                        if (el) {
                            blockRefs.current.set(block.block_id, el)
                        } else {
                            blockRefs.current.delete(block.block_id)
                        }
                    }}
                />
            ))}

            {/* Slash Menu */}
            {slashMenuPosition && (
                <SlashMenu
                    position={slashMenuPosition}
                    onSelect={handleSlashMenuSelect}
                    onClose={() => {
                        setSlashMenuPosition(null)
                        setSlashMenuBlockId(null)
                    }}
                />
            )}
        </div>
    )
}

// Individual Block Component
interface BlockComponentProps {
    block: Block
    index: number
    isFocused: boolean
    isSelected: boolean
    onFocus: () => void
    onBlur: () => void
    onChange: (value: string) => void
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
    onTodoToggle: (checked: boolean) => void
    registerRef: (el: HTMLTextAreaElement | null) => void
    isFirstBlock: boolean
}

function BlockComponent({
    block,
    index,
    isFocused,
    isSelected,
    onFocus,
    onBlur,
    onChange,
    onKeyDown,
    onTodoToggle,
    registerRef,
    isFirstBlock
}: BlockComponentProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current
        if (textarea) {
            textarea.style.height = 'auto'
            textarea.style.height = textarea.scrollHeight + 'px'
        }
    }, [block.content])

    // Divider block
    if (block.type === 'divider') {
        return <div className={`block-divider ${isSelected ? 'selected' : ''}`} />
    }

    // Get className for block type
    const getInputClassName = () => {
        const classes = ['block-input']
        if (block.type.startsWith('heading')) {
            classes.push(block.type)
        }
        if (block.type === 'quote') classes.push('quote')
        if (block.type === 'code') classes.push('code')
        if (block.type === 'todo' && block.checked) classes.push('checked')
        return classes.join(' ')
    }

    // Get block className with selected state
    const getBlockClassName = () => {
        const classes = ['block']
        if (isSelected) classes.push('selected')
        return classes.join(' ')
    }

    // Todo block
    if (block.type === 'todo') {
        return (
            <div className={getBlockClassName()}>
                <span className="block-handle"><GripVertical size={14} /></span>
                <div className="block-content block-todo">
                    <div
                        className={`block-checkbox ${block.checked ? 'checked' : ''}`}
                        onClick={() => onTodoToggle(!block.checked)}
                    >
                        {block.checked && <Check size={12} strokeWidth={3} />}
                    </div>
                    <textarea
                        ref={(el) => {
                            textareaRef.current = el
                            registerRef(el)
                        }}
                        className={getInputClassName()}
                        value={block.content}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        placeholder="To-do"
                        rows={1}
                    />
                </div>
            </div>
        )
    }

    // Bullet list
    if (block.type === 'bullet') {
        return (
            <div className={getBlockClassName()}>
                <span className="block-handle"><GripVertical size={14} /></span>
                <div className="block-content block-list block-bullet">
                    <textarea
                        ref={(el) => {
                            textareaRef.current = el
                            registerRef(el)
                        }}
                        className={getInputClassName()}
                        value={block.content}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        placeholder="List item"
                        rows={1}
                    />
                </div>
            </div>
        )
    }

    // Numbered list
    if (block.type === 'numbered') {
        return (
            <div className={getBlockClassName()}>
                <span className="block-handle"><GripVertical size={14} /></span>
                <div className="block-content block-list block-numbered" data-number={index + 1}>
                    <textarea
                        ref={(el) => {
                            textareaRef.current = el
                            registerRef(el)
                        }}
                        className={getInputClassName()}
                        value={block.content}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        placeholder="List item"
                        rows={1}
                    />
                </div>
            </div>
        )
    }

    // Callout block
    if (block.type === 'callout') {
        return (
            <div className={getBlockClassName()}>
                <span className="block-handle"><GripVertical size={14} /></span>
                <div className="block-content block-callout">
                    <textarea
                        ref={(el) => {
                            textareaRef.current = el
                            registerRef(el)
                        }}
                        className={getInputClassName()}
                        value={block.content}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        placeholder="Callout"
                        rows={1}
                    />
                </div>
            </div>
        )
    }

    // Default text/heading/quote/code block
    const getPlaceholder = () => {
        switch (block.type) {
            case 'heading1': return 'Heading 1'
            case 'heading2': return 'Heading 2'
            case 'heading3': return 'Heading 3'
            case 'quote': return 'Quote'
            case 'code': return 'Code'
            default: return isFirstBlock ? "Type '/' for commands, or # for heading" : ''
        }
    }

    return (
        <div className={getBlockClassName()}>
            <span className="block-handle"><GripVertical size={14} /></span>
            <div className="block-content">
                <textarea
                    ref={(el) => {
                        textareaRef.current = el
                        registerRef(el)
                    }}
                    className={getInputClassName()}
                    value={block.content}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    placeholder={getPlaceholder()}
                    rows={1}
                />
            </div>
        </div>
    )
}
