import { X } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

export default function TabBar() {
    const { tabs, activeTabId, setActiveTab, closeTab, saveTab } = useEditorStore()

    if (tabs.length === 0) {
        return null
    }

    const handleClose = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation()
        const tab = tabs.find(t => t.id === tabId)
        if (tab?.isDirty) {
            if (!window.confirm('저장하지 않은 변경사항이 있습니다. 정말 닫으시겠습니까?')) {
                return
            }
        }
        closeTab(tabId)
    }

    const handleKeyDown = (e: React.KeyboardEvent, tabId: string) => {
        // Cmd/Ctrl + S to save
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault()
            saveTab(tabId)
        }
    }

    return (
        <div
            className="tab-bar"
            onKeyDown={(e) => activeTabId && handleKeyDown(e, activeTabId)}
        >
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.isDirty ? 'tab-dirty' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                >
                    <span className="tab-title">{tab.title}</span>
                    <span className="tab-close" onClick={(e) => handleClose(e, tab.id)}>
                        <X size={12} />
                    </span>
                </button>
            ))}
        </div>
    )
}
