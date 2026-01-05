import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import {
    Folder,
    FolderOpen,
    FileText,
    ChevronRight,
    ChevronDown,
    FilePlus,
    FolderPlus,
    Trash2,
    Edit3
} from 'lucide-react'
import type { FileNode } from '@shared/types'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import CreateItemModal from './CreateItemModal'
import RenameItemModal from './RenameItemModal'

interface FileTreeProps {
    nodes: FileNode[]
    level?: number
    collapseAll?: number  // 값이 변경되면 모든 폴더를 접음
}

export default function FileTree({ nodes, level = 0, collapseAll }: FileTreeProps) {
    return (
        <div className="file-tree" style={{ paddingLeft: level > 0 ? 12 : 0 }}>
            {nodes.map((node) => (
                <FileTreeItem key={node.path} node={node} level={level} collapseAll={collapseAll} />
            ))}
        </div>
    )
}

interface FileTreeItemProps {
    node: FileNode
    level: number
    collapseAll?: number
}

// localStorage key for folder expanded states
const FOLDER_STATE_KEY = 'fileTree_expandedFolders'

// Helper functions to manage folder state in localStorage
function getExpandedFolders(): Set<string> {
    try {
        const stored = localStorage.getItem(FOLDER_STATE_KEY)
        return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
        return new Set()
    }
}

function saveExpandedFolders(folders: Set<string>) {
    localStorage.setItem(FOLDER_STATE_KEY, JSON.stringify([...folders]))
}

