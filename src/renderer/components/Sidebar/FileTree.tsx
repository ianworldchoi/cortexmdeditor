import { useState, useRef } from 'react'
import {
    Folder,
    FolderOpen,
    FileText,
    ChevronRight,
    ChevronDown,
    FilePlus,
    FolderPlus,
    Trash2
} from 'lucide-react'
import type { FileNode } from '@shared/types'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import CreateItemModal from './CreateItemModal'

interface FileTreeProps {
    nodes: FileNode[]
    level?: number
}

export default function FileTree({ nodes, level = 0 }: FileTreeProps) {
    return (
        <div className="file-tree" style={{ paddingLeft: level > 0 ? 12 : 0 }}>
            {nodes.map((node) => (
                <FileTreeItem key={node.path} node={node} level={level} />
            ))}
        </div>
    )
}

interface FileTreeItemProps {
    node: FileNode
    level: number
}

function FileTreeItem({ node, level }: FileTreeItemProps) {
    const [isExpanded, setIsExpanded] = useState(level < 2)
    const [isDragOver, setIsDragOver] = useState(false)
    const [showContextMenu, setShowContextMenu] = useState(false)
    const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
    const [showCreateModal, setShowCreateModal] = useState<'file' | 'folder' | null>(null)

    const { openTab, tabs, activeTabId } = useEditorStore()
    const { moveItem, deleteItem } = useVaultStore()
    const itemRef = useRef<HTMLDivElement>(null)

    const isActive = tabs.some(
        (t) => t.filePath === node.path && t.id === activeTabId
    )

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
                    <FileTree nodes={node.children} level={level + 1} />
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
    onDelete: () => void
}

function ContextMenu({
    x,
    y,
    isDirectory,
    onClose,
    onNewFile,
    onNewFolder,
    onDelete
}: ContextMenuProps) {
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
                className="context-menu"
                style={{
                    position: 'fixed',
                    left: x,
                    top: y,
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
