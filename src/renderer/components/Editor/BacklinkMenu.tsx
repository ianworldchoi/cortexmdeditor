import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { FileText } from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'

interface BacklinkMenuProps {
    position: { x: number; y: number }
    query: string
    onSelect: (fileName: string) => void
    onClose: () => void
}

export default function BacklinkMenu({ position, query, onSelect, onClose }: BacklinkMenuProps) {
    const { documentIndex } = useVaultStore()
    const [selectedIndex, setSelectedIndex] = useState(0)
    const menuRef = useRef<HTMLDivElement>(null)
    const [adjustedPos, setAdjustedPos] = useState(position)

    // Filter documents
    const filteredDocs = documentIndex
        .filter(doc => doc.title.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 10) // Limit to 10

    useEffect(() => {
        setSelectedIndex(0)
    }, [query])

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

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                // +1 for potential create option
                const exactMatch = filteredDocs.some(doc => doc.title.toLowerCase() === query.toLowerCase())
                const showCreateOption = query.trim().length > 0 && !exactMatch
                const totalItems = filteredDocs.length + (showCreateOption ? 1 : 0)

                setSelectedIndex(prev => (prev + 1) % totalItems)
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                const exactMatch = filteredDocs.some(doc => doc.title.toLowerCase() === query.toLowerCase())
                const showCreateOption = query.trim().length > 0 && !exactMatch
                const totalItems = filteredDocs.length + (showCreateOption ? 1 : 0)

                setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems)
            } else if (e.key === 'Enter') {
                e.preventDefault()
                const exactMatch = filteredDocs.some(doc => doc.title.toLowerCase() === query.toLowerCase())
                const showCreateOption = query.trim().length > 0 && !exactMatch

                if (selectedIndex < filteredDocs.length) {
                    if (filteredDocs[selectedIndex]) {
                        onSelect(filteredDocs[selectedIndex].title)
                    }
                } else if (showCreateOption && selectedIndex === filteredDocs.length) {
                    onSelect(query)
                }
            } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [filteredDocs, selectedIndex, onSelect, onClose])

    if (filteredDocs.length === 0 && query.trim().length === 0) return null

    // If no exact match found, add "Create new note" option
    const exactMatch = filteredDocs.some(doc => doc.title.toLowerCase() === query.toLowerCase())
    const showCreateOption = query.trim().length > 0 && !exactMatch

    if (filteredDocs.length === 0 && !showCreateOption) return null

    return (
        <div
            ref={menuRef}
            className="slash-menu" // Reuse slash menu styles
            style={{
                top: adjustedPos.y,
                left: adjustedPos.x
            }}
        >
            <div className="menu-header">Link to...</div>
            {filteredDocs.map((doc, index) => (
                <div
                    key={doc.path}
                    className={`menu-item ${index === selectedIndex ? 'selected' : ''}`}
                    onClick={() => onSelect(doc.title)}
                    onMouseEnter={() => setSelectedIndex(index)}
                >
                    <FileText size={16} />
                    <span>{doc.title}</span>
                </div>
            ))}
            {showCreateOption && (
                <div
                    className={`menu-item ${filteredDocs.length === selectedIndex ? 'selected' : ''}`}
                    onClick={() => onSelect(query)} // Pass query as the new file name
                    onMouseEnter={() => setSelectedIndex(filteredDocs.length)}
                >
                    <FileText size={16} />
                    <span>Create "{query}"</span>
                </div>
            )}
        </div>
    )
}

