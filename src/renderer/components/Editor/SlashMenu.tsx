import { useState, useEffect, useRef } from 'react'
import {
    Type,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    CheckSquare,
    Quote,
    Code,
    Minus,
    Lightbulb,
    Image as ImageIcon,
    ChevronRight
} from 'lucide-react'
import type { BlockType } from '@shared/types'

interface SlashMenuProps {
    position: { x: number; y: number }
    onSelect: (type: BlockType) => void
    onClose: () => void
}

interface MenuItem {
    type: BlockType
    label: string
    icon: React.ReactNode
    shortcut?: string
}

const MENU_ITEMS: MenuItem[] = [
    { type: 'text', label: 'Text', icon: <Type size={16} />, shortcut: '' },
    { type: 'heading1', label: 'Heading 1', icon: <Heading1 size={16} />, shortcut: '#' },
    { type: 'heading2', label: 'Heading 2', icon: <Heading2 size={16} />, shortcut: '##' },
    { type: 'heading3', label: 'Heading 3', icon: <Heading3 size={16} />, shortcut: '###' },
    { type: 'bullet', label: 'Bullet List', icon: <List size={16} />, shortcut: '-' },
    { type: 'numbered', label: 'Numbered List', icon: <ListOrdered size={16} />, shortcut: '1.' },
    { type: 'todo', label: 'To-do', icon: <CheckSquare size={16} />, shortcut: '[]' },
    { type: 'toggle', label: 'Toggle', icon: <ChevronRight size={16} />, shortcut: '>>' },
    { type: 'quote', label: 'Quote', icon: <Quote size={16} />, shortcut: '>' },
    { type: 'code', label: 'Code', icon: <Code size={16} />, shortcut: '```' },
    { type: 'divider', label: 'Divider', icon: <Minus size={16} />, shortcut: '---' },
    { type: 'callout', label: 'Callout', icon: <Lightbulb size={16} />, shortcut: '' },
    { type: 'image', label: 'Image', icon: <ImageIcon size={16} />, shortcut: '' }
]

export default function SlashMenu({
    position,
    onSelect,
    onClose
}: SlashMenuProps) {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [filter, setFilter] = useState('')
    const menuRef = useRef<HTMLDivElement>(null)

    const filteredItems = MENU_ITEMS.filter((item) =>
        item.label.toLowerCase().includes(filter.toLowerCase())
    )

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    setSelectedIndex((prev) =>
                        prev < filteredItems.length - 1 ? prev + 1 : 0
                    )
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    setSelectedIndex((prev) =>
                        prev > 0 ? prev - 1 : filteredItems.length - 1
                    )
                    break
                case 'Enter':
                    e.preventDefault()
                    if (filteredItems[selectedIndex]) {
                        onSelect(filteredItems[selectedIndex].type)
                    }
                    break
                case 'Escape':
                    e.preventDefault()
                    onClose()
                    break
                default:
                    // Filter by typing
                    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
                        setFilter((prev) => prev + e.key)
                        setSelectedIndex(0)
                    } else if (e.key === 'Backspace') {
                        setFilter((prev) => prev.slice(0, -1))
                        setSelectedIndex(0)
                    }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [filteredItems, selectedIndex, onSelect, onClose])

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
            className="slash-menu"
            style={{
                position: 'fixed',
                left: position.x,
                top: position.y
            }}
        >
            {filteredItems.length === 0 ? (
                <div
                    className="slash-menu-item"
                    style={{ color: 'var(--color-text-tertiary)' }}
                >
                    No results
                </div>
            ) : (
                filteredItems.map((item, index) => (
                    <div
                        key={item.type}
                        className={`slash-menu-item ${index === selectedIndex ? 'selected' : ''}`}
                        onMouseDown={(e) => {
                            e.preventDefault()
                            onSelect(item.type)
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                    >
                        <span className="slash-menu-icon">{item.icon}</span>
                        <span className="slash-menu-label">{item.label}</span>
                        {item.shortcut && (
                            <span className="slash-menu-shortcut">{item.shortcut}</span>
                        )}
                    </div>
                ))
            )}
        </div>
    )
}
