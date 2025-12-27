import { useState } from 'react'
import {
    RefreshCw,
    FolderOpen,
    ChevronLeft,
    Folder,
    FilePlus,
    FolderPlus,
    Sun,
    Moon
} from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'
import { useThemeStore } from '../../stores/themeStore'
import FileTree from './FileTree'
import CreateItemModal from './CreateItemModal'

export default function Sidebar() {
    const { vaultPath, fileTree, openVault, refreshTree, isLoading } =
        useVaultStore()
    const { theme, toggleTheme } = useThemeStore()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [showCreateModal, setShowCreateModal] = useState<'file' | 'folder' | null>(null)

    if (isCollapsed) {
        return (
            <div
                className="sidebar"
                style={{ width: 48, cursor: 'pointer' }}
                onClick={() => setIsCollapsed(false)}
            >
                <div className="sidebar-header" style={{ justifyContent: 'center' }}>
                    <Folder size={18} />
                </div>
            </div>
        )
    }

    return (
        <div className="sidebar">
            {/* Top Section: Vault Name + System Actions */}
            <div className="sidebar-header-top" style={{
                height: '40px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 var(--space-3)',
                flexShrink: 0
            }}>
                <span className="sidebar-title" style={{
                    flex: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginRight: 'var(--space-2)'
                }}>
                    {vaultPath ? vaultPath.split('/').pop() : 'Vault'}
                </span>
                <div className="sidebar-actions">
                    <button className="sidebar-btn" onClick={openVault} title="Open Vault">
                        <FolderOpen size={16} />
                    </button>
                    <button
                        className="sidebar-btn"
                        onClick={() => setIsCollapsed(true)}
                        title="Collapse"
                    >
                        <ChevronLeft size={16} />
                    </button>
                </div>
            </div>

            {/* Bottom Section: File Actions */}
            <div className="sidebar-header-actions" style={{
                padding: 'var(--space-2) var(--space-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                borderBottom: '0.5px solid var(--color-divider)',
                flexShrink: 0
            }}>
                {vaultPath && (
                    <>
                        <button
                            className="sidebar-btn"
                            onClick={() => setShowCreateModal('file')}
                            title="New File"
                        >
                            <FilePlus size={16} />
                        </button>
                        <button
                            className="sidebar-btn"
                            onClick={() => setShowCreateModal('folder')}
                            title="New Folder"
                        >
                            <FolderPlus size={16} />
                        </button>
                    </>
                )}
                <div style={{ flex: 1 }} />
                <button
                    className="sidebar-btn"
                    onClick={refreshTree}
                    title="Refresh"
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="sidebar-content">
                {isLoading ? (
                    <div className="loading">
                        <div className="loading-spinner" />
                    </div>
                ) : fileTree.length > 0 ? (
                    <FileTree nodes={fileTree} />
                ) : vaultPath ? (
                    <div className="empty-state">
                        <span className="empty-state-text">No markdown files found</span>
                    </div>
                ) : (
                    <div className="empty-state">
                        <span className="empty-state-text">Open a vault to start</span>
                    </div>
                )}
            </div>

            {showCreateModal && vaultPath && (
                <CreateItemModal
                    type={showCreateModal}
                    parentPath={vaultPath}
                    onClose={() => setShowCreateModal(null)}
                />
            )}

            <div
                className="sidebar-footer"
                style={{
                    padding: 'var(--space-3) var(--space-4)',
                    borderTop: '0.5px solid var(--color-divider)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}
            >
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    v1.0.0
                </div>
                <button
                    className="sidebar-btn"
                    onClick={toggleTheme}
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
            </div>
        </div>
    )
}
