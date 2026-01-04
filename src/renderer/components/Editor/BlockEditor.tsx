import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { GripVertical, Check, Image as ImageIcon, Plus, Copy, ChevronRight, ExternalLink, X as CloseIcon } from 'lucide-react'
import type { Document, Block, BlockType, TableCell, PendingDiff } from '@shared/types'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useHighlightStore } from '../../stores/highlightStore'
import { useDiffStore } from '../../stores/diffStore'
import { getNumberingForBlock } from '../../utils/numberingUtils'
import SlashMenu from './SlashMenu'
import BlockMenu, { BlockAction } from './BlockMenu'
import BacklinkMenu from './BacklinkMenu'
import TableBlock, { createDefaultTableData } from './TableBlock'
import BacklinkSection from './BacklinkSection'
import HighlightModal from './HighlightModal'
import HighlightTooltip from './HighlightTooltip'
import FileBlock from './FileBlock'



interface BlockEditorProps {
    document: Document
    tabId: string
    viewMode: 'edit' | 'preview'
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
    viewMode: 'edit' | 'preview'
    onLinkClick: (target: string) => void
    onBacklinkTrigger: (blockId: string, query: string, position: { x: number, y: number }) => void
    onBacklinkQueryChange: (query: string) => void
    onBacklinkClose: () => void
    onTableDataChange?: (data: TableCell[][]) => void
    // Drag-and-drop props
    onDragStart: (e: React.DragEvent, blockId: string) => void
    onDragEnd: () => void
    onDragOver: (e: React.DragEvent, blockId: string) => void
    onDrop: (e: React.DragEvent, blockId: string) => void
    isDragOver: boolean
    dropPosition: 'above' | 'below' | null
    isDragging: boolean
    // Multi-select with Shift-click
    onBlockSelect: (blockId: string, shiftKey: boolean) => void
    // Highlight handlers
    onHighlightHover?: (e: React.MouseEvent, blockId: string, text: string, comment: string) => void
    onHighlightLeave?: () => void
    // All blocks array for numbering calculation
    blocks: Block[]
    // Diff support
    diff?: PendingDiff
    onAcceptDiff?: (diffId: string) => void
    onRejectDiff?: (diffId: string) => void
}

interface MarkdownRendererProps {
    content: string
    onClick: (target: string) => void
    onHighlightHover?: (e: React.MouseEvent, text: string, comment: string) => void
    onHighlightLeave?: () => void
    onHighlightEdit?: (text: string, comment: string) => void
    onHighlightDelete?: (text: string) => void
}

