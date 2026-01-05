import { useEffect, useRef } from 'react'
import { MessageSquare } from 'lucide-react'

interface TextSelectionTooltipProps {
    position: { x: number, y: number }
    onChatClick: () => void
    onClose: () => void
}

export default function TextSelectionTooltip({ position, onChatClick, onClose }: TextSelectionTooltipProps) {
    const tooltipRef = useRef<HTMLDivElement>(null)

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
                onClose()
            }
        }

        // Delay to avoid immediate close from the mouseup that triggered the tooltip
        const timeout = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside)
        }, 100)

        return () => {
            clearTimeout(timeout)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [onClose])

    // Close on scroll
    useEffect(() => {
        const handleScroll = () => onClose()
        document.addEventListener('scroll', handleScroll, true)
        return () => document.removeEventListener('scroll', handleScroll, true)
    }, [onClose])

    return (
        <div
            ref={tooltipRef}
            className="text-selection-tooltip"
            style={{
                position: 'fixed',
                top: position.y,
                left: position.x,
                transform: 'translateX(-50%)'
            }}
        >
            <button onClick={onChatClick}>
                <MessageSquare size={14} />
                <span>Chat</span>
                <kbd>⌘L</kbd>
            </button>
        </div>
    )
}
