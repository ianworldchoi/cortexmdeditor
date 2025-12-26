import { useState } from 'react'
import { X, File, Folder } from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'
import { useEditorStore } from '../../stores/editorStore'

interface CreateItemModalProps {
    type: 'file' | 'folder'
    parentPath: string
    onClose: () => void
}

export default function CreateItemModal({
    type,
    parentPath,
    onClose
}: CreateItemModalProps) {
    const { createNewFile, createNewFolder } = useVaultStore()
    const { openTab } = useEditorStore()
    const [name, setName] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!name.trim()) {
            setError('Name is required')
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            if (type === 'file') {
                const filePath = await createNewFile(parentPath, name.trim())
                if (filePath) {
                    // Open the new file in editor
                    const fileName = name.trim().endsWith('.md') ? name.trim() : `${name.trim()}.md`
                    openTab(filePath, fileName)
                    onClose()
                } else {
                    setError('Failed to create file')
                }
            } else {
                const success = await createNewFolder(parentPath, name.trim())
                if (success) {
                    onClose()
                } else {
                    setError('Failed to create folder')
                }
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
                        {type === 'file' ? <File size={18} /> : <Folder size={18} />}
                        New {type === 'file' ? 'File' : 'Folder'}
                    </h2>
                    <button className="ai-panel-close" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">
                                {type === 'file' ? 'File name' : 'Folder name'}
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={type === 'file' ? 'Untitled.md' : 'New Folder'}
                                autoFocus
                            />
                            {type === 'file' && (
                                <p
                                    style={{
                                        marginTop: 8,
                                        fontSize: 'var(--text-xs)',
                                        color: 'var(--color-text-tertiary)'
                                    }}
                                >
                                    .md extension will be added automatically if not provided
                                </p>
                            )}
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
                            {isLoading ? 'Creating...' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
