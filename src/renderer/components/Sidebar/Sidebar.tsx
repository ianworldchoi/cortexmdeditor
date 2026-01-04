import { useState } from 'react'
import {
    RefreshCw,
    ListChevronsDownUp,
    PanelLeft,
    Folder,
    FilePlus,
    FolderPlus,
    Sun,
    Moon,
    Share2,
    Orbit
} from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'
import { useThemeStore } from '../../stores/themeStore'
import FileTree from './FileTree'
import CreateItemModal from './CreateItemModal'

export default function Sidebar() {
    const { vaultPath, fileTree, openVault, refreshTree, isLoading, isSidebarCollapsed, toggleSidebar } =
        useVaultStore()
    const { theme, toggleTheme } = useThemeStore()
    const [showCreateModal, setShowCreateModal] = useState<'file' | 'folder' | null>(null)
    const [collapseAll, setCollapseAll] = useState(0)  // 값을 증가시켜 collapse 트리거

    return (
        <div
            className="sidebar"
            style={{
                width: isSidebarCollapsed ? 48 : 'var(--sidebar-width)',
                cursor: isSidebarCollapsed ? 'pointer' : 'default'
            }}
            onClick={(e) => {
                if (isSidebarCollapsed) toggleSidebar()
            }}
        >
            {isSidebarCollapsed ? (
                // Collapsed Content
                <div style={{ height: '100%', width: '100%' }} />
            ) : (
                // Expanded Content
                <>
                    {/* Bottom Section: File Actions */}
                    <div className="sidebar-header-actions" style={{
                        padding: 'var(--space-2) var(--space-3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-1)',
                        borderBottom: '0.5px solid var(--color-divider)',
                        flexShrink: 0,
                        overflow: 'hidden'
                    }}>
                        {vaultPath && (
                            <>
                                <button
                                    className="sidebar-btn"
                                    onClick={async () => {
                                        const newFilePath = await useVaultStore.getState().createUntitledNote(vaultPath)
                                        if (newFilePath) {
                                            const { openTab } = await import('../../stores/editorStore').then(m => m.useEditorStore.getState())
                                            const fileName = newFilePath.split('/').pop() || 'Untitled'
                                            openTab(newFilePath, fileName.replace('.md', ''))
                                        }
                                    }}
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
                                <button
                                    className="sidebar-btn"
                                    onClick={async () => {
                                        const { openGraphTab } = await import('../../stores/editorStore').then(m => m.useEditorStore.getState())
                                        openGraphTab()
                                    }}
                                    title="Graph View"
                                >
                                    <Orbit size={16} />
                                </button>
                            </>
                        )}
                        <div style={{ flex: 1 }} />
                        <button
                            className="sidebar-btn"
                            onClick={() => setCollapseAll(prev => prev + 1)}
                            title="Collapse All Folders"
                        >
                            <ListChevronsDownUp size={16} />
                        </button>
                        <button
                            className="sidebar-btn"
                            onClick={refreshTree}
                            title="Refresh"
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>

                    <div className="sidebar-content" style={{ opacity: 1, transition: 'opacity 0.2s' }}>
                        {isLoading ? (
                            <div className="loading">
                                <div className="loading-spinner" />
                            </div>
                        ) : fileTree.length > 0 ? (
                            <FileTree nodes={fileTree} collapseAll={collapseAll} />
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
                            justifyContent: 'space-between',
                            overflow: 'hidden'
                        }}
                    >
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
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
                </>
            )}
        </div>
    )
}