function FileTreeItem({ node, level, collapseAll }: FileTreeItemProps) {
    // 저장된 상태가 있으면 복원, 없으면 닫힘 상태
    const [isExpanded, setIsExpanded] = useState(() => {
        if (!node.isDirectory) return false
        return getExpandedFolders().has(node.path)
    })
    const [isDragOver, setIsDragOver] = useState(false)
    const [showContextMenu, setShowContextMenu] = useState(false)
    const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
    const [showCreateModal, setShowCreateModal] = useState<'file' | 'folder' | null>(null)
    const [showRenameModal, setShowRenameModal] = useState(false)

    const { openTab, editorGroups, activeGroupId } = useEditorStore()
    const { moveItem, deleteItem } = useVaultStore()
    const itemRef = useRef<HTMLDivElement>(null)
    const isInitialMount = useRef(true)

    const activeGroup = editorGroups.find(g => g.id === activeGroupId)
    const activeTab = activeGroup?.tabs.find(t => t.id === activeGroup.activeTabId)
    const isActive = activeTab?.filePath === node.path

    // isExpanded 상태 변경 시 localStorage에 저장 (초기 마운트 제외)
    useEffect(() => {
        if (!node.isDirectory) return
        if (isInitialMount.current) {
            isInitialMount.current = false
            return
        }
        const folders = getExpandedFolders()
        if (isExpanded) {
            folders.add(node.path)
        } else {
            folders.delete(node.path)
        }
        saveExpandedFolders(folders)
    }, [isExpanded, node.isDirectory, node.path])

    // collapseAll prop이 변경되면 모든 폴더를 접음
    useEffect(() => {
        if (collapseAll !== undefined && node.isDirectory) {
            setIsExpanded(false)
        }
    }, [collapseAll, node.isDirectory])

    const handleClick = () => {
        if (node.isDirectory) {
            setIsExpanded(!isExpanded)
        } else {
            openTab(node.path, node.name)
        }
    }

    // Drag start - for files and folders
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('text/plain', node.path)
        e.dataTransfer.effectAllowed = 'move'
    }

    // Drag over - only for folders
    const handleDragOver = (e: React.DragEvent) => {
        if (!node.isDirectory) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setIsDragOver(true)
    }

    const handleDragLeave = () => {
        setIsDragOver(false)
    }

    // Drop - only for folders
    const handleDrop = async (e: React.DragEvent) => {
        if (!node.isDirectory) return
        e.preventDefault()
        setIsDragOver(false)

        const sourcePath = e.dataTransfer.getData('text/plain')
        if (sourcePath && sourcePath !== node.path) {
            // Don't allow dropping into self or parent
            if (!sourcePath.startsWith(node.path + '/')) {
                await moveItem(sourcePath, node.path)
            }
        }
    }

    // Context menu
    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault()
        setContextMenuPos({ x: e.clientX, y: e.clientY })
        setShowContextMenu(true)
    }

    const handleCloseContextMenu = () => {
        setShowContextMenu(false)
    }

    const handleDelete = async () => {
        setShowContextMenu(false)
        if (confirm(`Are you sure you want to delete "${node.name}"?`)) {
            await deleteItem(node.path)
        }
    }

    return (
        <>
            <div
                ref={itemRef}
                className={`file-tree-item ${node.isDirectory ? 'folder' : ''} ${isActive ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
                draggable
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    background: isDragOver ? 'var(--color-accent-light)' : undefined,
                    borderRadius: isDragOver ? 'var(--radius-sm)' : undefined
                }}
            >
                <span className="file-tree-icon">
                    {node.isDirectory ? (
                        isExpanded ? (
                            <FolderOpen size={16} />
                        ) : (
                            <Folder size={16} />
                        )
                    ) : (
                        <FileText size={16} />
                    )}
                </span>
                <span className="file-tree-name">{node.name.replace('.md', '')}</span>
                {node.isDirectory && (
                    <span style={{ opacity: 0.5 }}>
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                )}
            </div>

            {node.isDirectory && isExpanded && node.children && (
                <div className="file-tree-children">
                    <FileTree nodes={node.children} level={level + 1} collapseAll={collapseAll} />
                </div>
            )}

            {/* Context Menu */}
            {showContextMenu && (
                <ContextMenu
                    x={contextMenuPos.x}
                    y={contextMenuPos.y}
                    isDirectory={node.isDirectory}
                    onClose={handleCloseContextMenu}
                    onNewFile={() => {
                        setShowContextMenu(false)
                        setShowCreateModal('file')
                    }}
                    onNewFolder={() => {
                        setShowContextMenu(false)
                        setShowCreateModal('folder')
                    }}
                    onDelete={handleDelete}
                    onRename={() => {
                        setShowContextMenu(false)
                        setShowRenameModal(true)
                    }}
                />
            )}

            {/* Rename Modal */}
            {showRenameModal && (
                <RenameItemModal
                    node={node}
                    onClose={() => setShowRenameModal(false)}
                />
            )}

            {/* Create Modal */}
            {showCreateModal && node.isDirectory && (
                <CreateItemModal
                    type={showCreateModal}
                    parentPath={node.path}
                    onClose={() => setShowCreateModal(null)}
                />
            )}
        </>
    )
}

// Context Menu Component
interface ContextMenuProps {
    x: number
    y: number
    isDirectory: boolean
    onClose: () => void
    onNewFile: () => void
    onNewFolder: () => void
    onRename: () => void
    onDelete: () => void
}

function ContextMenu({
    x,
    y,
    isDirectory,
    onClose,
    onNewFile,
    onNewFolder,
    onRename,
    onDelete
}: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null)
    const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null)

    // Adjust position if menu would overflow viewport
    useLayoutEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth

            let newX = x
            let newY = y

            // Check bottom overflow - open menu upward if near bottom
            if (y + rect.height > viewportHeight - 10) {
                // Open upward: place bottom of menu at cursor position
                newY = y - rect.height
                // Ensure it doesn't go above viewport
                if (newY < 10) newY = 10
            }

            // Check right overflow
            if (x + rect.width > viewportWidth - 10) {
                newX = x - rect.width
                if (newX < 10) newX = 10
            }

            setAdjustedPos({ x: newX, y: newY })
        }
    }, [x, y])

    // Close on click outside
    const handleClickOutside = () => {
        onClose()
    }

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 99
                }}
                onClick={handleClickOutside}
            />
            <div
                ref={menuRef}
                className="context-menu"
                style={{
                    position: 'fixed',
                    left: adjustedPos?.x ?? x,
                    top: adjustedPos?.y ?? y,
                    visibility: adjustedPos ? 'visible' : 'hidden',
                    zIndex: 100,
                    background: 'var(--color-bg-primary)',
                    backdropFilter: 'blur(var(--blur-lg))',
                    border: '0.5px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    padding: 'var(--space-1)',
                    minWidth: 160
                }}
            >
                {isDirectory && (
                    <>
                        <button className="context-menu-item" onClick={onNewFile}>
                            <FilePlus size={14} />
                            <span>New File</span>
                        </button>
                        <button className="context-menu-item" onClick={onNewFolder}>
                            <FolderPlus size={14} />
                            <span>New Folder</span>
                        </button>
                        <div
                            style={{
                                height: 1,
                                background: 'var(--color-divider)',
                                margin: 'var(--space-1) 0'
                            }}
                        />
                    </>
                )}
                <button
                    className="context-menu-item"
                    onClick={onRename}
                >
                    <Edit3 size={14} />
                    <span>Rename</span>
                </button>
                <button
                    className="context-menu-item"
                    onClick={onDelete}
                    style={{ color: 'var(--color-error)' }}
                >
                    <Trash2 size={14} />
                    <span>Delete</span>
                </button>
            </div>
        </>
    )
}

