import { useEffect } from 'react'
import { PanelRight } from 'lucide-react'
import { useVaultStore } from './stores/vaultStore'
import { useAIStore } from './stores/aiStore'
import { useEditorStore } from './stores/editorStore'
import Sidebar from './components/Sidebar/Sidebar'
// import TabBar from './components/TabBar/TabBar' // Removed global TabBar
import EditorArea from './components/Editor/EditorArea'
import AIPanel from './components/AIPanel/AIPanel'
import WelcomeScreen from './components/WelcomeScreen'
import './styles/components.css'

export default function App() {
    const { vaultPath, refreshTree } = useVaultStore()
    const { isPanelOpen, togglePanel } = useAIStore()
    // const { activeTabId, closeTab } = useEditorStore() // Removed invalid destructuring

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
                const { activeGroupId, editorGroups, closeTab } = useEditorStore.getState()
                if (activeGroupId) {
                    const activeGroup = editorGroups.find(g => g.id === activeGroupId)
                    if (activeGroup?.activeTabId) {
                        const activeTab = activeGroup.tabs.find(t => t.id === activeGroup.activeTabId)
                        if (activeTab?.isDirty) {
                            if (!window.confirm('저장하지 않은 변경사항이 있습니다. 정말 닫으시겠습니까?')) {
                                return
                            }
                        }
                        closeTab(activeGroup.activeTabId, activeGroupId)
                    }
                }
            }

            // Cmd+Shift+[ : Previous Tab
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '[') {
                e.preventDefault()
                useEditorStore.getState().selectPrevTab()
            }

            // Cmd+Shift+] : Next Tab
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ']') {
                e.preventDefault()
                useEditorStore.getState().selectNextTab()
            }

            // Cmd+\ : Split Editor Right
            if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
                e.preventDefault()
                useEditorStore.getState().splitEditorRight()
            }

            // Cmd+Shift+B : Open Browser Tab
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'b') {
                e.preventDefault()
                useEditorStore.getState().openBrowserTab()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [togglePanel])

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

                {/* Right controls */}
                <div className="titlebar-right">
                    <button
                        className={`titlebar-button ${isPanelOpen ? 'active' : ''}`}
                        onClick={togglePanel}
                        title={isPanelOpen ? "Close AI Panel (Cmd+E)" : "Open AI Panel (Cmd+E)"}
                    >
                        <PanelRight size={16} />
                    </button>
                </div>
            </div>

            <div className="main-layout">
                {/* Left Sidebar */}
                <Sidebar />

                {/* Main Content Area */}
                <div className="content-area">
                    {vaultPath ? (
                        <>
                            {/* TabBar is now handled by EditorArea per group */}
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
