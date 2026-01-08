import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { FileText, Folder, ChevronRight } from 'lucide-react'
import { FixedSizeList as List } from 'react-window'
import { useVaultStore } from '../../stores/vaultStore'
import type { FileNode } from '@shared/types'

export interface MentionedItem {
    type: 'file' | 'directory'
    path: string
    name: string
    frontmatterTitle?: string
}

interface MentionDropdownProps {
    query: string
    onSelect: (item: MentionedItem) => void
    onMenuSelect: (menuId: 'files' | 'directory') => void
    onClose: () => void
    inputRef: React.RefObject<HTMLTextAreaElement | null>
}

type MenuState = 'menu' | 'files' | 'directory'

const ITEM_HEIGHT = 32
const MAX_VISIBLE_ITEMS = 10

export default function MentionDropdown({ query, onSelect, onMenuSelect, onClose, inputRef }: MentionDropdownProps) {
    const { documentIndex, fileTree, vaultPath } = useVaultStore()
    const [menuState, setMenuState] = useState<MenuState>('menu')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<List>(null)

    // Parse query to determine menu state
    useEffect(() => {
        if (query.startsWith('files:')) {
            setMenuState('files')
        } else if (query.startsWith('directory:')) {
            setMenuState('directory')
        } else {
            setMenuState('menu')
        }
        setSelectedIndex(0)
    }, [query])

    // Get search term after the colon
    const searchTerm = useMemo(() => {
        if (menuState === 'files') return query.slice(6).toLowerCase()
        if (menuState === 'directory') return query.slice(10).toLowerCase()
        return query.toLowerCase()
    }, [query, menuState])

    // Get all folders from fileTree
    const getAllFolders = (nodes: FileNode[], basePath = ''): { path: string; name: string }[] => {
        let folders: { path: string; name: string }[] = []
        for (const node of nodes) {
            if (node.isDirectory) {
                folders.push({ path: node.path, name: node.name })
                if (node.children) {
                    folders = [...folders, ...getAllFolders(node.children, node.path)]
                }
            }
        }
        return folders
    }

    // Filtered results based on menu state (NO LIMIT - virtual scroll handles all)
    const results = useMemo(() => {
        if (menuState === 'menu') {
            const menuItems = [
                { id: 'files', label: '@files:', description: 'Search files', icon: FileText },
                { id: 'directory', label: '@directory:', description: 'Select folder', icon: Folder }
            ]
            return menuItems.filter(item =>
                searchTerm === '' || item.label.toLowerCase().includes(searchTerm)
            )
        } else if (menuState === 'files') {
            return documentIndex
                .filter(doc =>
                    searchTerm === '' ||
                    doc.title.toLowerCase().includes(searchTerm) ||
                    doc.path.toLowerCase().includes(searchTerm)
                )
                // No .slice() - show all results
                .map(doc => ({
                    type: 'file' as const,
                    path: doc.path,
                    name: doc.title, // This is now filename from vaultStore
                    frontmatterTitle: (doc as any).frontmatterTitle
                }))
        } else {
            // directory
            const folders = getAllFolders(fileTree)
            // Add vault root
            if (vaultPath) {
                folders.unshift({ path: vaultPath, name: '/ (Vault Root)' })
            }
            return folders
                .filter(folder =>
                    searchTerm === '' ||
                    folder.name.toLowerCase().includes(searchTerm)
                )
                // No .slice() - show all results
                .map(folder => ({
                    type: 'directory' as const,
                    path: folder.path,
                    name: folder.name
                }))
        }
    }, [menuState, searchTerm, documentIndex, fileTree, vaultPath])

    // Scroll to selected item when navigating with keyboard
    useEffect(() => {
        if (listRef.current && menuState !== 'menu') {
            listRef.current.scrollToItem(selectedIndex, 'smart')
        }
    }, [selectedIndex, menuState])

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(prev => Math.max(prev - 1, 0))
            } else if (e.key === 'Enter') {
                e.preventDefault()
                handleSelect(selectedIndex)
            } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
            } else if (e.key === 'Tab') {
                e.preventDefault()
                handleSelect(selectedIndex)
            }
        }

        const textarea = inputRef.current
        if (textarea) {
            textarea.addEventListener('keydown', handleKeyDown)
            return () => textarea.removeEventListener('keydown', handleKeyDown)
        }
    }, [results, selectedIndex, inputRef])

    const handleSelect = (index: number) => {
        if (menuState === 'menu') {
            const item = results[index] as { id: string; label: string }
            if (item?.id === 'files') {
                setMenuState('files')
                onMenuSelect('files')
            } else if (item?.id === 'directory') {
                setMenuState('directory')
                onMenuSelect('directory')
            }
        } else {
            const item = results[index] as MentionedItem
            if (item) {
                onSelect(item)
            }
        }
    }

    const handleMenuClick = (id: string) => {
        if (id === 'files') {
            setMenuState('files')
            onMenuSelect('files')
        } else if (id === 'directory') {
            setMenuState('directory')
            onMenuSelect('directory')
        }
    }

    // Calculate list height (max 10 items visible, or less if fewer results)
    const listHeight = Math.min(results.length, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT

    // Row renderer for virtual list - files
    const FileRow = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
        const item = results[index] as MentionedItem
        return (
            <div
                style={style}
                className={`mention-menu-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => onSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
            >
                <FileText size={14} />
                <div className="mention-name-container">
                    <span className="mention-name">{item.name}</span>
                    {(item as any).frontmatterTitle && (item as any).frontmatterTitle !== item.name && (
                        <span className="mention-subtitle"> {(item as any).frontmatterTitle}</span>
                    )}
                </div>
            </div>
        )
    }, [results, selectedIndex, onSelect])

    // Row renderer for virtual list - directories
    const DirectoryRow = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
        const item = results[index] as MentionedItem
        return (
            <div
                style={style}
                className={`mention-menu-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => onSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
            >
                <Folder size={14} />
                <span className="mention-name">{item.name}</span>
            </div>
        )
    }, [results, selectedIndex, onSelect])

    return (
        <div ref={dropdownRef} className="mention-dropdown">
            {menuState === 'menu' && (
                <div className="mention-menu">
                    {(results as { id: string; label: string; description: string; icon: any }[]).map((item, index) => (
                        <div
                            key={item.id}
                            className={`mention-menu-item ${index === selectedIndex ? 'selected' : ''}`}
                            onClick={() => handleMenuClick(item.id)}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            <item.icon size={14} />
                            <span className="mention-label">{item.label}</span>
                            <span className="mention-description">{item.description}</span>
                            <ChevronRight size={12} className="mention-arrow" />
                        </div>
                    ))}
                </div>
            )}

            {menuState === 'files' && (
                <div className="mention-results">
                    {results.length === 0 ? (
                        <div className="mention-empty">No files found</div>
                    ) : (
                        <List
                            ref={listRef}
                            height={listHeight}
                            itemCount={results.length}
                            itemSize={ITEM_HEIGHT}
                            width="100%"
                            className="mention-virtual-list"
                        >
                            {FileRow}
                        </List>
                    )}
                </div>
            )}

            {menuState === 'directory' && (
                <div className="mention-results">
                    {results.length === 0 ? (
                        <div className="mention-empty">No folders found</div>
                    ) : (
                        <List
                            ref={listRef}
                            height={listHeight}
                            itemCount={results.length}
                            itemSize={ITEM_HEIGHT}
                            width="100%"
                            className="mention-virtual-list"
                        >
                            {DirectoryRow}
                        </List>
                    )}
                </div>
            )}
        </div>
    )
}
