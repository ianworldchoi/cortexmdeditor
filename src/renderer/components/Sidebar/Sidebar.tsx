import { useState } from 'react'
import {
    RefreshCw,
    FolderOpen,
    ChevronLeft,
    Folder,
    FilePlus,
    FolderPlus
} from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'
import FileTree from './FileTree'
import CreateItemModal from './CreateItemModal'

export default function Sidebar() {
    const { vaultPath, fileTree, openVault, refreshTree, isLoading } =
        useVaultStore()
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
            <div className="sidebar-header">
                <span className="sidebar-title">
                    {vaultPath ? vaultPath.split('/').pop() : 'Vault'}
                </span>
                <div className="sidebar-actions">
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
                    <button
                        className="sidebar-btn"
                        onClick={refreshTree}
                        title="Refresh"
                    >
                        <RefreshCw size={16} />
                    </button>
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
        </div>
    )
}
