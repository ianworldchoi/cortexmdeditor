import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { X } from 'lucide-react'
import { useHighlightStore } from '../../stores/highlightStore'
import { useVaultStore } from '../../stores/vaultStore'

interface HighlightModalProps {
    onSave: (comment: string) => void
    onCancel: () => void
}

export default function HighlightModal({ onSave, onCancel }: HighlightModalProps) {
    const { selectedText, comment, setComment, modalMode } = useHighlightStore()
    const { documentIndex } = useVaultStore()
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    // Backlink state
    const [showBacklinkMenu, setShowBacklinkMenu] = useState(false)
    const [backlinkQuery, setBacklinkQuery] = useState('')
    const [backlinkPosition, setBacklinkPosition] = useState({ x: 0, y: 0 })
    const [selectedIndex, setSelectedIndex] = useState(0)

    // Filter documents for backlink
    const filteredDocs = documentIndex
        .filter(doc => doc.title.toLowerCase().includes(backlinkQuery.toLowerCase()))
        .slice(0, 10)

    useEffect(() => {
        textareaRef.current?.focus()
    }, [])

    useEffect(() => {
        setSelectedIndex(0)
    }, [backlinkQuery])

    // Adjust backlink menu position
    useLayoutEffect(() => {
        if (showBacklinkMenu && menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth

            let newX = backlinkPosition.x
            let newY = backlinkPosition.y

            if (newY + rect.height > viewportHeight - 10) {
                newY = backlinkPosition.y - rect.height
            }
            if (newX + rect.width > viewportWidth - 10) {
                newX = backlinkPosition.x - rect.width
            }

            setBacklinkPosition({ x: newX, y: newY })
        }
    }, [showBacklinkMenu])

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value
        setComment(value)

        // Check for [[ trigger
        const cursorPos = e.target.selectionStart
        const textBeforeCursor = value.substring(0, cursorPos)
        const lastDoubleBracket = textBeforeCursor.lastIndexOf('[[')

        if (lastDoubleBracket !== -1 && !textBeforeCursor.substring(lastDoubleBracket).includes(']]')) {
            const query = textBeforeCursor.substring(lastDoubleBracket + 2)
            setBacklinkQuery(query)
            setShowBacklinkMenu(true)

            // Calculate position
            if (textareaRef.current) {
                const rect = textareaRef.current.getBoundingClientRect()
                setBacklinkPosition({
                    x: rect.left + 10,
                    y: rect.bottom + 5
                })
            }
        } else {
            setShowBacklinkMenu(false)
        }
    }

    const insertBacklink = (title: string) => {
        const cursorPos = textareaRef.current?.selectionStart || 0
        const textBeforeCursor = comment.substring(0, cursorPos)
        const lastDoubleBracket = textBeforeCursor.lastIndexOf('[[')

        if (lastDoubleBracket !== -1) {
            const newComment =
                comment.substring(0, lastDoubleBracket) +
                `[[${title}]]` +
                comment.substring(cursorPos)
            setComment(newComment)
        }

        setShowBacklinkMenu(false)
        textareaRef.current?.focus()
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showBacklinkMenu) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(prev => (prev + 1) % filteredDocs.length)
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(prev => (prev - 1 + filteredDocs.length) % filteredDocs.length)
            } else if (e.key === 'Enter') {
                e.preventDefault()
                if (filteredDocs[selectedIndex]) {
                    insertBacklink(filteredDocs[selectedIndex].title)
                }
            } else if (e.key === 'Escape') {
                e.preventDefault()
                setShowBacklinkMenu(false)
            }
        } else {
            if (e.key === 'Escape') {
                e.preventDefault()
                onCancel()
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onSave(comment)
            }
        }
    }

    return (
        <div className="highlight-modal-overlay" onClick={onCancel}>
            <div className="highlight-modal" onClick={e => e.stopPropagation()}>
                <div className="highlight-modal-header">
                    <span className="highlight-modal-title">
                        {modalMode === 'create' ? 'Add Highlight' : 'Edit Highlight'}
                    </span>
                    <button className="highlight-modal-close" onClick={onCancel}>
                        <X size={16} />
                    </button>
                </div>

                <div className="highlight-modal-preview">
                    <span className="highlight-preview-text">{selectedText}</span>
                </div>

                <div className="highlight-modal-content">
                    <textarea
                        ref={textareaRef}
                        className="highlight-modal-textarea"
                        placeholder="Add a comment... (use [[ for backlinks)"
                        value={comment}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        rows={3}
                    />
                </div>

                <div className="highlight-modal-footer">
                    <button className="highlight-modal-btn secondary" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="highlight-modal-btn primary" onClick={() => onSave(comment)}>
                        Save
                    </button>
                </div>

                {showBacklinkMenu && filteredDocs.length > 0 && (
                    <div
                        ref={menuRef}
                        className="highlight-backlink-menu"
                        style={{
                            position: 'fixed',
                            top: backlinkPosition.y,
                            left: backlinkPosition.x
                        }}
                    >
                        {filteredDocs.map((doc, index) => (
                            <div
                                key={doc.path}
                                className={`menu-item ${index === selectedIndex ? 'selected' : ''}`}
                                onClick={() => insertBacklink(doc.title)}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                {doc.title}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
