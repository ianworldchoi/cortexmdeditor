import { useState } from 'react'
import { X } from 'lucide-react'
import { useAIStore, DEFAULT_SYSTEM_PROMPT } from '../../stores/aiStore'
import { useVaultStore } from '../../stores/vaultStore' // Added this import

interface SettingsModalProps {
    onClose: () => void
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
    const {
        apiKey,
        setApiKey,
        customSystemPrompt,
        vaultSystemPrompts = {}, // Ensure default empty object
        setCustomSystemPrompt,
        setVaultSystemPrompt,
        resetSystemPrompt
    } = useAIStore()
    const { vaultPath } = useVaultStore()

    const [localApiKey, setLocalApiKey] = useState(apiKey || '')
    const [localPrompt, setLocalPrompt] = useState(
        vaultPath && vaultSystemPrompts[vaultPath]
            ? vaultSystemPrompts[vaultPath]
            : customSystemPrompt
    )

    // Mode: 'global' or 'vault'
    // If vaultPath exists, we default to showing the prompt that is effective (vault if exists, else global)
    // But we need to know what we are editing.
    // Let's simplify: If in a vault, we are editing the Vault Prompt.
    // If we want to edit global, we might need a toggle.
    // However, for MVP: If vault is open, show Vault Prompt UI.

    const isVaultMode = !!vaultPath
    // Check if this vault actually has a custom prompt set, or if it's falling back
    const hasVaultSpecificPrompt = isVaultMode && !!vaultSystemPrompts[vaultPath!]
    // If we are in vault mode but no specific prompt, localPrompt starts as global content.

    const handleSave = () => {
        setApiKey(localApiKey || null)
        if (isVaultMode) {
            setVaultSystemPrompt(vaultPath!, localPrompt)
        } else {
            setCustomSystemPrompt(localPrompt)
        }
        onClose()
    }

    const handleResetToDefault = () => {
        setLocalPrompt(DEFAULT_SYSTEM_PROMPT)
    }

    // const handleRevertToGlobal = () => { // Removed this function as it's not in the provided edit
    //     if (isVaultMode) {
    //         setLocalPrompt(customSystemPrompt)
    //         // We'll apply this when saving by setting vault prompt to null if it matches global? 
    //         // Or explicitly:
    //         // To "unset" a vault prompt, we probably need a specific action or just clear it?
    //         // Let's implement a specific "Use Global Prompt" button if in vault mode.
    //     }
    // }

    // Better logic for Reset:
    // If in Global mode: Reset to DEFAULT_SYSTEM_PROMPT
    // If in Vault mode: 
    //   - "Reset to Global": sets local value to customSystemPrompt AND sets a flag to delete vault prompt?
    //     Actually, let's keep it simple. handleSave just saves string.
    //     If user wants to use global, they create a 'duplicate' basically.
    //     A specific "Clear Vault Prompt" button would be better to remove the override.

    const handleClearVaultOverride = () => {
        if (isVaultMode) {
            setVaultSystemPrompt(vaultPath!, null)
            setLocalPrompt(customSystemPrompt)
            onClose() // Close to reflect changes immediately or stay open? Stay open is better but logic is tricky with local state.
            // If we stay open, we need to update local state.
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Settings</h2>
                    <button className="ai-panel-close" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="form-group">
                        <label className="form-label">Gemini API Key</label>
                        <input
                            type="password"
                            className="form-input"
                            value={localApiKey}
                            onChange={(e) => setLocalApiKey(e.target.value)}
                            placeholder="Enter your Gemini API key..."
                        />
                        <p
                            style={{
                                marginTop: 8,
                                fontSize: 'var(--text-xs)',
                                color: 'var(--color-text-tertiary)'
                            }}
                        >
                            Get your API key from{' '}
                            <a
                                href="https://aistudio.google.com/apikey"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Google AI Studio
                            </a>
                        </p>
                    </div>

                    <div className="form-group">
                        <label className="form-label">
                            {isVaultMode ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    System Prompt
                                    <span style={{
                                        fontSize: 'var(--text-xs)',
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        background: 'var(--color-accent-light)',
                                        color: 'var(--color-accent)'
                                    }}>
                                        Current Vault
                                    </span>
                                </span>
                            ) : (
                                'System Prompt (Global)'
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                                {isVaultMode && hasVaultSpecificPrompt && (
                                    <button
                                        onClick={handleClearVaultOverride}
                                        style={{
                                            fontSize: 'var(--text-xs)',
                                            color: 'var(--color-text-secondary)',
                                            textDecoration: 'underline'
                                        }}
                                        title="Remove vault-specific prompt and use global default"
                                    >
                                        Use Global
                                    </button>
                                )}
                                <button
                                    onClick={handleResetToDefault}
                                    style={{
                                        fontSize: 'var(--text-xs)',
                                        color: 'var(--color-accent)'
                                    }}
                                >
                                    Reset to Factory
                                </button>
                            </div>
                        </label>
                        <textarea
                            className="form-input form-textarea"
                            value={localPrompt}
                            onChange={(e) => setLocalPrompt(e.target.value)}
                            placeholder="Enter custom system prompt..."
                            rows={8}
                        />
                        <p
                            style={{
                                marginTop: 8,
                                fontSize: 'var(--text-xs)',
                                color: 'var(--color-text-tertiary)'
                            }}
                        >
                            {isVaultMode
                                ? "Customize AI behavior for this vault. This overrides the global setting."
                                : "Customize global AI behavior. Used when no vault-specific prompt is set."
                            }
                        </p>
                    </div>

                    <div
                        style={{
                            padding: 12,
                            background: 'var(--color-bg-tertiary)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-text-secondary)'
                        }}
                    >
                        <strong>Fixed Guardrails:</strong>
                        <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                            <li>Model restriction (Gemini 2.0 Flash/Pro only)</li>
                            <li>Local-only data access</li>
                            <li>Diff-only document edits</li>
                        </ul>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        Save
                    </button>
                </div>
            </div>
        </div>
    )
}
