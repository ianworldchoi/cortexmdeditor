import { FolderOpen } from 'lucide-react'
import { useVaultStore } from '../stores/vaultStore'

export default function WelcomeScreen() {
    const { openVault } = useVaultStore()

    return (
        <div className="welcome-screen">
            <div className="welcome-icon">
                <FolderOpen size={40} strokeWidth={1.5} />
            </div>
            <h1 className="welcome-title">Welcome to Cortex</h1>
            <p className="welcome-subtitle">
                A local-first, block-based Markdown editor with AI-powered document
                editing. Open a vault folder to get started.
            </p>
            <button className="welcome-btn" onClick={openVault}>
                <FolderOpen size={18} />
                Open Vault
            </button>
        </div>
    )
}
