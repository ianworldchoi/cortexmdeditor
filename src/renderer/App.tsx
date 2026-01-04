import { useEffect } from 'react'
import { PanelRight, ChevronsUpDown, PanelLeft } from 'lucide-react'
import { useVaultStore } from './stores/vaultStore'
import { useAIStore } from './stores/aiStore'
import { useEditorStore } from './stores/editorStore'
import { useThemeStore } from './stores/themeStore'
import Sidebar from './components/Sidebar/Sidebar'
// import TabBar from './components/TabBar/TabBar' // Removed global TabBar
import EditorArea from './components/Editor/EditorArea'
import AIPanel from './components/AIPanel/AIPanel'
import WelcomeScreen from './components/WelcomeScreen'
import './styles/components.css'

export default function App() {
    const { vaultPath, refreshTree } = useVaultStore()
    const { isPanelOpen, togglePanel } = useAIStore()
    const { theme } = useThemeStore()

    // Apply theme to document
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
    }, [theme])

    // const { activeTabId, closeTab } = useEditorStore() // Removed invalid destructuring

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + E: Toggle AI Panel
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'e') {
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
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === '\\') {
                e.preventDefault()
                useEditorStore.getState().splitEditorRight()
            }

            // Cmd+Shift+\ (or |) : Toggle Sidebar
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === '\\' || e.key === '|')) {
                e.preventDefault()
                useVaultStore.getState().toggleSidebar()
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

    const { openVault, toggleSidebar, isSidebarCollapsed } = useVaultStore()

    return (
        <div className="app-container">
            {/* Titlebar drag region */}
            <div className="titlebar titlebar-drag-region">
                <div className="titlebar-content">
                    {/* Left Controls */}
                    <button
                        className={`titlebar-button ${!isSidebarCollapsed ? 'active' : ''}`}
                        onClick={toggleSidebar}
                        title={isSidebarCollapsed ? "Expand Sidebar (Cmd+\\)" : "Collapse Sidebar (Cmd+\\)"}
                        style={{ marginRight: 'var(--space-2)' }}
                    >
                        <PanelLeft size={16} />
                    </button>

                    {/* Vault Selector Chip */}
                    <button
                        className="vault-chip"
                        onClick={openVault}
                        title="Switch Vault"
                    >
                        <span className="vault-chip-text">
                            {vaultPath ? vaultPath.split('/').pop() : 'Vault'}
                        </span>
                        <ChevronsUpDown size={14} style={{ opacity: 0.8 }} />
                    </button>

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
                <AIPanel />
            </div>
        </div>
    )
}
