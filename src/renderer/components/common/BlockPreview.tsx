import React from 'react'
import { Check, Image as ImageIcon, X } from 'lucide-react'
import type { Block, TableCell, PendingDiff } from '@shared/types'
import { MarkdownRenderer } from './MarkdownRenderer'
import { getNumberingForBlock } from '../../utils/numberingUtils'
import FileBlock from '../Editor/FileBlock'
import TableBlock from '../Editor/TableBlock'

interface BlockPreviewProps {
    block: Block
    blocks: Block[]
    onLinkClick: (target: string) => void
    onTodoToggle?: (checked: boolean) => void
    onToggleCollapse?: (collapsed: boolean) => void
    onHighlightHover?: (e: React.MouseEvent, blockId: string, text: string, comment: string) => void
    onHighlightLeave?: () => void
    renderChild?: (block: Block) => React.ReactNode
    diff?: PendingDiff
    onAcceptDiff?: (diffId: string) => void
    onRejectDiff?: (diffId: string) => void
}

const DiffFooter = ({ onAccept, onReject }: { onAccept: () => void, onReject: () => void }) => (
    <div className="diff-footer">
        <button
            className="diff-btn diff-btn-reject"
            onClick={(e) => {
                e.stopPropagation()
                onReject()
            }}
        >
            Reject change
        </button>
        <button
            className="diff-btn diff-btn-accept"
            onClick={(e) => {
                e.stopPropagation()
                onAccept()
            }}
        >
            Accept change
        </button>
    </div>
)

export const BlockPreview = ({
    block,
    blocks,
    onLinkClick,
    onTodoToggle,
    onToggleCollapse,
    onHighlightHover,
    onHighlightLeave,
    renderChild,
    diff,
    onAcceptDiff,
    onRejectDiff
}: BlockPreviewProps) => {
    if (diff) {
        if (diff.type === 'delete') {
            return (
                <div className="diff-item diff-delete">
                    <div className="diff-content-wrapper">
                        <div className="diff-old">
                            <BlockPreview
                                block={block}
                                blocks={blocks}
                                onLinkClick={onLinkClick}
                            />
                        </div>
                    </div>
                    <DiffFooter
                        onAccept={() => onAcceptDiff?.(diff.id)}
                        onReject={() => onRejectDiff?.(diff.id)}
                    />
                </div>
            )
        }

        if (diff.type === 'update' && diff.newContent !== undefined) {
            const newBlock = { ...block, content: diff.newContent }
            
            return (
                <div className="diff-item diff-update">
                    <div className="diff-content-wrapper">
                        <div className="diff-old">
                            <BlockPreview
                                block={block}
                                blocks={blocks}
                                onLinkClick={onLinkClick}
                            />
                        </div>
                        <div className="diff-arrow">↓</div>
                        <div className="diff-new">
                            <BlockPreview
                                block={newBlock}
                                blocks={blocks}
                                onLinkClick={onLinkClick}
                            />
                        </div>
                    </div>
                    <DiffFooter
                        onAccept={() => onAcceptDiff?.(diff.id)}
                        onReject={() => onRejectDiff?.(diff.id)}
                    />
                </div>
            )
        }
        
        if (diff.type === 'insert' && diff.newContent !== undefined) {
             const newBlock = { ...block, content: diff.newContent, type: diff.blockType || 'text' }
             return (
                <div className="diff-item diff-insert">
                    <div className="diff-content-wrapper">
                        <div className="diff-new">
                            <BlockPreview
                                block={newBlock}
                                blocks={blocks}
                                onLinkClick={onLinkClick}
                            />
                        </div>
                    </div>
                     <DiffFooter
                        onAccept={() => onAcceptDiff?.(diff.id)}
                        onReject={() => onRejectDiff?.(diff.id)}
                    />
                </div>
             )
        }
    }

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
            <div
                className={`block-checkbox ${block.checked ? 'checked' : ''}`}
                onClick={() => onTodoToggle?.(!block.checked)}
            >
                {block.checked && <Check size={12} strokeWidth={3} />}
            </div>
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
            <div className={`preview-callout callout-${type}`} style={previewStyle}>
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

    if (block.type === 'divider') return <hr className="preview-divider" style={previewStyle} />
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
            <div className="block-preview block-image-container" style={previewStyle}>
                {block.content ? (
                    <div className="image-wrapper">
                        <img src={imgSrc} alt={block.alt || 'Image'} style={{ maxWidth: '100%', height: 'auto' }} />
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
            <div className="block-preview block-file-container" style={previewStyle}>
                <FileBlock src={block.content} viewMode="preview" />
            </div>
        )
    }

    // Default text
    if (block.type === 'text') {
        return <div className="preview-text" style={previewStyle}>{contentElement}</div>
    }

    // Code
    if (block.type === 'code') {
        return (
            <div className="preview-code" style={previewStyle}>
                <pre style={{ maxWidth: '100%', overflowX: 'auto' }}><code>{block.content}</code></pre>
            </div>
        )
    }

    // Table (Preview Mode)
    if (block.type === 'table' && block.tableData) {
        return (
            <div style={previewStyle}>
                <TableBlock
                    tableData={block.tableData}
                    onChange={() => { }}
                    viewMode="preview"
                />
            </div>
        )
    }

    // Toggle block
    if (block.type === 'toggle') {
        const isExpanded = !block.collapsed
        return (
            <div className="preview-toggle" style={previewStyle}>
                <div className="toggle-header-row">
                    <span
                        className={`toggle-arrow ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => onToggleCollapse?.(!block.collapsed)}
                    >
                        ▶
                    </span>
                    <span className="toggle-title">
                        <MarkdownRenderer content={block.content} onClick={onLinkClick} />
                    </span>
                </div>
                {isExpanded && block.children && (
                    <div className="block-toggle-children">
                        {block.children.map((child) => (
                            <div key={child.block_id} className="preview-child">
                                {renderChild ? renderChild(child) : (
                                    <div className="preview-text">
                                        <MarkdownRenderer content={child.content} onClick={onLinkClick} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    // Fallback for any unhandled types
    return <div className="block-preview" style={previewStyle}>{contentElement}</div>
}
