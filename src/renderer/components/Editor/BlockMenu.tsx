import { useState, useEffect, useRef } from 'react'
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
                left: position.x,
                top: position.y,
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