const MarkdownRenderer = ({
    content,
    onClick,
    onHighlightHover,
    onHighlightLeave,
    onHighlightEdit,
    onHighlightDelete
}: MarkdownRendererProps) => {
    if (!content) return <br />

    // Advanced parsing for:
    // 1. **Bold**
    // 2. *Italic*
    // 3. ~~Strikethrough~~
    // 4. `Code`
    // 5. [[Backlink]]
    // 6. ==Highlight== or ==Highlight==^[comment with [[backlinks]]]
    // 7. [text](url) - Hyperlinks

    // Tokenize content
    // Regex strategy: split by special sequences
    // Highlight pattern: ==text== or ==text==^[comment] (comment can contain [[backlinks]])
    // Hyperlink pattern: [text](url) - must not be [[backlink]]
    // Use a more greedy pattern for comments that allows nested brackets
    const regex = /(\[\[.*?\]\]|\*\*.*?\*\*|\*.*?\*|~~.*?~~|`.*?`|==.*?==(?:\^\[(?:[^\[\]]|\[\[.*?\]\])*\])?|(?<!\[)\[[^\[\]]*\]\([^)]+\))/g
    const parts = content.split(regex)

    return (
        <span style={{ whiteSpace: 'pre-wrap' }}>
            {parts.map((part, i) => {
                // Highlight with optional comment: ==text== or ==text==^[comment with [[backlinks]]]
                const highlightMatch = part.match(/^==(.*?)==(?:\^\[((?:[^\[\]]|\[\[.*?\]\])*)\])?$/)
                if (highlightMatch) {
                    const highlightedText = highlightMatch[1]
                    const comment = highlightMatch[2] || ''
                    return (
                        <span
                            key={i}
                            className="highlight"
                            onMouseEnter={(e) => onHighlightHover?.(e, highlightedText, comment)}
                            onMouseLeave={() => onHighlightLeave?.()}
                            data-comment={comment}
                        >
                            <MarkdownRenderer
                                content={highlightedText}
                                onClick={onClick}
                                onHighlightHover={onHighlightHover}
                                onHighlightLeave={onHighlightLeave}
                                onHighlightEdit={onHighlightEdit}
                                onHighlightDelete={onHighlightDelete}
                            />
                        </span>
                    )
                }

                // Backlink
                const linkMatch = part.match(/^\[\[(.+?)(?:\|(.+?))?\]\]$/)
                if (linkMatch) {
                    const target = linkMatch[1]
                    const alt = linkMatch[2] || target
                    return (
                        <span
                            key={i}
                            className="backlink"
                            onClick={(e) => {
                                e.stopPropagation()
                                onClick(target)
                            }}
                            title={`Link to ${target}`}
                        >
                            {alt}
                        </span>
                    )
                }

                // Bold
                const boldMatch = part.match(/^\*\*(.*?)\*\*$/)
                if (boldMatch) {
                    return <strong key={i}>{boldMatch[1]}</strong>
                }

                // Italic
                const italicMatch = part.match(/^\*(.*?)\*$/)
                if (italicMatch) {
                    return <em key={i}>{italicMatch[1]}</em>
                }

                // Strikethrough
                const strikeMatch = part.match(/^~~(.*?)~~$/)
                if (strikeMatch) {
                    return <s key={i}>{strikeMatch[1]}</s>
                }

                // Inline Code
                const codeMatch = part.match(/^`(.*?)`$/)
                if (codeMatch) {
                    return <code key={i} className="inline-code">{codeMatch[1]}</code>
                }

                // Hyperlink [text](url)
                const hyperlinkMatch = part.match(/^\[([^\[\]]*)\]\(([^)]+)\)$/)
                if (hyperlinkMatch) {
                    const linkText = hyperlinkMatch[1]
                    const url = hyperlinkMatch[2]
                    return (
                        <a
                            key={i}
                            href={url}
                            className="hyperlink"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MarkdownRenderer
                                content={linkText}
                                onClick={onClick}
                                onHighlightHover={onHighlightHover}
                                onHighlightLeave={onHighlightLeave}
                                onHighlightEdit={onHighlightEdit}
                                onHighlightDelete={onHighlightDelete}
                            />
                            <ExternalLink className="hyperlink-icon" />
                        </a>
                    )
                }

                return part
            })}
        </span>
    )
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
    renderChild,
    viewMode,
    onLinkClick,
    onBacklinkTrigger,
    onBacklinkQueryChange,
    onBacklinkClose,
    onTableDataChange,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
    isDragOver,
    dropPosition,
    isDragging,
    onBlockSelect,
    onHighlightHover,
    onHighlightLeave,
    blocks
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

    // Get block className with selected state and drag state
    const getBlockClassName = () => {
        const classes = ['block']
        if (isSelected) classes.push('selected')
        if (isDragOver && dropPosition === 'above') classes.push('drop-above')
        if (isDragOver && dropPosition === 'below') classes.push('drop-below')
        if (isDragging) classes.push('dragging')
        return classes.join(' ')
    }

    const handleWrapperClick = (e: React.MouseEvent) => {
        // Only trigger if click is directly on the wrapper or handle
        if ((e.target as HTMLElement).closest('.block-handle')) {
            onHandleClick(e)
            return
        }
        // Shift-click for multi-select
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            // Note: If clicking inside textarea with Meta/Cmd, handleTextAreaClick will trigger.
            // But here we are on wrapper. Textarea click propagates to wrapper?
            // If we handle it in textarea and don't stop propagation, it might trigger this too.
            // But this selects the block.
            // If we are navigating, we probably don't want to select the block?
            // OR maybe we do.
            // Let's rely on handleTextAreaClick to handle the navigation.
            // If we navigate, component unmounts.

            // However, typical behavior: Cmd+Click on link -> Navigate.
            // Cmd+Click on block background -> Select.
            // The textarea covers most of the area.

            // If we clicked textarea, e.target will be textarea.
            if ((e.target as HTMLElement).tagName.toLowerCase() === 'textarea') {
                return // Let textarea handle it
            }

            e.preventDefault()
            onBlockSelect(block.block_id, e.shiftKey)
        }
    }

    const handleTextAreaClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
        if (!e.metaKey && !e.ctrlKey) return

        const target = e.currentTarget
        const cursor = target.selectionStart
        const value = target.value

        const regex = /\[\[(.+?)(?:\|.+?)?\]\]/g
        let match

        while ((match = regex.exec(value)) !== null) {
            const start = match.index
            const end = start + match[0].length

            if (cursor >= start && cursor <= end) {
                // Found a link under cursor
                const linkTarget = match[1]
                onLinkClick(linkTarget)
                return
            }
        }
    }

    // Drag handlers for the block handle
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', block.block_id)
        onDragStart(e, block.block_id)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver(e, block.block_id)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        onDrop(e, block.block_id)
    }

    // Common wrapper props
    const wrapperProps = {
        className: getBlockClassName(),
        onContextMenu,
        onClick: handleWrapperClick,
        onDragOver: handleDragOver,
        onDrop: handleDrop,
        onDragLeave: () => { },
        style: {
            paddingLeft: block.indent ? `${block.indent * 24}px` : undefined
        }
    }

    // Auto-resize textarea
    useLayoutEffect(() => {
        if (textareaRef.current) {
            // Reset height to auto to get correct scrollHeight
            textareaRef.current.style.height = 'auto'
            const scrollHeight = textareaRef.current.scrollHeight
            textareaRef.current.style.height = scrollHeight + 'px'
        }
    }, [block.content, viewMode])

    // Specific fix for initial load and mode switch adjustment
    useEffect(() => {
        if (textareaRef.current) {
            // Double check height after a tick to ensure styles are applied
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.style.height = 'auto'
                    textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
                }
            }, 0)
        }
    }, [viewMode])

    // Restore focus when block type changes (re-render) or isFocused becomes true
    useEffect(() => {
        if (isFocused && textareaRef.current) {
            // Prevent unnecessary focus calls if already focused
            if (document.activeElement !== textareaRef.current) {
                textareaRef.current.focus()

                // Optional: Maintain cursor position at end if it was a type conversion?
                // For now, default focus behavior usually puts cursor at end or all selected.
                // Should be fine for "- t" case where we want to be at end of "t".
                const length = textareaRef.current.value.length
                textareaRef.current.setSelectionRange(length, length)
            }
        }
    }, [isFocused, block.type])

    // Preview Mode Rendering
    if (viewMode === 'preview') {
        // For Toggle, we need to render children recursively in view mode too.
        if (block.type === 'toggle') {
            const isExpanded = !block.collapsed
            return (
                <div className="preview-toggle" style={{ paddingLeft: block.indent ? `${block.indent * 24}px` : undefined }}>
                    <div className="toggle-header-row">
                        <span className={`toggle-arrow ${isExpanded ? 'expanded' : ''}`} onClick={() => onToggleCollapse(!block.checked)}>▶</span>
                        <span className="toggle-title"><MarkdownRenderer content={block.content} onClick={onLinkClick} /></span>
                    </div>
                    {isExpanded && block.children && (
                        <div className="block-toggle-children">
                            {block.children.map((child, i) => (
                                <div key={child.block_id} className="preview-child">
                                    {/* Simple recursion for preview? Or proper component? */}
                                    {/* Ideally we should recurse BlockComponent with viewMode='preview' */}
                                    {/* But BlockComponent is not exported for recursion easily without props drilling */}
                                    {renderChild ? renderChild(child) : <div className="preview-text"><MarkdownRenderer content={child.content} onClick={onLinkClick} /></div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )
        }

        // All other block types in preview mode
        let contentElement: React.ReactNode = (
            <MarkdownRenderer
                content={block.content}
                onClick={onLinkClick}
                onHighlightHover={(e, text, comment) => {
                    onHighlightHover?.(e, block.block_id, text, comment)
                }}
                onHighlightLeave={onHighlightLeave}
            />
        )

        const previewStyle = { paddingLeft: block.indent ? `${block.indent * 24}px` : undefined }

        if (block.type === 'heading1') return <h1 className="preview-h1" style={previewStyle}>{contentElement}</h1>
        if (block.type === 'heading2') return <h2 className="preview-h2" style={previewStyle}>{contentElement}</h2>
        if (block.type === 'heading3') return <h3 className="preview-h3" style={previewStyle}>{contentElement}</h3>
        if (block.type === 'bullet') return <li className="preview-li" style={previewStyle}>{contentElement}</li>
        if (block.type === 'numbered') {
            const numbering = getNumberingForBlock(blocks, block.block_id)
            return (
                <li
                    className="preview-li-numbered"
                    style={previewStyle}
                    data-number={numbering?.display || '1'}
                    data-depth={numbering?.depth || 0}
                >
                    {contentElement}
                </li>
            )
        }
        if (block.type === 'todo') return (
            <div className="preview-todo" style={previewStyle}>
                <input type="checkbox" checked={block.checked} readOnly />
                <span className={block.checked ? 'checked' : ''}>{contentElement}</span>
            </div>
        )
        if (block.type === 'quote') return <blockquote className="preview-quote" style={previewStyle}>{contentElement}</blockquote>

        // Callout Block
        if (block.type === 'callout') {
            const match = block.content.match(/^\[!(.*?)\]\s?(.*)$/m)
            const type = match ? match[1].toLowerCase() : 'info'
            const content = match ? block.content.substring(match[0].length).trim() || match[2] : block.content

            // Determine Icon and Color class based on type
            let icon = 'ℹ️'
            let title = type.toUpperCase()
            if (type === 'tip' || type === 'success') { icon = '✅'; title = 'TIP' }
            if (type === 'warning') { icon = '⚠️'; title = 'WARNING' }
            if (type === 'danger' || type === 'error') { icon = '🚫'; title = 'ERROR' }
            if (type === 'note') { icon = '📝'; title = 'NOTE' }

            // If there's a title in the content line (after [!TYPE]), use it
            const titleMatch = block.content.match(/^\[!.*?\]\s*(.*?)(\n|$)/)
            if (titleMatch && titleMatch[1]) {
                title = titleMatch[1]
            }

            // Extract body (everything after the first line)
            const body = block.content.split('\n').slice(1).join('\n')

            // If simple one-liner
            const isOneLiner = block.content.indexOf('\n') === -1
            const displayContent = isOneLiner ? (match ? match[2] : block.content) : body

            return (
                <div className={`preview-callout callout-${type}`} style={{ paddingLeft: block.indent ? `${block.indent * 24}px` : undefined }}>
                    <div className="callout-header">
                        <span className="callout-icon">{icon}</span>
                        <strong className="callout-title">{title}</strong>
                    </div>
                    {/* Render body if exists, or remaining content if one-liner */}
                    {displayContent && (
                        <div className="callout-content">
                            <MarkdownRenderer content={displayContent} onClick={onLinkClick} />
                        </div>
                    )}
                </div>
            )
        }

        if (block.type === 'divider') return <hr className="preview-divider" />
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
                <div className="block-preview block-image-container" style={{ paddingLeft: block.indent ? `${block.indent * 24}px` : undefined }}>
                    {block.content ? (
                        <div className="image-wrapper">
                            <img src={imgSrc} alt={block.alt || 'Image'} />
                            {block.alt && <div className="image-caption">{block.alt}</div>}
                        </div>
                    ) : (
                        <div className="image-placeholder">
                            <ImageIcon size={24} />
                            <span>No image selected</span>
                        </div>
                    )}
                </div>
            )
        }

        // File block (Preview Mode)
        if (block.type === 'file') {
            return (
                <div className="block-preview block-file-container" style={{ paddingLeft: block.indent ? `${block.indent * 24}px` : undefined }}>
                    <FileBlock src={block.content} viewMode="preview" />
                </div>
            )
        }

        // Default text
        if (block.type === 'text') {
            return <div className="preview-text" style={{ paddingLeft: block.indent ? `${block.indent * 24}px` : undefined }}>{contentElement}</div>
        }

        // Code
        if (block.type === 'code') {
            return (
                <div className="preview-code" style={{ paddingLeft: block.indent ? `${block.indent * 24}px` : undefined }}>
                    <pre><code>{block.content}</code></pre>
                </div>
            )
        }

        // Table (Preview Mode)
        if (block.type === 'table' && block.tableData) {
            return (
                <div style={{ paddingLeft: block.indent ? `${block.indent * 24}px` : undefined }}>
                    <TableBlock
                        tableData={block.tableData}
                        onChange={() => { }}
                        viewMode="preview"
                    />
                </div>
            )
        }

        // Fallback for any unhandled types
        return <div className="block-preview" style={{ paddingLeft: block.indent ? `${block.indent * 24}px` : undefined }}>{contentElement}</div>
    }

    // ... Existing Edit Mode Renderers ...

    // Divider block
    if (block.type === 'divider') {
        return (
            <div {...wrapperProps}>
                <span className="block-handle" draggable onDragStart={handleDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span>
                <div
                    className="block-content block-divider-wrapper"
                    tabIndex={0}
                    onKeyDown={onKeyDown}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    ref={(el) => {
                        if (el) {
                            registerRef(el as unknown as HTMLTextAreaElement)
                        }
                    }}
                >
                    <hr className="block-divider" />
                </div>
            </div>
        )
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
                <span className="block-handle" draggable onDragStart={handleDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span>
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

    // File block (Edit Mode)
    if (block.type === 'file') {
        return (
            <div {...wrapperProps} className={getBlockClassName() + " block-file-container"}>
                <span className="block-handle" draggable onDragStart={handleDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span>
                <div className="block-content block-file">
                    <FileBlock src={block.content} viewMode="edit" />
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
                <span className="block-handle" draggable onDragStart={handleDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span>
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
                        onChange={(e) => {
                            onChange(e.target.value)
                            // Check for [[ trigger
                            const content = e.target.value
                            const cursorPosition = e.target.selectionStart
                            const textBeforeCursor = content.substring(0, cursorPosition)
                            const backlinkTriggerMatch = textBeforeCursor.match(/\[\[([^\]]*)$/)

                            if (backlinkTriggerMatch) {
                                const query = backlinkTriggerMatch[1]
                                const rect = e.target.getBoundingClientRect()
                                onBacklinkTrigger(block.block_id, query, { x: rect.left, y: rect.bottom + 5 })
                            } else {
                                onBacklinkClose()
                            }
                        }}
                        onKeyDown={onKeyDown}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        onClick={handleTextAreaClick}
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
                <span className="block-handle" draggable onDragStart={handleDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span>
                <div className="block-content block-list block-bullet">
                    <span className="bullet-icon">•</span>
                    <textarea
                        ref={(el) => {
                            textareaRef.current = el
                            registerRef(el)
                        }}
                        className={getInputClassName()}
                        value={block.content}
                        onChange={(e) => {
                            onChange(e.target.value)
                            // Check for [[ trigger
                            const content = e.target.value
                            const cursorPosition = e.target.selectionStart
                            const textBeforeCursor = content.substring(0, cursorPosition)
                            const backlinkTriggerMatch = textBeforeCursor.match(/\[\[([^\]]*)$/)

                            if (backlinkTriggerMatch) {
                                const query = backlinkTriggerMatch[1]
                                const rect = e.target.getBoundingClientRect()
                                onBacklinkTrigger(block.block_id, query, { x: rect.left, y: rect.bottom + 5 })
                            } else {
                                onBacklinkClose()
                            }
                        }}
                        onKeyDown={onKeyDown}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        onClick={handleTextAreaClick}
                        placeholder="List item"
                        rows={1}
                    />
                </div>
            </div>
        )
    }

    // Numbered list
    if (block.type === 'numbered') {
        const numbering = getNumberingForBlock(blocks, block.block_id)
        return (
            <div {...wrapperProps}>
                <span className="block-handle" draggable onDragStart={handleDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span>
                <div
                    className="block-content block-list block-numbered"
                    data-number={numbering?.display || '1'}
                    data-depth={numbering?.depth || 0}
                >
                    <textarea
                        ref={(el) => {
                            textareaRef.current = el
                            registerRef(el)
                        }}
                        className={getInputClassName()}
                        value={block.content}
                        onChange={(e) => {
                            onChange(e.target.value)
                            // Check for [[ trigger
                            const content = e.target.value
                            const cursorPosition = e.target.selectionStart
                            const textBeforeCursor = content.substring(0, cursorPosition)
                            const backlinkTriggerMatch = textBeforeCursor.match(/\[\[([^\]]*)$/)

                            if (backlinkTriggerMatch) {
                                const query = backlinkTriggerMatch[1]
                                const rect = e.target.getBoundingClientRect()
                                onBacklinkTrigger(block.block_id, query, { x: rect.left, y: rect.bottom + 5 })
                            } else {
                                onBacklinkClose()
                            }
                        }}
                        onKeyDown={onKeyDown}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        onClick={handleTextAreaClick}
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
                <span className="block-handle" draggable onDragStart={handleDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span>
                <div className="block-content block-callout">
                    <textarea
                        ref={(el) => {
                            textareaRef.current = el
                            registerRef(el)
                        }}
                        className={getInputClassName()}
                        value={block.content}
                        onChange={(e) => {
                            onChange(e.target.value)
                            // Check for [[ trigger
                            const content = e.target.value
                            const cursorPosition = e.target.selectionStart
                            const textBeforeCursor = content.substring(0, cursorPosition)
                            const backlinkTriggerMatch = textBeforeCursor.match(/\[\[([^\]]*)$/)

                            if (backlinkTriggerMatch) {
                                const query = backlinkTriggerMatch[1]
                                const rect = e.target.getBoundingClientRect()
                                onBacklinkTrigger(block.block_id, query, { x: rect.left, y: rect.bottom + 5 })
                            } else {
                                onBacklinkClose()
                            }
                        }}
                        onKeyDown={onKeyDown}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        onClick={handleTextAreaClick}
                        placeholder="Callout"
                        rows={1}
                    />
                </div>
            </div>
        )
    }

    // Toggle (Accordion) block
    if (block.type === 'toggle') {
        const hasChildren = block.children && block.children.length > 0
        const isExpanded = !block.collapsed

        return (
            <div {...wrapperProps} className={`${getBlockClassName()} block-toggle-wrapper`}>
                <span className="block-handle" draggable onDragStart={handleDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span>
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
                            onChange={(e) => {
                                onChange(e.target.value)
                                // Check for [[ trigger
                                const content = e.target.value
                                const cursorPosition = e.target.selectionStart
                                const textBeforeCursor = content.substring(0, cursorPosition)
                                const backlinkTriggerMatch = textBeforeCursor.match(/\[\[([^\]]*)$/)

                                if (backlinkTriggerMatch) {
                                    const query = backlinkTriggerMatch[1]
                                    const rect = e.target.getBoundingClientRect()
                                    onBacklinkTrigger(block.block_id, query, { x: rect.left, y: rect.bottom + 5 })
                                } else {
                                    onBacklinkClose()
                                }
                            }}
                            onKeyDown={onKeyDown}
                            onFocus={onFocus}
                            onBlur={onBlur}
                            onClick={handleTextAreaClick}
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
                                        onClick={handleTextAreaClick}
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
                <span className="block-handle" draggable onDragStart={handleDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span>
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

    // Table block (Edit Mode)
    if (block.type === 'table') {
        const tableData = block.tableData || createDefaultTableData()
        return (
            <div {...wrapperProps}>
                <span className="block-handle" draggable onDragStart={handleDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span>
                <div className="block-content">
                    <TableBlock
                        tableData={tableData}
                        onChange={(newData) => {
                            if (onTableDataChange) {
                                onTableDataChange(newData)
                            }
                        }}
                        viewMode="edit"
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
            <span className="block-handle" draggable onDragStart={handleDragStart} onDragEnd={onDragEnd}><GripVertical size={14} /></span>
            <div className="block-content" style={{ position: 'relative' }}>
                {/* Unfocused: Show MarkdownRenderer overlay */}
                {!isFocused && block.content && (
                    <div
                        className={`block-markdown-overlay ${getInputClassName()}`}
                        onClick={(e) => {
                            e.stopPropagation()
                            textareaRef.current?.focus()
                        }}
                    >
                        <MarkdownRenderer
                            content={block.content}
                            onClick={onLinkClick}
                            onHighlightHover={(e, text, comment) => {
                                onHighlightHover?.(e, block.block_id, text, comment)
                            }}
                            onHighlightLeave={onHighlightLeave}
                        />
                    </div>
                )}
                <textarea
                    ref={(el) => {
                        textareaRef.current = el
                        registerRef(el)
                    }}
                    className={getInputClassName()}
                    style={{ opacity: isFocused || !block.content ? 1 : 0, position: isFocused || !block.content ? 'relative' : 'absolute', top: 0, left: 0, right: 0 }}
                    value={block.content}
                    onChange={(e) => {
                        onChange(e.target.value)
                        // Check for [[ trigger
                        const content = e.target.value
                        const cursorPosition = e.target.selectionStart
                        const textBeforeCursor = content.substring(0, cursorPosition)
                        const backlinkTriggerMatch = textBeforeCursor.match(/\[\[([^\]]*)$/)

                        if (backlinkTriggerMatch) {
                            const query = backlinkTriggerMatch[1]
                            const rect = e.target.getBoundingClientRect()
                            onBacklinkTrigger(block.block_id, query, { x: rect.left, y: rect.bottom + 5 })
                        } else {
                            onBacklinkClose()
                        }
                    }}
                    onKeyDown={onKeyDown}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    onClick={handleTextAreaClick}
                    placeholder={getPlaceholder()}
                    rows={1}
                />
            </div>
        </div>
    )
}

export default function BlockEditor({ document, tabId, viewMode }: BlockEditorProps) {
    const { updateDocument, updateDocumentMeta, saveTab, openTab } = useEditorStore()
    const { documentIndex, vaultPath, createNewFile } = useVaultStore() // Added useVaultStore
    const { getDiffsForFile, getDiffForBlock, acceptDiff, rejectDiff } = useDiffStore()
    const [blocks, setBlocks] = useState<Block[]>(document.blocks)
    const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)
    const [slashMenuPosition, setSlashMenuPosition] = useState<{ x: number; y: number } | null>(null)
    const [slashMenuBlockId, setSlashMenuBlockId] = useState<string | null>(null)
    const [backlinkMenu, setBacklinkMenu] = useState<{ position: { x: number, y: number }, query: string, blockId: string } | null>(null)
    const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set())
    const [blockMenu, setBlockMenu] = useState<{ id: string, position: { x: number, y: number } } | null>(null)
    const blockRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
    const isLocalUpdate = useRef(false)
    const editorRef = useRef<HTMLDivElement>(null)

    // Title Sync Logic - REMOVED


    // Drag-and-drop state
    const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null)
    const [dropTargetId, setDropTargetId] = useState<string | null>(null)
    const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)
    const lastSelectRef = useRef<string | null>(null)

    // Drag selection box state
    const [isSelecting, setIsSelecting] = useState(false)
    const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null)
    const [selectionEnd, setSelectionEnd] = useState<{ x: number, y: number } | null>(null)

    // Highlight state
    const {
        isModalOpen: isHighlightModalOpen,
        openCreateModal: openHighlightCreateModal,
        openEditModal: openHighlightEditModal,
        closeModal: closeHighlightModal,
        selectedText: highlightSelectedText,
        selectedRange: highlightSelectedRange,
        comment: highlightComment,
        setComment: setHighlightComment,
        modalMode: highlightModalMode,
        editingHighlight
    } = useHighlightStore()
    const [highlightTooltip, setHighlightTooltip] = useState<{
        visible: boolean
        position: { x: number, y: number }
        text: string
        comment: string
        blockId: string
    } | null>(null)
    const highlightHoverTimer = useRef<NodeJS.Timeout | null>(null)

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

    // Drag-and-drop handlers
    const handleDragStart = useCallback((e: React.DragEvent, blockId: string) => {
        setDraggedBlockId(blockId)
        // If dragging a non-selected block, only drag that one
        // If dragging a selected block, drag all selected
        if (!selectedBlockIds.has(blockId)) {
            setSelectedBlockIds(new Set([blockId]))
        }
    }, [selectedBlockIds])

    const handleDragEnd = useCallback(() => {
        setDraggedBlockId(null)
        setDropTargetId(null)
        setDropPosition(null)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent, targetBlockId: string) => {
        if (draggedBlockId === targetBlockId) return
        if (selectedBlockIds.has(targetBlockId)) return

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const midY = rect.top + rect.height / 2
        const position = e.clientY < midY ? 'above' : 'below'

        setDropTargetId(targetBlockId)
        setDropPosition(position)
    }, [draggedBlockId, selectedBlockIds])

    const handleDrop = useCallback((e: React.DragEvent, targetBlockId: string) => {
        if (!draggedBlockId || draggedBlockId === targetBlockId) {
            handleDragEnd()
            return
        }

        // Get blocks to move (either just dragged one or all selected)
        const blocksToMove = selectedBlockIds.has(draggedBlockId)
            ? [...selectedBlockIds]
            : [draggedBlockId]

        isLocalUpdate.current = true
        setBlocks(prev => {
            // Remove blocks to move
            const remaining = prev.filter(b => !blocksToMove.includes(b.block_id))
            const movedBlocks = prev.filter(b => blocksToMove.includes(b.block_id))

            // Find target index in remaining array
            const targetIdx = remaining.findIndex(b => b.block_id === targetBlockId)
            if (targetIdx === -1) return prev

            // Insert at correct position
            const insertIdx = dropPosition === 'below' ? targetIdx + 1 : targetIdx
            return [
                ...remaining.slice(0, insertIdx),
                ...movedBlocks,
                ...remaining.slice(insertIdx)
            ]
        })

        handleDragEnd()
        setSelectedBlockIds(new Set())
    }, [draggedBlockId, dropPosition, selectedBlockIds, handleDragEnd])

    // Multi-select with Shift-click
    const handleBlockSelect = useCallback((blockId: string, shiftKey: boolean) => {
        if (shiftKey && lastSelectRef.current) {
            // Range select
            const startIdx = blocks.findIndex(b => b.block_id === lastSelectRef.current)
            const endIdx = blocks.findIndex(b => b.block_id === blockId)
            if (startIdx !== -1 && endIdx !== -1) {
                const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
                const rangeIds = blocks.slice(from, to + 1).map(b => b.block_id)
                setSelectedBlockIds(new Set(rangeIds))
            }
        } else {
            // Toggle single selection
            setSelectedBlockIds(prev => {
                const newSet = new Set(prev)
                if (newSet.has(blockId)) {
                    newSet.delete(blockId)
                } else {
                    newSet.add(blockId)
                }
                return newSet
            })
            lastSelectRef.current = blockId
        }
    }, [blocks])

    // Selection box drag handlers
    const handleEditorMouseDown = useCallback((e: React.MouseEvent) => {
        // Disable selection in preview mode
        if (viewMode === 'preview') return
        // Only start selection if clicking directly on the editor (not a block)
        if ((e.target as HTMLElement).closest('.block') || (e.target as HTMLElement).closest('.document-header')) return

        setIsSelecting(true)
        setSelectionStart({ x: e.clientX, y: e.clientY })
        setSelectionEnd({ x: e.clientX, y: e.clientY })
        setSelectedBlockIds(new Set())
    }, [viewMode])

    const handleEditorMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isSelecting || !selectionStart) return

        setSelectionEnd({ x: e.clientX, y: e.clientY })

        // Calculate selection box bounds
        const minX = Math.min(selectionStart.x, e.clientX)
        const maxX = Math.max(selectionStart.x, e.clientX)
        const minY = Math.min(selectionStart.y, e.clientY)
        const maxY = Math.max(selectionStart.y, e.clientY)

        // Find blocks that intersect with the selection box
        const selectedIds = new Set<string>()
        blocks.forEach(block => {
            const el = blockRefs.current.get(block.block_id)?.closest('.block') as HTMLElement
            if (el) {
                const rect = el.getBoundingClientRect()
                // Check if block intersects with selection box
                if (rect.right >= minX && rect.left <= maxX &&
                    rect.bottom >= minY && rect.top <= maxY) {
                    selectedIds.add(block.block_id)
                }
            }
        })
        setSelectedBlockIds(selectedIds)
    }, [isSelecting, selectionStart, blocks])

    const handleEditorMouseUp = useCallback(() => {
        setIsSelecting(false)
        setSelectionStart(null)
        setSelectionEnd(null)
    }, [])

    // Get selection box style
    const getSelectionBoxStyle = useCallback(() => {
        if (!isSelecting || !selectionStart || !selectionEnd) return undefined
        const left = Math.min(selectionStart.x, selectionEnd.x)
        const top = Math.min(selectionStart.y, selectionEnd.y)
        const width = Math.abs(selectionEnd.x - selectionStart.x)
        const height = Math.abs(selectionEnd.y - selectionStart.y)
        return { left, top, width, height }
    }, [isSelecting, selectionStart, selectionEnd])

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
            // Works when blocks are selected, even if text is focused (on Mac, check if selection in text)
            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedBlockIds.size > 0) {
                const activeEl = window.document.activeElement
                // Only delete blocks if not typing in a textarea OR if text is empty
                if (!(activeEl instanceof HTMLTextAreaElement) ||
                    (activeEl.selectionStart === 0 && activeEl.selectionEnd === 0 && activeEl.value === '')) {
                    e.preventDefault()
                    isLocalUpdate.current = true
                    setBlocks(prev => {
                        const rem = prev.filter(b => !selectedBlockIds.has(b.block_id))
                        if (rem.length === 0) return [createNewBlock('')]
                        return rem
                    })
                    setSelectedBlockIds(new Set())
                }
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

            // Cmd/Ctrl + Shift + H: Highlight toggle
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'h') {
                const activeEl = window.document.activeElement
                if (activeEl instanceof HTMLTextAreaElement) {
                    const { selectionStart, selectionEnd, value } = activeEl
                    const selectedText = value.slice(selectionStart, selectionEnd)

                    if (selectedText && focusedBlockId) {
                        e.preventDefault()
                        openHighlightCreateModal(selectedText, focusedBlockId, selectionStart, selectionEnd)
                    }
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [tabId, saveTab, blocks, selectedBlockIds, focusedBlockId, blockMenu, createNewBlock, openHighlightCreateModal])

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

    // Global keyboard shortcuts (Cmd+E to toggle view mode)
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'e') {
                e.preventDefault()
                const { toggleViewMode } = useEditorStore.getState()
                toggleViewMode(tabId)
            }
        }
        window.addEventListener('keydown', handleGlobalKeyDown)
        return () => window.removeEventListener('keydown', handleGlobalKeyDown)
    }, [tabId])

    const handleBlockKeyDown = useCallback((
        e: React.KeyboardEvent,
        block: Block
    ) => {
        const textarea = e.currentTarget as HTMLTextAreaElement
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

            // Preserve block type for list blocks and inherit indent
            if (block.type === 'numbered' || block.type === 'bullet' || block.type === 'todo') {
                newBlock.type = block.type
                newBlock.indent = block.indent // Inherit indent level
            }

            insertBlockAfter(block.block_id, newBlock)

            focusBlock(newBlock.block_id, 0)
        }

        // Tab: Indent
        if (e.key === 'Tab') {
            e.preventDefault()
            const { indentBlock, outdentBlock } = useEditorStore.getState()
            if (e.shiftKey) {
                outdentBlock(tabId, block.block_id)
            } else {
                indentBlock(tabId, block.block_id)
            }
            return
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

        // Space: Check for markdown shortcuts
        if (e.key === ' ' && block.type === 'text') {
            const contentBeforeCursor = block.content.slice(0, selectionStart)
            // Regex to check if we are at end of a potential shortcut pattern
            // Need to match exact patterns that end with space, but we are pressing space now.
            // So we check if contentBeforeCursor matches the trigger.

            const detectShortcutOnSpace = (input: string) => {
                const trimmed = input.trim()
                if (trimmed === '#') return { type: 'heading1' as BlockType, content: '' }
                if (trimmed === '##') return { type: 'heading2' as BlockType, content: '' }
                if (trimmed === '###') return { type: 'heading3' as BlockType, content: '' }
                if (trimmed === '-' || trimmed === '*') return { type: 'bullet' as BlockType, content: '' }
                if (trimmed === '[]' || trimmed === '[ ]') return { type: 'todo' as BlockType, content: '', checked: false }
                if (trimmed === '>') return { type: 'quote' as BlockType, content: '' }
                if (trimmed === '>>') return { type: 'toggle' as BlockType, content: '', collapsed: false }

                // Numbered list: "1." or "1)"
                if (/^\d+\.$/.test(trimmed)) return { type: 'numbered' as BlockType, content: '' }

                return null
            }

            const shortcut = detectShortcutOnSpace(contentBeforeCursor)
            if (shortcut) {
                e.preventDefault()
                // Update block type
                updateBlock(block.block_id, shortcut)

                // If there was content after cursor, we should probably keep it?
                // But usually markdown shortcuts are at start of empty-ish line.
                // If we have "- " and press space, we want bullet.
                // If we have "some text - " and press space, we probably DON'T want bullet unless it started line.
                // Check if it's at start of line (ignoring indent)
                // input.trim() handles ignoring spaces.
                // But we must ensure there's nothing else before it.
                // contentBeforeCursor must be ONLY the shortcut pattern (plus spaces).

                const leadingSpaces = contentBeforeCursor.match(/^\s*/)
                const pattern = contentBeforeCursor.trim()
                // If pattern matches and it's solely what's before cursor

                // Wait, if I type "-[space]", cursor is at 1. `beforeCursor` is "-". `detect` returns bullet.
                // Correct.

                return
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

        // Removed detectShortcut call from onChange to prevent IME issues.
        // Shortcuts are now handled in handleBlockKeyDown on 'Space' key.

        /* 
        const detectShortcut = (input: string) => { ... }
        if (block.type === 'text') { ... } 
        */

        // Image/File regex check - Obsidian style ![[filename]] or ![[filename|alt]]
        if (value.startsWith('![[')) {
            const match = value.match(/^!\[\[(.+?)(?:\|(.+?))?\]\]$/)
            if (match) {
                const fileName = match[1]
                // Check if it's a non-image file (treat as file block)
                const ext = fileName.split('.').pop()?.toLowerCase() || ''
                const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
                if (!imageExts.includes(ext)) {
                    updateBlock(block.block_id, {
                        type: 'file',
                        content: fileName
                    })
                    return
                }
                // Otherwise treat as image
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

        if (type === 'file') {
            // @ts-ignore
            const filePath = await window.api.openPdfDialog()
            if (filePath) {
                updateBlock(slashMenuBlockId, {
                    type: 'file',
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

        if (type === 'table') {
            updateBlock(slashMenuBlockId, {
                type: 'table',
                content: '',
                tableData: createDefaultTableData()
            })
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
    const [isAddingProperty, setIsAddingProperty] = useState(false)
    const [newPropKey, setNewPropKey] = useState('')
    const [newPropValue, setNewPropValue] = useState('')

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
        <div
            className={`block-editor ${isSelecting ? 'selecting' : ''}`}
            ref={editorRef}
            onMouseDown={handleEditorMouseDown}
            onMouseMove={handleEditorMouseMove}
            onMouseUp={handleEditorMouseUp}
            onMouseLeave={handleEditorMouseUp}
        >
            {/* Selection Box */}
            {isSelecting && selectionStart && selectionEnd && (
                <div
                    className="selection-box"
                    style={getSelectionBoxStyle()}
                />
            )}
            {/* Header */}
            {/* Header */}
            <div className="document-header">
                <input
                    className="document-title-input"
                    value={document.meta.title}
                    onChange={(e) => updateDocumentMeta(tabId, { title: e.target.value })}
                    placeholder="Untitled"
                />
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

                    {/* Custom Metadata */}
                    {Object.entries(document.meta).map(([key, value]) => {
                        if (['id', 'title', 'tags', 'created_at', 'updated_at', 'alwaysOn'].includes(key)) return null
                        return (
                            <div key={key} className="meta-row">
                                <span className="meta-label">{key}</span>
                                <input
                                    className="meta-value-input"
                                    value={String(value)}
                                    onChange={(e) => updateDocumentMeta(tabId, { [key]: e.target.value })}
                                />
                            </div>
                        )
                    })}

                    {/* Add Property Button */}
                    {isAddingProperty ? (
                        <div className="meta-add-row">
                            <input
                                className="meta-key-input"
                                placeholder="Property name"
                                value={newPropKey}
                                onChange={(e) => setNewPropKey(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        if (newPropKey && newPropValue) {
                                            updateDocumentMeta(tabId, { [newPropKey]: newPropValue })
                                            setNewPropKey('')
                                            setNewPropValue('')
                                            setIsAddingProperty(false)
                                        }
                                    }
                                }}
                            />
                            <input
                                className="meta-value-input"
                                placeholder="Value"
                                value={newPropValue}
                                onChange={(e) => setNewPropValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        if (newPropKey && newPropValue) {
                                            updateDocumentMeta(tabId, { [newPropKey]: newPropValue })
                                            setNewPropKey('')
                                            setNewPropValue('')
                                            setIsAddingProperty(false)
                                        }
                                    }
                                }}
                            />
                            <button
                                className="meta-add-confirm-btn"
                                onClick={() => {
                                    if (newPropKey && newPropValue) {
                                        updateDocumentMeta(tabId, { [newPropKey]: newPropValue })
                                        setNewPropKey('')
                                        setNewPropValue('')
                                        setIsAddingProperty(false)
                                    }
                                }}
                            >Add</button>
                            <button
                                className="meta-add-cancel-btn"
                                onClick={() => setIsAddingProperty(false)}
                            >Cancel</button>
                        </div>
                    ) : (
                        <button
                            className="meta-add-btn"
                            onClick={() => setIsAddingProperty(true)}
                        >
                            + Add property
                        </button>
                    )}
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
                    viewMode={viewMode}
                    onLinkClick={(target) => {
                        // Find the file in vault docs
                        const doc = documentIndex.find(d => d.title === target || d.path.endsWith(`/${target}.md`)) // Simple matching
                        if (doc) {
                            openTab(doc.path, doc.title)
                        } else {
                            // Link to non-existent file? Create it!
                            if (vaultPath) {
                                // Default to creating in root for now
                                createNewFile(vaultPath, `${target}.md`).then((newPath) => {
                                    if (newPath) {
                                        openTab(newPath, target)
                                    }
                                })
                            } else {
                                console.warn('File not found and no vault path:', target)
                            }
                        }
                    }}
                    onBacklinkTrigger={(blockId, query, position) => {
                        setBacklinkMenu({ blockId, query, position })
                    }}
                    onBacklinkQueryChange={(query) => {
                        setBacklinkMenu(prev => prev ? { ...prev, query } : null)
                    }}
                    onBacklinkClose={() => {
                        setBacklinkMenu(null)
                    }}
                    onTableDataChange={(data) => {
                        updateBlock(block.block_id, { tableData: data })
                    }}
                    // Drag-and-drop props
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    isDragOver={dropTargetId === block.block_id}
                    dropPosition={dropTargetId === block.block_id ? dropPosition : null}
                    isDragging={draggedBlockId === block.block_id || (!!draggedBlockId && selectedBlockIds.has(block.block_id))}
                    onBlockSelect={handleBlockSelect}
                    onHighlightHover={(e, blockId, text, comment) => {
                        // Clear any pending hide timer
                        if (highlightHoverTimer.current) {
                            clearTimeout(highlightHoverTimer.current)
                            highlightHoverTimer.current = null
                        }

                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        setHighlightTooltip({
                            visible: true,
                            position: { x: rect.left, y: rect.bottom + 5 },
                            text,
                            comment,
                            blockId
                        })
                    }}
                    onHighlightLeave={() => {
                        // Delay hiding to allow mouse to move to tooltip
                        highlightHoverTimer.current = setTimeout(() => {
                            setHighlightTooltip(null)
                        }, 150)
                    }}
                    blocks={blocks}
                />
            ))}

            {/* Backlinks Section - rendered after all blocks */}
            <BacklinkSection currentNoteId={document.filePath} />

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

            {/* Backlink Menu */}
            {backlinkMenu && (
                <BacklinkMenu
                    position={backlinkMenu.position}
                    query={backlinkMenu.query}
                    onSelect={async (fileName) => {
                        if (backlinkMenu.blockId) {
                            const block = blocks.find(b => b.block_id === backlinkMenu.blockId)
                            if (block) {
                                // Replace [[query with [[fileName]]
                                const content = block.content
                                // Simple replacement for now, ideally precise range
                                const newContent = content.replace(/\[\[([^\]]*)$/, `[[${fileName}]]`)
                                updateBlock(block.block_id, { content: newContent })
                            }
                        }

                        // Check if file exists, if not create logic
                        const exists = documentIndex.some(d => d.title === fileName)
                        if (!exists && vaultPath) {
                            await createNewFile(vaultPath, `${fileName}.md`)
                        }

                        setBacklinkMenu(null)
                        // Refocus
                        const textarea = blockRefs.current.get(backlinkMenu.blockId)
                        if (textarea) textarea.focus()
                    }}
                    onClose={() => setBacklinkMenu(null)}
                />
            )}

            {/* Highlight Modal */}
            {isHighlightModalOpen && (
                <HighlightModal
                    onSave={(comment) => {
                        if (highlightSelectedRange && highlightModalMode === 'create') {
                            // Create new highlight
                            const { blockId, start, end } = highlightSelectedRange
                            const block = blocks.find(b => b.block_id === blockId)
                            if (block) {
                                const selectedText = block.content.slice(start, end)
                                const date = new Date().toISOString().split('T')[0]
                                const commentWithDate = comment ? `${comment}|${date}` : ''
                                const highlightSyntax = commentWithDate
                                    ? `==${selectedText}==^[${commentWithDate}]`
                                    : `==${selectedText}==`
                                const newContent = block.content.slice(0, start) + highlightSyntax + block.content.slice(end)
                                isLocalUpdate.current = true
                                setBlocks(prev => prev.map(b =>
                                    b.block_id === blockId ? { ...b, content: newContent } : b
                                ))
                            }
                        } else if (editingHighlight && highlightModalMode === 'edit') {
                            // Edit existing highlight
                            const { blockId, originalText } = editingHighlight
                            const block = blocks.find(b => b.block_id === blockId)
                            if (block) {
                                // Find and replace the old highlight with new comment
                                const oldPattern = new RegExp(`==${originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}==(?:\\^\\[.*?\\])?`)
                                const newHighlight = comment
                                    ? `==${originalText}==^[${comment}]`
                                    : `==${originalText}==`
                                const newContent = block.content.replace(oldPattern, newHighlight)
                                isLocalUpdate.current = true
                                setBlocks(prev => prev.map(b =>
                                    b.block_id === blockId ? { ...b, content: newContent } : b
                                ))
                            }
                        }
                        closeHighlightModal()
                    }}
                    onCancel={() => closeHighlightModal()}
                />
            )}

            {/* Highlight Tooltip */}
            {highlightTooltip?.visible && (
                <HighlightTooltip
                    comment={highlightTooltip.comment}
                    position={highlightTooltip.position}
                    onClose={() => setHighlightTooltip(null)}
                    onMouseEnter={() => {
                        // Clear hide timer when entering tooltip
                        if (highlightHoverTimer.current) {
                            clearTimeout(highlightHoverTimer.current)
                            highlightHoverTimer.current = null
                        }
                    }}
                    onMouseLeave={() => {
                        // Hide tooltip when leaving
                        highlightHoverTimer.current = setTimeout(() => {
                            setHighlightTooltip(null)
                        }, 150)
                    }}
                    onEdit={() => {
                        openHighlightEditModal(
                            highlightTooltip.blockId,
                            highlightTooltip.text,
                            highlightTooltip.comment
                        )
                        setHighlightTooltip(null)
                    }}
                    onDelete={() => {
                        // Remove highlight from block
                        const block = blocks.find(b => b.block_id === highlightTooltip.blockId)
                        if (block) {
                            // Pattern that handles nested [[backlinks]] and |date in comments
                            const escapedText = highlightTooltip.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                            const pattern = new RegExp(`==${escapedText}==(?:\\^\\[(?:[^\\[\\]]|\\[\\[.*?\\]\\])*\\])?`)
                            const newContent = block.content.replace(pattern, highlightTooltip.text)
                            isLocalUpdate.current = true
                            setBlocks(prev => prev.map(b =>
                                b.block_id === highlightTooltip.blockId ? { ...b, content: newContent } : b
                            ))
                        }
                        setHighlightTooltip(null)
                    }}
                    onBacklinkClick={(target) => {
                        const doc = documentIndex.find(d => d.title === target)
                        if (doc) {
                            openTab(doc.path, doc.title)
                        }
                        setHighlightTooltip(null)
                    }}
                />
            )}
        </div>
    )
}
