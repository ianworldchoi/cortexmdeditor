import { useState } from 'react'
import { X } from 'lucide-react'
import { useAIStore, DEFAULT_SYSTEM_PROMPT } from '../../stores/aiStore'

interface SettingsModalProps {
    onClose: () => void
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
    const {
        apiKey,
        setApiKey,
        customSystemPrompt,
        setCustomSystemPrompt,
        resetSystemPrompt
    } = useAIStore()

    const [localApiKey, setLocalApiKey] = useState(apiKey || '')
    const [localPrompt, setLocalPrompt] = useState(customSystemPrompt)

    const handleSave = () => {
        setApiKey(localApiKey || null)
        setCustomSystemPrompt(localPrompt)
        onClose()
    }

    const handleReset = () => {
        setLocalPrompt(DEFAULT_SYSTEM_PROMPT)
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
                            System Prompt
                            <button
                                onClick={handleReset}
                                style={{
                                    marginLeft: 8,
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--color-accent)'
                                }}
                            >
                                Reset to default
                            </button>
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
                            Customize how the AI assistant behaves. Some guardrails cannot be
                            removed.
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
