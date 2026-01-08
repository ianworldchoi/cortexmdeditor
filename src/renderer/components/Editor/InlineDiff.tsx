import React, { useState } from 'react'
import { Check, X } from 'lucide-react'
import type { PendingDiff, Block, BlockType } from '@shared/types'
import { MarkdownRenderer } from '../common/MarkdownRenderer'

interface InlineDiffProps {
    diff: PendingDiff
    block: Block
    blocks: Block[]
    onAccept: (diffId: string) => void
    onReject: (diffId: string) => void
    onLinkClick?: (target: string) => void
}

/**
 * InlineDiff Component
 * 
 * Renders inline diff visualization for block changes.
 * Shows delete (red) and insert (green) styled blocks with
 * accept/reject buttons on hover.
 */
export default function InlineDiff({
    diff,
    block,
    blocks,
    onAccept,
    onReject,
    onLinkClick = () => { }
}: InlineDiffProps) {
    const [isHovered, setIsHovered] = useState(false)

    const handleAccept = (e: React.MouseEvent) => {
        e.stopPropagation()
        onAccept(diff.id)
    }

    const handleReject = (e: React.MouseEvent) => {
        e.stopPropagation()
        onReject(diff.id)
    }

    // Render delete diff - show old content with strikethrough
    if (diff.type === 'delete') {
        return (
            <div
                className="inline-diff inline-diff-delete"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <span className="inline-diff-marker">-</span>
                <div className="inline-diff-content">
                    <MarkdownRenderer
                        content={diff.oldContent || block.content}
                        onClick={onLinkClick}
                    />
                </div>
                <div className={`inline-diff-controls ${isHovered ? 'visible' : ''}`}>
                    <button
                        className="inline-diff-btn inline-diff-btn-reject"
                        onClick={handleReject}
                        title="Reject"
                    >
                        <X size={14} />
                    </button>
                    <button
                        className="inline-diff-btn inline-diff-btn-accept"
                        onClick={handleAccept}
                        title="Accept (Delete)"
                    >
                        <Check size={14} />
                    </button>
                </div>
            </div>
        )
    }

    // Render update diff - show old and new content
    if (diff.type === 'update') {
        return (
            <div
                className="inline-diff inline-diff-update"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Old content - delete style */}
                <div className="inline-diff-row inline-diff-delete">
                    <span className="inline-diff-marker">-</span>
                    <div className="inline-diff-content">
                        <MarkdownRenderer
                            content={diff.oldContent || block.content}
                            onClick={onLinkClick}
                        />
                    </div>
                </div>
                {/* New content - insert style */}
                <div className="inline-diff-row inline-diff-insert">
                    <span className="inline-diff-marker">+</span>
                    <div className="inline-diff-content">
                        <MarkdownRenderer
                            content={diff.newContent || ''}
                            onClick={onLinkClick}
                        />
                    </div>
                </div>
                <div className={`inline-diff-controls ${isHovered ? 'visible' : ''}`}>
                    <button
                        className="inline-diff-btn inline-diff-btn-reject"
                        onClick={handleReject}
                        title="Reject"
                    >
                        <X size={14} />
                    </button>
                    <button
                        className="inline-diff-btn inline-diff-btn-accept"
                        onClick={handleAccept}
                        title="Accept"
                    >
                        <Check size={14} />
                    </button>
                </div>
            </div>
        )
    }

    // Render insert diff - show new content only
    if (diff.type === 'insert') {
        return (
            <div
                className="inline-diff inline-diff-insert"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <span className="inline-diff-marker">+</span>
                <div className="inline-diff-content">
                    <MarkdownRenderer
                        content={diff.newContent || ''}
                        onClick={onLinkClick}
                    />
                </div>
                <div className={`inline-diff-controls ${isHovered ? 'visible' : ''}`}>
                    <button
                        className="inline-diff-btn inline-diff-btn-reject"
                        onClick={handleReject}
                        title="Reject"
                    >
                        <X size={14} />
                    </button>
                    <button
                        className="inline-diff-btn inline-diff-btn-accept"
                        onClick={handleAccept}
                        title="Accept"
                    >
                        <Check size={14} />
                    </button>
                </div>
            </div>
        )
    }

    // Fallback - should not reach here
    return null
}
