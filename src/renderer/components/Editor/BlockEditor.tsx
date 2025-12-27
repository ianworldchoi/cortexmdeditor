import { useState, useRef, useCallback, useEffect } from 'react'
import { GripVertical, Check, Image as ImageIcon, Plus, Copy, ChevronRight } from 'lucide-react'
import type { Document, Block, BlockType } from '@shared/types'
import { useEditorStore } from '../../stores/editorStore'
import SlashMenu from './SlashMenu'
import BlockMenu, { BlockAction } from './BlockMenu'

interface BlockEditorProps {
    document: Document
    tabId: string
}

interface BlockComponentProps {
    block: Block
    index: number
    isSelected: boolean
    isFirstBlock: boolean
    isFocused: boolean
    onChange: (content: string, alt?: string) => void
    onKeyDown: (e: React.KeyboardEvent) => void
    onFocus: () => void
    onBlur: () => void
    registerRef: (el: HTMLTextAreaElement | null) => void
    onTodoToggle: (checked: boolean) => void
    onToggleCollapse: (collapsed: boolean) => void
    onChildChange: (childIndex: number, content: string) => void
    onChildDelete: (childIndex: number) => void
    onChildAdd: () => void
    onContextMenu: (e: React.MouseEvent) => void
    onHandleClick: (e: React.MouseEvent) => void
    renderChild?: (block: Block) => React.ReactNode
}

