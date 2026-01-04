import { useState, useRef, useLayoutEffect } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'

interface HighlightTooltipProps {
    comment: string
    position: { x: number; y: number }
    onEdit: () => void
    onDelete: () => void
    onClose: () => void
    onBacklinkClick: (target: string) => void
    onMouseEnter?: () => void
    onMouseLeave?: () => void
}

export default function HighlightTooltip({
    comment,
    position,
    onEdit,
    onDelete,
    onClose,
    onBacklinkClick,
    onMouseEnter,
    onMouseLeave
}: HighlightTooltipProps) {
    const tooltipRef = useRef<HTMLDivElement>(null)
    const [adjustedPos, setAdjustedPos] = useState(position)

    useLayoutEffect(() => {
        if (tooltipRef.current) {
            const rect = tooltipRef.current.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth

            let newX = position.x
            let newY = position.y

            // Check bottom overflow
            if (position.y + rect.height > viewportHeight - 10) {
                newY = position.y - rect.height - 10
            }

            // Check right overflow
            if (position.x + rect.width > viewportWidth - 10) {
                newX = viewportWidth - rect.width - 10
            }

            // Check left overflow
            if (newX < 10) {
                newX = 10
            }

            setAdjustedPos({ x: newX, y: newY })
        }
    }, [position])

    // Parse comment to render backlinks and extract date
    const parseCommentAndDate = (raw: string) => {
        if (!raw) return { comment: '', date: '' }
        // Format: comment|YYYY-MM-DD or just comment
        const lastPipe = raw.lastIndexOf('|')
        if (lastPipe !== -1) {
            const possibleDate = raw.substring(lastPipe + 1)
            // Check if it looks like a date (YYYY-MM-DD)
            if (/^\d{4}-\d{2}-\d{2}$/.test(possibleDate)) {
                return { comment: raw.substring(0, lastPipe), date: possibleDate }
            }
        }
        return { comment: raw, date: '' }
    }

    const { comment: commentText, date } = parseCommentAndDate(comment)

    const renderComment = (text: string) => {
        if (!text) return <span className="highlight-tooltip-empty">No comment</span>

        const regex = /(\[\[.*?\]\])/g
        const parts = text.split(regex)

        return parts.map((part, i) => {
            const linkMatch = part.match(/^\[\[(.+?)\]\]$/)
            if (linkMatch) {
                return (
                    <span
                        key={i}
                        className="highlight-tooltip-backlink"
                        onClick={(e) => {
                            e.stopPropagation()
                            onBacklinkClick(linkMatch[1])
                        }}
                    >
                        {linkMatch[1]}
                    </span>
                )
            }
            return <span key={i}>{part}</span>
        })
    }

    return (
        <div
            ref={tooltipRef}
            className="highlight-tooltip"
            style={{
                position: 'fixed',
                top: adjustedPos.y,
                left: adjustedPos.x
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className="highlight-tooltip-header">
                <button
                    className="highlight-tooltip-close"
                    onClick={onClose}
                    title="Close"
                >
                    <X size={14} />
                </button>
            </div>
            <div className="highlight-tooltip-content">
                {renderComment(commentText)}
                {date && <div className="highlight-tooltip-date">{date}</div>}
                <div className="highlight-tooltip-actions">
                    <button
                        className="highlight-tooltip-btn"
                        onClick={onEdit}
                        title="Edit"
                    >
                        <Pencil size={14} />
                    </button>
                    <button
                        className="highlight-tooltip-btn delete"
                        onClick={onDelete}
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    )
}
