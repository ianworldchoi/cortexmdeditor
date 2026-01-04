import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import {
    Trash2,
    ArrowUpToLine,
    ArrowDownToLine,
    X
} from 'lucide-react'

export type BlockAction = 'delete' | 'insert_above' | 'insert_below'

interface BlockMenuProps {
    position: { x: number; y: number }
    onSelect: (action: BlockAction) => void
    onClose: () => void
}

interface MenuItem {
    action: BlockAction
    label: string
    icon: React.ReactNode
    shortcut?: string
    variant?: 'default' | 'danger'
}

const MENU_ITEMS: MenuItem[] = [
    { action: 'insert_above', label: 'Insert Above', icon: <ArrowUpToLine size={16} />, shortcut: 'Cmd+Up' },
    { action: 'insert_below', label: 'Insert Below', icon: <ArrowDownToLine size={16} />, shortcut: 'Cmd+Down' },
    { action: 'delete', label: 'Delete', icon: <Trash2 size={16} />, shortcut: 'Del', variant: 'danger' },
]

export default function BlockMenu({
    position,
    onSelect,
    onClose
}: BlockMenuProps) {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const menuRef = useRef<HTMLDivElement>(null)
    const [adjustedPos, setAdjustedPos] = useState(position)

    // Adjust position if menu would overflow viewport
    useLayoutEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth

            let newX = position.x
            let newY = position.y

            // Check bottom overflow - open menu upward if near bottom
            if (position.y + rect.height > viewportHeight - 10) {
                newY = position.y - rect.height
                if (newY < 10) newY = 10
            }

            // Check right overflow
            if (position.x + rect.width > viewportWidth - 10) {
                newX = position.x - rect.width
                if (newX < 10) newX = 10
            }

            setAdjustedPos({ x: newX, y: newY })
        }
    }, [position])

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    setSelectedIndex((prev) =>
                        prev < MENU_ITEMS.length - 1 ? prev + 1 : 0
                    )
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    setSelectedIndex((prev) =>
                        prev > 0 ? prev - 1 : MENU_ITEMS.length - 1
                    )
                    break
                case 'Enter':
                    e.preventDefault()
                    onSelect(MENU_ITEMS[selectedIndex].action)
                    break
                case 'Escape':
                    e.preventDefault()
                    onClose()
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedIndex, onSelect, onClose])

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose()
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [onClose])

    return (
        <div
            ref={menuRef}
            className="slash-menu" // Re-using slash menu styles for consistency
            style={{
                position: 'fixed',
                left: adjustedPos.x,
                top: adjustedPos.y,
                minWidth: '180px'
            }}
        >
            {MENU_ITEMS.map((item, index) => (
                <div
                    key={item.action}
                    className={`slash-menu-item ${index === selectedIndex ? 'selected' : ''} ${item.variant === 'danger' ? 'danger' : ''}`}
                    onMouseDown={(e) => {
                        e.preventDefault()
                        onSelect(item.action)
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                >
                    <span className={`slash-menu-icon ${item.variant === 'danger' ? 'danger-icon' : ''}`}>
                        {item.icon}
                    </span>
                    <span className={`slash-menu-label ${item.variant === 'danger' ? 'danger-text' : ''}`}>
                        {item.label}
                    </span>
                    {item.shortcut && (
                        <span className="slash-menu-shortcut">{item.shortcut}</span>
                    )}
                </div>
            ))}
        </div>
    )
}