function BlockComponent({
    block,
    index,
    isSelected,
    isFirstBlock,
    isFocused,
    onChange,
    onKeyDown,
    onFocus,
    onBlur,
    registerRef,
    onTodoToggle,
    onToggleCollapse,
    onChildChange,
    onChildDelete,
    onChildAdd,
    onContextMenu,
    onHandleClick,
    renderChild
}: BlockComponentProps) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)

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

    const handleWrapperClick = (e: React.MouseEvent) => {
        // Only trigger if click is directly on the wrapper or handle
        if ((e.target as HTMLElement).closest('.block-handle')) {
            onHandleClick(e)
            return
        }
    }

    // Common wrapper props
    const wrapperProps = {
        className: getBlockClassName(),
        onContextMenu,
        onClick: handleWrapperClick
    }

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
        }
    }, [block.content])

    // Divider block
    if (block.type === 'divider') {
        return <div {...wrapperProps} className={`block-divider ${isSelected ? 'selected' : ''}`} />
    }

    // Image block
    if (block.type === 'image') {
        let imgSrc = block.content
        if (block.content.startsWith('http://') || block.content.startsWith('https://')) {
            imgSrc = block.content
        } else if (block.content.startsWith('file://')) {
            imgSrc = block.content.replace('file://', 'media://')
        } else {
            // Assume local path
            imgSrc = `media://${block.content}`
        }

        return (
            <div {...wrapperProps} className={getBlockClassName() + " block-image-container"}>
                <span className="block-handle"><GripVertical size={14} /></span>
                <div className="block-content block-image">
                    {block.content ? (
                        <div className="image-wrapper">
                            <img
                                src={imgSrc}
                                alt={block.alt || 'Image'}
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                    e.currentTarget.nextElementSibling?.classList.remove('hidden')
                                }}
                            />
                            <div className="image-error hidden">
                                <ImageIcon size={24} />
                                <span>Failed to load image</span>
                            </div>
                            <div className={`image-caption ${isFocused ? 'visible' : ''}`}>
                                <input
                                    className="image-caption-input"
                                    value={block.alt || ''}
                                    placeholder="Add caption..."
                                    onChange={(e) => onChange(block.content, e.target.value)}
                                    onKeyDown={(e) => onKeyDown(e as unknown as React.KeyboardEvent<HTMLTextAreaElement>)}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="image-placeholder">
                            <ImageIcon size={24} />
                            <span>Add an image</span>
                        </div>
                    )}
                    <textarea
                        ref={(el) => {
                            textareaRef.current = el
                            registerRef(el)
                        }}
                        className="sr-only"
                        value={block.content}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        onFocus={onFocus}
                        onBlur={onBlur}
                    />
                </div>
            </div>
        )
    }

    // Todo block
    if (block.type === 'todo') {
        return (
            <div {...wrapperProps}>
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
            <div {...wrapperProps}>
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
            <div {...wrapperProps}>
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
            <div {...wrapperProps}>
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

    // Toggle (Accordion) block
    // Toggle (Accordion) block
    if (block.type === 'toggle') {
        const hasChildren = block.children && block.children.length > 0
        const isExpanded = !block.collapsed

        return (
            <div {...wrapperProps} className={`${getBlockClassName()} block-toggle-wrapper`}>
                <span className="block-handle"><GripVertical size={14} /></span>
                <div className="block-content block-toggle-content">
                    {/* Header Row */}
                    <div className="toggle-header-row">
                        <span
                            className={`toggle-arrow ${isExpanded ? 'expanded' : ''}`}
                            onClick={() => onToggleCollapse?.(isExpanded)}
                        >
                            ▶
                        </span>
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
                            placeholder="Toggle header"
                            rows={1}
                        />
                    </div>
                    {/* Children */}
                    {isExpanded && (
                        <div className="block-toggle-children">
                            {hasChildren && block.children!.map((child, childIndex) => (
                                <div key={child.block_id} className="toggle-child-block">
                                    <span className="child-bullet">•</span>
                                    <textarea
                                        className="child-input"
                                        value={child.content}
                                        onChange={(e) => onChildChange(childIndex, e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Backspace' && child.content === '') {
                                                e.preventDefault()
                                                onChildDelete(childIndex)
                                            } else if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                onChildAdd()
                                            }
                                        }}
                                        placeholder="Toggle content..."
                                        rows={1}
                                    />
                                </div>
                            ))}
                            <button
                                className="toggle-add-child-btn"
                                onClick={() => onChildAdd()}
                            >
                                <Plus size={12} /> Add item
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Code block with copy button
    if (block.type === 'code') {
        const handleCopy = () => {
            navigator.clipboard.writeText(block.content)
        }

        return (
            <div {...wrapperProps}>
                <span className="block-handle"><GripVertical size={14} /></span>
                <div className="block-content block-code-wrapper">
                    <button
                        className="code-copy-btn-sticky"
                        onClick={handleCopy}
                        title="Copy code"
                    >
                        <Copy size={12} />
                    </button>
                    {block.language && (
                        <span className="code-language-label">{block.language}</span>
                    )}
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
                        placeholder="Code"
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
        <div {...wrapperProps}>
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

export default function BlockEditor({ document, tabId }: BlockEditorProps) {
    const { updateDocument, updateDocumentMeta, saveTab } = useEditorStore()
    const [blocks, setBlocks] = useState<Block[]>(document.blocks)
    const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)
    const [slashMenuPosition, setSlashMenuPosition] = useState<{ x: number; y: number } | null>(null)
    const [slashMenuBlockId, setSlashMenuBlockId] = useState<string | null>(null)
    const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set())
    const [blockMenu, setBlockMenu] = useState<{ id: string, position: { x: number, y: number } } | null>(null)
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

    const focusBlock = useCallback((blockId: string, cursorPosition?: number) => {
        setTimeout(() => {
            const textarea = blockRefs.current.get(blockId)
            if (textarea) {
                textarea.focus()
                if (cursorPosition !== undefined) {
                    try {
                        textarea.setSelectionRange(cursorPosition, cursorPosition)
                    } catch (e) { }
                }
            }
        }, 0)
    }, [])

    const createNewBlock = useCallback((afterId: string): Block => {
        return {
            block_id: crypto.randomUUID(),
            type: 'text',
            content: ''
        }
    }, [])

    const recursiveUpdateBlock = useCallback((currentBlocks: Block[], blockId: string, updates: Partial<Block>): Block[] => {
        return currentBlocks.map(block => {
            if (block.block_id === blockId) {
                return { ...block, ...updates }
            }
            if (block.children) {
                return { ...block, children: recursiveUpdateBlock(block.children, blockId, updates) }
            }
            return block
        })
    }, [])

    const updateBlock = useCallback((blockId: string, updates: Partial<Block>) => {
        isLocalUpdate.current = true
        setBlocks(prev => recursiveUpdateBlock(prev, blockId, updates))
    }, [recursiveUpdateBlock])

    const recursiveInsertBlockAfter = useCallback((currentBlocks: Block[], afterId: string, newBlock: Block): Block[] => {
        const index = currentBlocks.findIndex(b => b.block_id === afterId)
        if (index !== -1) {
            return [...currentBlocks.slice(0, index + 1), newBlock, ...currentBlocks.slice(index + 1)]
        }
        // Recurse
        return currentBlocks.map(block => {
            if (block.children) {
                return { ...block, children: recursiveInsertBlockAfter(block.children, afterId, newBlock) }
            }
            return block
        })
    }, [])

    const insertBlockAfter = useCallback((afterId: string, newBlock: Block) => {
        isLocalUpdate.current = true
        setBlocks(prev => recursiveInsertBlockAfter(prev, afterId, newBlock))
    }, [recursiveInsertBlockAfter])

    const recursiveDeleteBlock = useCallback((currentBlocks: Block[], blockId: string): Block[] => {
        // Check if top level contains it
        if (currentBlocks.some(b => b.block_id === blockId)) {
            return currentBlocks.filter(b => b.block_id === blockId)
        }
        // Recurse
        return currentBlocks.map(block => {
            if (block.children) {
                const filtered = block.children.filter(b => b.block_id !== blockId)
                if (filtered.length !== block.children.length) {
                    return { ...block, children: filtered }
                }
                return { ...block, children: recursiveDeleteBlock(block.children, blockId) }
            }
            return block
        })
    }, [])

    // Correct Recursive Delete: Filter at level
    const deleteBlockFromTree = useCallback((currentBlocks: Block[], blockId: string): Block[] => {
        // Filter out from current level
        const filtered = currentBlocks.filter(b => b.block_id !== blockId)

        // If length changed, we found it (assuming unique IDs)
        if (filtered.length !== currentBlocks.length) {
            return filtered
        }

        // Otherwise recurse into children
        return currentBlocks.map(block => {
            if (block.children) {
                return { ...block, children: deleteBlockFromTree(block.children, blockId) }
            }
            return block
        })
    }, [])

    const deleteBlock = useCallback((blockId: string) => {
        isLocalUpdate.current = true
        setBlocks(prev => {
            const newBlocks = deleteBlockFromTree(prev, blockId)
            if (newBlocks.length === 0) return [createNewBlock('')]
            return newBlocks
        })
    }, [deleteBlockFromTree, createNewBlock])

    const handleBlockMenuSelect = useCallback((action: BlockAction) => {
        if (!blockMenu) return

        // Navigation Logic: We need a flattened list to find Prev/Next efficiently
        const flattenBlocks = (nodes: Block[]): Block[] => {
            let flat: Block[] = []
            for (const node of nodes) {
                flat.push(node)
                if (node.children && !node.collapsed) {
                    flat = [...flat, ...flattenBlocks(node.children)]
                }
            }
            return flat
        }

        const flatList = flattenBlocks(blocks)
        const currentIndex = flatList.findIndex(b => b.block_id === blockMenu.id)

        switch (action) {
            case 'delete':
                if (blocks.length > 0) { // check > 0 not > 1 strictly, but prevent empty doc handled in deleteBlock
                    deleteBlock(blockMenu.id)
                    // Focus adjacent block
                    if (currentIndex > 0) {
                        focusBlock(flatList[currentIndex - 1].block_id)
                    } else if (currentIndex < flatList.length - 1) {
                        // Next one might be shifted index if current deleted?
                        // Re-calculating next is safer, but flatList[currentIndex + 1] ID is stable
                        focusBlock(flatList[currentIndex + 1].block_id)
                    }
                }
                break
            case 'insert_above':
                // ... Logic for insert above is complex in tree. 
                // If top level: easy. If child: insert before in parent's array.
                // We need `insertBlockBefore` logic.
                // For now, simplify: only support top level or simple insert?
                // Or just implement `insertBlockBefore`.

                // Fallback: Just insert below for now or basic impl
                const newBlockAbove = createNewBlock('')
                // hack: insert below previous?
                // Real fix: Implement insertBlockBefore
                if (currentIndex > 0) {
                    insertBlockAfter(flatList[currentIndex - 1].block_id, newBlockAbove)
                } else {
                    // Insert at very top
                    isLocalUpdate.current = true
                    setBlocks(prev => [newBlockAbove, ...prev])
                }
                setTimeout(() => focusBlock(newBlockAbove.block_id), 0)
                break
            case 'insert_below':
                const newBlockBelow = createNewBlock('')
                insertBlockAfter(blockMenu.id, newBlockBelow)
                setTimeout(() => focusBlock(newBlockBelow.block_id), 0)
                break
        }
        setBlockMenu(null)
    }, [blockMenu, blocks, deleteBlock, insertBlockAfter, focusBlock, createNewBlock])

    // Handle keyboard shortcuts (Cmd+S, Cmd+A, Escape, Backspace for selected)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + S to save
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault()
                saveTab(tabId)
            }
            // Cmd/Ctrl + A: Two-stage selection
            // 1st: Select all text in current block (default browser behavior)
            // 2nd: If block text is fully selected OR no focus, select all blocks
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                const activeEl = window.document.activeElement

                // Check if we're in a textarea
                if (activeEl instanceof HTMLTextAreaElement) {
                    const isFullySelected = activeEl.selectionStart === 0 &&
                        activeEl.selectionEnd === activeEl.value.length

                    if (isFullySelected) {
                        // Text is already fully selected → select all blocks
                        e.preventDefault()
                        setSelectedBlockIds(new Set(blocks.map(b => b.block_id)))
                        activeEl.blur()
                    }
                    // If not fully selected, let default behavior select the text
                } else {
                    // No textarea focused → select all blocks
                    e.preventDefault()
                    setSelectedBlockIds(new Set(blocks.map(b => b.block_id)))
                }
            }
            // Escape to clear selection
            if (e.key === 'Escape') {
                if (selectedBlockIds.size > 0) {
                    e.preventDefault()
                    setSelectedBlockIds(new Set())
                }
                if (blockMenu) {
                    e.preventDefault()
                    setBlockMenu(null)
                }
            }
            // Backspace/Delete to remove selected blocks
            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedBlockIds.size > 0 && !focusedBlockId) {
                e.preventDefault()
                // simple delete loop
                isLocalUpdate.current = true
                setBlocks(prev => {
                    const rem = prev.filter(b => !selectedBlockIds.has(b.block_id))
                    if (rem.length === 0) return [createNewBlock('')]
                    return rem
                })
                setSelectedBlockIds(new Set())
            }

            // Cmd/Ctrl + B: Bold toggle
            if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
                const activeEl = window.document.activeElement
                if (activeEl instanceof HTMLTextAreaElement) {
                    e.preventDefault()
                    const { selectionStart, selectionEnd, value } = activeEl
                    const selectedText = value.slice(selectionStart, selectionEnd)

                    if (selectedText) {
                        // Check if already bold
                        const isBold = selectedText.startsWith('**') && selectedText.endsWith('**')
                        let newText: string
                        let newCursorStart: number
                        let newCursorEnd: number

                        if (isBold) {
                            // Remove bold
                            newText = selectedText.slice(2, -2)
                            newCursorStart = selectionStart
                            newCursorEnd = selectionStart + newText.length
                        } else {
                            // Add bold
                            newText = `**${selectedText}**`
                            newCursorStart = selectionStart
                            newCursorEnd = selectionStart + newText.length
                        }

                        const newValue = value.slice(0, selectionStart) + newText + value.slice(selectionEnd)

                        // Find the block and update it
                        const blockId = focusedBlockId
                        if (blockId) {
                            isLocalUpdate.current = true
                            setBlocks(prev => prev.map(b =>
                                b.block_id === blockId ? { ...b, content: newValue } : b
                            ))

                            // Restore selection after update
                            setTimeout(() => {
                                activeEl.setSelectionRange(newCursorStart, newCursorEnd)
                            }, 0)
                        }
                    }
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [tabId, saveTab, blocks, selectedBlockIds, focusedBlockId, blockMenu, createNewBlock])

    const mergeWithPrevious = useCallback((blockId: string) => {
        isLocalUpdate.current = true
        setBlocks(prev => {
            const index = prev.findIndex(b => b.block_id === blockId)
            if (index <= 0) return prev

            const prevBlock = prev[index - 1]
            const currentBlock = prev[index]

            if (prevBlock.type === 'divider') return prev

            const mergedContent = prevBlock.content + currentBlock.content

            return [
                ...prev.slice(0, index - 1),
                { ...prevBlock, content: mergedContent },
                ...prev.slice(index + 1)
            ]
        })
    }, [])

    const handleBlockKeyDown = useCallback((
        e: React.KeyboardEvent<HTMLTextAreaElement>,
        block: Block
    ) => {
        const textarea = e.currentTarget
        const { selectionStart, selectionEnd } = textarea

        // Enter: Create new block (or add child if in toggle)
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()

            if (slashMenuPosition) {
                setSlashMenuPosition(null)
                setSlashMenuBlockId(null)
                return
            }

            // Special handling for toggle blocks - add child instead of sibling
            if (block.type === 'toggle') {
                const newChild: Block = {
                    block_id: crypto.randomUUID(),
                    type: 'text',
                    content: ''
                }
                const currentChildren = block.children || []
                updateBlock(block.block_id, {
                    children: [...currentChildren, newChild],
                    collapsed: false // Expand when adding child
                })
                return
            }

            const beforeCursor = block.content.slice(0, selectionStart)
            const afterCursor = block.content.slice(selectionEnd)

            updateBlock(block.block_id, { content: beforeCursor })

            const newBlock = createNewBlock(block.block_id)
            newBlock.content = afterCursor
            insertBlockAfter(block.block_id, newBlock)

            focusBlock(newBlock.block_id, 0)
        }

        // Backspace
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
                e.preventDefault()
                updateBlock(block.block_id, { type: 'text' })
            } else {
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

        // Arrow up
        if (e.key === 'ArrowUp' && selectionStart === 0) {
            e.preventDefault()
            const blockIndex = blocks.findIndex(b => b.block_id === block.block_id)
            if (blockIndex > 0) {
                focusBlock(blocks[blockIndex - 1].block_id)
            }
        }

        // Arrow down
        if (e.key === 'ArrowDown' && selectionStart === block.content.length) {
            e.preventDefault()
            const blockIndex = blocks.findIndex(b => b.block_id === block.block_id)
            if (blockIndex < blocks.length - 1) {
                focusBlock(blocks[blockIndex + 1].block_id, 0)
            }
        }
    }, [blocks, slashMenuPosition, updateBlock, createNewBlock, insertBlockAfter, deleteBlock, mergeWithPrevious, focusBlock])

    const handleBlockChange = useCallback((block: Block, value: string, blockIndex: number) => {
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

        const detectShortcut = (input: string) => {
            const trimmed = input.trimEnd()

            const heading1 = trimmed.match(/^#\s+(.*)$/)
            if (heading1) return { type: 'heading1' as BlockType, content: heading1[1] }

            const heading2 = trimmed.match(/^##\s+(.*)$/)
            if (heading2) return { type: 'heading2' as BlockType, content: heading2[1] }

            const heading3 = trimmed.match(/^###\s+(.*)$/)
            if (heading3) return { type: 'heading3' as BlockType, content: heading3[1] }

            const todo = trimmed.match(/^- \[([ x])\]\s+(.*)$/)
            if (todo) {
                return {
                    type: 'todo' as BlockType,
                    content: todo[2],
                    checked: todo[1] === 'x'
                }
            }
            if (trimmed === '[]' || trimmed === '[ ]') {
                return { type: 'todo' as BlockType, content: '', checked: false }
            }

            const bullet = trimmed.match(/^- (.*)$/)
            if (bullet) return { type: 'bullet' as BlockType, content: bullet[1] }

            const numbered = trimmed.match(/^\d+\.\s+(.*)$/)
            if (numbered) return { type: 'numbered' as BlockType, content: numbered[1] }

            const toggle = trimmed.match(/^>>\s+(.*)$/)
            if (toggle) {
                return { type: 'toggle' as BlockType, content: toggle[1], collapsed: false }
            }

            const quote = trimmed.match(/^>\s+(.*)$/)
            if (quote) return { type: 'quote' as BlockType, content: quote[1] }

            if (trimmed === '```') return { type: 'code' as BlockType, content: '' }
            if (trimmed === '---' || trimmed === '***') return { type: 'divider' as BlockType, content: '' }
            if (trimmed === '!!' || trimmed === ':::') return { type: 'callout' as BlockType, content: '' }
            return null
        }

        if (block.type === 'text') {
            const shortcut = detectShortcut(value)
            if (shortcut) {
                updateBlock(block.block_id, shortcut)
                return
            }
        }

        // Image regex check - Obsidian style ![[filename]] or ![[filename|alt]]
        if (value.startsWith('![[')) {
            const match = value.match(/^!\[\[(.+?)(?:\|(.+?))?\]\]$/)
            if (match) {
                updateBlock(block.block_id, {
                    type: 'image',
                    content: match[1],
                    alt: match[2] || ''
                })
                return
            }
        }

        updateBlock(block.block_id, { content: value })
    }, [slashMenuPosition, updateBlock])

    const handleSlashMenuSelect = useCallback(async (type: BlockType) => {
        if (!slashMenuBlockId) return

        if (type === 'image') {
            // @ts-ignore
            const filePath = await window.api.openFileDialog()
            if (filePath) {
                updateBlock(slashMenuBlockId, {
                    type: 'image',
                    content: filePath
                })
                setSlashMenuPosition(null)
                setSlashMenuBlockId(null)
                return
            }
            setSlashMenuPosition(null)
            setSlashMenuBlockId(null)
            return
        }

        updateBlock(slashMenuBlockId, { type, content: '' })
        setSlashMenuPosition(null)
        setSlashMenuBlockId(null)
        focusBlock(slashMenuBlockId)
    }, [slashMenuBlockId, updateBlock, focusBlock])

    const handleTodoToggle = useCallback((blockId: string, checked: boolean) => {
        updateBlock(blockId, { checked })
    }, [updateBlock])

    const [tagInput, setTagInput] = useState('')

    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            const newTag = tagInput.trim().replace(/^#/, '') // # 제거
            if (newTag && !document.meta.tags.includes(newTag)) {
                updateDocumentMeta(tabId, { tags: [...document.meta.tags, newTag] })
            }
            setTagInput('')
        } else if (e.key === 'Backspace' && tagInput === '' && document.meta.tags.length > 0) {
            // 빈 입력에서 백스페이스 누르면 마지막 태그 삭제
            const newTags = document.meta.tags.slice(0, -1)
            updateDocumentMeta(tabId, { tags: newTags })
        }
    }

    const removeTag = (tagToRemove: string) => {
        const newTags = document.meta.tags.filter(t => t !== tagToRemove)
        updateDocumentMeta(tabId, { tags: newTags })
    }

    return (
        <div className="block-editor" ref={editorRef}>
            {/* Header */}
            <div className="document-header">
                <div className="document-breadcrumb">{document.meta.title}</div>
                <div className="document-meta-vertical">
                    <div className="meta-row">
                        <span className="meta-label">Created</span>
                        <span className="meta-date">
                            {new Date(document.meta.created_at).toLocaleDateString('ko-KR')}
                        </span>
                    </div>
                    <div className="meta-row">
                        <span className="meta-label">Tags</span>
                        <div className="meta-tags-editable">
                            {document.meta.tags?.map((tag, i) => (
                                <span key={i} className="meta-tag-chip">
                                    {tag}
                                    <button
                                        className="tag-remove-btn"
                                        onClick={() => removeTag(tag)}
                                    >×</button>
                                </span>
                            ))}
                            <input
                                type="text"
                                className="tag-input"
                                placeholder="#태그 추가"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={handleTagKeyDown}
                            />
                        </div>
                    </div>
                    <div className="meta-row">
                        <span className="meta-label">AI Context</span>
                        <label className="meta-always-on" title="AI가 항상 이 문서를 컨텍스트에 포함">
                            <input
                                type="checkbox"
                                checked={document.meta.alwaysOn || false}
                                onChange={(e) => {
                                    updateDocumentMeta(tabId, { alwaysOn: e.target.checked })
                                }}
                            />
                            <span>Always-on</span>
                        </label>
                    </div>
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
                        if (selectedBlockIds.size > 0) setSelectedBlockIds(new Set())
                    }}
                    onBlur={() => setFocusedBlockId(null)}
                    onChange={(value, alt) => {
                        if (alt !== undefined) updateBlock(block.block_id, { alt })
                        else handleBlockChange(block, value, index)
                    }}
                    onKeyDown={(e) => handleBlockKeyDown(e, block)}
                    onTodoToggle={(checked) => handleTodoToggle(block.block_id, checked)}
                    onToggleCollapse={(collapsed) => updateBlock(block.block_id, { collapsed })}
                    onChildChange={(childIndex, content) => {
                        if (block.children) {
                            const newChildren = [...block.children]
                            newChildren[childIndex] = { ...newChildren[childIndex], content }
                            updateBlock(block.block_id, { children: newChildren })
                        }
                    }}
                    onChildDelete={(childIndex) => {
                        if (block.children) {
                            const newChildren = block.children.filter((_, i) => i !== childIndex)
                            updateBlock(block.block_id, { children: newChildren })
                        }
                    }}
                    onChildAdd={() => {
                        const newChild: Block = {
                            block_id: crypto.randomUUID(),
                            type: 'text',
                            content: ''
                        }
                        const currentChildren = block.children || []
                        updateBlock(block.block_id, { children: [...currentChildren, newChild] })
                    }}
                    isFirstBlock={index === 0}
                    registerRef={(el) => {
                        if (el) blockRefs.current.set(block.block_id, el)
                        else blockRefs.current.delete(block.block_id)
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault()
                        setBlockMenu({
                            id: block.block_id,
                            position: { x: e.clientX, y: e.clientY }
                        })
                    }}
                    onHandleClick={(e) => {
                        e.preventDefault()
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        setBlockMenu({
                            id: block.block_id,
                            position: { x: rect.right + 10, y: rect.top }
                        })
                    }}
                />
            ))}

            {/* Click area at bottom */}
            <div
                className="editor-bottom-click-area"
                onClick={() => {
                    const newBlock = createNewBlock('')
                    isLocalUpdate.current = true
                    setBlocks(prev => [...prev, newBlock])
                    setTimeout(() => focusBlock(newBlock.block_id), 0)
                }}
            />

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

            {/* Block Menu */}
            {blockMenu && (
                <BlockMenu
                    position={blockMenu.position}
                    onSelect={handleBlockMenuSelect}
                    onClose={() => setBlockMenu(null)}
                />
            )}
        </div>
    )
}
