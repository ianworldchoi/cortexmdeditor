import { useState, useEffect } from 'react'
import { X, Edit3 } from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'
import type { FileNode } from '@shared/types'

interface RenameItemModalProps {
    node: FileNode
    onClose: () => void
}

export default function RenameItemModal({
    node,
    onClose
}: RenameItemModalProps) {
    const { renameItem } = useVaultStore()
    const [name, setName] = useState(node.name)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!name.trim()) {
            setError('Name is required')
            return
        }

        if (name === node.name) {
            onClose()
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            const success = await renameItem(node.path, name.trim())
            if (success) {
                onClose()
            } else {
                // Error is set in store, but we can capture generic failure too
                // For better UX we rely on store error, or we could pass down specific error
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose()
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleKeyDown}
                style={{ maxWidth: 360 }}
            >
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Edit3 size={18} />
                        Rename Item
                    </h2>
                    <button className="ai-panel-close" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">
                                Name
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                autoFocus
                            />
                            {error && (
                                <p
                                    style={{
                                        marginTop: 8,
                                        fontSize: 'var(--text-sm)',
                                        color: 'var(--color-error)'
                                    }}
                                >
                                    {error}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isLoading || !name.trim()}
                        >
                            {isLoading ? 'Renaming...' : 'Rename'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
