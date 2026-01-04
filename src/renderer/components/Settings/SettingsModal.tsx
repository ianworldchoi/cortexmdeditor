import { useState } from 'react'
import { X } from 'lucide-react'
import { useAIStore, DEFAULT_SYSTEM_PROMPT } from '../../stores/aiStore'
import { useVaultStore } from '../../stores/vaultStore'
import Modal from '../common/Modal'

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

    const isVaultMode = !!vaultPath
    const hasVaultSpecificPrompt = isVaultMode && !!vaultSystemPrompts[vaultPath!]

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

    const handleClearVaultOverride = () => {
        if (isVaultMode) {
            setVaultSystemPrompt(vaultPath!, null)
            setLocalPrompt(customSystemPrompt)
            // onClose() 
        }
    }

    const footer = (
        <>
            <button className="btn btn-secondary" onClick={onClose}>
                Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
                Save
            </button>
        </>
    )

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Settings"
            footer={footer}
            width="500px"
        >
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
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isVaultMode ? (
                            <>
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
                            </>
                        ) : (
                            'System Prompt (Global)'
                        )}
                    </span>

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
        </Modal>
    )
}
