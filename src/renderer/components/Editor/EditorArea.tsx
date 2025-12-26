import { FileEdit } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import BlockEditor from './BlockEditor'

export default function EditorArea() {
    const { tabs, activeTabId } = useEditorStore()

    const activeTab = tabs.find((t) => t.id === activeTabId)

    if (!activeTab) {
        return (
            <div className="editor-area">
                <div className="empty-state">
                    <FileEdit size={48} strokeWidth={1} style={{ opacity: 0.5 }} />
                    <span className="empty-state-text">
                        Select a document to start editing
                    </span>
                </div>
            </div>
        )
    }

    if (activeTab.isLoading) {
        return (
            <div className="editor-area">
                <div className="loading">
                    <div className="loading-spinner" />
                </div>
            </div>
        )
    }

    if (!activeTab.document) {
        return (
            <div className="editor-area">
                <div className="empty-state">
                    <span className="empty-state-text">Failed to load document</span>
                </div>
            </div>
        )
    }

    return (
        <div className="editor-area">
            <div className="editor-container">
                <BlockEditor document={activeTab.document} tabId={activeTab.id} />
            </div>
        </div>
    )
}
