import { useEffect, useRef } from 'react'
import { X, Columns, Globe, Eye, Edit3 } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

interface TabBarProps {
    groupId: string
}

export default function TabBar({ groupId }: TabBarProps) {
    const {
        editorGroups,
        activeGroupId,
        setActiveTab,
        closeTab,
        saveTab,
        splitEditorRight,
        closeGroup,
        openBrowserTab,
        toggleViewMode
    } = useEditorStore()

    const group = editorGroups.find(g => g.id === groupId)
    if (!group) return null

    const { tabs, activeTabId } = group
    const isActiveGroup = activeGroupId === groupId
    const activeTab = tabs.find(t => t.id === activeTabId)
    const tabListRef = useRef<HTMLDivElement>(null)

    // 선택된 탭이 보이도록 스크롤
    useEffect(() => {
        if (activeTabId && tabListRef.current) {
            const activeTabElement = tabListRef.current.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement
            if (activeTabElement) {
                activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
            }
        }
    }, [activeTabId])

    const handleClose = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation()
        const tab = tabs.find(t => t.id === tabId)
        if (tab?.isDirty) {
            if (!window.confirm('저장하지 않은 변경사항이 있습니다. 정말 닫으시겠습니까?')) {
                return
            }
        }
        closeTab(tabId, groupId)
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
            style={{ opacity: isActiveGroup ? 1 : 0.8 }}
            onKeyDown={(e) => activeTabId && handleKeyDown(e, activeTabId)}
        >
            <div className="tab-bar-bg" />
            <div className="tab-list" ref={tabListRef}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        data-tab-id={tab.id}
                        className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.isDirty ? 'tab-dirty' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation()
                            setActiveTab(tab.id, groupId)
                        }}
                    >
                        <span className="tab-title">{tab.title}</span>
                        <span className="tab-close" onClick={(e) => handleClose(e, tab.id)}>
                            <X size={12} />
                        </span>
                    </button>
                ))}
            </div>

            <div className="tab-bar-actions">
                {/* Close Group Button - only if multiple groups exist */}
                {editorGroups.length > 1 && (
                    <button
                        className="tab-action-btn"
                        onClick={() => closeGroup(groupId)}
                        title="Close Split"
                    >
                        <X size={14} />
                    </button>
                )}

                {/* Split Editor Button */}
                <button
                    className="tab-action-btn"
                    onClick={splitEditorRight}
                    disabled={tabs.length === 0}
                    title="Split Editor Right (⌘\\)"
                >
                    <Columns size={14} />
                </button>

                {/* Browser Tab Button */}
                <button
                    className="tab-action-btn"
                    onClick={() => openBrowserTab(undefined, groupId)}
                    title="Open Browser Tab (⌘⇧B)"
                >
                    <Globe size={14} />
                </button>

                {/* View/Edit Toggle Button */}
                {activeTab && activeTab.type === 'document' && (
                    <button
                        className="tab-action-btn"
                        onClick={() => toggleViewMode(activeTab.id)}
                        title={activeTab.viewMode === 'preview' ? "Switch to Edit Mode (⌘⇧E)" : "Switch to View Mode (⌘⇧E)"}
                    >
                        {activeTab.viewMode === 'preview' ? <Edit3 size={14} /> : <Eye size={14} />}
                    </button>
                )}
            </div>
        </div>
    )
}
