import { useEffect } from 'react'
import { useVaultStore } from './stores/vaultStore'
import { useAIStore } from './stores/aiStore'
import { useEditorStore } from './stores/editorStore'
import Sidebar from './components/Sidebar/Sidebar'
import TabBar from './components/TabBar/TabBar'
import EditorArea from './components/Editor/EditorArea'
import AIPanel from './components/AIPanel/AIPanel'
import WelcomeScreen from './components/WelcomeScreen'
import './styles/components.css'

export default function App() {
    const { vaultPath, refreshTree } = useVaultStore()
    const { isPanelOpen, togglePanel } = useAIStore()
    const { activeTabId, closeTab } = useEditorStore()

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + E: Toggle AI Panel
            if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
                e.preventDefault()
                togglePanel()
            }
            // Cmd/Ctrl + W: Close current tab
            if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
                e.preventDefault()
                const { activeTabId, tabs, closeTab } = useEditorStore.getState()
                if (activeTabId) {
                    const activeTab = tabs.find(t => t.id === activeTabId)
                    if (activeTab?.isDirty) {
                        if (!window.confirm('저장하지 않은 변경사항이 있습니다. 정말 닫으시겠습니까?')) {
                            return
                        }
                    }
                    closeTab(activeTabId)
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [togglePanel, activeTabId, closeTab])

    // Refresh tree on mount if vault exists
    useEffect(() => {
        if (vaultPath) {
            refreshTree()
        }
    }, [])

    return (
        <div className="app-container">
            {/* Titlebar drag region */}
            <div className="titlebar titlebar-drag-region">
                <div className="titlebar-content">
                    <span className="titlebar-title">Cortex</span>
                </div>
            </div>

            <div className="main-layout">
                {/* Left Sidebar */}
                <Sidebar />

                {/* Main Content Area */}
                <div className="content-area">
                    {vaultPath ? (
                        <>
                            <TabBar />
                            <EditorArea />
                        </>
                    ) : (
                        <WelcomeScreen />
                    )}
                </div>

                {/* AI Panel */}
                {isPanelOpen && <AIPanel />}
            </div>
        </div>
    )
}
